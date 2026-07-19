"""View: Dashboard exclusivo de Cessionários (KPIs e gráficos próprios do módulo)."""

from __future__ import annotations

import streamlit as st

from gat.business_rules import enriquecer_cessionarios, filtrar_ativos
from gat.config import CORES
from gat.database import listar_cessionarios
from gat.ui.charts import (
    gauge_sla,
    grafico_aging,
    grafico_disciplina,
    grafico_evolucao_mensal_unico,
    grafico_por_categoria,
    grafico_status_donut,
    grafico_top_responsaveis,
)
from gat.ui.kpi_cards import renderizar_kpis


def render(usuario: dict) -> None:
    st.subheader(":material/dashboard: Dashboard — Cessionários")
    st.caption("Indicadores exclusivos do módulo de Cessionários. Projetos CANCELADOS são excluídos.")

    df = enriquecer_cessionarios(filtrar_ativos(listar_cessionarios()))

    if df.empty:
        st.info("Nenhum registro ativo de cessionário para exibir indicadores.")
        return

    total_projetos = len(df)
    total_ats = df["num_at"].replace("", None).dropna().nunique()
    total_documentos = int(df["num_documentos"].fillna(0).sum())

    em_analise = int((df["status_analise"] == "EM ANÁLISE").sum())
    liberados = int(df["status_analise"].isin(["LIBERADO", "LIBERADO C/ REST."]).sum())
    nao_liberados = int((df["status_analise"] == "NÃO LIBERADO").sum())

    dentro_prazo = int(df["status_entrega_calc"].isin(["ANTES DO PRAZO", "NO PRAZO"]).sum())
    fora_prazo = int((df["status_entrega_calc"] == "ATRASADO").sum())
    sla_5 = int((df["sla_dias"] == 5).sum())
    sla_10 = int((df["sla_dias"] == 10).sum())

    concluidos = df[df["data_analise"].notna()]
    tempo_medio = round(concluidos["saldo_dias_uteis"].mean(), 1) if not concluidos.empty else 0
    mediana_analise = round(concluidos["saldo_dias_uteis"].median(), 1) if not concluidos.empty else 0

    holds = int((df["hold_dias"] > 0).sum())
    revisao_media = round(df["revisao"].mean(), 1) if total_projetos else 0
    num_erros = int(df["num_erros"].fillna(0).sum())
    etgs = int((df["etg"] == "SIM").sum())
    sem_pep = int((~df["tem_pep"]).sum())
    criticos = int(df["pendente_reuniao"].sum())

    total_status_entrega = df["status_entrega_calc"].notna().sum()
    pct_sla = round((dentro_prazo / total_status_entrega) * 100, 1) if total_status_entrega else 0.0

    st.markdown("##### Volume")
    renderizar_kpis([
        ("Total de Projetos", str(total_projetos), CORES["navy"]),
        ("Total de ATs", str(int(total_ats)), CORES["ceu"]),
        ("Total de Documentos", str(total_documentos), CORES["azul_2"]),
    ])

    st.markdown("##### Status e Prazo")
    renderizar_kpis([
        ("Em Análise", str(em_analise), CORES["azul_2"]),
        ("Liberados", str(liberados), CORES["verde"]),
        ("Não Liberados", str(nao_liberados), CORES["laranja"]),
        ("Dentro do Prazo", str(dentro_prazo), CORES["verde"]),
        ("Fora do Prazo", str(fora_prazo), CORES["vermelho"]),
    ])

    st.markdown("##### SLA e Tempo de Análise")
    renderizar_kpis([
        ("SLA de 5 dias úteis", str(sla_5), CORES["ceu"]),
        ("SLA de 10 dias úteis", str(sla_10), CORES["ceu"]),
        ("Tempo Médio (saldo dias)", str(tempo_medio), CORES["navy"]),
        ("Mediana (saldo dias)", str(mediana_analise), CORES["navy"]),
    ])

    st.markdown("##### Qualidade e Governança")
    renderizar_kpis([
        ("Holds Ativos/Registrados", str(holds), CORES["dourado"]),
        ("Revisão Média", str(revisao_media), CORES["roxo"]),
        ("N° de Erros Encontrados", str(num_erros), CORES["laranja"]),
        ("ETGs", str(etgs), CORES["roxo"]),
        ("Projetos Críticos (Pendente Reunião)", str(criticos), CORES["vermelho"]),
        ("Projetos sem PEP", str(sem_pep), CORES["dourado"]),
    ])

    col1, col2 = st.columns([2, 1])
    with col1:
        st.plotly_chart(grafico_evolucao_mensal_unico(df, "Cessionários", CORES["azul_2"]), use_container_width=True)
    with col2:
        st.plotly_chart(gauge_sla(pct_sla, "% Dentro do Prazo"), use_container_width=True)

    col3, col4 = st.columns(2)
    with col3:
        st.plotly_chart(grafico_status_donut(df, "status_analise", "Distribuição por Status"), use_container_width=True)
    with col4:
        st.plotly_chart(grafico_por_categoria(df, "tipo", "Projetos por Tipo", CORES["navy"]), use_container_width=True)

    col5, col6 = st.columns(2)
    with col5:
        st.plotly_chart(grafico_disciplina(df), use_container_width=True)
    with col6:
        st.plotly_chart(grafico_top_responsaveis(df), use_container_width=True)

    col7, col8 = st.columns(2)
    with col7:
        st.plotly_chart(grafico_por_categoria(df, "cessionario", "Projetos por Cessionário (Top 10)", CORES["ceu"], top_n=10), use_container_width=True)
    with col8:
        st.plotly_chart(grafico_aging(df, "saldo_dias_uteis"), use_container_width=True)
