"""View: Avaliação dos Analistas — módulo restrito e separado da produtividade.
Notas de desempenho por critério (1-5), visíveis apenas a quem o
administrador autorizar (`analistas.notas` / `analistas.avaliar`)."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.config import CRITERIOS_AVALIACAO_ANALISTA, ESCALA_AVALIACAO_ANALISTA, MESES_PT, PERFIL_ADMIN, RESPONSAVEIS
from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores, filtrar_ativos, filtrar_por_competencia
from gat.database import (
    atualizar_avaliacao_analista,
    fechar_avaliacao_analista,
    inserir_avaliacao_analista,
    listar_avaliacoes_analistas,
    listar_cessionarios,
    listar_fechamentos_avaliacao_analista,
    listar_prestadores,
    recalcular_fechamento_avaliacao_analista,
    registrar_atividade,
)
from gat.permissions import exigir_area, pode_area
from gat.relatorios_mensais import avaliacoes_obrigatorias_do_mes, produtividade_analistas
from gat.ui.kpi_cards import renderizar_kpis

_CHAVES_CRITERIOS = [c for c, _ in CRITERIOS_AVALIACAO_ANALISTA]

PENALIDADE_ETG = 0.5  # redução de 50% aplicada à média quando o analista teve ETG=SIM no período

NOTA_MAXIMA_ANALISTA = 5
BONUS_AVALIACOES_OBRIGATORIAS = 1  # concedido quando não há nenhuma pendência e havia ao menos 1 obrigatória no mês
RECOMENDACAO_DESEMPENHO_MAXIMO = (
    "Analista com desempenho máximo, apto para ministrar treinamentos internos e elegível para "
    "programas de reconhecimento e premiação."
)


def _media_bruta(row: pd.Series) -> float:
    valores = [row[c] for c in _CHAVES_CRITERIOS if pd.notna(row.get(c))]
    return round(sum(valores) / len(valores), 2) if valores else 0.0


def _analistas_com_etg_no_periodo(mes: int, ano: int) -> set[str]:
    """Analistas (Responsável) com ao menos um projeto de Prestador ou
    Cessionário marcado com ETG=SIM na competência (Data de Solicitação)
    informada — usado para aplicar a penalidade automática na avaliação."""
    df_p = filtrar_por_competencia(listar_prestadores(), "data_solicitacao", mes, ano)
    df_c = filtrar_por_competencia(listar_cessionarios(), "data_solicitacao", mes, ano)
    analistas: set[str] = set()
    if not df_p.empty and "etg" in df_p.columns:
        analistas |= set(df_p.loc[df_p["etg"] == "SIM", "responsavel"].dropna())
    if not df_c.empty and "etg" in df_c.columns:
        analistas |= set(df_c.loc[df_c["etg"] == "SIM", "responsavel"].dropna())
    return analistas


def _aplicar_penalidade_etg(df: pd.DataFrame) -> pd.DataFrame:
    """Adiciona `media_bruta` (média dos critérios, sem ajuste),
    `etg_penalizado` (bool) e `media_geral` (a nota final, com a
    penalidade de -50% já aplicada quando o analista teve ETG=SIM na
    mesma competência da avaliação)."""
    df = df.copy()
    df["media_bruta"] = df.apply(_media_bruta, axis=1)

    cache_etg: dict[tuple[int, int], set[str]] = {}
    for mes, ano in df[["mes", "ano"]].drop_duplicates().itertuples(index=False):
        cache_etg[(int(mes), int(ano))] = _analistas_com_etg_no_periodo(int(mes), int(ano))

    df["etg_penalizado"] = df.apply(
        lambda r: r["analista"] in cache_etg.get((int(r["mes"]), int(r["ano"])), set()), axis=1
    )
    df["media_geral"] = df.apply(
        lambda r: round(r["media_bruta"] * PENALIDADE_ETG, 2) if r["etg_penalizado"] else r["media_bruta"], axis=1
    )
    return df


def _aplicar_avaliacoes_obrigatorias(df: pd.DataFrame) -> pd.DataFrame:
    """
    Ordem de processamento: nota-base -> penalidade de ETG (já aplicada em
    `media_geral`) -> avaliações obrigatórias pendentes/realizadas no mês
    -> limite máximo da nota. Penalização e bonificação nunca se aplicam
    juntas: dependem do mesmo número de pendências no fechamento do mês
    (1 pendência = -1/3; 2 ou mais = -1/2, nunca reduz mais que isso;
    zero pendências = +1 ponto, se havia ao menos uma avaliação
    obrigatória naquele mês). A recomendação de reconhecimento é apenas
    informativa — não gera promoção, prêmio ou permissão automaticamente.
    """
    df = df.copy()

    def _linha(r: pd.Series) -> pd.Series:
        resumo = avaliacoes_obrigatorias_do_mes(r["analista"], int(r["mes"]), int(r["ano"]))
        pendentes = resumo["pendentes"]
        base = r["media_geral"]

        if pendentes == 0:
            penalizacao_fracao = 0.0
            bonificacao = float(BONUS_AVALIACOES_OBRIGATORIAS) if resumo["obrigatorias"] > 0 else 0.0
        elif pendentes == 1:
            penalizacao_fracao = 1 / 3
            bonificacao = 0.0
        else:
            penalizacao_fracao = 0.5
            bonificacao = 0.0

        nota_antes_limite = base * (1 - penalizacao_fracao) + bonificacao
        nota_final = min(round(nota_antes_limite, 2), NOTA_MAXIMA_ANALISTA)
        reconhecimento = RECOMENDACAO_DESEMPENHO_MAXIMO if bonificacao > 0 and nota_final >= NOTA_MAXIMA_ANALISTA else None

        if pendentes == 0 and resumo["obrigatorias"] > 0:
            justificativa_automatica = (
                f"Nota base {base:.2f}: nenhuma pendência entre {resumo['obrigatorias']} avaliação(ões) "
                f"obrigatória(s) do mês — bonificação de +{BONUS_AVALIACOES_OBRIGATORIAS} ponto aplicada."
            )
        elif pendentes == 0:
            justificativa_automatica = f"Nota base {base:.2f}: nenhuma avaliação obrigatória no mês — sem ajuste."
        elif pendentes == 1:
            justificativa_automatica = (
                f"Nota base {base:.2f}: 1 avaliação obrigatória pendente (AT {resumo['at_pendentes'][0]}) — "
                "penalização de 1/3 aplicada."
            )
        else:
            justificativa_automatica = (
                f"Nota base {base:.2f}: {pendentes} avaliações obrigatórias pendentes "
                f"({', '.join(resumo['at_pendentes'])}) — penalização de 1/2 aplicada (nunca mais que isso)."
            )

        return pd.Series({
            "avaliacoes_obrigatorias": resumo["obrigatorias"],
            "avaliacoes_pendentes": pendentes,
            "avaliacoes_at_pendentes": ", ".join(resumo["at_pendentes"]),
            "penalizacao_avaliacao_fracao": penalizacao_fracao,
            "bonificacao_avaliacao": bonificacao,
            "media_final": nota_final,
            "reconhecimento": reconhecimento,
            "justificativa_automatica": justificativa_automatica,
        })

    calculados = df.apply(_linha, axis=1)
    return pd.concat([df, calculados], axis=1)


def _aplicar_fechamentos(df: pd.DataFrame) -> pd.DataFrame:
    """Sobrepõe, quando existir, o fechamento persistente da competência —
    a partir do fechamento, os valores exibidos deixam de ser a prévia ao
    vivo e passam a ser os congelados em `fechamentos_avaliacao_analista`
    (não mudam mais automaticamente, mesmo que dados usados no cálculo
    mudem depois — ex.: uma avaliação obrigatória feita fora de prazo)."""
    df = df.copy()
    df["fechado"] = False
    df["data_fechamento"] = None
    df["usuario_fechamento"] = None

    fechamentos = listar_fechamentos_avaliacao_analista()
    if fechamentos.empty:
        return df

    mapa = {(f["analista"], int(f["mes"]), int(f["ano"])): f for _, f in fechamentos.iterrows()}
    for idx, row in df.iterrows():
        f = mapa.get((row["analista"], int(row["mes"]), int(row["ano"])))
        if f is None:
            continue
        df.at[idx, "fechado"] = True
        df.at[idx, "avaliacoes_obrigatorias"] = int(f["avaliacoes_obrigatorias"])
        df.at[idx, "avaliacoes_pendentes"] = int(f["avaliacoes_pendentes"])
        df.at[idx, "avaliacoes_at_pendentes"] = f["ats_pendentes"] or ""
        df.at[idx, "penalizacao_avaliacao_fracao"] = f["penalizacao_fracao"]
        df.at[idx, "bonificacao_avaliacao"] = f["bonificacao"]
        df.at[idx, "media_final"] = f["nota_final"]
        df.at[idx, "justificativa_automatica"] = f["justificativa_automatica"]
        df.at[idx, "reconhecimento"] = f["recomendacao_gerencial"]
        df.at[idx, "data_fechamento"] = f["data_fechamento"]
        df.at[idx, "usuario_fechamento"] = f["usuario_fechamento"]
    return df


def _dados_fechamento(linha: pd.Series, analista: str, mes: int, ano: int) -> dict:
    return {
        "avaliacao_analista_id": int(linha["id"]),
        "analista": analista, "mes": mes, "ano": ano,
        "nota_original": float(linha["media_geral"]),
        "avaliacoes_obrigatorias": int(linha["avaliacoes_obrigatorias"]),
        "avaliacoes_pendentes": int(linha["avaliacoes_pendentes"]),
        "ats_pendentes": linha["avaliacoes_at_pendentes"],
        "penalizacao_fracao": float(linha["penalizacao_avaliacao_fracao"]),
        "bonificacao": float(linha["bonificacao_avaliacao"]),
        "nota_final": float(linha["media_final"]),
        "justificativa_automatica": linha["justificativa_automatica"],
        "recomendacao_gerencial": linha["reconhecimento"],
    }


@st.dialog("Recalcular fechamento — restrito ao Administrador")
def _dialog_confirmar_recalculo(usuario: dict, linha: pd.Series, analista: str, mes: int, ano: int) -> None:
    st.warning(
        f"A competência {MESES_PT[mes - 1]}/{ano} de **{analista}** já está fechada. Recalcular substitui a "
        "nota final congelada pela prévia atual — esta ação é registrada permanentemente na auditoria e não "
        "pode ser desfeita pela interface.",
        icon=":material/warning:",
    )
    col1, col2 = st.columns(2)
    if col1.button("Cancelar", use_container_width=True, key="aa_cancelar_recalculo"):
        st.session_state.pop("aa_confirmar_recalculo", None)
        st.rerun()
    if col2.button("Confirmar recálculo", type="primary", use_container_width=True, key="aa_confirmar_recalculo_botao"):
        recalcular_fechamento_avaliacao_analista(analista, mes, ano, _dados_fechamento(linha, analista, mes, ano), usuario["username"])
        registrar_atividade(usuario["username"], usuario.get("perfil"), "RECALCULO_AVALIACAO_ANALISTA", modulo="analistas", detalhe=f"{analista} — {mes:02d}/{ano}")
        st.session_state.pop("aa_confirmar_recalculo", None)
        st.toast("Fechamento recalculado.", icon=":material/check_circle:")
        st.rerun()


@st.dialog("Avaliação do Analista", width="large")
def _dialog_avaliacao(usuario: dict, registro: dict | None = None) -> None:
    editando = registro is not None
    sufixo = f"edit_{registro['id']}" if editando else "novo"

    col1, col2 = st.columns(2)
    analista = col1.selectbox(
        "Analista", RESPONSAVEIS,
        index=RESPONSAVEIS.index(registro["analista"]) if editando and registro.get("analista") in RESPONSAVEIS else 0,
        key=f"aa_analista_{sufixo}",
    )
    mes = col2.selectbox(
        "Mês de referência", MESES_PT,
        index=(int(registro["mes"]) - 1) if editando else 0,
        key=f"aa_mes_{sufixo}",
    )
    ano = st.number_input("Ano de referência", min_value=2020, max_value=2100, step=1,
                           value=int(registro["ano"]) if editando else 2026, key=f"aa_ano_{sufixo}")

    st.markdown("##### Critérios (escala 1-5)")
    st.caption(" · ".join(f"{k} — {v}" for k, v in ESCALA_AVALIACAO_ANALISTA.items()))
    valores: dict[str, int] = {}
    cols = st.columns(2)
    for i, (chave, rotulo) in enumerate(CRITERIOS_AVALIACAO_ANALISTA):
        with cols[i % 2]:
            valores[chave] = st.slider(rotulo, 1, 5, value=int(registro.get(chave) or 3) if editando else 3, key=f"aa_{chave}_{sufixo}")

    justificativa = st.text_area("Justificativa", value=registro.get("justificativa", "") if editando else "", key=f"aa_just_{sufixo}")
    observacoes = st.text_area("Observações complementares", value=registro.get("observacoes", "") if editando else "", key=f"aa_obs_{sufixo}")

    media = round(sum(valores.values()) / len(valores), 2)
    st.metric("Média geral", media)

    col_salvar, col_cancelar = st.columns(2)
    salvar = col_salvar.button("Salvar", icon=":material/save:", type="primary", use_container_width=True, key=f"aa_salvar_{sufixo}")
    cancelar = col_cancelar.button("Cancelar", use_container_width=True, key=f"aa_cancelar_{sufixo}")

    if cancelar:
        st.rerun()

    if salvar:
        dados = {
            "analista": analista, "avaliador": usuario["username"],
            "mes": MESES_PT.index(mes) + 1, "ano": int(ano),
            **valores, "justificativa": justificativa, "observacoes": observacoes,
        }
        if editando:
            atualizar_avaliacao_analista(registro["id"], dados, usuario["username"])
            st.toast("Avaliação atualizada.", icon=":material/check_circle:")
        else:
            inserir_avaliacao_analista(dados, usuario["username"])
            st.toast("Avaliação registrada.", icon=":material/check_circle:")
        st.rerun()


def render(usuario: dict) -> None:
    exigir_area(usuario, "analistas.notas")

    st.subheader(":material/military_tech: Avaliação dos Analistas")
    st.caption(
        "Notas de desempenho por critério — módulo restrito, separado da produtividade. "
        "Escala: " + " · ".join(f"{k} = {v}" for k, v in ESCALA_AVALIACAO_ANALISTA.items())
    )
    st.caption(
        f":material/rule: Penalidade automática: quando o analista teve pelo menos um projeto (Prestador ou "
        f"Cessionário) com ETG = SIM na mesma competência da avaliação, a Média Geral é reduzida em "
        f"{int((1 - PENALIDADE_ETG) * 100)}%."
    )
    st.caption(
        ":material/fact_check: Avaliações obrigatórias: 1 pendência no fechamento do mês reduz a nota em 1/3; "
        "2 ou mais reduzem em 1/2 (nunca mais que isso). Zero pendências (havendo ao menos uma obrigatória no "
        f"mês) soma +{BONUS_AVALIACOES_OBRIGATORIAS} ponto, respeitando o limite máximo da nota "
        f"({NOTA_MAXIMA_ANALISTA}). Penalização e bonificação nunca se aplicam juntas."
    )

    if pode_area(usuario, "analistas.avaliar"):
        if st.button("Nova Avaliação", icon=":material/add:", type="primary", key="nova_avaliacao_analista"):
            _dialog_avaliacao(usuario)

    df = listar_avaliacoes_analistas()
    if df.empty:
        st.info("Nenhuma avaliação de analista registrada ainda.")
        return

    df = _aplicar_penalidade_etg(df)
    df = _aplicar_avaliacoes_obrigatorias(df)
    df = _aplicar_fechamentos(df)

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        col1, col2, col3 = st.columns(3)
        f_analista = col1.multiselect("Analista", sorted(df["analista"].dropna().unique().tolist()), key="filtro_aa_analista")
        f_avaliador = col2.multiselect("Avaliador", sorted(df["avaliador"].dropna().unique().tolist()), key="filtro_aa_avaliador")
        f_ano = col3.multiselect("Ano", sorted(df["ano"].dropna().unique().tolist(), reverse=True), key="filtro_aa_ano")
        f_mes = st.multiselect("Mês", MESES_PT, key="filtro_aa_mes")

    df_filtrado = df.copy()
    if f_analista:
        df_filtrado = df_filtrado[df_filtrado["analista"].isin(f_analista)]
    if f_avaliador:
        df_filtrado = df_filtrado[df_filtrado["avaliador"].isin(f_avaliador)]
    if f_ano:
        df_filtrado = df_filtrado[df_filtrado["ano"].isin(f_ano)]
    if f_mes:
        meses_idx = [MESES_PT.index(m) + 1 for m in f_mes]
        df_filtrado = df_filtrado[df_filtrado["mes"].isin(meses_idx)]

    if df_filtrado.empty:
        st.warning("Nenhuma avaliação encontrada com os filtros aplicados.", icon=":material/search_off:")
        return

    st.markdown("##### Médias por critério")
    medias_criterio = {rotulo: round(df_filtrado[chave].mean(), 2) for chave, rotulo in CRITERIOS_AVALIACAO_ANALISTA if chave in df_filtrado.columns}
    renderizar_kpis([(rotulo, str(valor), None) for rotulo, valor in list(medias_criterio.items())[:6]])

    st.markdown("##### Evolução mensal (nota final)")
    evolucao = df_filtrado.groupby(["ano", "mes"])["media_final"].mean().reset_index()
    evolucao["competencia"] = evolucao.apply(lambda r: f"{MESES_PT[int(r['mes']) - 1][:3]}/{str(int(r['ano']))[2:]}", axis=1)
    st.line_chart(evolucao.set_index("competencia")["media_final"])

    reconhecidos = df_filtrado[df_filtrado["reconhecimento"].notna()]
    if not reconhecidos.empty:
        st.markdown("##### Reconhecimento")
        for analista_nome in sorted(reconhecidos["analista"].unique()):
            st.success(f"**{analista_nome}**: {RECOMENDACAO_DESEMPENHO_MAXIMO}", icon=":material/military_tech:")
        st.caption(
            "Recomendação gerencial apenas — não gera promoção, aumento salarial, prêmio ou novas permissões "
            "automaticamente."
        )

    st.markdown("##### Fechamento mensal")
    st.caption(
        "Ao fechar uma competência, a nota final fica congelada — deixa de ser recalculada automaticamente "
        "mesmo que dados usados no cálculo mudem depois. Recalcular uma competência já fechada é uma ação "
        "restrita ao Administrador e fica registrada permanentemente na auditoria."
    )
    combinacoes = df_filtrado[["analista", "mes", "ano"]].drop_duplicates().sort_values(["ano", "mes", "analista"], ascending=False)
    rotulos_combinacao = {
        f"{r['analista']} — {MESES_PT[int(r['mes']) - 1]}/{int(r['ano'])}": (r["analista"], int(r["mes"]), int(r["ano"]))
        for _, r in combinacoes.iterrows()
    }
    if pode_area(usuario, "analistas.avaliar") and rotulos_combinacao:
        escolha = st.selectbox("Selecionar competência", list(rotulos_combinacao.keys()), key="aa_fechamento_escolha")
        analista_sel, mes_sel, ano_sel = rotulos_combinacao[escolha]
        linha_ref = df_filtrado[
            (df_filtrado["analista"] == analista_sel) & (df_filtrado["mes"] == mes_sel) & (df_filtrado["ano"] == ano_sel)
        ].iloc[0]

        col_p1, col_p2, col_p3 = st.columns(3)
        col_p1.metric("Nota base (pós-ETG)", linha_ref["media_geral"])
        col_p2.metric("Pendências", int(linha_ref["avaliacoes_pendentes"]))
        col_p3.metric("Nota final" + (" (fechada)" if linha_ref["fechado"] else " (prévia)"), linha_ref["media_final"])
        st.caption(linha_ref["justificativa_automatica"])

        if linha_ref["fechado"]:
            st.info(
                f":material/lock: Competência fechada em {str(linha_ref['data_fechamento'])[:16].replace('T', ' ')} "
                f"por {linha_ref['usuario_fechamento']}.",
                icon=":material/lock:",
            )
            if usuario.get("perfil") == PERFIL_ADMIN:
                if st.button("Recalcular (sobrescreve o fechamento atual)", icon=":material/restart_alt:", key="aa_recalcular_botao"):
                    st.session_state["aa_confirmar_recalculo"] = True
            else:
                st.caption("Recalcular uma competência fechada requer autorização do Administrador.")
        else:
            if st.button("Fechar competência", icon=":material/lock:", type="primary", key="aa_fechar_botao"):
                fechar_avaliacao_analista(_dados_fechamento(linha_ref, analista_sel, mes_sel, ano_sel), usuario["username"])
                registrar_atividade(usuario["username"], usuario.get("perfil"), "FECHAMENTO_AVALIACAO_ANALISTA", modulo="analistas", detalhe=f"{analista_sel} — {mes_sel:02d}/{ano_sel}")
                st.toast("Competência fechada com sucesso.", icon=":material/check_circle:")
                st.rerun()

        if st.session_state.get("aa_confirmar_recalculo"):
            _dialog_confirmar_recalculo(usuario, linha_ref, analista_sel, mes_sel, ano_sel)

    st.markdown("##### Avaliações registradas")
    df_filtrado["etg_rotulo"] = df_filtrado["etg_penalizado"].map({True: f"Sim (-{int((1 - PENALIDADE_ETG) * 100)}%)", False: "—"})
    df_filtrado["penalizacao_rotulo"] = df_filtrado["penalizacao_avaliacao_fracao"].map({0.0: "—", 1 / 3: "-1/3", 0.5: "-1/2"})
    df_filtrado["bonificacao_rotulo"] = df_filtrado["bonificacao_avaliacao"].apply(lambda v: f"+{v:g}" if v else "—")
    df_filtrado["fechado_rotulo"] = df_filtrado["fechado"].map({True: "Fechada", False: "Prévia (não fechada)"})
    colunas_tabela = [
        "analista", "avaliador", "mes", "ano", "media_bruta", "etg_rotulo", "media_geral",
        "avaliacoes_obrigatorias", "avaliacoes_pendentes", "avaliacoes_at_pendentes",
        "penalizacao_rotulo", "bonificacao_rotulo", "media_final", "fechado_rotulo", "justificativa",
    ]
    rotulos = {
        "analista": "Analista", "avaliador": "Avaliador", "mes": "Mês", "ano": "Ano",
        "media_bruta": "Média (critérios)", "etg_rotulo": "Penalidade ETG", "media_geral": "Média (pós-ETG)",
        "avaliacoes_obrigatorias": "Avaliações Obrigatórias", "avaliacoes_pendentes": "Pendentes",
        "avaliacoes_at_pendentes": "ATs Pendentes", "penalizacao_rotulo": "Penalização (Avaliação)",
        "bonificacao_rotulo": "Bonificação", "media_final": "Nota Final", "fechado_rotulo": "Situação",
        "justificativa": "Justificativa",
    }
    df_exibicao = df_filtrado[colunas_tabela].copy()
    df_exibicao["mes"] = df_exibicao["mes"].apply(lambda m: MESES_PT[int(m) - 1])
    df_exibicao = df_exibicao.rename(columns=rotulos).sort_values(["Ano", "Analista"], ascending=False).reset_index(drop=True)
    st.dataframe(df_exibicao, use_container_width=True, hide_index=True)

    if pode_area(usuario, "analistas.avaliar"):
        st.caption("Para editar uma avaliação existente, informe o ID (visível na auditoria) ao suporte técnico — edição em lote pela tabela será adicionada em uma próxima etapa.")

    if pode_area(usuario, "analistas.relatorios"):
        _renderizar_relatorio_gerencial(df_filtrado)


def _renderizar_relatorio_gerencial(df_filtrado: pd.DataFrame) -> None:
    """Relatório gerencial por analista/competência (item 14): análises
    realizadas, avaliações obrigatórias/realizadas/pendentes, ATs
    pendentes, nota original, penalização, bonificação, nota final,
    justificativa automática e recomendação gerencial."""
    st.markdown("##### Relatório Gerencial")
    df_prest = enriquecer_prestadores(filtrar_ativos(listar_prestadores()))
    df_cess = enriquecer_cessionarios(filtrar_ativos(listar_cessionarios()))

    linhas_relatorio = []
    combinacoes = df_filtrado[["analista", "mes", "ano"]].drop_duplicates()
    for _, comb in combinacoes.iterrows():
        analista, mes, ano = comb["analista"], int(comb["mes"]), int(comb["ano"])
        linha_calculo = df_filtrado[
            (df_filtrado["analista"] == analista) & (df_filtrado["mes"] == mes) & (df_filtrado["ano"] == ano)
        ].iloc[0]
        prod_p = produtividade_analistas(df_prest, mes, ano, analista=analista)
        prod_c = produtividade_analistas(df_cess, mes, ano, analista=analista)
        analises_realizadas = int(prod_p["concluidos"].sum() if not prod_p.empty else 0) + int(prod_c["concluidos"].sum() if not prod_c.empty else 0)

        linhas_relatorio.append({
            "Analista": analista, "Mês": MESES_PT[mes - 1], "Ano": ano,
            "Análises Realizadas": analises_realizadas,
            "Avaliações Obrigatórias": int(linha_calculo["avaliacoes_obrigatorias"]),
            "Avaliações Realizadas": int(linha_calculo["avaliacoes_obrigatorias"]) - int(linha_calculo["avaliacoes_pendentes"]),
            "Avaliações Pendentes": int(linha_calculo["avaliacoes_pendentes"]),
            "ATs Pendentes": linha_calculo["avaliacoes_at_pendentes"] or "—",
            "Nota Original": linha_calculo["media_geral"],
            "Penalização": {0.0: "—", 1 / 3: "-1/3", 0.5: "-1/2"}.get(linha_calculo["penalizacao_avaliacao_fracao"], "—"),
            "Bonificação": f"+{linha_calculo['bonificacao_avaliacao']:g}" if linha_calculo["bonificacao_avaliacao"] else "—",
            "Nota Final": linha_calculo["media_final"],
            "Situação": "Fechada" if linha_calculo["fechado"] else "Prévia (não fechada)",
            "Justificativa Automática": linha_calculo["justificativa_automatica"],
            "Recomendação Gerencial": linha_calculo["reconhecimento"] or "—",
        })

    df_relatorio = pd.DataFrame(linhas_relatorio).sort_values(["Ano", "Mês", "Analista"], ascending=[False, False, True]).reset_index(drop=True)
    st.dataframe(df_relatorio, use_container_width=True, hide_index=True)
