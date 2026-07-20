"""View: Relatórios Mensais — indicadores por competência, comparativos,
exportação em Excel/PDF e One Page Report executivo."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores, filtrar_ativos, filtrar_por_competencia
from gat.config import COLUNAS_EXIBICAO_CESSIONARIOS, COLUNAS_EXIBICAO_PRESTADORES, CORES
from gat.database import (
    listar_cessionarios,
    listar_prestadores,
    obter_observacao_mensal,
    registrar_atividade,
    salvar_observacao_mensal,
)
from gat.export_excel import gerar_relatorio_mensal_excel
from gat.export_pdf import gerar_one_page_report_pdf, gerar_relatorio_mensal_pdf
from gat.permissions import exigir_area, pode_area, pode_modulo
from gat.relatorios_mensais import (
    acumulado_ano,
    comparativo_mensal,
    indicadores_mensais_modulo,
    mes_anterior,
    produtividade_analistas,
)
from gat.ui.filtros import chave_competencia, rotulo_competencia, seletor_competencia
from gat.ui.kpi_cards import renderizar_kpis

_MODULOS_VISIVEIS = {
    "Consolidado": "consolidado",
    "Prestadores": "prestadores",
    "Cessionários": "cessionarios",
    "Analistas": "analistas",
}


def _base(usuario: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    df_prest = enriquecer_prestadores(filtrar_ativos(listar_prestadores())) if pode_modulo(usuario, "prestadores") else pd.DataFrame()
    df_cess = enriquecer_cessionarios(filtrar_ativos(listar_cessionarios())) if pode_modulo(usuario, "cessionarios") else pd.DataFrame()
    return df_prest, df_cess


def render(usuario: dict) -> None:
    exigir_area(usuario, "relatorios")

    st.subheader(":material/summarize: Relatórios Mensais")
    st.caption("Indicadores por competência (Mês/Ano), comparativos e exportação em Excel/PDF, incluindo o One Page Report executivo.")

    opcoes_modulo = [
        rotulo for rotulo, chave in _MODULOS_VISIVEIS.items()
        if chave in ("consolidado", "analistas") or pode_modulo(usuario, chave)
    ]
    if not opcoes_modulo:
        st.info("Nenhum módulo liberado para este usuário.")
        return

    col1, col2 = st.columns([1, 2])
    modulo_label = col1.selectbox("Módulo", opcoes_modulo, key="rel_mensal_modulo")
    with col2:
        mes, ano = seletor_competencia("rel_mensal")
    if mes is None or ano is None:
        st.warning("Selecione um Mês e um Ano específicos para gerar o relatório mensal (não é possível gerar para \"Todos\").", icon=":material/info:")
        return

    competencia_label = rotulo_competencia(mes, ano)
    st.caption(f"Competência selecionada: **{competencia_label}**")

    df_prest, df_cess = _base(usuario)
    modulo = _MODULOS_VISIVEIS[modulo_label]

    if modulo == "prestadores":
        df_modulo, colunas_exib = df_prest, COLUNAS_EXIBICAO_PRESTADORES
    elif modulo == "cessionarios":
        df_modulo, colunas_exib = df_cess, COLUNAS_EXIBICAO_CESSIONARIOS
    elif modulo == "consolidado":
        df_modulo, colunas_exib = pd.concat([df_prest, df_cess], ignore_index=True) if not (df_prest.empty and df_cess.empty) else pd.DataFrame(), None
    else:
        df_modulo, colunas_exib = pd.concat([df_prest, df_cess], ignore_index=True) if not (df_prest.empty and df_cess.empty) else pd.DataFrame(), None

    if modulo == "analistas":
        produtividade = produtividade_analistas(df_modulo, mes, ano)
        indicadores = {
            "Projetos Analisados": int(produtividade["projetos_analisados"].sum()) if not produtividade.empty else 0,
            "Documentos Analisados": int(produtividade["documentos"].sum()) if not produtividade.empty else 0,
            "ATs Emitidas": int(produtividade["ats_emitidas"].sum()) if not produtividade.empty else 0,
            "Backlog do Período": int(produtividade["backlog"].sum()) if not produtividade.empty else 0,
            "Em Andamento (hoje)": int(produtividade["em_andamento"].sum()) if not produtividade.empty else 0,
        }
        renderizar_kpis([(k, str(v), CORES["navy"]) for k, v in indicadores.items()])
        st.markdown("##### Produtividade por analista")
        st.dataframe(produtividade.rename(columns={
            "responsavel": "Analista", "projetos_analisados": "Projetos Analisados", "documentos": "Documentos",
            "ats_emitidas": "ATs Emitidas", "tempo_medio_analise": "Tempo Médio (dias)",
            "sla_atendido_pct": "% SLA Atendido", "backlog": "Backlog", "concluidos": "Concluídos", "em_andamento": "Em Andamento",
        }), use_container_width=True, hide_index=True)
        df_projetos_export = None
    else:
        indicadores_dict = indicadores_mensais_modulo(df_modulo, mes, ano)
        indicadores = {
            "Projetos Recebidos": indicadores_dict["recebidos"],
            "Projetos Concluídos": indicadores_dict["concluidos"],
            "Projetos em Análise": indicadores_dict["em_analise"],
            "Documentos": indicadores_dict["documentos"],
            "% SLA Cumprido": f"{indicadores_dict['sla_percentual']}%",
            "Backlog do Período": indicadores_dict["backlog"],
        }
        renderizar_kpis([(k, str(v), CORES["navy"]) for k, v in indicadores.items()])

        st.markdown("##### Comparativos")
        mes_ant, ano_ant = mes_anterior(mes, ano)
        ind_ant = indicadores_mensais_modulo(df_modulo, mes_ant, ano_ant)
        ind_ano_passado = indicadores_mensais_modulo(df_modulo, mes, ano - 1)
        acumulado = acumulado_ano(df_modulo, ano)

        col_c1, col_c2, col_c3 = st.columns(3)
        with col_c1:
            st.caption(f"{competencia_label} × {rotulo_competencia(mes_ant, ano_ant)}")
            v, d = comparativo_mensal(indicadores_dict, ind_ant, "recebidos")
            st.metric("Recebidos", v, delta=d)
            v, d = comparativo_mensal(indicadores_dict, ind_ant, "concluidos")
            st.metric("Concluídos", v, delta=d)
        with col_c2:
            st.caption(f"{competencia_label} × {rotulo_competencia(mes, ano - 1)}")
            v, d = comparativo_mensal(indicadores_dict, ind_ano_passado, "recebidos")
            st.metric("Recebidos (ano anterior)", v, delta=d)
            v, d = comparativo_mensal(indicadores_dict, ind_ano_passado, "concluidos")
            st.metric("Concluídos (ano anterior)", v, delta=d)
        with col_c3:
            st.caption(f"Acumulado {ano}")
            st.metric("Recebidos no ano", acumulado["recebidos"])
            st.metric("Concluídos no ano", acumulado["concluidos"])

        produtividade = produtividade_analistas(df_modulo, mes, ano)
        df_projetos_export = filtrar_por_competencia(df_modulo, "data_solicitacao", mes, ano)

    st.markdown("##### Exportação")
    col_exp1, col_exp2 = st.columns(2)

    if pode_area(usuario, "relatorios"):
        with col_exp1:
            excel_bytes = gerar_relatorio_mensal_excel(
                modulo_label, competencia_label, indicadores,
                df_projetos=df_projetos_export, colunas_projetos=colunas_exib,
                produtividade_df=produtividade if not produtividade.empty else None,
            )
            if st.download_button(
                "Exportar Excel", data=excel_bytes,
                file_name=f"GAT_2026_Relatorio_{modulo_label}_{chave_competencia(mes, ano)}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                icon=":material/download:", type="primary", use_container_width=True,
            ):
                registrar_atividade(usuario["username"], usuario.get("perfil"), "EXPORTACAO", modulo=modulo_label, detalhe=f"Excel {competencia_label}")
        with col_exp2:
            pdf_bytes = gerar_relatorio_mensal_pdf(modulo_label, competencia_label, indicadores, produtividade if not produtividade.empty else None)
            if st.download_button(
                "Exportar PDF", data=pdf_bytes,
                file_name=f"GAT_2026_Relatorio_{modulo_label}_{chave_competencia(mes, ano)}.pdf",
                mime="application/pdf", icon=":material/picture_as_pdf:", use_container_width=True,
            ):
                registrar_atividade(usuario["username"], usuario.get("perfil"), "EXPORTACAO", modulo=modulo_label, detalhe=f"PDF {competencia_label}")

    st.markdown("#####")
    st.markdown("##### One Page Report — Resumo Executivo Mensal")
    st.caption("Consolida Prestadores + Cessionários do mês selecionado, independentemente do módulo escolhido acima.")

    chave_obs = chave_competencia(mes, ano)
    observacao_atual = obter_observacao_mensal(chave_obs)
    with st.expander("Observações gerenciais desta competência", icon=":material/edit_note:", expanded=False):
        nova_observacao = st.text_area("Observações", value=observacao_atual, key=f"obs_{chave_obs}", height=100)
        if st.button("Salvar observações", icon=":material/save:", key=f"salvar_obs_{chave_obs}"):
            salvar_observacao_mensal(chave_obs, nova_observacao, usuario["username"])
            st.success("Observações salvas para esta competência.")
            st.rerun()

    if pode_area(usuario, "relatorios"):
        ind_prest_geral = indicadores_mensais_modulo(df_prest, mes, ano)
        ind_cess_geral = indicadores_mensais_modulo(df_cess, mes, ano)
        prod_geral = produtividade_analistas(
            pd.concat([df_prest, df_cess], ignore_index=True) if not (df_prest.empty and df_cess.empty) else pd.DataFrame(),
            mes, ano,
        )
        sem_pep_geral = (int((~df_prest["tem_pep"]).sum()) if not df_prest.empty else 0) + (int((~df_cess["tem_pep"]).sum()) if not df_cess.empty else 0)
        total_projetos = ind_prest_geral["recebidos"] + ind_cess_geral["recebidos"]
        produtividade_media = round(prod_geral["projetos_analisados"].mean(), 1) if not prod_geral.empty and prod_geral["projetos_analisados"].sum() else 0.0

        resumo = {
            "total_projetos": total_projetos,
            "total_prestadores": ind_prest_geral["recebidos"],
            "total_cessionarios": ind_cess_geral["recebidos"],
            "concluidos": ind_prest_geral["concluidos"] + ind_cess_geral["concluidos"],
            "em_analise": ind_prest_geral["em_analise"] + ind_cess_geral["em_analise"],
            "documentos": ind_prest_geral["documentos"] + ind_cess_geral["documentos"],
            "sla_percentual": round((ind_prest_geral["sla_percentual"] + ind_cess_geral["sla_percentual"]) / 2, 1),
            "backlog": ind_prest_geral["backlog"] + ind_cess_geral["backlog"],
            "sem_pep": sem_pep_geral,
            "produtividade_media": produtividade_media,
        }
        mes_ant2, ano_ant2 = mes_anterior(mes, ano)
        ind_prest_ant = indicadores_mensais_modulo(df_prest, mes_ant2, ano_ant2)
        ind_cess_ant = indicadores_mensais_modulo(df_cess, mes_ant2, ano_ant2)
        comparativo_opr = {
            "Total de Projetos": comparativo_mensal(
                {"total": total_projetos}, {"total": ind_prest_ant["recebidos"] + ind_cess_ant["recebidos"]}, "total"
            )[1] or "sem variação relevante",
            "Concluídos": comparativo_mensal(
                {"c": resumo["concluidos"]}, {"c": ind_prest_ant["concluidos"] + ind_cess_ant["concluidos"]}, "c"
            )[1] or "sem variação relevante",
        }

        opr_bytes = gerar_one_page_report_pdf(competencia_label, resumo, comparativo_opr, observacao_atual)
        if st.download_button(
            "Gerar One Page Report (PDF)", data=opr_bytes,
            file_name=f"GAT_2026_OnePageReport_{chave_competencia(mes, ano)}.pdf",
            mime="application/pdf", icon=":material/picture_as_pdf:", type="primary", use_container_width=True,
        ):
            registrar_atividade(usuario["username"], usuario.get("perfil"), "OPR_GERADO", modulo="consolidado", detalhe=competencia_label)
