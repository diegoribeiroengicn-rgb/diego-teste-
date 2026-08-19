"""Visão do Gestor — painel executivo diário da equipe, restrito a Gestor e
Administrador. Consome exclusivamente dados já existentes (Prestadores,
Cessionários, Lista de Prioridades, Alertas, Avaliações, Status das
Análises) — não altera nenhum módulo/regra/permissão existente, apenas
combina o que cada um já calcula (ver gat/visao_gestor.py)."""

from __future__ import annotations

from typing import Any

import pandas as pd
import streamlit as st

from gat.business_rules import (
    STATUS_ATIVO_ANALISE,
    enriquecer_cessionarios,
    enriquecer_prestadores,
    filtrar_ativos,
)
from gat.config import (
    DISCIPLINAS,
    PERFIL_ADMIN,
    PERFIL_GESTOR,
    RESPONSAVEIS,
    STATUS_ANALISE_OPCOES,
)
from gat.database import listar_cessionarios, listar_obras_prestador, listar_prestadores, registrar_atividade
from gat.kpis_analistas_prazo import calcular_kpis_prazo_analista
from gat.normalizacao import texto_seguro
from gat.permissions import exigir_area
from gat.relatorios_visao_gestor import (
    gerar_excel_visao_gestor,
    gerar_pdf_visao_gestor,
    gerar_word_visao_gestor,
    nome_arquivo_visao_gestor,
)
from gat.ui.formatos import formatar_datas_df
from gat.visao_gestor import (
    comparativo_atual_vs_prioridade,
    montar_alertas_ativos,
    montar_base_combinada,
    montar_lista_prioridades_gestor,
    montar_painel_por_analista,
    montar_pendencias_avaliacao,
    status_operacional,
)

_ICONE_STATUS_OPERACIONAL = {"ATRASADO": "🔴", "ATENCAO": "🟡", "EM_DIA": "🟢", "SEM_PENDENCIAS": "⚪"}
_LABEL_STATUS_OPERACIONAL = {
    "ATRASADO": "Atrasado", "ATENCAO": "Atenção — vencendo em breve",
    "EM_DIA": "Em dia", "SEM_PENDENCIAS": "Sem pendências",
}
_ICONE_NIVEL = {1: "🟣 Nível 1", 2: "🔶 Nível 2", 3: "🔷 Nível 3"}

_CHAVE_PAGINA_LISTA_PRIORIDADES = "gestao_lista_prioridades"
_CHAVES_FILTRO = [
    "vg_analista", "vg_prestador", "vg_cessionario", "vg_disciplina", "vg_projeto",
    "vg_at", "vg_revisao", "vg_prioridade", "vg_sla", "vg_status", "vg_periodo_ini", "vg_periodo_fim",
]


def _base_dados() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    df_prest = enriquecer_prestadores(filtrar_ativos(listar_prestadores()))
    df_cess = enriquecer_cessionarios(filtrar_ativos(listar_cessionarios()))
    df_base = montar_base_combinada(df_prest, df_cess)
    lista_prioridades = montar_lista_prioridades_gestor(df_prest, df_cess)
    alertas_ativos = montar_alertas_ativos(df_prest, df_cess)
    return df_base, lista_prioridades, alertas_ativos


