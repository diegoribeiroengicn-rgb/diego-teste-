"""View: Análise de Prestadores (Aba A)."""

from __future__ import annotations

import streamlit as st

from gat.business_rules import enriquecer_prestadores
from gat.config import COLUNAS_EXIBICAO_PRESTADORES, RESPONSAVEIS, STATUS_ANALISE_OPCOES
from gat.database import listar_prestadores, obter_prestador
from gat.ui.modals import dialog_prestador
from gat.ui.tables import tabela_com_edicao


def render(usuario: dict) -> None:
    st.subheader("📐 Análise de Prestadores de Serviço")

    col_novo, _ = st.columns([1, 4])
    with col_novo:
        if st.button("➕ Novo Cadastro", key="novo_prestador", use_container_width=True):
            dialog_prestador(usuario["username"])

    df = listar_prestadores()
    if df.empty:
        st.info("Nenhum registro de prestador cadastrado ainda. Utilize o botão acima para iniciar.")
        return

    df = enriquecer_prestadores(df)

    with st.expander("🔎 Filtros", expanded=False):
        col1, col2, col3, col4 = st.columns(4)
        f_resp = col1.multiselect("Responsável", RESPONSAVEIS)
        f_status = col2.multiselect("Status Análise", STATUS_ANALISE_OPCOES)
        f_pendentes = col3.checkbox("Somente Pendente de Reunião")
        f_cancelados = col4.checkbox("Incluir cancelados", value=False)

    df_filtrado = df.copy()
    if not f_cancelados:
        df_filtrado = df_filtrado[df_filtrado["status_analise"] != "CANCELADO"]
    if f_resp:
        df_filtrado = df_filtrado[df_filtrado["responsavel"].isin(f_resp)]
    if f_status:
        df_filtrado = df_filtrado[df_filtrado["status_analise"].isin(f_status)]
    if f_pendentes:
        df_filtrado = df_filtrado[df_filtrado["pendente_reuniao"]]

    df_filtrado = df_filtrado.reset_index(drop=True)
    st.caption(f"{len(df_filtrado)} registro(s) encontrados.")

    colunas = list(COLUNAS_EXIBICAO_PRESTADORES.keys())
    df_exibicao = df_filtrado[colunas].rename(columns=COLUNAS_EXIBICAO_PRESTADORES)

    tabela_com_edicao(
        df_exibicao,
        df_filtrado["id"],
        chave="prestadores",
        abrir_dialog_edicao=lambda registro: dialog_prestador(usuario["username"], registro),
        obter_registro=obter_prestador,
    )
