"""View: Gestão > Planos de Ação."""

from __future__ import annotations

from datetime import date

import streamlit as st

from gat.config import CORES, RESPONSAVEIS, STATUS_PLANO_ACAO_OPCOES
from gat.database import listar_planos_acao, obter_plano_acao
from gat.permissions import exigir_area
from gat.ui.kpi_cards import renderizar_kpis
from gat.ui.modals_gestao import dialog_plano_acao
from gat.ui.tables import tabela_com_edicao

_COLUNAS_EXIBICAO = {
    "id": "ID",
    "descricao": "Descrição",
    "responsavel": "Responsável",
    "prazo": "Prazo",
    "status": "Status",
}

_CHAVES_FILTRO = ["filtro_plano_status", "filtro_plano_resp"]


def render(usuario: dict) -> None:
    exigir_area(usuario, "reunioes")

    st.subheader(":material/task_alt: Planos de Ação")
    st.caption("Ações definidas em reuniões ou registradas diretamente, com responsável, prazo e acompanhamento de conclusão.")

    col_novo, _ = st.columns([1, 4])
    with col_novo:
        if st.button("Novo Plano de Ação", icon=":material/add:", type="primary", key="novo_plano_acao", use_container_width=True):
            dialog_plano_acao(usuario["username"])

    df = listar_planos_acao()
    if df.empty:
        st.info("Nenhum plano de ação registrado ainda. Utilize o botão acima para iniciar.")
        return

    hoje = date.today().isoformat()
    vencidos = int(((df["prazo"].fillna("9999-12-31") < hoje) & (df["status"] != "CONCLUÍDO")).sum())

    renderizar_kpis([
        ("Total", str(len(df)), None),
        ("Pendente", str(int((df["status"] == "PENDENTE").sum())), CORES["laranja"]),
        ("Em Andamento", str(int((df["status"] == "EM ANDAMENTO").sum())), CORES["azul_2"]),
        ("Concluído", str(int((df["status"] == "CONCLUÍDO").sum())), CORES["verde"]),
        ("Vencidos", str(vencidos), CORES["vermelho"]),
    ])

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        col1, col2, col3 = st.columns([2, 2, 1])
        f_status = col1.multiselect("Status", STATUS_PLANO_ACAO_OPCOES, key="filtro_plano_status")
        f_resp = col2.multiselect("Responsável", RESPONSAVEIS, key="filtro_plano_resp")
        with col3:
            st.write("")
            if st.button("Limpar filtros", icon=":material/filter_alt_off:", key="limpar_filtros_plano"):
                for chave in _CHAVES_FILTRO:
                    st.session_state.pop(chave, None)
                st.rerun()

    df_filtrado = df.copy()
    if f_status:
        df_filtrado = df_filtrado[df_filtrado["status"].isin(f_status)]
    if f_resp:
        df_filtrado = df_filtrado[df_filtrado["responsavel"].isin(f_resp)]

    df_filtrado = df_filtrado.reset_index(drop=True)
    st.caption(f"{len(df_filtrado)} plano(s) encontrado(s).")

    colunas = list(_COLUNAS_EXIBICAO.keys())
    df_exibicao = df_filtrado[colunas].rename(columns=_COLUNAS_EXIBICAO)

    tabela_com_edicao(
        df_exibicao,
        df_filtrado["id"],
        chave="planos_acao",
        abrir_dialog_edicao=lambda registro: dialog_plano_acao(usuario["username"], registro),
        obter_registro=obter_plano_acao,
    )
