"""View: Análise de Cessionários (Aba B)."""

from __future__ import annotations

import streamlit as st

from gat.business_rules import enriquecer_cessionarios
from gat.config import COLUNAS_EXIBICAO_CESSIONARIOS, RESPONSAVEIS, STATUS_ANALISE_OPCOES, TIPO_CESSIONARIO_OPCOES
from gat.database import listar_cessionarios, obter_cessionario
from gat.permissions import exigir_area, exigir_modulo, pode_area
from gat.ui.modals import dialog_cessionario
from gat.ui.tables import tabela_com_edicao

SITUACAO_PEP_OPCOES = ["Todos", "Com PEP", "Sem PEP"]

_CHAVES_FILTRO = [
    "filtro_cess_resp", "filtro_cess_status", "filtro_cess_tipo",
    "filtro_cess_pep", "filtro_cess_pendentes", "filtro_cess_cancelados",
]


def render(usuario: dict) -> None:
    exigir_modulo(usuario, "cessionarios")

    st.subheader("Projetos de Cessionários")
    st.caption("Cadastro, edição e consulta. Para indicadores e gráficos, veja Cessionários → Dashboard.")

    if pode_area(usuario, "cessionarios.cadastrar"):
        col_novo, _ = st.columns([1, 4])
        with col_novo:
            if st.button("Novo Cadastro", icon=":material/add:", type="primary", key="novo_cessionario", use_container_width=True):
                dialog_cessionario(usuario["username"])

    if st.session_state.pop("abrir_novo_cessionario", False):
        exigir_area(usuario, "cessionarios.cadastrar")
        dialog_cessionario(usuario["username"])

    df = listar_cessionarios()
    if df.empty:
        st.info("Nenhum registro de cessionário cadastrado ainda. Utilize o botão acima para iniciar.")
        return

    df = enriquecer_cessionarios(df)

    status_default = st.session_state.pop("filtro_cess_status_default", None)
    if status_default is not None:
        st.session_state["filtro_cess_status"] = status_default

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        col1, col2, col3, col4, col5, col6 = st.columns(6)
        f_resp = col1.multiselect("Responsável", RESPONSAVEIS, key="filtro_cess_resp")
        f_status = col2.multiselect("Status Análise", STATUS_ANALISE_OPCOES, key="filtro_cess_status")
        f_tipo = col3.multiselect("Tipo", TIPO_CESSIONARIO_OPCOES, key="filtro_cess_tipo")
        f_pep = col4.selectbox("Situação do PEP", SITUACAO_PEP_OPCOES, key="filtro_cess_pep")
        f_pendentes = col5.checkbox("Somente Pendente de Reunião", key="filtro_cess_pendentes")
        f_cancelados = col6.checkbox("Incluir cancelados", value=False, key="filtro_cess_cancelados")
        if st.button("Limpar filtros", icon=":material/filter_alt_off:", key="limpar_filtros_cess"):
            for chave in _CHAVES_FILTRO:
                st.session_state.pop(chave, None)
            st.rerun()

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

    def _abrir_edicao(registro: dict) -> None:
        exigir_area(usuario, "cessionarios.editar")
        dialog_cessionario(usuario["username"], registro)

    tabela_com_edicao(
        df_exibicao,
        df_filtrado["id"],
        chave="cessionarios",
        abrir_dialog_edicao=_abrir_edicao,
        obter_registro=obter_cessionario,
    )
