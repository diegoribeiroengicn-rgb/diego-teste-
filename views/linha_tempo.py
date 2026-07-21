"""View: Linha do Tempo — consolidada por código (Prestador/Cessionário).

A visão principal reúne, sob uma única linha, TODOS os projetos/ATs/
disciplinas/revisões do mesmo código — com métricas agregadas de tempo de
retorno externo (tempo entre revisões) e conformidade com o SLA de 10 dias
úteis. A partir daí, cada projeto pode ser expandido para revelar a
sequência cronológica completa de revisões (entrada → resposta → retorno
externo → nova revisão), sem perder a consolidação por código."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores, filtrar_ativos, filtrar_por_competencia
from gat.calendario import calcular_hold_dias, dias_uteis_entre
from gat.config import DISCIPLINAS, RESPONSAVEIS
from gat.database import listar_avaliacoes_checklist, listar_cessionarios, listar_prestadores, listar_reunioes_do_projeto, registrar_atividade
from gat.permissions import exigir_area, pode_modulo
from gat.relatorio_prestador import gerar_relatorio_prestador, nome_arquivo_relatorio
from gat.revisoes import calcular_intervalos_revisao, consolidado_por_entidade, projetos_por_entidade, situacao_sla_externo
from gat.ui.charts import (
    grafico_evolucao_mensal_retorno,
    grafico_interno_vs_externo,
    grafico_projetos_por_revisao,
    grafico_situacao_sla_externo,
    grafico_top_atraso_entidades,
)
from gat.ui.filtros import rotulo_competencia, seletor_competencia

_MODULOS_VISIVEIS = {"Prestadores": "prestadores", "Cessionários": "cessionarios"}


def _base(modulo: str) -> tuple[pd.DataFrame, str, str]:
    if modulo == "prestadores":
        return enriquecer_prestadores(filtrar_ativos(listar_prestadores())), "prestador", "PRESTADOR"
    return enriquecer_cessionarios(filtrar_ativos(listar_cessionarios())), "cessionario", "CESSIONARIO"


def _etapa(titulo: str, data_ref, dias_uteis: int | None, responsavel: str | None, observacao: str | None = None) -> None:
    with st.container(border=True):
        col1, col2 = st.columns([3, 1])
        with col1:
            st.markdown(f"**{titulo}**")
            if observacao:
                st.caption(observacao)
        with col2:
            if data_ref:
                st.caption(pd.to_datetime(data_ref).strftime("%d/%m/%Y") if pd.notna(pd.to_datetime(data_ref, errors="coerce")) else "—")
            if dias_uteis is not None:
                st.metric("Dias úteis", dias_uteis, label_visibility="collapsed")
        if responsavel:
            st.caption(f"Responsável: {responsavel}")


def _sequencia_completa_projeto(modulo: str, coluna_nome: str, tipo_entidade: str, df_grupo: pd.DataFrame) -> None:
    """Sequência cronológica completa de revisões de UM projeto (código/nome
    + AT + disciplina): postagem → análise → resposta → retorno externo →
    próxima revisão, e assim sucessivamente."""
    df_grupo = df_grupo.sort_values("revisao").reset_index(drop=True)
    anterior = None
    for idx, revisao in df_grupo.iterrows():
        st.markdown(f"###### REV{int(revisao['revisao']):02d}")
        hold_dias = calcular_hold_dias(revisao.get("hold_inicio"), revisao.get("hold_fim"))
        dias_analise_interna = int(revisao.get("dias_uteis_decorridos") or revisao.get("saldo_dias_uteis") or 0)

        _etapa("Postagem (Data de Solicitação)", revisao.get("data_solicitacao"), None, None)
        _etapa("Análise Tecnoplano (tempo de análise interna)", None, dias_analise_interna, revisao.get("responsavel"))
        if revisao.get("data_analise"):
            _etapa("Resposta da Tecnoplano", revisao.get("data_analise"), None, revisao.get("responsavel"), "Data em que a análise foi concluída.")
        else:
            _etapa("Resposta da Tecnoplano", None, None, None, "Ainda em análise — sem data de resposta registrada.")
        if hold_dias:
            _etapa("Aguardando retorno externo (Hold)", None, hold_dias, None, f"Hold de {revisao.get('hold_inicio', '—')} a {revisao.get('hold_fim', '—')}.")

        if anterior is not None:
            if pd.notna(revisao.get("data_solicitacao")) and pd.notna(anterior.get("data_solicitacao")):
                dias = dias_uteis_entre(anterior["data_solicitacao"], revisao["data_solicitacao"])
                situacao = situacao_sla_externo(dias)
                _etapa(
                    f"Retorno externo — REV{int(anterior['revisao']):02d} → REV{int(revisao['revisao']):02d}",
                    None, dias, None, f"Situação: {situacao}",
                )
        anterior = revisao
        if idx < len(df_grupo) - 1:
            st.markdown("---")

    ultima = df_grupo.iloc[-1]
    _etapa("Data limite (prazo acordado)", ultima.get("data_limite"), None, None, f"Status de entrega: {ultima.get('status_entrega_calc', '—')}")

    reunioes = listar_reunioes_do_projeto(modulo, int(ultima["id"]))
    if not reunioes.empty:
        st.markdown("**Reuniões vinculadas**")
        st.dataframe(
            reunioes[["titulo", "data_prevista", "data_realizada"]].rename(
                columns={"titulo": "Título", "data_prevista": "Data Prevista", "data_realizada": "Data Realizada"}
            ),
            use_container_width=True, hide_index=True,
        )

    avaliacoes = listar_avaliacoes_checklist(tipo_entidade)
    if not avaliacoes.empty:
        avaliacoes_projeto = avaliacoes[avaliacoes["projeto_id"].isin(df_grupo["id"])]
        if not avaliacoes_projeto.empty:
            st.markdown("**Avaliações**")
            st.dataframe(
                avaliacoes_projeto[["data_avaliacao", "revisao", "pontuacao", "classificacao", "acompanhamento"]].rename(
                    columns={"data_avaliacao": "Data", "revisao": "Revisão", "pontuacao": "Pontuação", "classificacao": "Classificação", "acompanhamento": "Acompanhamento"}
                ),
                use_container_width=True, hide_index=True,
            )

    if ultima.get("observacoes"):
        st.caption(f"Observações: {ultima['observacoes']}")


def render(usuario: dict) -> None:
    exigir_area(usuario, "linha_tempo")

    st.subheader(":material/timeline: Linha do Tempo — Consolidada por Código")
    st.caption(
        "Consolida todos os projetos, ATs, disciplinas e revisões do mesmo código de Prestador/Cessionário, "
        "com o tempo de retorno externo entre revisões e a conformidade com o SLA de 10 dias úteis. "
        "Expanda um projeto para ver a sequência cronológica completa de revisões."
    )

    opcoes_modulo = [rotulo for rotulo, chave in _MODULOS_VISIVEIS.items() if pode_modulo(usuario, chave)]
    if not opcoes_modulo:
        st.info("Nenhum módulo (Prestadores/Cessionários) liberado para este usuário.")
        return

    with st.expander("Filtros", icon=":material/filter_list:", expanded=True):
        col1, col2, col3 = st.columns(3)
        modulo_label = col1.selectbox("Módulo", opcoes_modulo, key="lt_modulo")
        f_codigo = col2.text_input("Código", key="lt_codigo")
        f_nome = col3.text_input("Nome (busca parcial)", key="lt_nome")
        col4, col5, col6 = st.columns(3)
        f_at = col4.text_input("N° AT", key="lt_at")
        f_disciplina = col5.selectbox("Disciplina", ["Todas"] + DISCIPLINAS, key="lt_disciplina")
        f_analista = col6.selectbox("Analista", ["Todos"] + RESPONSAVEIS, key="lt_analista")
        col7, col8 = st.columns(2)
        f_revisao = col7.text_input("Revisão", key="lt_revisao")
        mes, ano = seletor_competencia("lt_comp")
        usar_periodo = st.checkbox("Usar período personalizado (em vez de mês/ano)", key="lt_usar_periodo")
        if usar_periodo:
            col9, col10 = st.columns(2)
            st.session_state.setdefault("lt_data_inicio", None)
            st.session_state.setdefault("lt_data_fim", None)
            data_inicio = col9.date_input("Data início", format="DD/MM/YYYY", key="lt_data_inicio")
            data_fim = col10.date_input("Data fim", format="DD/MM/YYYY", key="lt_data_fim")
        else:
            data_inicio = data_fim = None

    modulo = _MODULOS_VISIVEIS[modulo_label]
    df, coluna_nome, tipo_entidade = _base(modulo)

    if f_codigo.strip():
        df = df[df["codigo"].fillna("").astype(str).str.contains(f_codigo.strip(), case=False, na=False, regex=False)]
    if f_nome.strip():
        df = df[df[coluna_nome].fillna("").astype(str).str.contains(f_nome.strip(), case=False, na=False, regex=False)]
    if f_at.strip():
        df = df[df["num_at"].fillna("").astype(str).str.contains(f_at.strip(), case=False, na=False, regex=False)]
    if f_disciplina != "Todas":
        df = df[df["disciplina"] == f_disciplina]
    if f_analista != "Todos":
        df = df[df["responsavel"] == f_analista]
    if f_revisao.strip():
        df = df[df["revisao"].astype(str) == f_revisao.strip()]
    if usar_periodo and data_inicio and data_fim:
        datas = pd.to_datetime(df["data_solicitacao"], errors="coerce")
        df = df[(datas.dt.date >= data_inicio) & (datas.dt.date <= data_fim)]
    elif mes or ano:
        df = filtrar_por_competencia(df, "data_solicitacao", mes, ano)

    if df.empty:
        st.warning("Nenhum projeto encontrado com os critérios de busca.", icon=":material/search_off:")
        return

    intervalos = calcular_intervalos_revisao(df, coluna_nome)
    consolidado = consolidado_por_entidade(df, coluna_nome)

    if consolidado.empty:
        st.warning("Nenhum código/entidade encontrado com os critérios de busca.", icon=":material/search_off:")
        return

    total_intervalos = len(intervalos)
    intervalos_validos = intervalos[intervalos["situacao_sla"] != "DATA INCONSISTENTE"]
    pct_dentro_geral = round(100 * (intervalos_validos["situacao_sla"] == "DENTRO DO SLA").sum() / len(intervalos_validos), 1) if not intervalos_validos.empty else 0.0

    col_m1, col_m2, col_m3, col_m4 = st.columns(4)
    col_m1.metric("Códigos/entidades", len(consolidado))
    col_m2.metric("Projetos consolidados", int(consolidado["qtd_projetos"].sum()))
    col_m3.metric("Intervalos calculados", total_intervalos)
    col_m4.metric("% dentro do SLA (geral)", f"{pct_dentro_geral}%")

    st.markdown("---")
    st.markdown("##### Gráficos consolidados (retorno externo entre revisões)")
    col_g1, col_g2 = st.columns(2)
    col_g1.plotly_chart(grafico_situacao_sla_externo(intervalos), use_container_width=True)
    col_g2.plotly_chart(grafico_evolucao_mensal_retorno(intervalos_validos), use_container_width=True)
    col_g3, col_g4 = st.columns(2)
    col_g3.plotly_chart(grafico_projetos_por_revisao(intervalos), use_container_width=True)
    col_g4.plotly_chart(grafico_top_atraso_entidades(consolidado.assign(media_dias=consolidado["media_dias"].fillna(0))), use_container_width=True)

    media_interno = pd.to_numeric(df.get("dias_uteis_decorridos"), errors="coerce").mean()
    media_externo = intervalos_validos["dias_uteis_retorno"].mean() if not intervalos_validos.empty else 0
    st.plotly_chart(grafico_interno_vs_externo(round(media_interno or 0, 1), round(media_externo or 0, 1)), use_container_width=True)

    st.markdown("---")
    st.markdown("##### Consolidado por código")
    if int(consolidado["qtd_inconsistentes"].sum()):
        st.warning(
            f":material/warning: {int(consolidado['qtd_inconsistentes'].sum())} intervalo(s) com data de revisão "
            "inconsistente (revisão seguinte registrada com data de entrada anterior à revisão anterior). Esses "
            "casos são sinalizados na coluna \"Inconsistentes\" e não entram nas médias de dias — corrija o "
            "cadastro da revisão para restaurar o cálculo correto.",
            icon=":material/warning:",
        )
    tabela = consolidado.sort_values("qtd_fora_sla", ascending=False).copy()
    tabela["Código/Nome"] = tabela["codigo"].fillna(tabela["nome"])
    for coluna in ["media_dias", "maior_dias", "menor_dias"]:
        tabela[coluna] = tabela[coluna].apply(lambda v: "—" if pd.isna(v) else v)
    st.dataframe(
        tabela[["Código/Nome", "nome", "qtd_projetos", "qtd_ats", "qtd_disciplinas", "qtd_atrasados_atual", "qtd_intervalos", "media_dias", "maior_dias", "menor_dias", "qtd_dentro_sla", "qtd_fora_sla", "qtd_inconsistentes", "pct_dentro_sla"]].rename(columns={
            "nome": "Nome", "qtd_projetos": "Projetos", "qtd_ats": "ATs", "qtd_disciplinas": "Disciplinas",
            "qtd_atrasados_atual": "Atrasados (atual)", "qtd_intervalos": "Intervalos", "media_dias": "Média dias",
            "maior_dias": "Maior", "menor_dias": "Menor", "qtd_dentro_sla": "Dentro SLA", "qtd_fora_sla": "Fora SLA",
            "qtd_inconsistentes": "Inconsistentes", "pct_dentro_sla": "% dentro SLA",
        }),
        use_container_width=True, hide_index=True,
    )

    st.markdown("---")
    st.markdown("##### Detalhamento por código")
    opcoes_entidade = {f"{r['codigo'] or '—'} · {r['nome']}": r["chave_entidade"] for _, r in consolidado.sort_values("nome").iterrows()}
    rotulo_escolhido = st.selectbox(f"Selecione um código/entidade ({len(opcoes_entidade)} encontrado(s))", list(opcoes_entidade.keys()), key="lt_entidade_escolhida")
    chave_entidade = opcoes_entidade[rotulo_escolhido]
    resumo_entidade = consolidado[consolidado["chave_entidade"] == chave_entidade].iloc[0]

    col_a, col_b, col_c, col_d, col_e = st.columns(5)
    col_a.metric("Projetos", int(resumo_entidade["qtd_projetos"]))
    col_b.metric("Média dias retorno", resumo_entidade["media_dias"] if pd.notna(resumo_entidade["media_dias"]) else "—")
    col_c.metric("Maior atraso", resumo_entidade["maior_dias"] if pd.notna(resumo_entidade["maior_dias"]) else "—")
    col_d.metric("Fora do SLA", int(resumo_entidade["qtd_fora_sla"]))
    col_e.metric("% dentro do SLA", f"{resumo_entidade['pct_dentro_sla']}%" if pd.notna(resumo_entidade["pct_dentro_sla"]) else "—")
    if resumo_entidade["qtd_projetos_sem_at_valido"]:
        st.caption(
            f":material/warning: {int(resumo_entidade['qtd_projetos_sem_at_valido'])} projeto(s) sem N° AT utilizável — "
            "não entram no cálculo de tempo entre revisões (sem correspondência confiável)."
        )
    if resumo_entidade["qtd_inconsistentes"]:
        st.caption(
            f":material/warning: {int(resumo_entidade['qtd_inconsistentes'])} intervalo(s) com data de revisão "
            "inconsistente — verifique as datas de entrada das revisões deste código na sequência abaixo."
        )

    projetos_entidade = projetos_por_entidade(df, coluna_nome)
    projetos_entidade = projetos_entidade[projetos_entidade["chave_entidade"] == chave_entidade]
    for _, projeto in projetos_entidade.sort_values(["disciplina", "num_at"]).iterrows():
        rotulo_projeto = f"AT {projeto['num_at'] or '—'} · {projeto['disciplina'] or '—'} · REV{int(projeto['revisao_atual']):02d} · {projeto['qtd_revisoes']} revisão(ões)"
        with st.expander(rotulo_projeto, icon=":material/folder_open:"):
            df_grupo = df[df["id"].isin(projeto["ids"])]
            _sequencia_completa_projeto(modulo, coluna_nome, tipo_entidade, df_grupo)

    st.markdown("---")
    titulo_relatorio = "Relatório do Prestador" if modulo == "prestadores" else "Relatório do Cessionário"
    st.markdown(f"##### {titulo_relatorio} (Word)")
    st.caption(
        "Documento Word completo — com quantas páginas forem necessárias — com todos os projetos deste código, "
        "todas as revisões, datas de entrada/saída, tempo de retorno entre revisões (dias úteis e corridos), "
        "tempos médios de resposta interna/externa, tempo total até a aprovação e a linha do tempo visual de cada "
        "revisão, com os indicadores de SLA nas cores padronizadas do sistema. Não é um OPR de uma única página."
    )
    observacoes_relatorio = st.text_area(
        "Observações gerenciais deste relatório", key=f"lt_relatorio_obs_{chave_entidade}",
    )
    if st.button(f"Gerar {titulo_relatorio} (Word)", icon=":material/description:", type="primary", key=f"lt_relatorio_gerar_{chave_entidade}"):
        ids_entidade = [id_ for lista in projetos_entidade["ids"] for id_ in lista]
        df_entidade = df[df["id"].isin(ids_entidade)]

        identificador = resumo_entidade["codigo"] or resumo_entidade["nome"]
        periodo_label_lt = "Todos os períodos"
        if usar_periodo and data_inicio and data_fim:
            periodo_label_lt = f"{data_inicio.strftime('%d/%m/%Y')} a {data_fim.strftime('%d/%m/%Y')}"
        elif mes or ano:
            periodo_label_lt = rotulo_competencia(mes, ano)

        conteudo_relatorio = gerar_relatorio_prestador(
            df_entidade, coluna_nome, modulo, str(identificador), resumo_entidade["nome"],
            periodo_label_lt,
            {"Código": f_codigo, "Nome": f_nome, "N° AT": f_at, "Disciplina": f_disciplina if f_disciplina != "Todas" else "", "Analista": f_analista if f_analista != "Todos" else "", "Revisão": f_revisao},
            usuario.get("nome_completo") or usuario["username"],
            observacoes_relatorio,
        )
        nome_arquivo_lt = nome_arquivo_relatorio(modulo, str(identificador), periodo_label_lt.replace("/", "-"))
        st.download_button(
            f"Baixar {titulo_relatorio} (Word)", data=conteudo_relatorio, file_name=nome_arquivo_lt,
            mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            icon=":material/download:", type="primary", use_container_width=True, key=f"lt_relatorio_baixar_{chave_entidade}",
        )
        registrar_atividade(usuario["username"], usuario.get("perfil"), "RELATORIO_PRESTADOR_GERADO", modulo=modulo, detalhe=str(identificador))
