"""View: Painel de Analistas — produtividade mensal (Prestadores/Cessionários/Consolidado)."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores, filtrar_ativos
from gat.config import CORES, DISCIPLINAS, RESPONSAVEIS, STATUS_ANALISE_OPCOES
from gat.database import listar_cessionarios, listar_prestadores
from gat.export_excel import gerar_relatorio_mensal_excel
from gat.permissions import exigir_area, pode_area, pode_modulo
from gat.relatorios_mensais import indicadores_mensais_modulo, produtividade_analistas
from gat.ui.filtros import chave_competencia, rotulo_competencia, seletor_competencia
from gat.ui.kpi_cards import renderizar_kpis

_MODULOS_VISIVEIS = {
    "Consolidado (ambos)": "consolidado",
    "Prestadores": "prestadores",
    "Cessionários": "cessionarios",
}


def render(usuario: dict) -> None:
    exigir_area(usuario, "analistas")

    st.subheader(":material/groups_2: Painel de Analistas")
    st.caption("Produtividade mensal dos analistas: projetos, documentos, ATs, tempo médio, SLA e backlog.")

    opcoes_modulo = [
        rotulo for rotulo, chave in _MODULOS_VISIVEIS.items()
        if chave == "consolidado" or pode_modulo(usuario, chave)
    ]
    if not opcoes_modulo:
        st.info("Nenhum módulo liberado para este usuário.")
        return

    with st.expander("Filtros", icon=":material/filter_list:", expanded=True):
        col1, col2 = st.columns(2)
        modulo_label = col1.selectbox("Módulo", opcoes_modulo, key="painel_analistas_modulo")
        f_disciplina = col2.selectbox("Disciplina", ["Todas"] + DISCIPLINAS, key="painel_analistas_disciplina")
        col3, col4 = st.columns(2)
        f_analista = col3.multiselect("Analista", RESPONSAVEIS, key="painel_analistas_analista")
        f_status = col4.multiselect("Status", STATUS_ANALISE_OPCOES, key="painel_analistas_status")
        col5, col6 = st.columns(2)
        f_at = col5.text_input("N° AT", key="painel_analistas_at", placeholder="Busca exata ou parcial")
        f_revisao = col6.text_input("Revisão", key="painel_analistas_revisao")
        mes, ano = seletor_competencia("painel_analistas")
        col7, col8 = st.columns(2)
        f_data_ini = col7.date_input("Período — Data inicial", value=None, format="DD/MM/YYYY", key="painel_analistas_data_ini")
        f_data_fim = col8.date_input("Período — Data final", value=None, format="DD/MM/YYYY", key="painel_analistas_data_fim")

    disciplina = None if f_disciplina == "Todas" else f_disciplina
    st.caption(f"Competência: **{rotulo_competencia(mes, ano)}**")

    df_prest = enriquecer_prestadores(filtrar_ativos(listar_prestadores())) if pode_modulo(usuario, "prestadores") else pd.DataFrame()
    df_cess = enriquecer_cessionarios(filtrar_ativos(listar_cessionarios())) if pode_modulo(usuario, "cessionarios") else pd.DataFrame()

    modulo = _MODULOS_VISIVEIS[modulo_label]
    if modulo == "prestadores":
        df_base = df_prest
    elif modulo == "cessionarios":
        df_base = df_cess
    else:
        df_base = pd.concat([df_prest, df_cess], ignore_index=True) if not (df_prest.empty and df_cess.empty) else pd.DataFrame()

    if df_base.empty:
        st.info("Nenhum registro disponível para os filtros selecionados.")
        return

    if f_status:
        df_base = df_base[df_base["status_analise"].isin(f_status)]
    if f_at.strip():
        df_base = df_base[df_base["num_at"].fillna("").astype(str).str.contains(f_at.strip(), case=False, na=False, regex=False)]
    if f_revisao.strip():
        df_base = df_base[df_base["revisao"].astype(str) == f_revisao.strip()]
    if f_data_ini:
        df_base = df_base[pd.to_datetime(df_base["data_solicitacao"], errors="coerce") >= pd.Timestamp(f_data_ini)]
    if f_data_fim:
        df_base = df_base[pd.to_datetime(df_base["data_solicitacao"], errors="coerce") <= pd.Timestamp(f_data_fim)]

    tabela = produtividade_analistas(df_base, mes, ano, analista=None, disciplina=disciplina)
    if f_analista:
        tabela = tabela[tabela["responsavel"].isin(f_analista)]

    if tabela.empty:
        st.info("Nenhum resultado para os filtros selecionados.")
        return

    total_analisados = int(tabela["projetos_analisados"].sum())
    total_documentos = int(tabela["documentos"].sum())
    total_ats = int(tabela["ats_emitidas"].sum())
    tempo_medio_geral = round(tabela.loc[tabela["projetos_analisados"] > 0, "tempo_medio_analise"].mean(), 1) if (tabela["projetos_analisados"] > 0).any() else 0.0
    sla_medio = round(tabela.loc[tabela["projetos_analisados"] > 0, "sla_atendido_pct"].mean(), 1) if (tabela["projetos_analisados"] > 0).any() else 0.0
    total_backlog = int(tabela["backlog"].sum())
    total_andamento = int(tabela["em_andamento"].sum())

    renderizar_kpis([
        ("Projetos Analisados", str(total_analisados), CORES["navy"]),
        ("Documentos Analisados", str(total_documentos), CORES["azul_2"]),
        ("ATs Emitidas", str(total_ats), CORES["ceu"]),
        ("Tempo Médio (dias)", str(tempo_medio_geral), CORES["roxo"]),
    ])
    renderizar_kpis([
        ("% SLA Atendido (média)", f"{sla_medio}%", CORES["verde"]),
        ("Backlog do Período", str(total_backlog), CORES["laranja"]),
        ("Em Andamento (hoje)", str(total_andamento), CORES["dourado"]),
    ])

    st.markdown("##### Produtividade por analista")
    tabela_exibicao = tabela.rename(columns={
        "responsavel": "Analista",
        "projetos_analisados": "Projetos Analisados",
        "documentos": "Documentos",
        "ats_emitidas": "ATs Emitidas",
        "tempo_medio_analise": "Tempo Médio (dias)",
        "sla_atendido_pct": "% SLA Atendido",
        "backlog": "Backlog do Período",
        "concluidos": "Concluídos",
        "em_andamento": "Em Andamento",
    }).sort_values("Projetos Analisados", ascending=False).reset_index(drop=True)

    st.dataframe(tabela_exibicao, use_container_width=True, hide_index=True)

    st.markdown("##### Ver registros de um analista")
    st.caption("Abre os projetos que originaram os indicadores acima, respeitando os filtros aplicados.")
    analista_drill = st.selectbox("Analista", ["Selecione..."] + sorted(tabela["responsavel"].unique().tolist()), key="painel_analistas_drill")
    if analista_drill != "Selecione...":
        df_drill = df_base[df_base["responsavel"] == analista_drill]
        colunas_drill = [c for c in ["item", "codigo", "prestador", "cessionario", "disciplina", "num_at", "revisao", "status_analise", "data_solicitacao", "data_analise"] if c in df_drill.columns]
        st.dataframe(df_drill[colunas_drill].reset_index(drop=True), use_container_width=True, hide_index=True)

    if pode_area(usuario, "analistas.relatorios") and mes is not None and ano is not None:
        st.markdown("##### Exportação")
        indicadores_export = {"Projetos Analisados": total_analisados, "Documentos": total_documentos, "ATs Emitidas": total_ats, "% SLA Médio": f"{sla_medio}%", "Backlog": total_backlog}
        excel_bytes = gerar_relatorio_mensal_excel(
            f"Analistas — {modulo_label}", rotulo_competencia(mes, ano), indicadores_export, produtividade_df=tabela,
        )
        st.download_button(
            "Exportar Excel", data=excel_bytes,
            file_name=f"GAT_2026_Analistas_{modulo_label}_{chave_competencia(mes, ano)}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            icon=":material/download:", type="primary",
        )
