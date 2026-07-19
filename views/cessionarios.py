"""View: Análise de Cessionários (Aba B)."""

from __future__ import annotations

import streamlit as st

from gat.business_rules import enriquecer_cessionarios
from gat.config import COLUNAS_EXIBICAO_CESSIONARIOS, CORES, RESPONSAVEIS, STATUS_ANALISE_OPCOES, TIPO_CESSIONARIO_OPCOES
from gat.database import listar_cessionarios, obter_cessionario
from gat.ui.kpi_cards import renderizar_kpis
from gat.ui.modals import dialog_cessionario
from gat.ui.tables import tabela_com_edicao

SITUACAO_PEP_OPCOES = ["Todos", "Com PEP", "Sem PEP"]


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
    df_ativos = df[df["status_analise"] != "CANCELADO"]
    total_sem_pep = int((~df_ativos["tem_pep"]).sum())

    renderizar_kpis([
        ("Projetos Ativos", str(len(df_ativos)), CORES["navy"]),
        ("Atrasados", str(int((df_ativos["status_entrega_calc"] == "ATRASADO").sum())), CORES["vermelho"]),
        ("Pendente de Reunião", str(int(df_ativos["pendente_reuniao"].sum())), CORES["laranja"]),
        ("Projetos sem PEP", str(total_sem_pep), CORES["dourado"]),
    ])

    with st.expander("🔎 Filtros", expanded=False):
        col1, col2, col3, col4, col5, col6 = st.columns(6)
        f_resp = col1.multiselect("Responsável", RESPONSAVEIS)
        f_status = col2.multiselect("Status Análise", STATUS_ANALISE_OPCOES)
        f_tipo = col3.multiselect("Tipo", TIPO_CESSIONARIO_OPCOES)
        f_pep = col4.selectbox("Situação do PEP", SITUACAO_PEP_OPCOES)
        f_pendentes = col5.checkbox("Somente Pendente de Reunião")
        f_cancelados = col6.checkbox("Incluir cancelados", value=False)

    df_filtrado = df.copy()
    if not f_cancelados:
        df_filtrado = df_filtrado[df_filtrado["status_analise"] != "CANCELADO"]
    if f_resp:
        df_filtrado = df_filtrado[df_filtrado["responsavel"].isin(f_resp)]
    if f_status:
        df_filtrado = df_filtrado[df_filtrado["status_analise"].isin(f_status)]
    if f_tipo:
        df_filtrado = df_filtrado[df_filtrado["tipo"].isin(f_tipo)]
    if f_pep == "Com PEP":
        df_filtrado = df_filtrado[df_filtrado["tem_pep"]]
    elif f_pep == "Sem PEP":
        df_filtrado = df_filtrado[~df_filtrado["tem_pep"]]
    if f_pendentes:
        df_filtrado = df_filtrado[df_filtrado["pendente_reuniao"]]

    df_filtrado = df_filtrado.reset_index(drop=True)
    st.caption(f"{len(df_filtrado)} registro(s) encontrados. Ordenação padrão: Item (ordem de chegada).")

    colunas = list(COLUNAS_EXIBICAO_CESSIONARIOS.keys())
    df_exibicao = df_filtrado[colunas].rename(columns=COLUNAS_EXIBICAO_CESSIONARIOS)

    tabela_com_edicao(
        df_exibicao,
        df_filtrado["id"],
        chave="cessionarios",
        abrir_dialog_edicao=lambda registro: dialog_cessionario(usuario["username"], registro),
        obter_registro=obter_cessionario,
    )
