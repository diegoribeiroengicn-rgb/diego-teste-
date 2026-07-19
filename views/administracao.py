"""View: Administração — gestão de usuários e histórico de auditoria (somente ADMIN)."""

from __future__ import annotations

import streamlit as st

from gat.config import PERFIS_OPCOES
from gat.database import (
    criar_usuario,
    definir_configuracao,
    desativar_usuario,
    listar_historico,
    listar_usuarios,
    obter_configuracao,
)


def render(usuario: dict) -> None:
    st.subheader(":material/settings: Administração do Sistema")

    tab_usuarios, tab_historico, tab_config = st.tabs(["Usuários", "Histórico de Edições", "Configurações"])

    with tab_usuarios:
        st.markdown("##### Cadastrar novo usuário")
        with st.form("form_novo_usuario", clear_on_submit=True):
            col1, col2, col3 = st.columns(3)
            novo_username = col1.text_input("Usuário")
            nova_senha = col2.text_input("Senha", type="password")
            novo_perfil = col3.selectbox("Perfil", PERFIS_OPCOES)
            novo_nome = st.text_input("Nome completo")
            criar = st.form_submit_button("Cadastrar usuário", icon=":material/person_add:", type="primary")

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
            with st.container(key="acao_destrutivo_desativar_usuario"):
                if alvo != "-" and st.button("Desativar acesso", icon=":material/person_remove:"):
                    desativar_usuario(alvo)
                    st.success(f"Usuário '{alvo}' desativado.")
                    st.rerun()

    with tab_historico:
        st.markdown("##### Histórico de edições (auditoria)")
        filtro_tabela = st.selectbox("Tabela", ["Todas", "prestadores", "cessionarios"])
        df_hist = listar_historico(None if filtro_tabela == "Todas" else filtro_tabela)
        st.dataframe(df_hist, use_container_width=True, hide_index=True)

    with tab_config:
        st.markdown("##### Criticidade de projetos sem PEP")
        st.caption(
            "Define, em dias corridos desde a Data de Solicitação, quando um projeto sem PEP passa a ser "
            "classificado como Atenção ou Crítico nos Lembretes e nos KPIs dos dashboards."
        )
        dias_atencao_atual = int(obter_configuracao("pep_dias_atencao", "3"))
        dias_critico_atual = int(obter_configuracao("pep_dias_critico", "6"))

        with st.form("form_config_pep"):
            col1, col2 = st.columns(2)
            dias_atencao = col1.number_input("Dias para 'Atenção'", min_value=1, step=1, value=dias_atencao_atual)
            dias_critico = col2.number_input("Dias para 'Crítico'", min_value=1, step=1, value=dias_critico_atual)
            salvar_config = st.form_submit_button("Salvar limiares", icon=":material/save:", type="primary")

        if salvar_config:
            if dias_critico <= dias_atencao:
                st.error("O limiar de 'Crítico' deve ser maior que o de 'Atenção'.")
            else:
                definir_configuracao("pep_dias_atencao", str(int(dias_atencao)))
                definir_configuracao("pep_dias_critico", str(int(dias_critico)))
                st.success("Limiares atualizados com sucesso.")
                st.rerun()
