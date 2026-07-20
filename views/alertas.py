"""View: Central de Alertas — projetos que sugerem reunião (gargalos críticos,
atraso, classificação crítica/baixa na avaliação), com retirar/reativar do radar."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores, filtrar_ativos, filtrar_por_competencia
from gat.config import COLUNAS_EXIBICAO_CESSIONARIOS, COLUNAS_EXIBICAO_PRESTADORES, DISCIPLINAS, META_REVISAO_APROVACAO, RESPONSAVEIS
from gat.database import (
    listar_avaliacoes_checklist,
    listar_cessionarios,
    listar_prestadores,
    listar_radar,
    reativar_no_radar,
    retirar_do_radar,
    status_radar,
)
from gat.permissions import exigir_area
from gat.ui.filtros import rotulo_competencia, seletor_competencia

_TIPO_ALERTA = "PENDENTE_REUNIAO"


def _classificacoes_criticas(tipo_entidade: str) -> set[tuple[str, str]]:
    """(nome/código, disciplina) com última avaliação CRÍTICO ou BAIXO."""
    df = listar_avaliacoes_checklist(tipo_entidade)
    if df.empty:
        return set()
    df = df.sort_values("data_avaliacao").drop_duplicates(subset=["codigo_entidade", "nome_entidade", "disciplina"], keep="last")
    criticos = df[df["classificacao"].isin(["CRÍTICO", "BAIXO"])]
    chave = criticos["codigo_entidade"].fillna(criticos["nome_entidade"])
    return set(zip(chave, criticos["disciplina"].fillna("")))


def _montar_alertas(df: pd.DataFrame, modulo: str, coluna_nome: str, coluna_codigo: str) -> pd.DataFrame:
    if df.empty:
        return df
    criticos = _classificacoes_criticas("PRESTADOR" if modulo == "prestadores" else "CESSIONARIO")

    def _motivos(row: pd.Series) -> list[str]:
        motivos = []
        if row.get("pendente_reuniao"):
            motivos.append(f"Revisão ≥ REV{META_REVISAO_APROVACAO} sem liberação")
        if row.get("status_entrega_calc") == "ATRASADO":
            motivos.append("Atrasado")
        codigo = row.get(coluna_codigo) or row.get(coluna_nome)
        if (codigo, row.get("disciplina") or "") in criticos:
            motivos.append("Avaliação Crítica/Baixa")
        return motivos

    df = df.copy()
    df["motivos"] = df.apply(_motivos, axis=1)
    df = df[df["motivos"].apply(len) > 0]
    if df.empty:
        return df
    df["situacao_radar"] = df["id"].apply(lambda pid: status_radar(modulo, int(pid), _TIPO_ALERTA))
    df["motivos_texto"] = df["motivos"].apply(lambda m: " · ".join(m))
    return df


def _secao_modulo(usuario: dict, modulo: str, df: pd.DataFrame, coluna_nome: str, coluna_codigo: str, colunas_exibicao: dict) -> None:
    alertas = _montar_alertas(df, modulo, coluna_nome, coluna_codigo)
    ativos = alertas[alertas["situacao_radar"] == "ATIVO"] if not alertas.empty else alertas
    retirados = alertas[alertas["situacao_radar"] == "RETIRADO"] if not alertas.empty else alertas

    st.metric("Alertas ativos", len(ativos) if not ativos.empty else 0)

    if ativos.empty:
        st.success("Nenhum alerta ativo no momento.")
    else:
        limite = 30
        if len(ativos) > limite:
            ativos = ativos.assign(_qtd_motivos=ativos["motivos"].apply(len)).sort_values("_qtd_motivos", ascending=False)
            st.caption(f"Exibindo os {limite} alertas mais críticos de {len(ativos)}. Use os Filtros para refinar a lista.")
            ativos = ativos.head(limite)
        for _, row in ativos.iterrows():
            with st.container(border=True):
                col_info, col_acao = st.columns([4, 1])
                with col_info:
                    st.markdown(f"**{row.get(coluna_nome)}** ({row.get('disciplina', '—')}) — {row.get('motivos_texto')}")
                    st.caption(f"Item {row.get('item')} · N° AT {row.get('num_at') or '—'} · Revisão {row.get('revisao')} · Responsável: {row.get('responsavel') or '—'}")
                with col_acao:
                    if st.button("Retirar do radar", key=f"retirar_{modulo}_{row['id']}", use_container_width=True):
                        st.session_state[f"_retirar_form_{modulo}_{row['id']}"] = True
                if st.session_state.get(f"_retirar_form_{modulo}_{row['id']}"):
                    justificativa = st.text_area("Justificativa (obrigatória)", key=f"just_{modulo}_{row['id']}")
                    col_confirmar, col_cancelar = st.columns(2)
                    if col_confirmar.button("Confirmar retirada", key=f"confirma_retirar_{modulo}_{row['id']}", type="primary"):
                        if not justificativa.strip():
                            st.error("A justificativa é obrigatória para retirar um alerta do radar.")
                        else:
                            retirar_do_radar(modulo, int(row["id"]), _TIPO_ALERTA, justificativa, usuario["username"])
                            st.session_state.pop(f"_retirar_form_{modulo}_{row['id']}", None)
                            st.toast("Alerta retirado do radar.", icon=":material/check_circle:")
                            st.rerun()
                    if col_cancelar.button("Cancelar", key=f"cancela_retirar_{modulo}_{row['id']}"):
                        st.session_state.pop(f"_retirar_form_{modulo}_{row['id']}", None)
                        st.rerun()

    if not retirados.empty:
        with st.expander(f"Retirados do radar ({len(retirados)})", icon=":material/visibility_off:"):
            for _, row in retirados.iterrows():
                col_info, col_acao = st.columns([4, 1])
                with col_info:
                    st.markdown(f"**{row.get(coluna_nome)}** ({row.get('disciplina', '—')}) — {row.get('motivos_texto')}")
                with col_acao:
                    if st.button("Reativar", key=f"reativar_{modulo}_{row['id']}", use_container_width=True):
                        reativar_no_radar(modulo, int(row["id"]), _TIPO_ALERTA, usuario["username"])
                        st.toast("Alerta reativado.", icon=":material/check_circle:")
                        st.rerun()


def render(usuario: dict) -> None:
    exigir_area(usuario, "alertas")

    st.subheader(":material/notifications_active: Central de Alertas — Sugestão de Reunião")
    st.caption(
        f"Projetos com revisão ≥ REV{META_REVISAO_APROVACAO} sem liberação, atrasados, ou com avaliação "
        "Crítica/Baixa são sinalizados para reunião de alinhamento. Um alerta retirado do radar sai das "
        "sugestões ativas, mas permanece no histórico e na auditoria."
    )

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        col1, col2 = st.columns(2)
        f_analista = col1.multiselect("Analista", RESPONSAVEIS, key="filtro_alertas_analista")
        f_disciplina = col2.multiselect("Disciplina", DISCIPLINAS, key="filtro_alertas_disciplina")
        mes, ano = seletor_competencia("filtro_alertas")

    df_prest = enriquecer_prestadores(filtrar_ativos(listar_prestadores()))
    df_cess = enriquecer_cessionarios(filtrar_ativos(listar_cessionarios()))

    if f_analista:
        df_prest = df_prest[df_prest["responsavel"].isin(f_analista)] if not df_prest.empty else df_prest
        df_cess = df_cess[df_cess["responsavel"].isin(f_analista)] if not df_cess.empty else df_cess
    if f_disciplina:
        df_prest = df_prest[df_prest["disciplina"].isin(f_disciplina)] if not df_prest.empty else df_prest
        df_cess = df_cess[df_cess["disciplina"].isin(f_disciplina)] if not df_cess.empty else df_cess
    if mes or ano:
        df_prest = filtrar_por_competencia(df_prest, "data_solicitacao", mes, ano)
        df_cess = filtrar_por_competencia(df_cess, "data_solicitacao", mes, ano)
        st.caption(f"Competência: **{rotulo_competencia(mes, ano)}**")

    st.markdown("#### Prestadores")
    _secao_modulo(usuario, "prestadores", df_prest, "prestador", "codigo", COLUNAS_EXIBICAO_PRESTADORES)

    st.markdown("#### Cessionários")
    _secao_modulo(usuario, "cessionarios", df_cess, "cessionario", "codigo", COLUNAS_EXIBICAO_CESSIONARIOS)