def _renderizar_filtros(df: pd.DataFrame) -> pd.DataFrame:
    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        col1, col2, col3 = st.columns(3)
        f_analista = col1.multiselect("Analista", RESPONSAVEIS, key="vg_analista")
        f_prestador = col2.text_input("Prestador (busca)", key="vg_prestador")
        f_cessionario = col3.text_input("Cessionário (busca)", key="vg_cessionario")

        col4, col5, col6 = st.columns(3)
        f_disciplina = col4.multiselect("Disciplina", DISCIPLINAS, key="vg_disciplina")
        f_projeto = col5.text_input("Projeto/Código (busca)", key="vg_projeto")
        f_at = col6.text_input("N° AT (busca)", key="vg_at")

        col7, col8, col9 = st.columns(3)
        opcoes_revisao = sorted(df["revisao"].dropna().unique().tolist()) if not df.empty else []
        f_revisao = col7.multiselect("Revisão", opcoes_revisao, key="vg_revisao")
        f_prioridade = col8.multiselect("Prioridade (nível)", [1, 2, 3], key="vg_prioridade")
        f_sla = col9.selectbox("SLA reduzido", ["Todos", "Sim", "Não"], key="vg_sla")
        f_status = st.multiselect("Status da análise", STATUS_ANALISE_OPCOES, key="vg_status")

        col10, col11 = st.columns(2)
        st.session_state.setdefault("vg_periodo_ini", None)
        st.session_state.setdefault("vg_periodo_fim", None)
        f_periodo_ini = col10.date_input("Período — De (Data de Solicitação)", format="DD/MM/YYYY", key="vg_periodo_ini")
        f_periodo_fim = col11.date_input("Período — Até (Data de Solicitação)", format="DD/MM/YYYY", key="vg_periodo_fim")

        if st.button("Limpar filtros", icon=":material/filter_alt_off:", key="vg_limpar_filtros"):
            for chave in _CHAVES_FILTRO:
                st.session_state.pop(chave, None)
            st.rerun()

    resultado = df
    if f_analista:
        resultado = resultado[resultado["responsavel"].isin(f_analista)]
    if f_prestador.strip() and "prestador" in resultado.columns:
        resultado = resultado[resultado["prestador"].astype(str).str.contains(f_prestador.strip(), case=False, na=False, regex=False)]
    if f_cessionario.strip() and "cessionario" in resultado.columns:
        resultado = resultado[resultado["cessionario"].astype(str).str.contains(f_cessionario.strip(), case=False, na=False, regex=False)]
    if f_disciplina:
        resultado = resultado[resultado["disciplina"].isin(f_disciplina)]
    if f_projeto.strip() and "codigo" in resultado.columns:
        resultado = resultado[resultado["codigo"].astype(str).str.contains(f_projeto.strip(), case=False, na=False, regex=False)]
    if f_at.strip() and "num_at" in resultado.columns:
        resultado = resultado[resultado["num_at"].fillna("").astype(str).str.contains(f_at.strip(), case=False, na=False, regex=False)]
    if f_revisao:
        resultado = resultado[resultado["revisao"].isin(f_revisao)]
    if f_prioridade:
        resultado = resultado[resultado["nivel_prioridade"].isin(f_prioridade)]
    if f_sla != "Todos":
        resultado = resultado[resultado["sla_reduzido"].fillna(False).astype(bool) == (f_sla == "Sim")]
    if f_status:
        resultado = resultado[resultado["status_analise"].isin(f_status)]
    if f_periodo_ini or f_periodo_fim:
        datas = pd.to_datetime(resultado["data_solicitacao"], errors="coerce")
        if f_periodo_ini:
            resultado = resultado[datas >= pd.Timestamp(f_periodo_ini)]
            datas = pd.to_datetime(resultado["data_solicitacao"], errors="coerce")
        if f_periodo_fim:
            resultado = resultado[datas <= pd.Timestamp(f_periodo_fim)]
    return resultado


