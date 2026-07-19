"""
Camada de acesso ao banco de dados SQLite do Sistema GAT 2026.

Responsável por:
* Criar e manter o esquema do banco `gat_tecnoplano.db`;
* Persistir cadastros e edições das abas de Prestadores e Cessionários;
* Registrar o histórico de todas as edições (governança/auditoria);
* Gerenciar usuários e credenciais (senhas com hash `bcrypt`).
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Iterator

import bcrypt
import pandas as pd

from gat.config import DB_PATH, PERFIL_ADMIN

# ---------------------------------------------------------------------------
# Conexão
# ---------------------------------------------------------------------------


@contextmanager
def _conectar() -> Iterator[sqlite3.Connection]:
    """Abre uma conexão SQLite com row_factory configurado, fechando ao final."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# Colunas editáveis de cada tabela de projeto (usadas no cadastro/edição e
# no cálculo de diffs para o histórico de auditoria).
COLUNAS_PRESTADORES = [
    "item", "codigo", "prestador", "disciplina", "disciplina_sla", "peps",
    "obra_referencia", "revisao", "num_documentos", "data_solicitacao",
    "data_limite", "data_analise", "hold_inicio", "hold_fim", "num_at",
    "revisao_at", "responsavel", "status_analise", "observacoes",
]

COLUNAS_CESSIONARIOS = [
    "item", "codigo", "cessionario", "disciplina", "disciplina_sla",
    "revisao", "num_documentos", "data_solicitacao", "tipo", "sla_dias",
    "data_limite", "data_analise", "hold_inicio", "hold_fim", "num_at",
    "revisao_at", "responsavel", "status_analise", "observacoes",
]


# ---------------------------------------------------------------------------
# Inicialização do esquema
# ---------------------------------------------------------------------------


