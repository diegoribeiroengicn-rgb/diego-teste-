"""View: Painel Geral Consolidado (Dashboard GAT).

A ordem de apresentação é deliberadamente executiva: primeiro o panorama
operacional (volume, distribuição, produção), só depois os prazos e
atrasos — que ficam reunidos ao final, na seção "Acompanhamento de
Prazos", com um tom visual gerencial (sem cartões vermelhos gigantes ou
texto em caixa alta dominando a tela). Os atrasos continuam com os mesmos
cálculos e todos os indicadores anteriores — mudou apenas a posição e a
intensidade visual, nunca o conteúdo."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores, filtrar_ativos, filtrar_por_competencia, resumo_indicadores_atraso
from gat.config import CORES
from gat.database import listar_cessionarios, listar_prestadores, registrar_atividade
from gat.export_projetos import gerar_csv_bytes, gerar_excel_bytes, montar_exportacao_consolidada, nome_arquivo_exportacao
from gat.ui.charts import (
    gauge_sla,
    grafico_aging,
    grafico_disciplina,
    grafico_evolucao_mensal,
    grafico_status_donut,
    grafico_top_responsaveis,
)
from gat.permissions import exigir_modulo, exigir_area, pode_area
from gat.ui.filtros import rotulo_competencia, seletor_competencia
from gat.ui.kpi_cards import renderizar_kpis


def _renderizar_acompanhamento_prazos(
    df_prest, df_cess, total_atrasados: int, pendentes_reuniao: int, pct_no_prazo: float, base_aging, coluna_disp: str,
) -> None:
    """Seção final da Visão Geral — reúne todos os indicadores de prazo e
    atraso já existentes (cálculos inalterados), com apresentação discreta
    e gerencial em vez de destaque alarmista: cartões no mesmo padrão
    visual das demais métricas da página, sem caixa alta nem blocos
    vermelhos ocupando a largura inteira."""
    r1 = resumo_indicadores_atraso(df_prest, "prestadores")
    r2 = resumo_indicadores_atraso(df_cess, "cessionarios")
    total_ativos = r1["em_analise"] + r2["em_analise"]
    atrasados_em_analise = r1["atrasados_em_analise"] + r2["atrasados_em_analise"]
    pct = round((atrasados_em_analise / total_ativos) * 100, 1) if total_ativos else 0.0

    st.markdown("---")
    st.markdown("#### Acompanhamento de Prazos")
    st.caption("Situação de prazos e atrasos das análises ativas e concluídas — Prestadores e Cessionários.")

    col_g1, col_g2 = st.columns(2)
    with col_g1:
        st.plotly_chart(gauge_sla(pct_no_prazo, "% Dentro do Prazo"), use_container_width=True)
    with col_g2:
        st.plotly_chart(grafico_aging(base_aging, coluna_disp), use_container_width=True)

    renderizar_kpis([
        ("Atrasados (Total)", str(total_atrasados), CORES["vermelho"]),
        ("Pendente de Reunião", str(pendentes_reuniao), CORES["laranja"]),
    ])
    renderizar_kpis([
        ("Em Análise", str(total_ativos), CORES["azul_2"]),
        ("Dentro do Prazo", str(r1["dentro_prazo"] + r2["dentro_prazo"]), CORES["verde"]),
        ("Próximos do Vencimento", str(r1["proximo_vencimento"] + r2["proximo_vencimento"]), CORES["dourado"]),
    ])
    renderizar_kpis([
        ("Atrasados em Análise", str(atrasados_em_analise), CORES["vermelho"]),
        ("Concluídos no Prazo", str(r1["concluidos_no_prazo"] + r2["concluidos_no_prazo"]), CORES["verde"]),
        ("Concluídos com Atraso", str(r1["concluidos_com_atraso"] + r2["concluidos_com_atraso"]), CORES["laranja"]),
    ])
    st.caption(
        f"{pct}% dos projetos ativos estão atrasados em análise "
        f"({r1['atrasados_em_analise']} Prestadores · {r2['atrasados_em_analise']} Cessionários). "
        f"Total de projetos atrasados (ativos + concluídos com atraso): {r1['total_atrasados'] + r2['total_atrasados']}."
    )


def render(usuario: dict) -> None:
    exigir_modulo(usuario, "consolidado")

    st.subheader(":material/insights: Painel Geral Consolidado")
    st.caption("União (consolidação) das abas de Prestadores e Cessionários. Projetos CANCELADOS são rigorosamente excluídos.")

    df_prest_bruto = listar_prestadores()
    df_cess_bruto = listar_cessionarios()

    df_prest_completo = enriquecer_prestadores(filtrar_ativos(df_prest_bruto))
    df_cess_completo = enriquecer_cessionarios(filtrar_ativos(df_cess_bruto))

    with st.expander("Filtro de competência", icon=":material/calendar_month:", expanded=False):
        mes, ano = seletor_competencia("consolidado")
    st.caption(f"Competência: **{rotulo_competencia(mes, ano)}** (baseado na Data de Solicitação)")

    if mes or ano:
        df_prest = filtrar_por_competencia(df_prest_completo, "data_solicitacao", mes, ano)
        df_cess = filtrar_por_competencia(df_cess_completo, "data_solicitacao", mes, ano)
    else:
        df_prest = df_prest_completo
        df_cess = df_cess_completo

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

    # --- Panorama operacional (primeira informação da página) ---------------
    st.markdown("##### Panorama Operacional")
    renderizar_kpis([
        ("Projetos Ativos (Total)", str(total_geral), CORES["navy"]),
        ("Prestadores Ativos", str(total_prest), CORES["azul_2"]),
        ("Cessionários Ativos", str(total_cess), CORES["ceu"]),
    ])
    renderizar_kpis([
        ("Projetos sem PEP — Prestadores", str(sem_pep_prest), CORES["dourado"]),
    ])

    # --- Produção e distribuição da demanda ---------------------------------
    st.markdown("####")
    st.markdown("##### Produção e Distribuição")
    col_g1, col_g2 = st.columns(2)
    with col_g1:
        df_consolidado_status = pd.concat(
            [df_prest[["status_analise"]] if not df_prest.empty else pd.DataFrame(columns=["status_analise"]),
             df_cess[["status_analise"]] if not df_cess.empty else pd.DataFrame(columns=["status_analise"])],
            ignore_index=True,
        )
        st.plotly_chart(grafico_status_donut(df_consolidado_status, "status_analise", "Distribuição por Status de Análise"), use_container_width=True)
    with col_g2:
        df_consolidado_resp = pd.concat(
            [df_prest[["responsavel"]] if not df_prest.empty else pd.DataFrame(columns=["responsavel"]),
             df_cess[["responsavel"]] if not df_cess.empty else pd.DataFrame(columns=["responsavel"])],
            ignore_index=True,
        )
        st.plotly_chart(grafico_top_responsaveis(df_consolidado_resp), use_container_width=True)

    col_g3, col_g4 = st.columns([2, 1])
    with col_g3:
        st.plotly_chart(grafico_evolucao_mensal(df_prest, df_cess), use_container_width=True)
    with col_g4:
        df_consolidado_disc = pd.concat(
            [df_prest[["disciplina"]] if not df_prest.empty else pd.DataFrame(columns=["disciplina"]),
             df_cess[["disciplina"]] if not df_cess.empty else pd.DataFrame(columns=["disciplina"])],
            ignore_index=True,
        )
        st.plotly_chart(grafico_disciplina(df_consolidado_disc), use_container_width=True)

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

    # --- Prazos e atrasos (última seção, tom gerencial) ---------------------
    base_aging = df_prest if not df_prest.empty else df_cess
    coluna_disp = "dias_uteis_decorridos" if "dias_uteis_decorridos" in base_aging.columns else "saldo_dias_uteis"
    _renderizar_acompanhamento_prazos(df_prest, df_cess, total_atrasados, pendentes_reuniao, pct_no_prazo, base_aging, coluna_disp)

    if pode_area(usuario, "consolidado.exportar"):
        st.markdown("---")
        st.markdown("##### Exportar Projetos Consolidados")
        st.caption("Junta Prestadores e Cessionários em um único arquivo, com a coluna \"Tipo de Projeto\" identificando a origem de cada linha.")
        pode_completo = pode_area(usuario, "consolidado.exportar_completo")
        col_escopo, col_formato = st.columns(2)
        opcoes_escopo = ["Dados filtrados"] + (["Base completa"] if pode_completo else [])
        escopo = col_escopo.selectbox("Escopo da exportação", opcoes_escopo, key="export_cons_escopo")
        formato = col_formato.selectbox("Formato", ["Excel (.xlsx)", "CSV (.csv)"], key="export_cons_formato")

        filtrado = escopo == "Dados filtrados"
        base_prest = df_prest if filtrado else df_prest_completo
        base_cess = df_cess if filtrado else df_cess_completo
        st.caption(f"Você está prestes a baixar: **{escopo}** — {len(base_prest) + len(base_cess)} registro(s) ({len(base_prest)} prestadores + {len(base_cess)} cessionários).")

        if st.button("Baixar Projetos Consolidados", icon=":material/description:", key="export_cons_gerar"):
            exigir_area(usuario, "consolidado.exportar" if filtrado else "consolidado.exportar_completo")
            exportacao = montar_exportacao_consolidada(base_prest, base_cess)
            rotulo_periodo = rotulo_competencia(mes, ano) if (filtrado and (mes or ano)) else None
            if formato.startswith("Excel"):
                conteudo = gerar_excel_bytes(exportacao, "Consolidado")
                arquivo = nome_arquivo_exportacao("Consolidado", "xlsx", filtrado, rotulo_periodo)
                mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            else:
                conteudo = gerar_csv_bytes(exportacao)
                arquivo = nome_arquivo_exportacao("Consolidado", "csv", filtrado, rotulo_periodo)
                mime = "text/csv"
            st.download_button(
                f"Confirmar download — {escopo}", data=conteudo, file_name=arquivo, mime=mime,
                icon=":material/download:", type="primary", use_container_width=True, key="export_cons_baixar",
            )
            registrar_atividade(usuario["username"], usuario.get("perfil"), "EXPORTACAO_PROJETOS", modulo="consolidado", detalhe=f"{escopo} · {formato}")