def _renderizar_kpis_executivos(df: pd.DataFrame, lista_prioridades: pd.DataFrame, alertas_ativos: pd.DataFrame, painel: pd.DataFrame) -> None:
    status_upper = df["status_analise"].astype(str).str.strip().str.upper()
    em_andamento = df[status_upper.isin(STATUS_ATIVO_ANALISE)]
    kpis_equipe = calcular_kpis_prazo_analista(df, None)

    col1, col2, col3, col4, col_hold = st.columns(5)
    col1.metric("Total em andamento", len(em_andamento))
    col2.metric("Total prioritárias", len(lista_prioridades))
    col3.metric("Total atrasadas", kpis_equipe["atrasados_em_analise"])
    col4.metric("Vencendo em ≤2 dias úteis", kpis_equipe["vencem_2_dias_uteis"])
    col_hold.metric("Em HOLD", kpis_equipe.get("em_hold", 0))

    col5, col6, col7 = st.columns(3)
    col5.metric("Com SLA reduzido", int(em_andamento["sla_reduzido"].fillna(False).astype(bool).sum()) if "sla_reduzido" in em_andamento.columns else 0)
    col6.metric("Alertas ativos", len(alertas_ativos))
    col7.metric("% geral entregue no prazo", f"{kpis_equipe['pct_cumprimento_prazo']}%")

    if not painel.empty:
        maior_carga = painel.loc[painel["em_andamento"].idxmax()]
        maior_prioridades = painel.loc[painel["prioridades"].idxmax()]
        maior_atrasos = painel.loc[painel["atrasados"].idxmax()]
        media_geral_prazo = round(painel["tempo_medio_dias"].mean(), 1) if not painel.empty else 0.0

        col8, col9, col10, col11 = st.columns(4)
        col8.metric("Maior carga", f"{maior_carga['analista']} ({int(maior_carga['em_andamento'])})")
        col9.metric("Maior qtd. prioridades", f"{maior_prioridades['analista']} ({int(maior_prioridades['prioridades'])})")
        col10.metric(
            "Maior qtd. atrasos",
            f"{maior_atrasos['analista']} ({int(maior_atrasos['atrasados'])})" if maior_atrasos["atrasados"] > 0 else "Nenhum atraso",
        )
        col11.metric("Média geral de prazo da equipe (dias úteis)", media_geral_prazo)


def _renderizar_quem_faz_o_que(df: pd.DataFrame, painel: pd.DataFrame, lista_prioridades: pd.DataFrame, alertas_ativos: pd.DataFrame) -> None:
    st.markdown("#### :material/groups: Quem está fazendo o quê")
    if painel.empty:
        st.info("Nenhum analista com análises, prioridades ou alertas nos filtros aplicados.")
        return

    for _, linha in painel.sort_values("em_andamento", ascending=False).iterrows():
        analista = linha["analista"]
        situacao = status_operacional(int(linha["atrasados"]), int(linha["vence_2_dias"]), int(linha["em_andamento"]))
        icone = _ICONE_STATUS_OPERACIONAL[situacao]
        titulo = (
            f"{icone} **{analista}** — {_LABEL_STATUS_OPERACIONAL[situacao]} · "
            f"{int(linha['em_andamento'])} em andamento · {int(linha['prioridades'])} prioridade(s) · "
            f"{int(linha['atrasados'])} atrasada(s) · {int(linha.get('em_hold', 0))} em HOLD · "
            f"{int(linha['alertas_ativos'])} alerta(s)"
        )
        with st.expander(titulo, icon=":material/person:"):
            col1, col2, col3, col4, col5, col_hold = st.columns(6)
            col1.metric("Em andamento", int(linha["em_andamento"]))
            col2.metric("Concluídos", int(linha["concluidos"]))
            col3.metric("Atrasados", int(linha["atrasados"]))
            col4.metric("Prioridades", int(linha["prioridades"]))
            col5.metric("Alertas ativos", int(linha["alertas_ativos"]))
            col_hold.metric("Em HOLD", int(linha.get("em_hold", 0)))
            col6, col7, col8 = st.columns(3)
            col6.metric("Tempo médio de análise (dias úteis)", linha["tempo_medio_dias"])
            col7.metric("% no prazo", f"{linha['pct_no_prazo']}%")
            col8.metric("SLA reduzido em vigor", int(linha["sla_reduzido_qtd"]))

            sub = df[df["responsavel"] == analista]
            if not sub.empty:
                prioridades_analista = lista_prioridades[lista_prioridades["responsavel"] == analista] if not lista_prioridades.empty else pd.DataFrame()
                motivos_por_at = (
                    prioridades_analista.set_index("num_at")["motivos_entrada_label"].to_dict()
                    if not prioridades_analista.empty else {}
                )
                exibicao = sub.copy()
                exibicao["Prioridade"] = exibicao["nivel_prioridade"].map(_ICONE_NIVEL).fillna("—")
                exibicao["Motivo da prioridade"] = exibicao["num_at"].map(motivos_por_at).fillna("—")
                exibicao["SLA"] = exibicao.get("sla_dias")
                exibicao["Dias restantes"] = exibicao.get("_dias_restantes")
                colunas = {
                    "num_at": "N° AT", "codigo": "Projeto", "entidade": "Prestador/Cessionário",
                    "disciplina": "Disciplina", "revisao": "Revisão", "data_solicitacao": "Data de Solicitação",
                    "data_limite": "Data Prevista", "Dias restantes": "Dias restantes",
                    "status_analise": "Status", "Prioridade": "Prioridade", "SLA": "SLA",
                    "Motivo da prioridade": "Motivo da prioridade",
                }
                colunas_presentes = [c for c in colunas if c in exibicao.columns]
                exibicao_final = formatar_datas_df(exibicao[colunas_presentes], ["data_solicitacao", "data_limite"]).rename(columns=colunas)
                st.dataframe(exibicao_final, use_container_width=True, hide_index=True)

                if st.button("Ver na Lista de Prioridades", icon=":material/arrow_forward:", key=f"vg_ver_lista_{analista}"):
                    st.session_state["filtro_prio_responsavel"] = [analista]
                    pagina = st.session_state.get("_gat_paginas", {}).get(_CHAVE_PAGINA_LISTA_PRIORIDADES)
                    if pagina is not None:
                        st.switch_page(pagina)
                    else:
                        st.rerun()
            else:
                st.caption("Nenhuma análise ativa no momento.")


