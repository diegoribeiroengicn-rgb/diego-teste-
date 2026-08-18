"""View: Relatórios Mensais — indicadores por competência, comparativos,
exportação em Excel/PDF e One Page Report executivo."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores, filtrar_ativos, filtrar_por_competencia, indicadores_meta_rev2
from gat.config import (
    COLUNAS_EXIBICAO_CESSIONARIOS,
    COLUNAS_EXIBICAO_PRESTADORES,
    CORES,
    DISCIPLINAS,
    MESES_PT,
    RESPONSAVEIS,
    STATUS_ANALISE_OPCOES,
)
from gat.database import (
    listar_anos_disponiveis,
    listar_cessionarios,
    listar_prestadores,
    listar_resumos_para_relatorio,
    obter_configuracao,
    obter_observacao_mensal,
    registrar_atividade,
    salvar_observacao_mensal,
)
from gat.export_excel import gerar_relatorio_mensal_excel
from gat.export_pdf import gerar_one_page_report_pdf, gerar_relatorio_mensal_pdf
from gat.export_word import (
    cabecalho_institucional as cabecalho_institucional_word,
    documento_para_bytes,
    graficos_em_grade,
    nome_arquivo,
    novo_documento,
    observacoes as observacoes_word,
    rodape_institucional,
    secao,
    tabela_indicadores_compacta,
)
from gat.opr import combinar_executivos, indicadores_completos, indicadores_executivos, indicadores_resumidos
from gat.permissions import exigir_area, pode_area, pode_modulo
from gat.relatorios_mensais import (
    acumulado_ano,
    comparativo_mensal,
    indicadores_mensais_modulo,
    mes_anterior,
    produtividade_analistas,
)
from gat.revisoes import SITUACAO_SLA_EXTERNO_OPCOES, calcular_intervalos_revisao, consolidado_por_entidade
from gat.ui.charts import (
    grafico_aprovacao_rev2,
    grafico_interno_vs_externo,
    grafico_por_revisao,
    grafico_situacao_sla_externo,
    grafico_status_donut,
    grafico_top_atraso_entidades,
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
    st.markdown("##### Resumo de Conclusão")
    st.caption(
        "Consulta de onde cada análise concluída foi disponibilizada (M-Files/Drive/E-mail) — apenas "
        "informativo, sem novos indicadores obrigatórios."
    )
    resumos = listar_resumos_para_relatorio()
    if not resumos.empty:
        resumos = filtrar_por_competencia(resumos, "data_analise", mes, ano)
    if resumos.empty:
        st.caption("Nenhuma análise com Resumo de Conclusão gerado nesta competência.")
    else:
        col_r1, col_r2, col_r3, col_r4 = st.columns(4)
        col_r1.metric("Postado no M-Files", int(resumos["resumo_mfiles"].sum()))
        col_r2.metric("Postado no Drive", int(resumos["resumo_drive"].sum()))
        col_r3.metric("Enviado por e-mail", int(resumos["resumo_email"].sum()))
        col_r4.metric("Total de análises com Resumo", len(resumos))
        resumos = resumos.assign(tabela=resumos["tabela"].map({"prestadores": "Prestadores", "cessionarios": "Cessionários"}))
        st.dataframe(
            resumos.rename(columns={
                "tabela": "Módulo", "codigo": "Código", "entidade": "Prestador/Cessionário",
                "obra_referencia": "Obra/Tipo", "disciplina": "Disciplina", "revisao": "Revisão",
                "status_analise": "Status", "data_analise": "Conclusão", "responsavel": "Responsável",
                "resumo_mfiles": "M-Files", "resumo_drive": "Drive", "resumo_email": "E-mail",
                "resumo_qtd_geracoes": "Gerações/Downloads", "resumo_ultima_geracao_em": "Última geração",
                "resumo_gerado_por": "Gerado por",
            }),
            use_container_width=True, hide_index=True,
        )

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
        sem_pep_geral = int((~df_prest["tem_pep"]).sum()) if not df_prest.empty else 0
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

    st.markdown("#####")
    st.markdown("##### OPR — Relatório Institucional (Word)")
    st.caption(
        "Gerado sempre em Microsoft Word (.docx) totalmente editável — nunca apenas em PDF ou imagem. "
        "Disponível para Prestadores, Cessionários ou Consolidado, nos níveis Resumido e Executivo, "
        "com período mensal, anual ou personalizado."
    )

    if not pode_area(usuario, "relatorios"):
        return

    with st.expander("Configurar e gerar OPR", icon=":material/description:", expanded=True):
        col_o1, col_o2, col_o3 = st.columns(3)
        tipo_opr_label = col_o1.selectbox("Tipo de OPR", ["Prestadores", "Cessionários", "Consolidado"], key="opr_tipo")
        nivel_opr = col_o2.selectbox("Nível do OPR", ["Resumido", "Executivo"], key="opr_nivel")
        periodo_opr = col_o3.selectbox("Período do OPR", ["Mensal (competência acima)", "Anual", "Personalizado"], key="opr_periodo_tipo")

        data_inicio_opr = data_fim_opr = None
        ano_opr = ano
        if periodo_opr == "Personalizado":
            col_p1, col_p2 = st.columns(2)
            st.session_state.setdefault("opr_data_inicio", None)
            st.session_state.setdefault("opr_data_fim", None)
            data_inicio_opr = col_p1.date_input("Data início", format="DD/MM/YYYY", key="opr_data_inicio")
            data_fim_opr = col_p2.date_input("Data fim", format="DD/MM/YYYY", key="opr_data_fim")
        elif periodo_opr == "Anual":
            anos_disponiveis_opr = listar_anos_disponiveis() or [ano]
            ano_opr = st.selectbox(
                "Ano", anos_disponiveis_opr,
                index=anos_disponiveis_opr.index(ano) if ano in anos_disponiveis_opr else 0,
                key="opr_ano",
            )

        st.markdown("**Filtros avançados do OPR**")
        col_f1, col_f2, col_f3 = st.columns(3)
        f_codigo_opr = col_f1.text_input("Código", key="opr_f_codigo")
        f_nome_opr = col_f2.text_input("Nome (busca parcial)", key="opr_f_nome")
        f_at_opr = col_f3.text_input("N° AT", key="opr_f_at")
        col_f4, col_f5, col_f6 = st.columns(3)
        f_disciplina_opr = col_f4.selectbox("Disciplina", ["Todas"] + DISCIPLINAS, key="opr_f_disc")
        f_analista_opr = col_f5.selectbox("Analista", ["Todos"] + RESPONSAVEIS, key="opr_f_analista")
        f_revisao_opr = col_f6.text_input("Revisão", key="opr_f_rev")
        col_f7, col_f8 = st.columns(2)
        f_status_opr = col_f7.selectbox("Status da análise", ["Todos"] + STATUS_ANALISE_OPCOES, key="opr_f_status")
        f_sla_opr = col_f8.selectbox("Situação SLA (retorno externo)", ["Todas"] + SITUACAO_SLA_EXTERNO_OPCOES, key="opr_f_sla")

        observacoes_opr_texto = st.text_area(
            "Observações gerenciais deste OPR",
            value=observacao_atual if periodo_opr == "Mensal (competência acima)" else "",
            key="opr_observacoes",
        )

        gerar_opr = st.button("Gerar OPR (Word)", type="primary", icon=":material/description:", use_container_width=True, key="opr_gerar_botao")

    if not gerar_opr:
        return

    def _filtrar_opr(df_base: pd.DataFrame) -> pd.DataFrame:
        if df_base.empty:
            return df_base
        resultado = df_base
        if periodo_opr == "Mensal (competência acima)":
            resultado = filtrar_por_competencia(resultado, "data_solicitacao", mes, ano)
        elif periodo_opr == "Anual":
            resultado = filtrar_por_competencia(resultado, "data_solicitacao", None, ano_opr)
        elif periodo_opr == "Personalizado" and data_inicio_opr and data_fim_opr:
            datas = pd.to_datetime(resultado["data_solicitacao"], errors="coerce")
            resultado = resultado[(datas.dt.date >= data_inicio_opr) & (datas.dt.date <= data_fim_opr)]
        if f_codigo_opr.strip():
            resultado = resultado[resultado["codigo"].fillna("").astype(str).str.contains(f_codigo_opr.strip(), case=False, na=False, regex=False)]
        if f_nome_opr.strip():
            coluna_nome_busca = "prestador" if "prestador" in resultado.columns else "cessionario"
            resultado = resultado[resultado[coluna_nome_busca].fillna("").astype(str).str.contains(f_nome_opr.strip(), case=False, na=False, regex=False)]
        if f_at_opr.strip():
            resultado = resultado[resultado["num_at"].fillna("").astype(str).str.contains(f_at_opr.strip(), case=False, na=False, regex=False)]
        if f_disciplina_opr != "Todas":
            resultado = resultado[resultado["disciplina"] == f_disciplina_opr]
        if f_analista_opr != "Todos":
            resultado = resultado[resultado["responsavel"] == f_analista_opr]
        if f_revisao_opr.strip():
            resultado = resultado[resultado["revisao"].astype(str) == f_revisao_opr.strip()]
        if f_status_opr != "Todos":
            resultado = resultado[resultado["status_analise"] == f_status_opr]
        return resultado

    def _aplicar_filtro_sla(df_modulo: pd.DataFrame, coluna_nome: str) -> pd.DataFrame:
        if f_sla_opr == "Todas" or df_modulo.empty:
            return df_modulo
        intervalos_temp = calcular_intervalos_revisao(df_modulo, coluna_nome)
        ids_com_situacao = set(intervalos_temp[intervalos_temp["situacao_sla"] == f_sla_opr]["id"])
        return df_modulo[df_modulo["id"].isin(ids_com_situacao)]

    df_prest_opr = _aplicar_filtro_sla(_filtrar_opr(df_prest), "prestador")
    df_cess_opr = _aplicar_filtro_sla(_filtrar_opr(df_cess), "cessionario")

    if periodo_opr == "Mensal (competência acima)":
        periodo_label_opr = competencia_label
        partes_arquivo_periodo = [MESES_PT[mes - 1].title(), str(ano)]
    elif periodo_opr == "Anual":
        periodo_label_opr = f"Ano {ano_opr}"
        partes_arquivo_periodo = [str(ano_opr)]
    elif data_inicio_opr and data_fim_opr:
        periodo_label_opr = f"{data_inicio_opr.strftime('%d/%m/%Y')} a {data_fim_opr.strftime('%d/%m/%Y')}"
        partes_arquivo_periodo = [data_inicio_opr.strftime("%d-%m-%Y"), "a", data_fim_opr.strftime("%d-%m-%Y")]
    else:
        st.error("Selecione a Data início e a Data fim para gerar um OPR de período personalizado.")
        return

    filtros_dict_opr = {
        "Código": f_codigo_opr, "Nome": f_nome_opr, "N° AT": f_at_opr,
        "Disciplina": f_disciplina_opr if f_disciplina_opr != "Todas" else "",
        "Analista": f_analista_opr if f_analista_opr != "Todos" else "",
        "Revisão": f_revisao_opr, "Status": f_status_opr if f_status_opr != "Todos" else "",
        "Situação SLA": f_sla_opr if f_sla_opr != "Todas" else "",
    }

    meta_rev2_config = float(obter_configuracao("meta_aprovacao_rev2", "80"))
    tipo_arquivo_map = {"Prestadores": "Prestador", "Cessionários": "Cessionario", "Consolidado": "Consolidado"}

    if tipo_opr_label == "Prestadores":
        exec_ind = indicadores_executivos(df_prest_opr, "prestador", meta_rev2_config)
        base_grafico, coluna_nome_g = df_prest_opr, "prestador"
    elif tipo_opr_label == "Cessionários":
        exec_ind = indicadores_executivos(df_cess_opr, "cessionario", meta_rev2_config)
        base_grafico, coluna_nome_g = df_cess_opr, "cessionario"
    else:
        exec_prest_ind = indicadores_executivos(df_prest_opr, "prestador", meta_rev2_config)
        exec_cess_ind = indicadores_executivos(df_cess_opr, "cessionario", meta_rev2_config)
        exec_ind = combinar_executivos(exec_prest_ind, exec_cess_ind)
        base_grafico = pd.concat(
            [df_prest_opr.assign(_nome_opr=df_prest_opr.get("prestador")), df_cess_opr.assign(_nome_opr=df_cess_opr.get("cessionario"))],
            ignore_index=True,
        ) if not (df_prest_opr.empty and df_cess_opr.empty) else pd.DataFrame()
        coluna_nome_g = "_nome_opr"

    doc = novo_documento()
    cabecalho_institucional_word(
        doc, f"OPR — {tipo_opr_label} ({nivel_opr})",
        "GAT 2026 · Controle de Análises Técnicas · Tecnoplano",
        periodo_label_opr, filtros_dict_opr,
        usuario.get("nome_completo") or usuario["username"],
        compacto=True,
    )

    secao(doc, "Indicadores do período", nivel=2)
    pares_indicadores = indicadores_resumidos(exec_ind) if nivel_opr == "Resumido" else indicadores_completos(exec_ind)
    tabela_indicadores_compacta(doc, pares_indicadores, colunas=2 if nivel_opr == "Resumido" else 3)

    if nivel_opr == "Executivo" and not base_grafico.empty:
        intervalos_g = calcular_intervalos_revisao(base_grafico, coluna_nome_g)
        meta_rev2_dict = indicadores_meta_rev2(base_grafico, meta_rev2_config)
        intervalos_validos_g = intervalos_g[intervalos_g["situacao_sla"] != "DATA INCONSISTENTE"] if not intervalos_g.empty else intervalos_g
        media_interno = pd.to_numeric(base_grafico.get("dias_uteis_decorridos", base_grafico.get("saldo_dias_uteis")), errors="coerce").mean()
        media_externo = intervalos_validos_g["dias_uteis_retorno"].mean() if not intervalos_validos_g.empty else 0

        figuras_grade = [
            {"fig": grafico_status_donut(base_grafico, "status_analise", "Distribuição por Status"), "titulo": "Distribuição por Status"},
            {"fig": grafico_por_revisao(base_grafico), "titulo": "Projetos por Revisão"},
            {"fig": grafico_aprovacao_rev2(meta_rev2_dict), "titulo": "Aprovação até a REV2"},
            {"fig": grafico_situacao_sla_externo(intervalos_g), "titulo": "Situação do Retorno Externo (SLA)"},
            {"fig": grafico_interno_vs_externo(round(media_interno or 0, 1), round(media_externo or 0, 1)), "titulo": "Tempo Médio — Interno x Externo"},
        ]
        if not intervalos_g.empty:
            consolidado_g = consolidado_por_entidade(base_grafico, coluna_nome_g)
            figuras_grade.append({
                "fig": grafico_top_atraso_entidades(consolidado_g.assign(media_dias=consolidado_g["media_dias"].fillna(0))),
                "titulo": "Maiores Gargalos — Retorno Externo",
            })

        secao(doc, "Gráficos", nivel=2)
        st.markdown("##### Pré-visualização dos gráficos incluídos no OPR")
        colunas_preview = st.columns(3)
        for idx, item in enumerate(figuras_grade):
            colunas_preview[idx % 3].plotly_chart(item["fig"], use_container_width=True)
        graficos_em_grade(doc, figuras_grade, colunas=3)

    observacoes_word(doc, "Observações gerenciais", observacoes_opr_texto)
    rodape_institucional(doc)

    conteudo_word = documento_para_bytes(doc)
    nome_arquivo_opr = nome_arquivo("OPR", tipo_arquivo_map[tipo_opr_label], *partes_arquivo_periodo)

    st.markdown("##### Documento gerado")
    if st.download_button(
        "Baixar OPR (Word)", data=conteudo_word, file_name=nome_arquivo_opr,
        mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        icon=":material/download:", type="primary", use_container_width=True, key="opr_download_botao",
    ):
        registrar_atividade(usuario["username"], usuario.get("perfil"), "OPR_WORD_GERADO", modulo=tipo_opr_label, detalhe=f"{nivel_opr} · {periodo_label_opr}")
