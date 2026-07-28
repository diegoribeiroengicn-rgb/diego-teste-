"""View: Avaliação dos Analistas — módulo restrito e separado da produtividade.
Notas de desempenho por critério (1-5), visíveis apenas a quem o
administrador autorizar (`analistas.notas` / `analistas.avaliar`)."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.config import CRITERIOS_AVALIACAO_ANALISTA, ESCALA_AVALIACAO_ANALISTA, MESES_PT, RESPONSAVEIS
from gat.business_rules import filtrar_por_competencia
from gat.database import (
    atualizar_avaliacao_analista,
    inserir_avaliacao_analista,
    listar_avaliacoes_analistas,
    listar_cessionarios,
    listar_prestadores,
)
from gat.permissions import exigir_area, pode_area
from gat.ui.kpi_cards import renderizar_kpis

_CHAVES_CRITERIOS = [c for c, _ in CRITERIOS_AVALIACAO_ANALISTA]

PENALIDADE_ETG = 0.5  # redução de 50% aplicada à média quando o analista teve ETG=SIM no período


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

    if pode_area(usuario, "analistas.avaliar"):
        if st.button("Nova Avaliação", icon=":material/add:", type="primary", key="nova_avaliacao_analista"):
            _dialog_avaliacao(usuario)

    df = listar_avaliacoes_analistas()
    if df.empty:
        st.info("Nenhuma avaliação de analista registrada ainda.")
        return

    df = _aplicar_penalidade_etg(df)

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

    st.markdown("##### Evolução mensal (média geral)")
    evolucao = df_filtrado.groupby(["ano", "mes"])["media_geral"].mean().reset_index()
    evolucao["competencia"] = evolucao.apply(lambda r: f"{MESES_PT[int(r['mes']) - 1][:3]}/{str(int(r['ano']))[2:]}", axis=1)
    st.line_chart(evolucao.set_index("competencia")["media_geral"])

    st.markdown("##### Avaliações registradas")
    df_filtrado["etg_rotulo"] = df_filtrado["etg_penalizado"].map({True: f"Sim (-{int((1 - PENALIDADE_ETG) * 100)}%)", False: "—"})
    colunas_tabela = ["analista", "avaliador", "mes", "ano", "media_bruta", "etg_rotulo", "media_geral", "justificativa"]
    rotulos = {
        "analista": "Analista", "avaliador": "Avaliador", "mes": "Mês", "ano": "Ano",
        "media_bruta": "Média (critérios)", "etg_rotulo": "Penalidade ETG", "media_geral": "Média Geral (final)",
        "justificativa": "Justificativa",
    }
    df_exibicao = df_filtrado[colunas_tabela].copy()
    df_exibicao["mes"] = df_exibicao["mes"].apply(lambda m: MESES_PT[int(m) - 1])
    df_exibicao = df_exibicao.rename(columns=rotulos).sort_values(["Ano", "Analista"], ascending=False).reset_index(drop=True)
    st.dataframe(df_exibicao, use_container_width=True, hide_index=True)

    if pode_area(usuario, "analistas.avaliar"):
        st.caption("Para editar uma avaliação existente, informe o ID (visível na auditoria) ao suporte técnico — edição em lote pela tabela será adicionada em uma próxima etapa.")