def _renderizar_o_que_deveria_analisar(lista_prioridades: pd.DataFrame, analistas: list[str], df_base: pd.DataFrame) -> None:
    """
    Identifica cada demanda pelo Prestador/Cessionário — código, nome,
    obra (só Prestadores) e disciplina — em vez do número da AT, que exige
    interpretação adicional e não comunica de imediato qual é a demanda.
    O número da AT continua disponível, apenas como informação secundária
    ao final da linha; a lógica de prioridade/SLA/HOLD não muda em nada,
    só a identificação visual."""
    st.markdown("#### :material/checklist: O que o analista deveria estar analisando (Lista de Prioridades)")
    if lista_prioridades.empty:
        st.success("Nenhuma análise prioritária no momento.")
        return

    obras = listar_obras_prestador()
    mapa_obras = obras.set_index("id")["nome_obra"].to_dict() if not obras.empty else {}
    mapa_obra_por_id: dict[Any, str] = {}
    if not df_base.empty and "obra_id" in df_base.columns:
        prestadores_base = df_base[df_base.get("tipo_modulo") == "Prestador"]
        mapa_obra_por_id = {
            r["id"]: mapa_obras.get(r.get("obra_id"), "") for _, r in prestadores_base.iterrows() if pd.notna(r.get("obra_id"))
        }

    for analista in analistas:
        sub = lista_prioridades[lista_prioridades["responsavel"] == analista]
        if sub.empty:
            continue
        st.markdown(f"**{analista}**")
        for posicao, (_, linha) in enumerate(sub.iterrows(), start=1):
            nivel = _ICONE_NIVEL.get(linha.get("nivel_prioridade"), "Prioridade normal")
            situacao = linha.get("situacao_prazo") or "—"
            situacao_label = {
                "DENTRO DO PRAZO": "dentro do prazo", "VENCE EM BREVE": "vence em breve",
                "VENCE HOJE": "vence hoje", "ATRASADO": f"vencida há {abs(linha.get('dias_restantes') or 0)} dia(s) útil(eis)",
            }.get(situacao, situacao.lower())

            codigo = texto_seguro(linha.get("codigo")).strip() or "—"
            nome = texto_seguro(linha.get("nome_entidade")).strip() or "—"
            disciplina = texto_seguro(linha.get("disciplina")).strip() or "—"
            partes_identificacao = [f"{codigo} — {nome}"]
            if linha.get("tipo") == "Prestador":
                obra = texto_seguro(mapa_obra_por_id.get(linha.get("id"))).strip()
                if obra:
                    partes_identificacao.append(obra)
            partes_identificacao.append(disciplina)
            identificacao = " | ".join(partes_identificacao)
            num_at = texto_seguro(linha.get("num_at")).strip() or "—"

            st.markdown(
                f"{posicao}º **{identificacao}** — {nivel} — {situacao_label} "
                f"({linha.get('motivos_entrada_label') or '—'}) · *AT {num_at}*"
            )
        st.markdown("")


