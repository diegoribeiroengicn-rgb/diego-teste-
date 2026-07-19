"""View: Administração — gestão de usuários e histórico de auditoria (somente ADMIN)."""

from __future__ import annotations

import streamlit as st

from gat.config import PERFIS_OPCOES
from gat.database import criar_usuario, desativar_usuario, listar_historico, listar_usuarios


def render(usuario: dict) -> None:
    st.subheader("⚙️ Administração do Sistema")

    tab_usuarios, tab_historico = st.tabs(["Usuários", "Histórico de Edições"])

    with tab_usuarios:
        st.markdown("##### Cadastrar novo usuário")
        with st.form("form_novo_usuario", clear_on_submit=True):
            col1, col2, col3 = st.columns(3)
            novo_username = col1.text_input("Usuário")
            nova_senha = col2.text_input("Senha", type="password")
            novo_perfil = col3.selectbox("Perfil", PERFIS_OPCOES)
            novo_nome = st.text_input("Nome completo")
            criar = st.form_submit_button("Cadastrar usuário")

        if criar:
            if not novo_username or not nova_senha:
                st.error("Informe usuário e senha.")
            else:
                try:
                    criar_usuario(novo_username.strip(), nova_senha, novo_nome, novo_perfil)
                    st.success(f"Usuário '{novo_username}' cadastrado com sucesso.")
                    st.rerun()
                except Exception as exc:  # username duplicado, etc.
                    st.error(f"Não foi possível cadastrar o usuário: {exc}")

        st.markdown("##### Usuários cadastrados")
        df_usuarios = listar_usuarios()
        st.dataframe(df_usuarios, use_container_width=True, hide_index=True)

        col_desativar, _ = st.columns([1, 3])
        with col_desativar:
            usuarios_ativos = df_usuarios[df_usuarios["ativo"] == 1]["username"].tolist()
            usuarios_ativos = [u for u in usuarios_ativos if u != usuario["username"]]
            alvo = st.selectbox("Desativar usuário", options=["-"] + usuarios_ativos)
            if alvo != "-" and st.button("Desativar acesso"):
                desativar_usuario(alvo)
                st.success(f"Usuário '{alvo}' desativado.")
                st.rerun()

    with tab_historico:
        st.markdown("##### Histórico de edições (auditoria)")
        filtro_tabela = st.selectbox("Tabela", ["Todas", "prestadores", "cessionarios"])
        df_hist = listar_historico(None if filtro_tabela == "Todas" else filtro_tabela)
        st.dataframe(df_hist, use_container_width=True, hide_index=True)