def init_db() -> None:
    """Cria as tabelas do sistema (caso não existam) e semeia o usuário admin padrão."""
    with _conectar() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                senha_hash TEXT NOT NULL,
                nome_completo TEXT,
                perfil TEXT NOT NULL DEFAULT 'ANALISTA',
                ativo INTEGER NOT NULL DEFAULT 1,
                criado_em TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS prestadores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item INTEGER,
                codigo TEXT,
                prestador TEXT NOT NULL,
                disciplina TEXT,
                disciplina_sla TEXT,
                peps TEXT,
                obra_referencia TEXT,
                revisao INTEGER NOT NULL DEFAULT 0,
                num_documentos INTEGER NOT NULL DEFAULT 0,
                data_solicitacao TEXT NOT NULL,
                data_limite TEXT,
                data_analise TEXT,
                hold_inicio TEXT,
                hold_fim TEXT,
                num_at TEXT,
                revisao_at INTEGER,
                responsavel TEXT,
                status_analise TEXT NOT NULL DEFAULT 'EM ANÁLISE',
                observacoes TEXT,
                criado_em TEXT NOT NULL,
                criado_por TEXT,
                atualizado_em TEXT,
                atualizado_por TEXT
            );

            CREATE TABLE IF NOT EXISTS cessionarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item INTEGER,
                codigo TEXT,
                cessionario TEXT NOT NULL,
                disciplina TEXT,
                disciplina_sla TEXT,
                revisao INTEGER NOT NULL DEFAULT 0,
                num_documentos INTEGER NOT NULL DEFAULT 0,
                data_solicitacao TEXT NOT NULL,
                tipo TEXT,
                sla_dias INTEGER,
                data_limite TEXT,
                data_analise TEXT,
                hold_inicio TEXT,
                hold_fim TEXT,
                num_at TEXT,
                revisao_at INTEGER,
                responsavel TEXT,
                status_analise TEXT NOT NULL DEFAULT 'EM ANÁLISE',
                observacoes TEXT,
                criado_em TEXT NOT NULL,
                criado_por TEXT,
                atualizado_em TEXT,
                atualizado_por TEXT
            );

            CREATE TABLE IF NOT EXISTS historico_edicoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tabela TEXT NOT NULL,
                registro_id INTEGER NOT NULL,
                campo TEXT NOT NULL,
                valor_anterior TEXT,
                valor_novo TEXT,
                usuario TEXT,
                data_hora TEXT NOT NULL
            );
            """
        )

        total_usuarios = conn.execute("SELECT COUNT(*) AS n FROM usuarios").fetchone()["n"]
        if total_usuarios == 0:
            senha_hash = bcrypt.hashpw("Tecnoplano@2026".encode(), bcrypt.gensalt()).decode()
            conn.execute(
                "INSERT INTO usuarios (username, senha_hash, nome_completo, perfil, ativo, criado_em) "
                "VALUES (?, ?, ?, ?, 1, ?)",
                ("admin", senha_hash, "Administrador GAT", PERFIL_ADMIN, datetime.now().isoformat()),
            )


# ---------------------------------------------------------------------------
# Usuários
# ---------------------------------------------------------------------------


def buscar_usuario(username: str) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute(
            "SELECT * FROM usuarios WHERE username = ? AND ativo = 1", (username,)
        ).fetchone()
        return dict(linha) if linha else None


def criar_usuario(username: str, senha: str, nome_completo: str, perfil: str) -> None:
    senha_hash = bcrypt.hashpw(senha.encode(), bcrypt.gensalt()).decode()
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO usuarios (username, senha_hash, nome_completo, perfil, ativo, criado_em) "
            "VALUES (?, ?, ?, ?, 1, ?)",
            (username, senha_hash, nome_completo, perfil, datetime.now().isoformat()),
        )


def listar_usuarios() -> pd.DataFrame:
    with _conectar() as conn:
        return pd.read_sql_query(
            "SELECT id, username, nome_completo, perfil, ativo, criado_em FROM usuarios ORDER BY username", conn
        )


def alterar_senha(username: str, nova_senha: str) -> None:
    senha_hash = bcrypt.hashpw(nova_senha.encode(), bcrypt.gensalt()).decode()
    with _conectar() as conn:
        conn.execute("UPDATE usuarios SET senha_hash = ? WHERE username = ?", (senha_hash, username))


def desativar_usuario(username: str) -> None:
    with _conectar() as conn:
        conn.execute("UPDATE usuarios SET ativo = 0 WHERE username = ?", (username,))


# ---------------------------------------------------------------------------
# Histórico / auditoria
# ---------------------------------------------------------------------------


def _registrar_historico(conn: sqlite3.Connection, tabela: str, registro_id: int, antigo: dict, novo: dict, usuario: str) -> None:
    """Compara os dicionários antigo/novo e grava uma linha de histórico por campo alterado."""
    agora = datetime.now().isoformat()
    for campo, valor_novo in novo.items():
        valor_antigo = antigo.get(campo) if antigo else None
        if str(valor_antigo) != str(valor_novo):
            conn.execute(
                "INSERT INTO historico_edicoes (tabela, registro_id, campo, valor_anterior, valor_novo, usuario, data_hora) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (tabela, registro_id, campo, str(valor_antigo) if valor_antigo is not None else None, str(valor_novo) if valor_novo is not None else None, usuario, agora),
            )


def listar_historico(tabela: str | None = None, registro_id: int | None = None) -> pd.DataFrame:
    query = "SELECT * FROM historico_edicoes WHERE 1=1"
    params: list[Any] = []
    if tabela:
        query += " AND tabela = ?"
        params.append(tabela)
    if registro_id is not None:
        query += " AND registro_id = ?"
        params.append(registro_id)
    query += " ORDER BY data_hora DESC"
    with _conectar() as conn:
        return pd.read_sql_query(query, conn, params=params)


# ---------------------------------------------------------------------------
# Prestadores (Aba A)
# ---------------------------------------------------------------------------


def inserir_prestador(dados: dict[str, Any], usuario: str) -> int:
    agora = datetime.now().isoformat()
    campos = {c: dados.get(c) for c in COLUNAS_PRESTADORES}
    with _conectar() as conn:
        if not campos.get("item"):
            maior = conn.execute("SELECT COALESCE(MAX(item), 0) AS m FROM prestadores").fetchone()["m"]
            campos["item"] = maior + 1
        cursor = conn.execute(
            f"INSERT INTO prestadores ({', '.join(campos.keys())}, criado_em, criado_por, atualizado_em, atualizado_por) "
            f"VALUES ({', '.join(['?'] * len(campos))}, ?, ?, ?, ?)",
            (*campos.values(), agora, usuario, agora, usuario),
        )
        novo_id = cursor.lastrowid
        _registrar_historico(conn, "prestadores", novo_id, {}, campos, usuario)
        return novo_id


def atualizar_prestador(registro_id: int, dados: dict[str, Any], usuario: str) -> None:
    with _conectar() as conn:
        antigo = conn.execute("SELECT * FROM prestadores WHERE id = ?", (registro_id,)).fetchone()
        antigo_dict = dict(antigo) if antigo else {}
        campos = {c: dados.get(c) for c in COLUNAS_PRESTADORES}
        agora = datetime.now().isoformat()
        set_clause = ", ".join(f"{c} = ?" for c in campos)
        conn.execute(
            f"UPDATE prestadores SET {set_clause}, atualizado_em = ?, atualizado_por = ? WHERE id = ?",
            (*campos.values(), agora, usuario, registro_id),
        )
        _registrar_historico(conn, "prestadores", registro_id, antigo_dict, campos, usuario)


def excluir_prestador(registro_id: int) -> None:
    with _conectar() as conn:
        conn.execute("DELETE FROM prestadores WHERE id = ?", (registro_id,))


def listar_prestadores() -> pd.DataFrame:
    with _conectar() as conn:
        return pd.read_sql_query("SELECT * FROM prestadores ORDER BY item, id", conn)


def obter_prestador(registro_id: int) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM prestadores WHERE id = ?", (registro_id,)).fetchone()
        return dict(linha) if linha else None


# ---------------------------------------------------------------------------
# Cessionários (Aba B)
# ---------------------------------------------------------------------------


def inserir_cessionario(dados: dict[str, Any], usuario: str) -> int:
    agora = datetime.now().isoformat()
    campos = {c: dados.get(c) for c in COLUNAS_CESSIONARIOS}
    with _conectar() as conn:
        if not campos.get("item"):
            maior = conn.execute("SELECT COALESCE(MAX(item), 0) AS m FROM cessionarios").fetchone()["m"]
            campos["item"] = maior + 1
        cursor = conn.execute(
            f"INSERT INTO cessionarios ({', '.join(campos.keys())}, criado_em, criado_por, atualizado_em, atualizado_por) "
            f"VALUES ({', '.join(['?'] * len(campos))}, ?, ?, ?, ?)",
            (*campos.values(), agora, usuario, agora, usuario),
        )
        novo_id = cursor.lastrowid
        _registrar_historico(conn, "cessionarios", novo_id, {}, campos, usuario)
        return novo_id


def atualizar_cessionario(registro_id: int, dados: dict[str, Any], usuario: str) -> None:
    with _conectar() as conn:
        antigo = conn.execute("SELECT * FROM cessionarios WHERE id = ?", (registro_id,)).fetchone()
        antigo_dict = dict(antigo) if antigo else {}
        campos = {c: dados.get(c) for c in COLUNAS_CESSIONARIOS}
        agora = datetime.now().isoformat()
        set_clause = ", ".join(f"{c} = ?" for c in campos)
        conn.execute(
            f"UPDATE cessionarios SET {set_clause}, atualizado_em = ?, atualizado_por = ? WHERE id = ?",
            (*campos.values(), agora, usuario, registro_id),
        )
        _registrar_historico(conn, "cessionarios", registro_id, antigo_dict, campos, usuario)


def excluir_cessionario(registro_id: int) -> None:
    with _conectar() as conn:
        conn.execute("DELETE FROM cessionarios WHERE id = ?", (registro_id,))


def listar_cessionarios() -> pd.DataFrame:
    with _conectar() as conn:
        return pd.read_sql_query("SELECT * FROM cessionarios ORDER BY item, id", conn)


def obter_cessionario(registro_id: int) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM cessionarios WHERE id = ?", (registro_id,)).fetchone()
        return dict(linha) if linha else None
