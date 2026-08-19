"""View: Avaliação de Prestadores e Cessionários (checklist + histórico do
modelo de nota simples, baseado em Avaliacao_Prestadores_GAT.xlsx)."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.alertas_engine import MARCO_AVALIACOES_OFICIAL, pendencias_avaliacao_obrigatoria
from gat.business_rules import classificar_nota, filtrar_ativos, filtrar_por_competencia
from gat.config import COLUNAS_EXIBICAO_AVALIACOES, CORES_CLASSIFICACAO_AVALIACAO, DISCIPLINAS, RESPONSAVEIS
from gat.database import (
    listar_avaliacoes,
    listar_avaliacoes_checklist,
    listar_cessionarios,
    listar_obras_prestador,
    listar_prestadores,
    nome_exibicao_obra,
    obter_avaliacao,
    registrar_atividade,
)
from gat.export_avaliacoes import (
    gerar_excel_multiplas_abas,
    gerar_json_bytes,
    gerar_zip_csv,
    montar_backup_avaliacoes_checklist,
    nome_arquivo_backup,
)
from gat.normalizacao import texto_seguro
from gat.permissions import exigir_area, pode_area, pode_modulo
from gat.ranking_avaliacoes import detalhamento_avaliacoes, montar_ranking
from gat.ui.charts import grafico_status_donut
from gat.ui.filtros import rotulo_competencia, rotulo_periodo_filtro, seletor_competencia, seletor_periodo
from gat.ui.formatos import formatar_data_br, formatar_datas_df
from gat.ui.kpi_cards import renderizar_kpis
from gat.ui.modals import dialog_avaliacao
from gat.ui.modals_avaliacao import dialog_avaliacao_checklist
from gat.ui.tables import tabela_com_edicao


def _renderizar_backup(usuario: dict, tipo_label: str, tipo_entidade: str) -> None:
    if not pode_area(usuario, "avaliacoes.relatorios"):
        return
    with st.expander(f"Backup — Avaliação de {tipo_label}", icon=":material/backup:", expanded=False):
        st.caption(
            "Exporta todas as avaliações (checklist), com AT, projeto, disciplina, revisão, analista, "
            f"{tipo_label.lower()}, notas, comentários, datas e histórico completo de auditoria."
        )
        formato = st.selectbox("Formato", ["Excel (.xlsx)", "CSV (.zip)", "JSON"], key=f"backup_aval_formato_{tipo_entidade}")
        if st.button("Gerar backup", icon=":material/backup:", type="primary", key=f"backup_aval_gerar_{tipo_entidade}"):
            tabelas = montar_backup_avaliacoes_checklist(tipo_entidade)
            prefixo = f"Avaliacoes_{tipo_label.replace('á', 'a').replace('ã', 'a')}"
            if formato.startswith("Excel"):
                conteudo, arquivo, mime = gerar_excel_multiplas_abas(tabelas), nome_arquivo_backup(prefixo, "xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            elif formato.startswith("CSV"):
                conteudo, arquivo, mime = gerar_zip_csv(tabelas), nome_arquivo_backup(prefixo, "zip"), "application/zip"
            else:
                conteudo, arquivo, mime = gerar_json_bytes(tabelas), nome_arquivo_backup(prefixo, "json"), "application/json"
            st.download_button(
                f"Baixar backup ({formato})", data=conteudo, file_name=arquivo, mime=mime,
                icon=":material/download:", type="primary", key=f"backup_aval_baixar_{tipo_entidade}",
            )
            registrar_atividade(usuario["username"], usuario.get("perfil"), "BACKUP_AVALIACOES", modulo=tipo_entidade, detalhe=formato)


def _prefill_pendencia(row: pd.Series, coluna_nome: str) -> dict:
    return {
        "nome_entidade": row.get(coluna_nome), "codigo_entidade": row.get("codigo"),
        "disciplina": row.get("disciplina"), "at_referencia": row.get("num_at"),
        "revisao": row.get("revisao"), "analista_responsavel": row.get("responsavel"),
        "projeto_id": int(row["id"]),
    }


def _renderizar_pendencias(usuario: dict, tipo_label: str, tipo_entidade: str) -> None:
    """Lista de tarefas com as disciplinas/ATs cuja avaliação obrigatória da
    Rev.01 ainda está pendente — não exibe avaliações já concluídas,
    canceladas, dispensadas (isentas) ou que ainda não atingiram a Rev.01."""
    if tipo_entidade == "PRESTADOR":
        df, modulo, coluna_nome = listar_prestadores(), "prestadores", "prestador"
        rotulo_avaliacao = "Avaliação do Prestador"
    else:
        df, modulo, coluna_nome = listar_cessionarios(), "cessionarios", "cessionario"
        rotulo_avaliacao = "Avaliação do Projetista do Cessionário"

    df = filtrar_ativos(df)
    pendentes = pendencias_avaliacao_obrigatoria(df, modulo, coluna_nome, "codigo")

    st.markdown(f"##### Pendências — {rotulo_avaliacao} (Rev.01)")
    if pendentes.empty:
        st.success("Nenhuma avaliação obrigatória pendente no momento.", icon=":material/check_circle:")
        return

    st.caption(f"{len(pendentes)} disciplina(s)/AT(s) aguardando {rotulo_avaliacao.lower()}.")
    for _, row in pendentes.iterrows():
        with st.container(border=True):
            col_info, col_botao = st.columns([4, 1])
            with col_info:
                st.markdown(f"**{row.get(coluna_nome) or '—'}** ({row.get('disciplina') or '—'}) — AT {row.get('num_at') or '—'}")
                st.caption(f"Responsável: {row.get('responsavel') or '—'} · Revisão atual: {row.get('revisao')}")
            with col_botao:
                if st.button("Avaliar", icon=":material/fact_check:", type="primary", key=f"pendencia_avaliar_{tipo_entidade}_{int(row['id'])}", use_container_width=True):
                    dialog_avaliacao_checklist(usuario["username"], tipo_entidade, prefill=_prefill_pendencia(row, coluna_nome))


def _tab_checklist(usuario: dict) -> None:
    opcoes_tipo = []
    if pode_modulo(usuario, "prestadores"):
        opcoes_tipo.append("Prestador")
    if pode_modulo(usuario, "cessionarios"):
        opcoes_tipo.append("Cessionário")
    if not opcoes_tipo:
        st.info("Nenhum módulo (Prestadores/Cessionários) liberado para este usuário.")
        return

    auto_abrir = st.session_state.get("_gat_avaliacao_auto_abrir")
    if auto_abrir:
        st.session_state["aval_checklist_tipo"] = "Prestador" if auto_abrir.get("tipo_entidade") == "PRESTADOR" else "Cessionário"

    tipo_label = st.selectbox("Tipo", opcoes_tipo, key="aval_checklist_tipo")
    tipo_entidade = "PRESTADOR" if tipo_label == "Prestador" else "CESSIONARIO"

    if auto_abrir and auto_abrir.get("tipo_entidade") == tipo_entidade:
        st.session_state.pop("_gat_avaliacao_auto_abrir", None)
        dialog_avaliacao_checklist(usuario["username"], tipo_entidade, prefill=auto_abrir)

    _renderizar_pendencias(usuario, tipo_label, tipo_entidade)

    _renderizar_backup(usuario, tipo_label, tipo_entidade)

    if pode_area(usuario, "avaliacoes.cadastrar"):
        col_novo, _ = st.columns([1, 4])
        with col_novo:
            if st.button("Nova Avaliação (Checklist)", icon=":material/add:", type="primary", key="nova_avaliacao_checklist", use_container_width=True):
                dialog_avaliacao_checklist(usuario["username"], tipo_entidade)

    df = listar_avaliacoes_checklist(tipo_entidade)
    if df.empty:
        st.info(f"Nenhuma avaliação de {tipo_label.lower()} registrada ainda. Utilize o botão acima para iniciar.")
        return

    segmentacao_obra = tipo_entidade == "PRESTADOR"
    if segmentacao_obra:
        obras_df = listar_obras_prestador()
        mapa_nome_obra = {
            o["id"]: nome_exibicao_obra(o) for o in obras_df.to_dict("records")
        } if not obras_df.empty else {}
        df["nome_obra"] = df.get("obra_id", pd.Series(dtype="Int64")).map(mapa_nome_obra)

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        col1, col2, col3 = st.columns(3)
        f_entidade = col1.multiselect("Nome", sorted(df["nome_entidade"].dropna().unique().tolist()), key=f"filtro_checklist_nome_{tipo_entidade}")
        f_disciplina = col2.multiselect("Disciplina", sorted(df["disciplina"].dropna().unique().tolist()), key=f"filtro_checklist_disc_{tipo_entidade}")
        f_classificacao = col3.multiselect("Classificação", sorted(df["classificacao"].dropna().unique().tolist()), key=f"filtro_checklist_class_{tipo_entidade}")
        col4, col5, col6 = st.columns(3)
        f_at = col4.text_input("N° AT", key=f"filtro_checklist_at_{tipo_entidade}")
        f_revisao = col5.text_input("Revisão", key=f"filtro_checklist_rev_{tipo_entidade}")
        f_analista = col6.multiselect("Analista responsável", RESPONSAVEIS, key=f"filtro_checklist_analista_{tipo_entidade}")
        f_obra = []
        if segmentacao_obra:
            f_obra = st.multiselect(
                "Obra/Canteiro", sorted(df["nome_obra"].dropna().unique().tolist()),
                key=f"filtro_checklist_obra_{tipo_entidade}",
            )
        mes, ano = seletor_competencia(f"checklist_comp_{tipo_entidade}", rotulo="Competência da avaliação")

    df_filtrado = df.copy()
    if f_entidade:
        df_filtrado = df_filtrado[df_filtrado["nome_entidade"].isin(f_entidade)]
    if f_disciplina:
        df_filtrado = df_filtrado[df_filtrado["disciplina"].isin(f_disciplina)]
    if f_classificacao:
        df_filtrado = df_filtrado[df_filtrado["classificacao"].isin(f_classificacao)]
    if f_at.strip():
        df_filtrado = df_filtrado[df_filtrado["at_referencia"].fillna("").astype(str).str.contains(f_at.strip(), case=False, na=False, regex=False)]
    if f_revisao.strip():
        df_filtrado = df_filtrado[df_filtrado["revisao"].astype(str) == f_revisao.strip()]
    if f_analista:
        df_filtrado = df_filtrado[df_filtrado["analista_responsavel"].isin(f_analista)]
    if f_obra:
        df_filtrado = df_filtrado[df_filtrado["nome_obra"].isin(f_obra)]
    if mes or ano:
        df_filtrado = filtrar_por_competencia(df_filtrado, "data_avaliacao", mes, ano)
        st.caption(f"Competência: **{rotulo_competencia(mes, ano)}**")

    df_filtrado = df_filtrado.reset_index(drop=True)
    if df_filtrado.empty:
        st.warning("Nenhuma avaliação encontrada com os filtros aplicados.", icon=":material/search_off:")
        return

    media = df_filtrado["pontuacao"].mean()
    renderizar_kpis([
        ("Avaliações", str(len(df_filtrado)), None),
        ("Pontuação Média", f"{media:.1f} / 15", None),
        ("Demandam Acompanhamento", str((df_filtrado["classificacao"].isin(["CRÍTICO", "BAIXO"])).sum()), CORES_CLASSIFICACAO_AVALIACAO["CRÍTICO"]),
    ])

    if segmentacao_obra and df_filtrado["nome_obra"].notna().any():
        st.markdown("##### Resumo por Obra/Canteiro")
        resumo_obra = df_filtrado.dropna(subset=["nome_obra"]).groupby("nome_obra").agg(
            avaliacoes=("id", "count"), pontuacao_media=("pontuacao", "mean"),
        ).reset_index()
        resumo_obra["pontuacao_media"] = resumo_obra["pontuacao_media"].round(1)
        resumo_obra = resumo_obra.rename(columns={
            "nome_obra": "Obra/Canteiro", "avaliacoes": "Avaliações", "pontuacao_media": "Pontuação Média",
        }).sort_values("Avaliações", ascending=False)
        st.dataframe(resumo_obra, use_container_width=True, hide_index=True)

    df_classificacao = pd.DataFrame({"status_analise": df_filtrado["classificacao"]})
    st.plotly_chart(
        grafico_status_donut(df_classificacao, "status_analise", "Distribuição por Classificação", mapa_cores=CORES_CLASSIFICACAO_AVALIACAO),
        use_container_width=True,
    )

    st.caption(f"{len(df_filtrado)} avaliação(ões) encontrada(s).")
    colunas_tabela = ["nome_entidade", "codigo_entidade", "disciplina", "at_referencia", "revisao", "data_avaliacao", "analista_responsavel", "pontuacao", "classificacao", "acompanhamento"]
    rotulos = {
        "nome_entidade": "Nome", "codigo_entidade": "Código", "disciplina": "Disciplina",
        "at_referencia": "N° AT", "revisao": "Revisão", "data_avaliacao": "Data", "analista_responsavel": "Analista",
        "pontuacao": "Pontuação", "classificacao": "Classificação", "acompanhamento": "Acompanhamento",
    }
    if segmentacao_obra:
        colunas_tabela.insert(2, "nome_obra")
        rotulos["nome_obra"] = "Obra/Canteiro"
    df_exibicao = formatar_datas_df(df_filtrado[colunas_tabela], ["data_avaliacao"]).copy()
    if segmentacao_obra:
        df_exibicao["nome_obra"] = df_exibicao["nome_obra"].fillna("—")
    df_exibicao = df_exibicao.rename(columns=rotulos)

    def _abrir_edicao(registro: dict) -> None:
        exigir_area(usuario, "avaliacoes.editar")
        dialog_avaliacao_checklist(usuario["username"], tipo_entidade, registro)

    def _obter(reg_id: int) -> dict:
        from gat.database import obter_avaliacao_checklist
        return obter_avaliacao_checklist(reg_id)

    tabela_com_edicao(
        df_exibicao, df_filtrado["id"], chave=f"avaliacoes_checklist_{tipo_entidade}",
        abrir_dialog_edicao=_abrir_edicao, obter_registro=_obter,
    )


def _tab_historico_nota(usuario: dict) -> None:
    if not pode_modulo(usuario, "prestadores"):
        st.info("Disponível apenas para usuários com acesso ao módulo Prestadores.")
        return

    if pode_area(usuario, "avaliacoes.cadastrar"):
        col_novo, _ = st.columns([1, 4])
        with col_novo:
            if st.button("Nova Avaliação (nota 1-15)", icon=":material/add:", key="nova_avaliacao", use_container_width=True):
                dialog_avaliacao(usuario["username"])

    df = listar_avaliacoes()
    if df.empty:
        st.info("Nenhuma avaliação (modelo anterior) registrada ainda.")
        return

    df["classificacao"] = df["nota"].apply(lambda n: classificar_nota(n)[0])

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        col1, col2, col3 = st.columns([2, 2, 1])
        f_prestador = col1.multiselect("Prestador", sorted(df["nome_prestador"].dropna().unique().tolist()), key="filtro_aval_prestador")
        f_analista = col2.multiselect("Analista", RESPONSAVEIS, key="filtro_aval_analista")
        with col3:
            st.write("")
            if st.button("Limpar filtros", icon=":material/filter_alt_off:", key="limpar_filtros_aval"):
                for chave in ("filtro_aval_prestador", "filtro_aval_analista", "aval_competencia_mes", "aval_competencia_ano"):
                    st.session_state.pop(chave, None)
                st.rerun()
        mes, ano = seletor_competencia("aval_competencia", rotulo="Competência da avaliação")

    df_filtrado = df.copy()
    if f_prestador:
        df_filtrado = df_filtrado[df_filtrado["nome_prestador"].isin(f_prestador)]
    if f_analista:
        df_filtrado = df_filtrado[df_filtrado["analista_responsavel"].isin(f_analista)]
    if mes or ano:
        df_filtrado = filtrar_por_competencia(df_filtrado, "data_avaliacao", mes, ano)
        st.caption(f"Competência: **{rotulo_competencia(mes, ano)}**")

    df_filtrado = df_filtrado.reset_index(drop=True)

    media = df_filtrado["nota"].mean() if not df_filtrado.empty else 0
    mediana = df_filtrado["nota"].median() if not df_filtrado.empty else 0
    melhor = df_filtrado["nota"].max() if not df_filtrado.empty else 0
    pior = df_filtrado["nota"].min() if not df_filtrado.empty else 0

    renderizar_kpis([
        ("Avaliações", str(len(df_filtrado)), None),
        ("Nota Média", f"{media:.1f}", None),
        ("Mediana", f"{mediana:.1f}", None),
        ("Melhor Nota", str(int(melhor)), CORES_CLASSIFICACAO_AVALIACAO["EXCELENTE"]),
        ("Pior Nota", str(int(pior)), CORES_CLASSIFICACAO_AVALIACAO["CRÍTICO"]),
    ])

    contagem_prestador = df_filtrado["nome_prestador"].value_counts()
    baixa_representatividade = contagem_prestador[contagem_prestador < 3].index.tolist()
    if baixa_representatividade:
        st.warning(
            "Baixa representatividade estatística (menos de 3 avaliações) para: "
            + ", ".join(baixa_representatividade)
        )

    df_classificacao = pd.DataFrame({"status_analise": df_filtrado["classificacao"]})
    st.plotly_chart(
        grafico_status_donut(df_classificacao, "status_analise", "Distribuição por Classificação", mapa_cores=CORES_CLASSIFICACAO_AVALIACAO),
        use_container_width=True,
    )

    st.caption(f"{len(df_filtrado)} avaliação(ões) encontrada(s).")
    colunas = list(COLUNAS_EXIBICAO_AVALIACOES.keys())
    df_exibicao = df_filtrado[colunas].rename(columns=COLUNAS_EXIBICAO_AVALIACOES)

    def _abrir_edicao(registro: dict) -> None:
        exigir_area(usuario, "avaliacoes.cadastrar")
        dialog_avaliacao(usuario["username"], registro)

    tabela_com_edicao(
        df_exibicao,
        df_filtrado["id"],
        chave="avaliacoes",
        abrir_dialog_edicao=_abrir_edicao,
        obter_registro=obter_avaliacao,
    )


def _titulo_ranking(tipo_entidade: str) -> str:
    return "Ranking de Prestadores" if tipo_entidade == "PRESTADOR" else "Ranking de Projetistas de Cessionários"


def _tab_ranking(usuario: dict) -> None:
    """Ranking de Prestadores / Ranking de Projetistas de Cessionários
    (modificação de ranking/marco das avaliações): usa exclusivamente
    avaliações válidas realizadas a partir do marco oficial (01/07/2026),
    nunca considerando avaliação pendente como nota zero. Os dois
    rankings nunca se misturam — sempre um ou outro, conforme o Tipo
    escolhido."""
    opcoes_tipo = []
    if pode_modulo(usuario, "prestadores"):
        opcoes_tipo.append("Prestador")
    if pode_modulo(usuario, "cessionarios"):
        opcoes_tipo.append("Projetista de Cessionário")
    if not opcoes_tipo:
        st.info("Nenhum módulo (Prestadores/Cessionários) liberado para este usuário.")
        return

    tipo_label = st.selectbox("Tipo", opcoes_tipo, key="aval_ranking_tipo")
    tipo_entidade = "PRESTADOR" if tipo_label == "Prestador" else "CESSIONARIO"
    st.markdown(f"##### {_titulo_ranking(tipo_entidade)}")
    st.caption(
        f"Considera exclusivamente avaliações concluídas a partir do marco oficial das avaliações "
        f"({formatar_data_br(MARCO_AVALIACOES_OFICIAL)}) — média das notas finais que o sistema já calcula, "
        "sem alterar critérios, pesos ou escala."
    )

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        mes, ano, data_inicio, data_fim = seletor_periodo(f"aval_ranking_periodo_{tipo_entidade}", "Data da Avaliação")
        col1, col2 = st.columns(2)
        f_disciplina = col1.multiselect("Disciplina", DISCIPLINAS, key=f"aval_ranking_disc_{tipo_entidade}")
        opcoes_nome = sorted(listar_avaliacoes_checklist(tipo_entidade)["nome_entidade"].dropna().unique().tolist())
        rotulo_nome = "Prestador" if tipo_entidade == "PRESTADOR" else "Projetista/Cessionário"
        f_nome = col2.multiselect(rotulo_nome, opcoes_nome, key=f"aval_ranking_nome_{tipo_entidade}")

    ranking = montar_ranking(
        tipo_entidade, mes=mes, ano=ano, data_inicio=data_inicio, data_fim=data_fim,
        disciplina=f_disciplina or None, nomes=f_nome or None,
    )

    if ranking.empty:
        st.info("Sem avaliações válidas no período.", icon=":material/info:")
        return

    periodo_label = rotulo_periodo_filtro(mes, ano, data_inicio, data_fim)
    st.caption(f"Período considerado: **{periodo_label}** · {len(ranking)} {rotulo_nome.lower()}(s) no ranking.")

    exibicao = ranking.copy()
    exibicao["Posição"] = exibicao["posicao"].apply(lambda p: f"{p}º")
    exibicao["Nota Média"] = exibicao["media"].map(lambda v: f"{v:.1f}".replace(".", ","))
    exibicao["Data da Última Avaliação"] = exibicao["ultima_data"].apply(formatar_data_br)
    exibicao["codigo"] = exibicao["codigo"].apply(lambda v: texto_seguro(v).strip() or "—")
    colunas_tabela = {
        "Posição": "Posição", "nome": "Nome", "codigo": "Código",
        "Nota Média": "Nota Média", "qtd_avaliacoes": "Qtd. Avaliações",
        "melhor_nota": "Melhor Nota", "pior_nota": "Menor Nota",
        "Data da Última Avaliação": "Data da Última Avaliação",
    }
    if tipo_entidade == "CESSIONARIO":
        exibicao["Cessionário Relacionado"] = exibicao["nome"]
        colunas_tabela["Cessionário Relacionado"] = "Cessionário Relacionado"
    exibicao = exibicao.rename(columns={"nome": "Nome", "codigo": "Código", "qtd_avaliacoes": "Qtd. Avaliações", "melhor_nota": "Melhor Nota", "pior_nota": "Menor Nota"})
    st.dataframe(exibicao[list(colunas_tabela.values())], use_container_width=True, hide_index=True)

    st.markdown("###### Detalhamento — de onde veio a posição no ranking")
    opcoes_detalhe = {f"{int(r['posicao'])}º — {r['nome']}": r["chave"] for _, r in ranking.iterrows()}
    escolha = st.selectbox("Selecione um registro do ranking", list(opcoes_detalhe.keys()), key=f"aval_ranking_detalhe_{tipo_entidade}")
    if escolha:
        detalhe = detalhamento_avaliacoes(tipo_entidade, opcoes_detalhe[escolha], mes=mes, ano=ano, data_inicio=data_inicio, data_fim=data_fim)
        if detalhe.empty:
            st.info("Sem avaliações válidas no período.", icon=":material/info:")
        else:
            detalhe = detalhe.copy()
            for coluna in ("at_referencia", "disciplina", "revisao", "classificacao"):
                if coluna in detalhe.columns:
                    detalhe[coluna] = detalhe[coluna].apply(lambda v: texto_seguro(v).strip() or "—")
            detalhe_exibicao = formatar_datas_df(detalhe, ["data_avaliacao"]).rename(columns={
                "at_referencia": "N° AT", "nome_entidade": "Nome", "disciplina": "Disciplina", "revisao": "Revisão",
                "data_avaliacao": "Data", "pontuacao": "Nota", "classificacao": "Avaliação", "media_acumulada": "Média Acumulada",
            })
            st.dataframe(detalhe_exibicao, use_container_width=True, hide_index=True)


def render(usuario: dict) -> None:
    exigir_area(usuario, "avaliacoes.visualizar")
    if not (pode_modulo(usuario, "prestadores") or pode_modulo(usuario, "cessionarios")):
        st.info("Nenhum módulo (Prestadores/Cessionários) liberado para este usuário.")
        return

    st.subheader(":material/grade: Avaliação de Prestadores e Cessionários")
    st.caption(
        "Checklist por categorias (Qualidade de Projeto, Manuais e Normas, Documentação Geral, "
        "Revisões, Comunicação) — pontuação 0-15 · Crítico ≤3 · Baixo 4-6 · Regular 7-9 · Bom 10-12 · Excelente 13-15."
    )

    aba_checklist, aba_ranking, aba_historico = st.tabs([
        "Checklist (atual)", "Ranking", "Histórico — modelo anterior (nota 1-15)",
    ])
    with aba_checklist:
        _tab_checklist(usuario)
    with aba_ranking:
        _tab_ranking(usuario)
    with aba_historico:
        _tab_historico_nota(usuario)
