"""View: Linha do Tempo — cronologia de um projeto de Prestador ou Cessionário
(postagem, análise, resposta, retorno externo, revisões, reuniões, avaliações)."""

from __future__ import annotations

from datetime import date

import pandas as pd
import streamlit as st

from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores, filtrar_ativos, filtrar_por_competencia
from gat.calendario import calcular_hold_dias
from gat.config import DISCIPLINAS, RESPONSAVEIS
from gat.database import (
    listar_avaliacoes_checklist,
    listar_cessionarios,
    listar_prestadores,
    listar_reunioes_do_projeto,
)
from gat.permissions import exigir_area, pode_modulo
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


def render(usuario: dict) -> None:
    exigir_area(usuario, "linha_tempo")

    st.subheader(":material/timeline: Linha do Tempo")
    st.caption("Cronologia de postagem, análise, resposta, retorno externo, revisões, reuniões e avaliações de um projeto específico.")

    opcoes_modulo = [rotulo for rotulo, chave in _MODULOS_VISIVEIS.items() if pode_modulo(usuario, chave)]
    if not opcoes_modulo:
        st.info("Nenhum módulo (Prestadores/Cessionários) liberado para este usuário.")
        return

    with st.expander("Buscar projeto", icon=":material/search:", expanded=True):
        col1, col2 = st.columns(2)
        modulo_label = col1.selectbox("Módulo", opcoes_modulo, key="lt_modulo")
        f_disciplina = col2.selectbox("Disciplina", ["Todas"] + DISCIPLINAS, key="lt_disciplina")
        col3, col4 = st.columns(2)
        f_nome = col3.text_input("Nome (busca parcial)", key="lt_nome")
        f_codigo = col4.text_input("Código", key="lt_codigo")
        col5, col6 = st.columns(2)
        f_at = col5.text_input("N° AT", key="lt_at")
        f_analista = col6.selectbox("Analista", ["Todos"] + RESPONSAVEIS, key="lt_analista")
        mes, ano = seletor_competencia("lt_comp")

    modulo = _MODULOS_VISIVEIS[modulo_label]
    df, coluna_nome, tipo_entidade = _base(modulo)

    if f_nome.strip():
        df = df[df[coluna_nome].fillna("").astype(str).str.contains(f_nome.strip(), case=False, na=False, regex=False)]
    if f_codigo.strip():
        df = df[df["codigo"].fillna("").astype(str).str.contains(f_codigo.strip(), case=False, na=False, regex=False)]
    if f_at.strip():
        df = df[df["num_at"].fillna("").astype(str).str.contains(f_at.strip(), case=False, na=False, regex=False)]
    if f_disciplina != "Todas":
        df = df[df["disciplina"] == f_disciplina]
    if f_analista != "Todos":
        df = df[df["responsavel"] == f_analista]
    if mes or ano:
        df = filtrar_por_competencia(df, "data_solicitacao", mes, ano)

    if df.empty:
        st.warning("Nenhum projeto encontrado com os critérios de busca.", icon=":material/search_off:")
        return

    df = df.reset_index(drop=True)
    opcoes_projeto = {
        f"Item {r['item']} · {r[coluna_nome]} · {r['disciplina']} · AT {r.get('num_at') or '—'} · REV {r['revisao']}": r["id"]
        for _, r in df.iterrows()
    }
    rotulo_escolhido = st.selectbox(f"Projeto ({len(opcoes_projeto)} encontrado(s))", list(opcoes_projeto.keys()), key="lt_projeto_escolhido")
    projeto_id = opcoes_projeto[rotulo_escolhido]
    projeto = df[df["id"] == projeto_id].iloc[0]

    st.markdown("---")
    st.markdown(f"### {projeto[coluna_nome]} — {projeto['disciplina']} (Item {projeto['item']})")
    col_a, col_b, col_c, col_d = st.columns(4)
    col_a.metric("Código", projeto.get("codigo") or "—")
    col_b.metric("N° AT", projeto.get("num_at") or "—")
    col_c.metric("Revisão", int(projeto["revisao"]))
    col_d.metric("Status", projeto["status_analise"])

    st.markdown("##### Ciclo: Postagem → Análise Tecnoplano → Resposta → Aguardando retorno externo → Nova revisão")

    hold_dias = calcular_hold_dias(projeto.get("hold_inicio"), projeto.get("hold_fim"))
    dias_analise_interna = int(projeto.get("dias_uteis_decorridos") or projeto.get("saldo_dias_uteis") or 0)

    _etapa("1. Postagem (Data de Solicitação)", projeto.get("data_solicitacao"), None, None)
    _etapa("2. Análise Tecnoplano (tempo de análise interna)", None, dias_analise_interna, projeto.get("responsavel"))
    if projeto.get("data_analise"):
        _etapa("3. Resposta da Tecnoplano", projeto.get("data_analise"), None, projeto.get("responsavel"), "Data em que a análise foi concluída.")
    else:
        _etapa("3. Resposta da Tecnoplano", None, None, None, "Ainda em análise — sem data de resposta registrada.")
    if hold_dias:
        _etapa("4. Aguardando retorno externo (Hold)", None, hold_dias, None, f"Hold de {projeto.get('hold_inicio', '—')} a {projeto.get('hold_fim', '—')}.")
    _etapa("Data limite (prazo acordado)", projeto.get("data_limite"), None, None, f"Status de entrega: {projeto.get('status_entrega_calc', '—')}")

    st.markdown("##### Reuniões vinculadas")
    reunioes = listar_reunioes_do_projeto(modulo, int(projeto_id))
    if reunioes.empty:
        st.caption("Nenhuma reunião vinculada a este projeto.")
    else:
        st.dataframe(
            reunioes[["titulo", "data_prevista", "data_realizada"]].rename(
                columns={"titulo": "Título", "data_prevista": "Data Prevista", "data_realizada": "Data Realizada"}
            ),
            use_container_width=True, hide_index=True,
        )

    st.markdown("##### Avaliações")
    avaliacoes = listar_avaliacoes_checklist(tipo_entidade)
    if not avaliacoes.empty:
        avaliacoes_projeto = avaliacoes[avaliacoes["projeto_id"] == projeto_id]
        if not avaliacoes_projeto.empty:
            st.dataframe(
                avaliacoes_projeto[["data_avaliacao", "revisao", "pontuacao", "classificacao", "acompanhamento"]].rename(
                    columns={"data_avaliacao": "Data", "revisao": "Revisão", "pontuacao": "Pontuação", "classificacao": "Classificação", "acompanhamento": "Acompanhamento"}
                ),
                use_container_width=True, hide_index=True,
            )
        else:
            st.caption("Nenhuma avaliação registrada para este projeto específico.")
    else:
        st.caption("Nenhuma avaliação registrada para este tipo de entidade ainda.")

    if projeto.get("observacoes"):
        st.markdown("##### Observações")
        st.info(projeto["observacoes"])
