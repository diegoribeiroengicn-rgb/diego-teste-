"""View: Análise de Cessionários (Aba B)."""

from __future__ import annotations

import streamlit as st

from gat.business_rules import enriquecer_cessionarios
from gat.config import COLUNAS_EXIBICAO_CESSIONARIOS, RESPONSAVEIS, STATUS_ANALISE_OPCOES, TIPO_CESSIONARIO_OPCOES
from gat.database import listar_cessionarios, obter_cessionario
from gat.ui.modals import dialog_cessionario
from gat.ui.tables import tabela_com_edicao


def render(usuario: dict) -> None:
    st.subheader("🏬 Análise de Cessionários")

    col_novo, _ = st.columns([1, 4])
    with col_novo:
        if st.button("➕ Novo Cadastro", key="novo_cessionario", use_container_width=True):
            dialog_cessionario(usuario["username"])

    df = listar_cessionarios()
    if df.empty:
        st.info("Nenhum registro de cessionário cadastrado ainda. Utilize o botão acima para iniciar.")
        return

    df = enriquecer_cessionarios(df)

    with st.expander("🔎 Filtros", expanded=False):
        col1, col2, col3, col4, col5 = st.columns(5)
        f_resp = col1.multiselect("Responsável", RESPONSAVEIS)
        f_status = col2.multiselect("Status Análise", STATUS_ANALISE_OPCOES)
        f_tipo = col3.multiselect("Tipo", TIPO_CESSIONARIO_OPCOES)
        f_pendentes = col4.checkbox("Somente Pendente de Reunião")
        f_cancelados = col5.checkbox("Incluir cancelados", value=False)

    df_filtrado = df.copy()
    if not f_cancelados:
        df_filtrado = df_filtrado[df_filtrado["status_analise"] != "CANCELADO"]
    if f_resp:
        df_filtrado = df_filtrado[df_filtrado["responsavel"].isin(f_resp)]
    if f_status:
        df_filtrado = df_filtrado[df_filtrado["status_analise"].isin(f_status)]
    if f_tipo:
        df_filtrado = df_filtrado[df_filtrado["tipo"].isin(f_tipo)]
    if f_pendentes:
        df_filtrado = df_filtrado[df_filtrado["pendente_reuniao"]]

    df_filtrado = df_filtrado.reset_index(drop=True)
    st.caption(f"{len(df_filtrado)} registro(s) encontrados.")

    colunas = list(COLUNAS_EXIBICAO_CESSIONARIOS.keys())
    df_exibicao = df_filtrado[colunas].rename(columns=COLUNAS_EXIBICAO_CESSIONARIOS)

    tabela_com_edicao(
        df_exibicao,
        df_filtrado["id"],
        chave="cessionarios",
        abrir_dialog_edicao=lambda registro: dialog_cessionario(usuario["username"], registro),
        obter_registro=obter_cessionario,
    )
