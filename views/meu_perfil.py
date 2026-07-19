"""View: Meu Perfil — dados da conta e alteração da própria senha."""

from __future__ import annotations

import streamlit as st

from gat.database import alterar_senha_usuario, buscar_usuario_por_id


def render(usuario: dict) -> None:
    st.subheader(":material/account_circle: Meu Perfil")

    dados = buscar_usuario_por_id(usuario["id"]) or {}

    col1, col2 = st.columns(2)
    col1.text_input("Usuário", value=dados.get("username", ""), disabled=True)
    col2.text_input("Nome completo", value=dados.get("nome_completo") or "", disabled=True)
    col1.text_input("Perfil", value=dados.get("perfil", ""), disabled=True)
    col2.text_input("Último acesso", value=dados.get("ultimo_acesso") or "-", disabled=True)

    st.divider()
    st.markdown("##### Alterar Senha")
    st.caption("Informe a senha atual e defina uma nova senha pessoal.")

    with st.form("form_alterar_senha_propria", clear_on_submit=True):
        senha_atual = st.text_input("Senha atual", type="password")
        nova_senha = st.text_input("Nova senha", type="password")
        confirmacao = st.text_input("Confirmar nova senha", type="password")
        salvar = st.form_submit_button("Salvar nova senha", icon=":material/lock_reset:", type="primary")

    if salvar:
        if not senha_atual or not nova_senha:
            st.error("Preencha todos os campos.")
        elif len(nova_senha) < 6:
            st.error("A nova senha deve ter pelo menos 6 caracteres.")
        elif nova_senha != confirmacao:
            st.error("A confirmação não corresponde à nova senha.")
        elif not alterar_senha_usuario(dados["username"], senha_atual, nova_senha):
            st.error("Senha atual incorreta.")
        else:
            st.success("Senha alterada com sucesso.")