def _renderizar_comparativo(df: pd.DataFrame, lista_prioridades: pd.DataFrame, analistas: list[str]) -> None:
    st.markdown("#### :material/compare_arrows: Comparativo — atividade atual x prioridade recomendada")
    st.caption("Painel informativo: não redistribui trabalho automaticamente, apenas destaca divergências para o gestor decidir.")
    divergencias = []
    for analista in analistas:
        comparativo = comparativo_atual_vs_prioridade(df, lista_prioridades, analista)
        if comparativo:
            divergencias.append(comparativo)

    if not divergencias:
        st.success("Nenhuma divergência: todos os analistas estão alinhados com a Lista de Prioridades.")
        return

    for divergencia in divergencias:
        dias = divergencia["dias_restantes_recomendado"]
        situacao_recomendado = f"vencida há {abs(dias)} dia(s) útil(eis)" if (dias is not None and dias < 0) else (
            f"vence em {dias} dia(s) útil(eis)" if dias is not None else "—"
        )
        st.warning(
            f"**{divergencia['analista']}** — Analisando atualmente **AT-{divergencia['at_atual']}** "
            f"({divergencia['prioridade_atual']}) ↓ Deveria estar analisando **AT-{divergencia['at_recomendado']}** "
            f"({divergencia['motivo_recomendado']}, {situacao_recomendado})",
            icon=":material/priority_high:",
        )


def _renderizar_distribuicao_carga(painel: pd.DataFrame) -> None:
    st.markdown("#### :material/bar_chart: Distribuição da carga de trabalho")
    if painel.empty:
        st.info("Nenhum dado disponível com os filtros aplicados.")
        return
    exibicao = painel.rename(columns={
        "analista": "Analista", "em_andamento": "Em Andamento", "concluidos": "Concluídos",
        "atrasados": "Atrasados", "em_hold": "Em HOLD", "prioridades": "Prioritárias", "alertas_ativos": "Alertas Ativos",
        "aguardando_avaliacao": "Aguardando Avaliação", "tempo_medio_dias": "Tempo Médio (dias úteis)",
        "vence_2_dias": "Vencendo em 2 Dias Úteis", "pct_no_prazo": "% No Prazo", "pct_atraso": "% Com Atraso",
        "sla_reduzido_qtd": "SLA Reduzido em Vigor",
    })
    st.dataframe(exibicao, use_container_width=True, hide_index=True)

    st.markdown("###### Indicadores consolidados da equipe")
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total em andamento (equipe)", int(painel["em_andamento"].sum()))
    col2.metric("Total concluído (equipe)", int(painel["concluidos"].sum()))
    col3.metric("Total atrasado (equipe)", int(painel["atrasados"].sum()))
    col4.metric("Total em HOLD (equipe)", int(painel.get("em_hold", pd.Series(dtype=int)).sum()))


