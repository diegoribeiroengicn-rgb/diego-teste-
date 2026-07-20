"""View: Análise de Prestadores (Aba A)."""

from __future__ import annotations

import streamlit as st

from gat.business_rules import enriquecer_prestadores, filtrar_por_competencia
from gat.config import COLUNAS_EXIBICAO_PRESTADORES, RESPONSAVEIS, STATUS_ANALISE_OPCOES
from gat.database import listar_prestadores, obter_prestador
from gat.permissions import exigir_area, exigir_modulo, pode_area
from gat.ui.filtros import rotulo_competencia, seletor_competencia
from gat.ui.modals import dialog_prestador
from gat.ui.tables import tabela_com_edicao

SITUACAO_PEP_OPCOES = ["Todos", "Com PEP", "Sem PEP"]

_CHAVES_FILTRO = [
    "filtro_prest_resp", "filtro_prest_status", "filtro_prest_pep",
    "filtro_prest_pendentes", "filtro_prest_cancelados",
]


def render(usuario: dict) -> None:
    exigir_modulo(usuario, "prestadores")

    st.subheader("Projetos de Prestadores de Serviço")
    st.caption("Cadastro, edição e consulta. Para indicadores e gráficos, veja Prestadores → Dashboard.")

    pode_cadastrar = pode_area(usuario, "prestadores.cadastrar")
    if pode_cadastrar:
        col_novo, _ = st.columns([1, 4])
        with col_novo:
            if st.button("Novo Cadastro", icon=":material/add:", type="primary", key="novo_prestador", use_container_width=True):
                dialog_prestador(usuario["username"])

    if st.session_state.pop("abrir_novo_prestador", False):
        exigir_area(usuario, "prestadores.cadastrar")
        dialog_prestador(usuario["username"])

    df = listar_prestadores()
    if df.empty:
        st.info("Nenhum registro de prestador cadastrado ainda. Utilize o botão acima para iniciar.")
        return

    df = enriquecer_prestadores(df)

    status_default = st.session_state.pop("filtro_prest_status_default", None)
    if status_default is not None:
        st.session_state["filtro_prest_status"] = status_default

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        col1, col2, col3, col4, col5 = st.columns(5)
        f_resp = col1.multiselect("Responsável", RESPONSAVEIS, key="filtro_prest_resp")
        f_status = col2.multiselect("Status Análise", STATUS_ANALISE_OPCOES, key="filtro_prest_status")
        f_pep = col3.selectbox("Situação do PEP", SITUACAO_PEP_OPCOES, key="filtro_prest_pep")
        f_pendentes = col4.checkbox("Somente Pendente de Reunião", key="filtro_prest_pendentes")
        f_cancelados = col5.checkbox("Incluir cancelados", value=False, key="filtro_prest_cancelados")
        mes, ano = seletor_competencia("filtro_prest_comp")
        if st.button("Limpar filtros", icon=":material/filter_alt_off:", key="limpar_filtros_prest"):
            for chave in _CHAVES_FILTRO:
                st.session_state.pop(chave, None)
            st.session_state.pop("filtro_prest_comp_mes", None)
            st.session_state.pop("filtro_prest_comp_ano", None)
            st.rerun()

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
    if mes or ano:
        df_filtrado = filtrar_por_competencia(df_filtrado, "data_solicitacao", mes, ano)
        st.caption(f"Competência: **{rotulo_competencia(mes, ano)}** (baseado na Data de Solicitação)")

    df_filtrado = df_filtrado.reset_index(drop=True)
    st.caption(f"{len(df_filtrado)} registro(s) encontrados. Ordenação padrão: Item (ordem de chegada).")

    colunas = list(COLUNAS_EXIBICAO_PRESTADORES.keys())
    df_exibicao = df_filtrado[colunas].rename(columns=COLUNAS_EXIBICAO_PRESTADORES)

    def _abrir_edicao(registro: dict) -> None:
        exigir_area(usuario, "prestadores.editar")
        dialog_prestador(usuario["username"], registro)

    tabela_com_edicao(
        df_exibicao,
        df_filtrado["id"],
        chave="prestadores",
        abrir_dialog_edicao=_abrir_edicao,
        obter_registro=obter_prestador,
    )
