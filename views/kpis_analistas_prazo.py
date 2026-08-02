"""KPIs de Prazo dos Analistas (itens 13-20 da modificação de cálculo
automático de data prevista): desempenho de cada analista frente à data
prevista de entrega, com acesso restrito — o próprio analista só vê os
próprios indicadores (validado no backend, nunca apenas escondido na tela);
Gestor e Administrador podem ver qualquer analista e a visão consolidada da
equipe."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores, filtrar_ativos, filtrar_por_competencia
from gat.config import (
    CORES,
    DISCIPLINAS,
    MESES_PT,
    PERFIL_ADMIN,
    PERFIL_GESTOR,
    RESPONSAVEIS,
    STATUS_ANALISE_OPCOES,
    TIPO_CESSIONARIO_OPCOES,
)
from gat.database import listar_cessionarios, listar_fechamentos_avaliacao_analista, listar_prestadores, registrar_atividade
from gat.kpis_analistas_prazo import (
    aplicar_filtros_prazo,
    calcular_kpis_prazo_analista,
    preparar_base_prazo,
    relacao_analises_analista,
    tabela_consolidada_por_analista,
)
from gat.permissions import exigir_area, pode_area
from gat.relatorios_kpis_prazo import gerar_relatorio_individual_word, nome_arquivo_kpis_prazo
from gat.ui.charts import gauge_sla, grafico_atrasados_por_analista, grafico_classificacao_prazo, grafico_ranking_cumprimento_prazo
from gat.ui.filtros import rotulo_competencia, seletor_competencia
from gat.ui.formatos import formatar_datas_df

_CHAVE_PAGINA_LISTA_PRIORIDADES = "gestao_lista_prioridades"


def _base_combinada() -> pd.DataFrame:
    df_p = preparar_base_prazo(enriquecer_prestadores(filtrar_ativos(listar_prestadores())), "prestadores")
    df_c = preparar_base_prazo(enriquecer_cessionarios(filtrar_ativos(listar_cessionarios())), "cessionarios")
    if df_p.empty and df_c.empty:
        return pd.DataFrame()
    return pd.concat([df_p, df_c], ignore_index=True)


def _renderizar_filtros(df: pd.DataFrame) -> tuple[pd.DataFrame, str]:
    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        modo_periodo = st.radio("Período", ["Mês/Ano", "Personalizado", "Todo o histórico"], horizontal=True, key="kpz_modo_periodo")
        if modo_periodo == "Mês/Ano":
            mes, ano = seletor_competencia("kpz_comp", "Competência (Data de Solicitação)")
            df_periodo = filtrar_por_competencia(df, "data_solicitacao", mes, ano)
            rotulo_periodo = rotulo_competencia(mes, ano)
        elif modo_periodo == "Personalizado":
            col_i, col_f = st.columns(2)
            st.session_state.setdefault("kpz_data_ini", None)
            st.session_state.setdefault("kpz_data_fim", None)
            data_ini = col_i.date_input("De", format="DD/MM/YYYY", key="kpz_data_ini")
            data_fim = col_f.date_input("Até", format="DD/MM/YYYY", key="kpz_data_fim")
            datas = pd.to_datetime(df["data_solicitacao"], errors="coerce")
            df_periodo = df
            if data_ini:
                df_periodo = df_periodo[datas >= pd.Timestamp(data_ini)]
            if data_fim:
                df_periodo = df_periodo[datas <= pd.Timestamp(data_fim)]
            rotulo_periodo = f"{data_ini.strftime('%d/%m/%Y') if data_ini else '...'} a {data_fim.strftime('%d/%m/%Y') if data_fim else '...'}"
        else:
            df_periodo = df
            rotulo_periodo = "Todo o histórico"

        col1, col2, col3 = st.columns(3)
        f_disciplina = col1.multiselect("Disciplina", DISCIPLINAS, key="kpz_disciplina")
        opcoes_revisao = sorted(df["revisao"].dropna().unique().tolist()) if not df.empty else []
        f_revisao = col2.multiselect("Revisão", opcoes_revisao, key="kpz_revisao")
        f_status = col3.multiselect("Status", STATUS_ANALISE_OPCOES, key="kpz_status")

        col4, col5, col6 = st.columns(3)
        f_tipo = col4.multiselect("Tipo do projeto (Cessionário)", TIPO_CESSIONARIO_OPCOES, key="kpz_tipo")
        f_sla_reduzido = col5.selectbox("SLA reduzido", ["Todos", "Sim", "Não"], key="kpz_slareduzido")
        f_prioridade = col6.multiselect("Prioridade (Nível)", [1, 2, 3], key="kpz_prioridade")
        f_entidade = st.text_input("Prestador/Cessionário (busca)", key="kpz_entidade")

    sla_reduzido_valor = {"Sim": True, "Não": False}.get(f_sla_reduzido)
    df_filtrado = aplicar_filtros_prazo(
        df_periodo,
        disciplina=f_disciplina or None,
        revisao=[int(r) for r in f_revisao] or None,
        status=f_status or None,
        tipo_projeto=f_tipo or None,
        sla_reduzido=sla_reduzido_valor,
        prioridade=f_prioridade or None,
        entidade=f_entidade.strip() or None,
    )
    return df_filtrado, rotulo_periodo


def _ultima_nota_fechada_por_analista() -> dict[str, dict]:
    """Nota Final da competência mais recente já fechada de cada analista
    (módulo Avaliação de Analistas) — uma vez fechada, a nota fica
    congelada e só o Administrador pode recalculá-la; o Gestor não pode
    alterá-la, apenas visualizá-la (mesma permissão `analistas.notas` já
    usada em Avaliação de Analistas)."""
    fechamentos = listar_fechamentos_avaliacao_analista()
    if fechamentos.empty:
        return {}
    mais_recentes = fechamentos.sort_values(["ano", "mes"], ascending=False).drop_duplicates("analista")
    return {linha["analista"]: linha.to_dict() for _, linha in mais_recentes.iterrows()}


def _renderizar_nota_avaliacao(analista: str, usuario: dict, notas_fechadas: dict[str, dict]) -> None:
    if not pode_area(usuario, "analistas.notas"):
        return
    fechamento = notas_fechadas.get(analista)
    if not fechamento:
        return
    competencia = f"{MESES_PT[int(fechamento['mes']) - 1]}/{int(fechamento['ano'])}"
    st.markdown(
        f"""<div style="border:1px solid {CORES['borda_forte']};border-radius:10px;padding:12px 14px;margin-bottom:14px;">
            <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:{CORES['texto_fraco']};">
                🔒 Nota Final de Avaliação (fechada) — {competencia}</div>
            <div style="font-size:1.9rem;font-weight:800;color:{CORES['navy']};">{fechamento['nota_final']}</div>
            <div style="font-size:0.78rem;color:{CORES['texto_fraco']};">
                Nota bloqueada — alteração requer autorização do Administrador (o Gestor não pode recalculá-la).</div>
        </div>""",
        unsafe_allow_html=True,
    )


def _renderizar_cards(kpis: dict, analista: str) -> None:
    st.markdown("##### Cards do analista")
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total entregue", kpis["total_entregue"])
    col2.metric("Entregues antes do prazo", kpis["antes_prazo"])
    col3.metric("Entregues no dia", kpis["no_dia"])
    col4.metric("Entregues com atraso", kpis["com_atraso"])

    col_atraso, col_vence, col_acao = st.columns([2, 2, 1.3])
    with col_atraso:
        destaque = kpis["atrasados_em_analise"] > 0
        cor = CORES["vermelho"] if destaque else CORES["borda_forte"]
        st.markdown(
            f"""<div style="border:2px solid {cor};border-radius:10px;padding:12px 14px;
                        background:{'#FEF2F2' if destaque else 'transparent'};">
                <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:{CORES['texto_fraco']};">
                    Atrasados em Análise</div>
                <div style="font-size:1.9rem;font-weight:800;color:{cor if destaque else CORES['texto']};">
                    {kpis['atrasados_em_analise']}</div>
            </div>""",
            unsafe_allow_html=True,
        )
    with col_vence:
        st.markdown(
            f"""<div style="border:1px solid {CORES['borda_forte']};border-radius:10px;padding:12px 14px;">
                <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:{CORES['texto_fraco']};">
                    Vencem em até 2 dias úteis</div>
                <div style="font-size:1.9rem;font-weight:800;color:{CORES['texto']};">
                    {kpis['vencem_2_dias_uteis']}</div>
            </div>""",
            unsafe_allow_html=True,
        )
    with col_acao:
        st.write("")
        st.write("")
        if st.button(
            "Ver na Lista de Prioridades", icon=":material/arrow_forward:", key="kpz_ver_lista",
            disabled=kpis["vencem_2_dias_uteis"] == 0, use_container_width=True,
        ):
            st.session_state["filtro_prio_responsavel"] = [analista]
            pagina = st.session_state.get("_gat_paginas", {}).get(_CHAVE_PAGINA_LISTA_PRIORIDADES)
            if pagina is not None:
                st.switch_page(pagina)
            else:
                st.rerun()

    col5, col6, col7 = st.columns(3)
    col5.metric("% Cumprimento do prazo", f"{kpis['pct_cumprimento_prazo']}%")
    col6.metric("Média dias úteis de antecipação", kpis["media_dias_antecipacao"])
    col7.metric("Média dias úteis de atraso", kpis["media_dias_atraso"])


def _renderizar_grafico_individual(df: pd.DataFrame, analista: str, kpis: dict) -> None:
    st.markdown("##### Gráficos")
    col_donut, col_gauge = st.columns(2)
    with col_donut:
        st.plotly_chart(
            grafico_classificacao_prazo(df[df["responsavel"] == analista], "Classificação das Entregas"),
            use_container_width=True,
        )
    with col_gauge:
        st.plotly_chart(gauge_sla(kpis["pct_cumprimento_prazo"], "% Cumprimento do Prazo"), use_container_width=True)


def _renderizar_relatorio_individual(df: pd.DataFrame, analista: str, rotulo_periodo: str, usuario: dict) -> None:
    st.markdown("##### Relatório individual")
    relacao = relacao_analises_analista(df, analista)
    if relacao.empty:
        st.caption("Nenhuma análise encontrada para gerar o relatório com os filtros aplicados.")
        return
    colunas = [
        "_modulo", "disciplina", "revisao", "num_at", "data_solicitacao", "data_limite",
        "data_analise", "_dias_uteis_diferenca", "classificacao_entrega", "status_analise",
    ]
    colunas_presentes = [c for c in colunas if c in relacao.columns]
    exibicao = formatar_datas_df(relacao[colunas_presentes], ["data_solicitacao", "data_limite", "data_analise"]).rename(columns={
        "_modulo": "Módulo", "disciplina": "Disciplina", "revisao": "Revisão", "num_at": "N° AT",
        "data_solicitacao": "Data Solicitação", "data_limite": "Data Prevista", "data_analise": "Data Efetiva",
        "_dias_uteis_diferenca": "Dias Úteis (Antecip./Atraso)", "classificacao_entrega": "Classificação",
        "status_analise": "Status",
    })
    st.dataframe(exibicao, use_container_width=True, hide_index=True)

    if st.button("Gerar relatório individual (Word)", icon=":material/description:", key="kpz_gerar_relatorio"):
        kpis = calcular_kpis_prazo_analista(df, analista)
        conteudo = gerar_relatorio_individual_word(analista, rotulo_periodo, kpis, exibicao, usuario["username"])
        st.download_button(
            "Baixar relatório (Word)", data=conteudo, file_name=nome_arquivo_kpis_prazo(analista),
            mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document", key="kpz_baixar_relatorio",
        )
        registrar_atividade(usuario["username"], usuario.get("perfil"), "RELATORIO_KPI_PRAZO_ANALISTA", modulo="analistas", detalhe=analista)


def _renderizar_consolidado(df: pd.DataFrame, usuario: dict, notas_fechadas: dict[str, dict]) -> None:
    st.markdown("##### Indicadores consolidados da equipe")
    st.caption("Visão restrita a Gestor/Administrador — nunca exibida a analistas comuns (item 20).")
    tabela = tabela_consolidada_por_analista(df, RESPONSAVEIS)
    if tabela.empty:
        st.info("Nenhum dado encontrado com os filtros aplicados.")
        return

    total_entregue = int(tabela["total_entregue"].sum())
    total_atrasados = int(tabela["atrasados_em_analise"].sum())
    total_vence_2d = int(tabela["vencem_2_dias_uteis"].sum())
    pct_geral = round(tabela["antes_prazo"].sum() / total_entregue * 100 + tabela["no_dia"].sum() / total_entregue * 100, 1) if total_entregue else 0.0
    media_atraso_geral = round(tabela.loc[tabela["com_atraso"] > 0, "media_dias_atraso"].mean(), 1) if (tabela["com_atraso"] > 0).any() else 0.0
    media_antecip_geral = round(tabela.loc[tabela["antes_prazo"] > 0, "media_dias_antecipacao"].mean(), 1) if (tabela["antes_prazo"] > 0).any() else 0.0

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total entregue (equipe)", total_entregue)
    col2.metric("Atrasados em análise (equipe)", total_atrasados)
    col3.metric("Vencem em até 2 dias úteis (equipe)", total_vence_2d)
    col4.metric("% Cumprimento geral do prazo", f"{pct_geral}%")
    col5, col6 = st.columns(2)
    col5.metric("Média dias úteis de atraso (equipe)", media_atraso_geral)
    col6.metric("Média dias úteis de antecipação (equipe)", media_antecip_geral)

    st.markdown("##### Gráficos")
    col_donut, col_ranking = st.columns(2)
    with col_donut:
        st.plotly_chart(grafico_classificacao_prazo(df, "Classificação das Entregas — Equipe"), use_container_width=True)
    with col_ranking:
        st.plotly_chart(grafico_ranking_cumprimento_prazo(tabela), use_container_width=True)
    st.plotly_chart(grafico_atrasados_por_analista(tabela), use_container_width=True)

    st.markdown("###### Por disciplina")
    if "disciplina" in df.columns and not df.empty:
        por_disciplina = df.groupby("disciplina").size().reset_index(name="Projetos").rename(columns={"disciplina": "Disciplina"})
        st.dataframe(por_disciplina, use_container_width=True, hide_index=True)

    st.markdown("###### Por analista")
    tabela_exibicao = tabela.rename(columns={
        "total_entregue": "Total Entregue", "antes_prazo": "Antes do Prazo", "no_dia": "No Dia",
        "com_atraso": "Com Atraso", "pct_antes_prazo": "% Antes", "pct_no_dia": "% No Dia",
        "pct_atraso": "% Atraso", "pct_cumprimento_prazo": "% Cumprimento",
        "media_dias_antecipacao": "Média Antecipação (dias úteis)", "media_dias_atraso": "Média Atraso (dias úteis)",
        "atrasados_em_analise": "Atrasados em Análise", "vencem_2_dias_uteis": "Vencem em 2 Dias Úteis",
    })
    if pode_area(usuario, "analistas.notas"):
        tabela_exibicao["Nota Final (fechada) 🔒"] = tabela_exibicao["Analista"].map(
            lambda a: notas_fechadas[a]["nota_final"] if a in notas_fechadas else "—"
        )
    st.dataframe(tabela_exibicao, use_container_width=True, hide_index=True)


def render(usuario: dict) -> None:
    exigir_area(usuario, "analistas.kpis_prazo")

    perfil = usuario.get("perfil")
    pode_ver_outros = perfil in (PERFIL_ADMIN, PERFIL_GESTOR)
    pode_consolidado = pode_ver_outros and pode_area(usuario, "analistas.kpis_prazo.consolidado")

    st.subheader(":material/military_tech: KPIs de Prazo dos Analistas")
    st.caption(
        "Desempenho frente à data prevista de entrega: antes do prazo, no dia, com atraso, análises "
        "atualmente atrasadas e próximas do vencimento. Acesso restrito: cada analista só vê os próprios "
        "indicadores; Gestor e Administrador podem consultar qualquer analista e a visão consolidada da equipe."
    )

    df_base = _base_combinada()
    if df_base.empty:
        st.info("Nenhum projeto cadastrado ainda.")
        return

    df_filtrado, rotulo_periodo = _renderizar_filtros(df_base)

    analista_vinculado = usuario.get("analista_vinculado")
    if pode_ver_outros:
        opcoes = (["Consolidado (equipe)"] if pode_consolidado else []) + list(RESPONSAVEIS)
        escolha = st.selectbox("Analista", opcoes, key="kpz_analista_escolha")
        analista_alvo = None if escolha == "Consolidado (equipe)" else escolha
    else:
        if not analista_vinculado:
            st.warning(
                "Seu usuário não está vinculado a um analista da lista de Responsáveis. Solicite ao "
                "administrador a vinculação em Sistema > Administração > Usuários para visualizar seus "
                "indicadores de prazo.",
                icon=":material/link_off:",
            )
            return
        analista_alvo = analista_vinculado
        st.caption(f"Exibindo apenas os indicadores de **{analista_alvo}** — você só pode ver os seus próprios indicadores de prazo.")

    notas_fechadas = _ultima_nota_fechada_por_analista()

    if analista_alvo is None:
        _renderizar_consolidado(df_filtrado, usuario, notas_fechadas)
        return

    _renderizar_nota_avaliacao(analista_alvo, usuario, notas_fechadas)
    kpis = calcular_kpis_prazo_analista(df_filtrado, analista_alvo)
    _renderizar_cards(kpis, analista_alvo)
    st.divider()
    _renderizar_grafico_individual(df_filtrado, analista_alvo, kpis)
    st.divider()
    _renderizar_relatorio_individual(df_filtrado, analista_alvo, rotulo_periodo, usuario)
