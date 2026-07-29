"""
Persistência automática do banco de dados via GitHub — mitiga a perda de
dados em ambientes com disco efêmero (ex.: Streamlit Community Cloud, que
recria o disco do zero a cada reinício/deploy).

Automatiza, via API do GitHub, exatamente o mesmo mecanismo manual já
existente em Administração → Configurações → "Sincronizar dados atuais
para persistência": mantém `SEED_DB_PATH` (o banco de sementes lido pela
aplicação quando o banco de produção ainda não existe) sempre atualizado
com o estado atual e publicado (commit) diretamente no branch em produção
— sem depender de alguém baixar/subir o arquivo ou pedir a um assistente
para dar commit/push manualmente a cada mudança.

Configuração (Streamlit Cloud: Settings → Secrets deste app):

    GAT_BACKUP_GITHUB_TOKEN = "ghp_..."     # obrigatório — token com permissão
                                             # de escrita apenas neste repositório
    GAT_BACKUP_GITHUB_REPO = "owner/repo"   # obrigatório
    GAT_BACKUP_GITHUB_BRANCH = "..."        # opcional — default: branch publicado atual
    GAT_BACKUP_GITHUB_PATH = "..."          # opcional — default: caminho do seed atual

Sem esses segredos configurados, todas as funções deste módulo são no-ops
seguros (retornam False) — o comportamento do sistema permanece idêntico
ao de antes desta funcionalidade existir.
"""

from __future__ import annotations

import base64
import threading
import time
from datetime import datetime
from typing import Any

import requests

from gat.config import SEED_DB_PATH

_API = "https://api.github.com"
_BRANCH_PADRAO = "claude/gat-2026-governance-system-2p09ah"
_CAMINHO_PADRAO = "data/seed_gat_tecnoplano.db"
_TIMEOUT_SEGUNDOS = 20
_INTERVALO_MINIMO_SEGUNDOS = 30

_lock = threading.Lock()
_ultimo_envio_ts = 0.0
_envio_em_andamento = False
_ultimo_status: dict[str, Any] = {"sucesso": None, "mensagem": "Nenhuma tentativa de backup ainda.", "em": None}


def _config() -> dict[str, str] | None:
    try:
        import streamlit as st
        token = st.secrets.get("GAT_BACKUP_GITHUB_TOKEN")
        repo = st.secrets.get("GAT_BACKUP_GITHUB_REPO")
    except Exception:
        return None
    if not token or not repo:
        return None
    branch = st.secrets.get("GAT_BACKUP_GITHUB_BRANCH") or _BRANCH_PADRAO
    caminho = st.secrets.get("GAT_BACKUP_GITHUB_PATH") or _CAMINHO_PADRAO
    return {"token": token, "repo": repo, "branch": branch, "caminho": caminho}


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def configurado() -> bool:
    return _config() is not None


def status() -> dict[str, Any]:
    """Resultado da última tentativa de backup conhecida (para exibir na UI)."""
    with _lock:
        return dict(_ultimo_status)


def _registrar_status(sucesso: bool, mensagem: str) -> None:
    with _lock:
        _ultimo_status.update({
            "sucesso": sucesso, "mensagem": mensagem,
            "em": datetime.now().isoformat(timespec="seconds"),
        })


_TAMANHO_MAXIMO_BYTES = 40 * 1024 * 1024  # limite prático do corpo de requisição da Contents API


def enviar_backup_agora() -> bool:
    """
    Publica o banco de sementes atual (`SEED_DB_PATH`, já atualizado por
    `sincronizar_para_persistencia()`) como um novo commit no branch de
    produção, via Contents API do GitHub (o método mais compatível com
    qualquer tipo de token — inclusive os de permissão mínima "Contents:
    Read and write"). Síncrono — chamado tanto pelo agendamento automático
    em segundo plano quanto pelo botão de teste manual em Administração.
    """
    cfg = _config()
    if cfg is None:
        _registrar_status(False, "Backup externo não configurado (faltam segredos GAT_BACKUP_GITHUB_* em Secrets).")
        return False
    if not SEED_DB_PATH.exists():
        _registrar_status(False, "Banco de sementes local ainda não existe — nada para enviar.")
        return False

    conteudo_bytes = SEED_DB_PATH.read_bytes()
    if len(conteudo_bytes) > _TAMANHO_MAXIMO_BYTES:
        _registrar_status(False, f"Banco de dados grande demais para backup automático via GitHub ({len(conteudo_bytes) / 1024 / 1024:.1f} MB) — migre para um armazenamento externo dedicado.")
        return False

    owner_repo, branch, caminho = cfg["repo"], cfg["branch"], cfg["caminho"]
    headers = _headers(cfg["token"])
    url_arquivo = f"{_API}/repos/{owner_repo}/contents/{caminho}"

    try:
        sha_atual = None
        get_resp = requests.get(url_arquivo, headers=headers, params={"ref": branch}, timeout=_TIMEOUT_SEGUNDOS)
        if get_resp.status_code == 200:
            sha_atual = get_resp.json()["sha"]
        elif get_resp.status_code != 404:
            _registrar_status(False, f"Não foi possível consultar '{caminho}' em '{branch}': HTTP {get_resp.status_code} — {get_resp.text[:200]}")
            return False

        payload: dict[str, Any] = {
            "message": f"Backup automático do banco de dados ({datetime.now().strftime('%Y-%m-%d %H:%M:%S')})",
            "content": base64.b64encode(conteudo_bytes).decode(),
            "branch": branch,
        }
        if sha_atual:
            payload["sha"] = sha_atual

        put_resp = requests.put(url_arquivo, headers=headers, json=payload, timeout=_TIMEOUT_SEGUNDOS)
        if put_resp.status_code not in (200, 201):
            _registrar_status(False, f"Falha ao publicar backup: HTTP {put_resp.status_code} — {put_resp.text[:200]}")
            return False
    except requests.RequestException as exc:
        _registrar_status(False, f"Falha ao enviar backup para o GitHub: {exc}")
        return False

    _registrar_status(True, f"Backup publicado com sucesso em {owner_repo}@{branch}:{caminho}.")
    return True


def agendar_backup_apos_gravacao() -> None:
    """
    Dispara `enviar_backup_agora()` em uma thread em segundo plano, sem
    bloquear a requisição/gravação atual — respeitando um intervalo
    mínimo entre envios para não sobrecarregar a API do GitHub quando
    várias gravações acontecem em sequência rápida (ex.: criar um usuário
    e semear suas permissões na mesma ação).
    """
    global _ultimo_envio_ts, _envio_em_andamento
    if _config() is None:
        return
    with _lock:
        agora = time.monotonic()
        if _envio_em_andamento or (agora - _ultimo_envio_ts) < _INTERVALO_MINIMO_SEGUNDOS:
            return
        _envio_em_andamento = True
        _ultimo_envio_ts = agora

    def _tarefa() -> None:
        global _envio_em_andamento
        try:
            enviar_backup_agora()
        finally:
            with _lock:
                _envio_em_andamento = False

    threading.Thread(target=_tarefa, daemon=True).start()
