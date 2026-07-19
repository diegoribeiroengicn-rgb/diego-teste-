"""View: Análise de Prestadores (Aba A)."""

from __future__ import annotations

import streamlit as st

from gat.business_rules import enriquecer_prestadores
from gat.config import COLUNAS_EXIBICAO_PRESTADORES, RESPONSAVEIS, STATUS_ANALISE_OPCOES
from gat.database import listar_prestadores, obter_prestador
from gat.ui.modals import dialog_prestador
from gat.ui.tables import tabela_com_edicao

SITUACAO_PEP_OPCOES = ["Todos", "Com PEP", "Sem PEP"]


def render(usuario: dict) -> None:
    st.subheader("📐 Projetos de Prestadores de Serviço")
    st.caption("Cadastro, edição e consulta. Para indicadores e gráficos, veja Prestadores → Dashboard.")

    col_novo, _ = st.columns([1, 4])
    with col_novo:
        if st.button("➕ Novo Cadastro", key="novo_prestador", use_container_width=True):
            dialog_prestador(usuario["username"])

    if st.session_state.pop("abrir_novo_prestador", False):
        dialog_prestador(usuario["username"])

    df = listar_prestadores()
    if df.empty:
        st.info("Nenhum registro de prestador cadastrado ainda. Utilize o botão acima para iniciar.")
        return

    df = enriquecer_prestadores(df)

    with st.expander("🔎 Filtros", expanded=False):
        col1, col2, col3, col4, col5 = st.columns(5)
        f_resp = col1.multiselect("Responsável", RESPONSAVEIS)
        f_status = col2.multiselect("Status Análise", STATUS_ANALISE_OPCOES)
        f_pep = col3.selectbox("Situação do PEP", SITUACAO_PEP_OPCOES)
        f_pendentes = col4.checkbox("Somente Pendente de Reunião")
        f_cancelados = col5.checkbox("Incluir cancelados", value=False)

    df_filtrado = df.copy()
    if not f_cancelados:
        df_filtrado = df_filtrado[df_filtrado["status_analise"] != "CANCELADO"]
    if f_resp:
        df_filtrado = df_filtrado[df_filtrado["responsavel"].isin(f_resp)]
    if f_status:
        df_filtrado = df_filtrado[df_filtrado["status_analise"].isin(f_status)]
    if f_pep == "Com PEP":
        df_filtrado = df_filtrado[df_filtrado["tem_pep"]]
    elif f_pep == "Sem PEP":
        df_filtrado = df_filtrado[~df_filtrado["tem_pep"]]
    if f_pendentes:
        df_filtrado = df_filtrado[df_filtrado["pendente_reuniao"]]

    df_filtrado = df_filtrado.reset_index(drop=True)
    st.caption(f"{len(df_filtrado)} registro(s) encontrados. Ordenação padrão: Item (ordem de chegada).")

    colunas = list(COLUNAS_EXIBICAO_PRESTADORES.keys())
    df_exibicao = df_filtrado[colunas].rename(columns=COLUNAS_EXIBICAO_PRESTADORES)

    tabela_com_edicao(
        df_exibicao,
        df_filtrado["id"],
        chave="prestadores",
        abrir_dialog_edicao=lambda registro: dialog_prestador(usuario["username"], registro),
        obter_registro=obter_prestador,
    )
