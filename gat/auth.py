"""
Módulo de autenticação do Sistema GAT 2026.

Implementa a tela de login segura (bloqueio total de acesso ao programa),
a verificação de credenciais com `bcrypt` e o controle de sessão via
`st.session_state`.
"""

from __future__ import annotations

import bcrypt
import streamlit as st

from gat.database import buscar_usuario
from gat.styles import logo_base64


def _verificar_senha(senha_texto: str, senha_hash: str) -> bool:
    try:
        return bcrypt.checkpw(senha_texto.encode(), senha_hash.encode())
    except (ValueError, AttributeError):
        return False


def usuario_autenticado() -> bool:
    """Indica se há um usuário autenticado na sessão corrente."""
    return bool(st.session_state.get("autenticado"))


def usuario_atual() -> dict:
    """Retorna os dados do usuário autenticado na sessão (ou dicionário vazio)."""
    return st.session_state.get("usuario", {})


def logout() -> None:
    for chave in ("autenticado", "usuario"):
        st.session_state.pop(chave, None)
    st.rerun()


def _autenticar(username: str, senha: str) -> bool:
    usuario = buscar_usuario(username.strip())
    if not usuario:
        return False
    if not _verificar_senha(senha, usuario["senha_hash"]):
        return False
    st.session_state["autenticado"] = True
    st.session_state["usuario"] = {
        "id": usuario["id"],
        "username": usuario["username"],
        "nome_completo": usuario["nome_completo"],
        "perfil": usuario["perfil"],
    }
    return True


def tela_login() -> None:
    """Renderiza a tela de login e bloqueia o restante do aplicativo até autenticação válida."""
    logo_b64 = logo_base64()

    st.markdown(
        """
        <style>
        [data-testid="stSidebar"] {display: none;}
        div.st-key-gat_login_box {
            max-width: 380px;
            margin: 60px auto 0 auto;
            background: #ffffff;
            border-radius: 16px;
            border-top: 6px solid #1B3A8A;
            box-shadow: 0 20px 60px rgba(15,23,42,.25);
            padding: 12px 24px 20px 24px;
        }
        .gat-login-title {
            text-align:center; color:#1B3A8A; font-weight:700;
            font-size: 15px; letter-spacing: 2px; text-transform: uppercase;
            margin-top: 14px;
        }
        .gat-login-sub {
            text-align:center; color:#64748B; font-size: 12px; margin-bottom: 18px;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    col_esq, col_meio, col_dir = st.columns([1, 1.3, 1])
    with col_meio:
        with st.container(key="gat_login_box"):
            if logo_b64:
                st.markdown(
                    f'<div style="text-align:center"><img src="data:image/png;base64,{logo_b64}" '
                    f'style="height:42px;object-fit:contain"/></div>',
                    unsafe_allow_html=True,
                )
            st.markdown('<div class="gat-login-title">GAT 2026</div>', unsafe_allow_html=True)
            st.markdown(
                '<div class="gat-login-sub">Controle de Análises Técnicas · Acesso restrito</div>',
                unsafe_allow_html=True,
            )

            with st.form("form_login", border=False):
                username = st.text_input("Usuário", placeholder="usuário")
                senha = st.text_input("Senha", type="password", placeholder="senha")
                entrar = st.form_submit_button("Entrar", use_container_width=True)

            if entrar:
                if not username or not senha:
                    st.error("Informe usuário e senha.")
                elif _autenticar(username, senha):
                    st.rerun()
                else:
                    st.error("Usuário ou senha inválidos.")
