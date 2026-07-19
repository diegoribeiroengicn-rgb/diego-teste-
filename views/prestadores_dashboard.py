"""View: Dashboard exclusivo de Prestadores (KPIs e gráficos próprios do módulo)."""

from __future__ import annotations

import streamlit as st

from gat.business_rules import classificar_nota, enriquecer_prestadores, filtrar_ativos
from gat.config import CORES, META_REVISAO_APROVACAO
from gat.database import listar_avaliacoes, listar_prestadores
from gat.ui.charts import (
    gauge_sla,
    grafico_aging,
    grafico_disciplina,
    grafico_evolucao_mensal_unico,
    grafico_status_donut,
    grafico_top_responsaveis,
)
from gat.ui.kpi_cards import renderizar_kpis


def render(usuario: dict) -> None:
    st.subheader("📊 Dashboard — Prestadores de Serviço")
    st.caption("Indicadores exclusivos do módulo de Prestadores. Projetos CANCELADOS são excluídos.")

    df = enriquecer_prestadores(filtrar_ativos(listar_prestadores()))

    if df.empty:
        st.info("Nenhum registro ativo de prestador para exibir indicadores.")
        return

    total_projetos = len(df)
    total_ats = df["num_at"].replace("", None).dropna().nunique()
    total_documentos = int(df["num_documentos"].fillna(0).sum())
    total_avaliacoes = len(listar_avaliacoes())

    em_analise = int((df["status_analise"] == "EM ANÁLISE").sum())
    liberados = int((df["status_analise"] == "LIBERADO").sum())
    liberados_restricao = int((df["status_analise"] == "LIBERADO C/ REST.").sum())
    nao_liberados = int((df["status_analise"] == "NÃO LIBERADO").sum())

    liberados_geral = df[df["status_analise"].isin(["LIBERADO", "LIBERADO C/ REST."])]
    aprovacao_rev1 = int((liberados_geral["revisao"] <= 1).sum())
    aprovacao_rev2 = int((liberados_geral["revisao"] <= META_REVISAO_APROVACAO).sum())
    acima_meta = int((df["revisao"] > META_REVISAO_APROVACAO).sum())
    pendentes_retorno = int((df["status_analise"] == "EM HOLD").sum())

    concluidos = df[df["data_analise"].notna()]
    tempo_medio = round(concluidos["dias_uteis_decorridos"].mean(), 1) if not concluidos.empty else 0
    total_status_entrega = df["status_entrega_calc"].notna().sum()
    no_prazo = df["status_entrega_calc"].isin(["ANTES DO PRAZO", "NO PRAZO"]).sum()
    pct_sla = round((no_prazo / total_status_entrega) * 100, 1) if total_status_entrega else 0.0

    num_erros = int(df["num_erros"].fillna(0).sum())
    etgs = int((df["etg"] == "SIM").sum())
    sem_pep = int((~df["tem_pep"]).sum())

    df_aval = listar_avaliacoes()
    prestadores_criticos = 0
    if not df_aval.empty:
        media_por_prestador = df_aval.groupby("nome_prestador")["nota"].mean()
        prestadores_criticos = int(sum(1 for nota in media_por_prestador if classificar_nota(round(nota))[0] == "CRÍTICO"))

    st.markdown("##### Volume")
    renderizar_kpis([
        ("Total de Projetos", str(total_projetos), CORES["navy"]),
        ("Total de ATs", str(int(total_ats)), CORES["azul_2"]),
        ("Total de Documentos", str(total_documentos), CORES["ceu"]),
        ("Avaliações Registradas", str(total_avaliacoes), CORES["roxo"]),
    ])

    st.markdown("##### Status de Análise")
    renderizar_kpis([
        ("Em Análise", str(em_analise), CORES["azul_2"]),
        ("Liberados", str(liberados), CORES["verde"]),
        ("Liberados c/ Restrição", str(liberados_restricao), CORES["lima"]),
        ("Não Liberados", str(nao_liberados), CORES["laranja"]),
    ])

    st.markdown("##### Metas e Prazos")
    renderizar_kpis([
        ("Aprovação até REV1", str(aprovacao_rev1), CORES["verde"]),
        (f"Aprovação até REV{META_REVISAO_APROVACAO}", str(aprovacao_rev2), CORES["verde"]),
        ("Revisões Acima da Meta", str(acima_meta), CORES["vermelho"]),
        ("Pendentes de Retorno (Hold)", str(pendentes_retorno), CORES["dourado"]),
        ("Tempo Médio de Análise (dias)", str(tempo_medio), CORES["navy"]),
    ])

    st.markdown("##### Qualidade e Governança")
    renderizar_kpis([
        ("% Dentro do SLA", f"{pct_sla}%", CORES["verde"]),
        ("N° de Erros Encontrados", str(num_erros), CORES["laranja"]),
        ("ETGs", str(etgs), CORES["roxo"]),
        ("Prestadores Críticos", str(prestadores_criticos), CORES["vermelho"]),
        ("Projetos sem PEP", str(sem_pep), CORES["dourado"]),
    ])

    col1, col2 = st.columns([2, 1])
    with col1:
        st.plotly_chart(grafico_evolucao_mensal_unico(df, "Prestadores", CORES["navy"]), use_container_width=True)
    with col2:
        st.plotly_chart(gauge_sla(pct_sla, "% Dentro do SLA"), use_container_width=True)

    col3, col4 = st.columns(2)
    with col3:
        st.plotly_chart(grafico_status_donut(df, "status_analise", "Distribuição por Status"), use_container_width=True)
    with col4:
        st.plotly_chart(grafico_top_responsaveis(df), use_container_width=True)

    col5, col6 = st.columns(2)
    with col5:
        st.plotly_chart(grafico_disciplina(df), use_container_width=True)
    with col6:
        st.plotly_chart(grafico_aging(df, "dias_uteis_decorridos"), use_container_width=True)