def _renderizar_relatorios(df: pd.DataFrame, painel: pd.DataFrame, lista_prioridades: pd.DataFrame, kpis_dict: dict, analistas: list[str], usuario: dict) -> None:
    st.markdown("#### :material/description: Relatórios")
    aba_consolidado, aba_individual = st.tabs(["Relatório consolidado (equipe)", "Relatório individual (analista)"])

    with aba_consolidado:
        col_xlsx, col_docx, col_pdf = st.columns(3)
        if col_xlsx.button("Gerar Excel", icon=":material/description:", key="vg_gerar_xlsx", use_container_width=True):
            conteudo = gerar_excel_visao_gestor(painel)
            col_xlsx.download_button(
                "Baixar Excel", data=conteudo, file_name=nome_arquivo_visao_gestor("consolidado").replace(".docx", ".xlsx"),
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", key="vg_baixar_xlsx",
            )
        if col_docx.button("Gerar Word", icon=":material/description:", key="vg_gerar_docx", use_container_width=True):
            conteudo = gerar_word_visao_gestor("Painel consolidado da equipe", kpis_dict, painel, lista_prioridades, usuario["username"])
            col_docx.download_button(
                "Baixar Word", data=conteudo, file_name=nome_arquivo_visao_gestor("consolidado"),
                mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document", key="vg_baixar_docx",
            )
        if col_pdf.button("Gerar PDF", icon=":material/description:", key="vg_gerar_pdf", use_container_width=True):
            conteudo = gerar_pdf_visao_gestor("Painel consolidado da equipe", kpis_dict, painel)
            col_pdf.download_button(
                "Baixar PDF", data=conteudo, file_name=nome_arquivo_visao_gestor("consolidado").replace(".docx", ".pdf"),
                mime="application/pdf", key="vg_baixar_pdf",
            )
        registrar_atividade(usuario["username"], usuario.get("perfil"), "RELATORIO_VISAO_GESTOR_CONSOLIDADO", modulo="visao_gestor")

    with aba_individual:
        if not analistas:
            st.info("Nenhum analista disponível com os filtros aplicados.")
        else:
            analista_escolhido = st.selectbox("Analista", analistas, key="vg_relatorio_analista")
            painel_individual = painel[painel["analista"] == analista_escolhido]
            prioridades_individual = lista_prioridades[lista_prioridades["responsavel"] == analista_escolhido] if not lista_prioridades.empty else pd.DataFrame()
            kpis_individual = calcular_kpis_prazo_analista(df, analista_escolhido)
            col_docx2, col_pdf2 = st.columns(2)
            if col_docx2.button("Gerar Word", icon=":material/description:", key="vg_gerar_docx_ind", use_container_width=True):
                conteudo = gerar_word_visao_gestor(f"Analista: {analista_escolhido}", kpis_individual, painel_individual, prioridades_individual, usuario["username"])
                col_docx2.download_button(
                    "Baixar Word", data=conteudo, file_name=nome_arquivo_visao_gestor("individual", analista_escolhido),
                    mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document", key="vg_baixar_docx_ind",
                )
            if col_pdf2.button("Gerar PDF", icon=":material/description:", key="vg_gerar_pdf_ind", use_container_width=True):
                conteudo = gerar_pdf_visao_gestor(f"Analista: {analista_escolhido}", kpis_individual, painel_individual)
                col_pdf2.download_button(
                    "Baixar PDF", data=conteudo, file_name=nome_arquivo_visao_gestor("individual", analista_escolhido).replace(".docx", ".pdf"),
                    mime="application/pdf", key="vg_baixar_pdf_ind",
                )
            registrar_atividade(usuario["username"], usuario.get("perfil"), "RELATORIO_VISAO_GESTOR_INDIVIDUAL", modulo="visao_gestor", detalhe=analista_escolhido)


