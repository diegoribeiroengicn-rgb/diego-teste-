"""View: Avaliação de Prestadores (baseado em Avaliacao_Prestadores_GAT.xlsx)."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.business_rules import classificar_nota
from gat.config import COLUNAS_EXIBICAO_AVALIACOES, CORES_CLASSIFICACAO_AVALIACAO, RESPONSAVEIS
from gat.database import listar_avaliacoes, obter_avaliacao
from gat.permissions import exigir_area, exigir_modulo, pode_area
from gat.ui.charts import grafico_status_donut
from gat.ui.kpi_cards import renderizar_kpis
from gat.ui.modals import dialog_avaliacao
from gat.ui.tables import tabela_com_edicao


def render(usuario: dict) -> None:
    exigir_modulo(usuario, "prestadores")
    exigir_area(usuario, "avaliacoes.visualizar")

    st.subheader(":material/grade: Avaliação de Prestadores")
    st.caption("Escala 1–15 · Crítico ≤3 · Baixo 4–6 · Regular 7–9 · Bom 10–12 · Excelente 13–15")

    if pode_area(usuario, "avaliacoes.cadastrar"):
        col_novo, _ = st.columns([1, 4])
        with col_novo:
            if st.button("Nova Avaliação", icon=":material/add:", type="primary", key="nova_avaliacao", use_container_width=True):
                dialog_avaliacao(usuario["username"])

    df = listar_avaliacoes()
    if df.empty:
        st.info("Nenhuma avaliação registrada ainda. Utilize o botão acima para iniciar.")
        return

    df["classificacao"] = df["nota"].apply(lambda n: classificar_nota(n)[0])

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        col1, col2, col3 = st.columns([2, 2, 1])
        f_prestador = col1.multiselect("Prestador", sorted(df["nome_prestador"].dropna().unique().tolist()), key="filtro_aval_prestador")
        f_analista = col2.multiselect("Analista", RESPONSAVEIS, key="filtro_aval_analista")
        with col3:
            st.write("")
            if st.button("Limpar filtros", icon=":material/filter_alt_off:", key="limpar_filtros_aval"):
                for chave in ("filtro_aval_prestador", "filtro_aval_analista"):
                    st.session_state.pop(chave, None)
                st.rerun()

    df_filtrado = df.copy()
    if f_prestador:
        df_filtrado = df_filtrado[df_filtrado["nome_prestador"].isin(f_prestador)]
    if f_analista:
        df_filtrado = df_filtrado[df_filtrado["analista_responsavel"].isin(f_analista)]

    df_filtrado = df_filtrado.reset_index(drop=True)

    media = df_filtrado["nota"].mean() if not df_filtrado.empty else 0
    mediana = df_filtrado["nota"].median() if not df_filtrado.empty else 0
    melhor = df_filtrado["nota"].max() if not df_filtrado.empty else 0
    pior = df_filtrado["nota"].min() if not df_filtrado.empty else 0

    renderizar_kpis([
        ("Avaliações", str(len(df_filtrado)), None),
        ("Nota Média", f"{media:.1f}", None),
        ("Mediana", f"{mediana:.1f}", None),
        ("Melhor Nota", str(int(melhor)), CORES_CLASSIFICACAO_AVALIACAO["EXCELENTE"]),
        ("Pior Nota", str(int(pior)), CORES_CLASSIFICACAO_AVALIACAO["CRÍTICO"]),
    ])

    contagem_prestador = df_filtrado["nome_prestador"].value_counts()
    baixa_representatividade = contagem_prestador[contagem_prestador < 3].index.tolist()
    if baixa_representatividade:
        st.warning(
            "Baixa representatividade estatística (menos de 3 avaliações) para: "
            + ", ".join(baixa_representatividade)
        )

    df_classificacao = pd.DataFrame({"status_analise": df_filtrado["classificacao"]})
    st.plotly_chart(
        grafico_status_donut(df_classificacao, "status_analise", "Distribuição por Classificação", mapa_cores=CORES_CLASSIFICACAO_AVALIACAO),
        use_container_width=True,
    )

    st.caption(f"{len(df_filtrado)} avaliação(ões) encontrada(s).")
    colunas = list(COLUNAS_EXIBICAO_AVALIACOES.keys())
    df_exibicao = df_filtrado[colunas].rename(columns=COLUNAS_EXIBICAO_AVALIACOES)

    def _abrir_edicao(registro: dict) -> None:
        exigir_area(usuario, "avaliacoes.cadastrar")
        dialog_avaliacao(usuario["username"], registro)

    tabela_com_edicao(
        df_exibicao,
        df_filtrado["id"],
        chave="avaliacoes",
        abrir_dialog_edicao=_abrir_edicao,
        obter_registro=obter_avaliacao,
    )
