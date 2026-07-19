"""View: Painel Geral Consolidado (Dashboard GAT)."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores, filtrar_ativos
from gat.config import CORES
from gat.database import listar_cessionarios, listar_prestadores
from gat.ui.charts import (
    gauge_sla,
    grafico_aging,
    grafico_disciplina,
    grafico_evolucao_mensal,
    grafico_status_donut,
    grafico_top_responsaveis,
)
from gat.permissions import exigir_modulo
from gat.ui.kpi_cards import renderizar_kpis


def render(usuario: dict) -> None:
    exigir_modulo(usuario, "consolidado")

    st.subheader(":material/insights: Painel Geral Consolidado")
    st.caption("União (consolidação) das abas de Prestadores e Cessionários. Projetos CANCELADOS são rigorosamente excluídos.")

    df_prest_bruto = listar_prestadores()
    df_cess_bruto = listar_cessionarios()

    df_prest = enriquecer_prestadores(filtrar_ativos(df_prest_bruto))
    df_cess = enriquecer_cessionarios(filtrar_ativos(df_cess_bruto))

    total_prest = len(df_prest)
    total_cess = len(df_cess)
    total_geral = total_prest + total_cess

    atrasados_prest = int((df_prest["status_entrega_calc"] == "ATRASADO").sum()) if not df_prest.empty else 0
    atrasados_cess = int((df_cess["status_entrega_calc"] == "ATRASADO").sum()) if not df_cess.empty else 0
    total_atrasados = atrasados_prest + atrasados_cess

    pendentes_reuniao = (
        int(df_prest["pendente_reuniao"].sum()) if not df_prest.empty else 0
    ) + (int(df_cess["pendente_reuniao"].sum()) if not df_cess.empty else 0)

    pct_no_prazo = 0.0
    if total_geral > 0:
        no_prazo = total_geral - total_atrasados
        pct_no_prazo = round((no_prazo / total_geral) * 100, 1)

    sem_pep_prest = int((~df_prest["tem_pep"]).sum()) if not df_prest.empty else 0
    sem_pep_cess = int((~df_cess["tem_pep"]).sum()) if not df_cess.empty else 0

    renderizar_kpis([
        ("Projetos Ativos (Total)", str(total_geral), CORES["navy"]),
        ("Prestadores Ativos", str(total_prest), CORES["azul_2"]),
        ("Cessionários Ativos", str(total_cess), CORES["ceu"]),
        ("Atrasados", str(total_atrasados), CORES["vermelho"]),
        ("Pendente de Reunião", str(pendentes_reuniao), CORES["laranja"]),
    ])

    renderizar_kpis([
        ("Projetos sem PEP (Total)", str(sem_pep_prest + sem_pep_cess), CORES["dourado"]),
        ("Sem PEP — Prestadores", str(sem_pep_prest), CORES["dourado"]),
        ("Sem PEP — Cessionários", str(sem_pep_cess), CORES["dourado"]),
    ])

    st.markdown("####")
    col_g1, col_g2 = st.columns([2, 1])
    with col_g1:
        st.plotly_chart(grafico_evolucao_mensal(df_prest, df_cess), use_container_width=True)
    with col_g2:
        st.plotly_chart(gauge_sla(pct_no_prazo, "% Dentro do Prazo"), use_container_width=True)

    col_g3, col_g4 = st.columns(2)
    with col_g3:
        df_consolidado_status = pd.concat(
            [df_prest[["status_analise"]] if not df_prest.empty else pd.DataFrame(columns=["status_analise"]),
             df_cess[["status_analise"]] if not df_cess.empty else pd.DataFrame(columns=["status_analise"])],
            ignore_index=True,
        )
        st.plotly_chart(grafico_status_donut(df_consolidado_status, "status_analise", "Distribuição por Status de Análise"), use_container_width=True)
    with col_g4:
        df_consolidado_resp = pd.concat(
            [df_prest[["responsavel"]] if not df_prest.empty else pd.DataFrame(columns=["responsavel"]),
             df_cess[["responsavel"]] if not df_cess.empty else pd.DataFrame(columns=["responsavel"])],
            ignore_index=True,
        )
        st.plotly_chart(grafico_top_responsaveis(df_consolidado_resp), use_container_width=True)

    col_g5, col_g6 = st.columns(2)
    with col_g5:
        df_consolidado_disc = pd.concat(
            [df_prest[["disciplina"]] if not df_prest.empty else pd.DataFrame(columns=["disciplina"]),
             df_cess[["disciplina"]] if not df_cess.empty else pd.DataFrame(columns=["disciplina"])],
            ignore_index=True,
        )
        st.plotly_chart(grafico_disciplina(df_consolidado_disc), use_container_width=True)
    with col_g6:
        coluna_dias = "dias_uteis_decorridos" if not df_prest.empty else "saldo_dias_uteis"
        base_aging = df_prest if not df_prest.empty else df_cess
        coluna_disp = "dias_uteis_decorridos" if "dias_uteis_decorridos" in base_aging.columns else "saldo_dias_uteis"
        st.plotly_chart(grafico_aging(base_aging, coluna_disp), use_container_width=True)

    st.markdown("#### Resumo Sintético")
    tab1, tab2 = st.tabs(["Prestadores", "Cessionários"])
    with tab1:
        if df_prest.empty:
            st.info("Sem registros ativos de prestadores.")
        else:
            resumo = df_prest.groupby("responsavel").agg(
                projetos=("id", "count"),
                atrasados=("status_entrega_calc", lambda s: (s == "ATRASADO").sum()),
                pendentes_reuniao=("pendente_reuniao", "sum"),
            ).reset_index()
            st.dataframe(resumo, use_container_width=True, hide_index=True)
    with tab2:
        if df_cess.empty:
            st.info("Sem registros ativos de cessionários.")
        else:
            resumo = df_cess.groupby("responsavel").agg(
                projetos=("id", "count"),
                atrasados=("status_entrega_calc", lambda s: (s == "ATRASADO").sum()),
                pendentes_reuniao=("pendente_reuniao", "sum"),
            ).reset_index()
            st.dataframe(resumo, use_container_width=True, hide_index=True)