def render(usuario: dict) -> None:
    exigir_area(usuario, "visao_gestor")

    perfil = usuario.get("perfil")
    if perfil not in (PERFIL_ADMIN, PERFIL_GESTOR):
        st.error("Acesso restrito a Gestor e Administrador.", icon=":material/lock:")
        st.stop()

    st.subheader(":material/dashboard: Visão do Gestor")
    st.caption(
        "Painel executivo diário da equipe: quem está fazendo o quê, o que cada analista deveria estar "
        "analisando conforme a Lista de Prioridades, divergências entre atividade atual e prioridade "
        "recomendada, e distribuição da carga de trabalho. Consome apenas informações já existentes — "
        "não altera nenhum módulo, regra ou permissão."
    )

    df_base, lista_prioridades, alertas_ativos = _base_dados()
    if df_base.empty:
        st.info("Nenhum projeto cadastrado ainda.")
        return
    pendencias_avaliacao = montar_pendencias_avaliacao(
        enriquecer_prestadores(filtrar_ativos(listar_prestadores())),
        enriquecer_cessionarios(filtrar_ativos(listar_cessionarios())),
    )

    df_filtrado = _renderizar_filtros(df_base)
    if df_filtrado.empty:
        st.warning("Nenhum registro encontrado com os filtros aplicados.", icon=":material/search_off:")
        return

    analistas_presentes = sorted(df_filtrado["responsavel"].dropna().unique().tolist())
    lista_prioridades_filtrada = lista_prioridades[lista_prioridades["responsavel"].isin(analistas_presentes)] if not lista_prioridades.empty else lista_prioridades
    alertas_filtrados = alertas_ativos[alertas_ativos["responsavel"].isin(analistas_presentes)] if not alertas_ativos.empty else alertas_ativos
    pendencias_filtradas = pendencias_avaliacao[pendencias_avaliacao["responsavel"].isin(analistas_presentes)] if not pendencias_avaliacao.empty else pendencias_avaliacao

    painel = montar_painel_por_analista(df_filtrado, lista_prioridades_filtrada, alertas_filtrados, pendencias_filtradas, analistas_presentes)

    st.markdown("### Indicadores executivos")
    _renderizar_kpis_executivos(df_filtrado, lista_prioridades_filtrada, alertas_filtrados, painel)
    st.divider()

    aba1, aba2, aba3, aba4, aba5 = st.tabs([
        "Quem está fazendo o quê", "O que deveria estar analisando", "Comparativo", "Distribuição de carga", "Relatórios",
    ])
    with aba1:
        _renderizar_quem_faz_o_que(df_filtrado, painel, lista_prioridades_filtrada, alertas_filtrados)
    with aba2:
        _renderizar_o_que_deveria_analisar(lista_prioridades_filtrada, analistas_presentes, df_filtrado)
    with aba3:
        _renderizar_comparativo(df_filtrado, lista_prioridades_filtrada, analistas_presentes)
    with aba4:
        _renderizar_distribuicao_carga(painel)
    with aba5:
        kpis_equipe = calcular_kpis_prazo_analista(df_filtrado, None)
        status_upper = df_filtrado["status_analise"].astype(str).str.strip().str.upper()
        kpis_relatorio = {
            "Total em andamento": int(status_upper.isin(STATUS_ATIVO_ANALISE).sum()),
            "Total prioritárias": len(lista_prioridades_filtrada),
            "Total atrasadas": kpis_equipe["atrasados_em_analise"],
            "Vencendo em ≤2 dias úteis": kpis_equipe["vencem_2_dias_uteis"],
            "Alertas ativos": len(alertas_filtrados),
            "% geral entregue no prazo": f"{kpis_equipe['pct_cumprimento_prazo']}%",
        }
        _renderizar_relatorios(df_filtrado, painel, lista_prioridades_filtrada, kpis_relatorio, analistas_presentes, usuario)
