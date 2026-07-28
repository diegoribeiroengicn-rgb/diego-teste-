"""View: Lembretes — Projetos de Prestadores sem PEP."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.business_rules import (
    CRITICIDADE_ATENCAO,
    CRITICIDADE_CRITICO,
    CRITICIDADE_INFORMATIVO,
    enriquecer_prestadores,
    filtrar_ativos,
)
from gat.config import CORES, RESPONSAVEIS
from gat.database import listar_prestadores, obter_prestador
from gat.permissions import exigir_area
from gat.ui.kpi_cards import renderizar_kpis
from gat.ui.modals import dialog_prestador

_ORDEM_CRITICIDADE = {CRITICIDADE_CRITICO: 0, CRITICIDADE_ATENCAO: 1, CRITICIDADE_INFORMATIVO: 2}

_CORES_CRITICIDADE = {
    CRITICIDADE_CRITICO: "vermelho",
    CRITICIDADE_ATENCAO: "dourado",
    CRITICIDADE_INFORMATIVO: "ceu",
}


def _ou_traco(valor) -> str:
    """Formata um valor para exibição, tratando None/NaN como '-'."""
    if valor is None or (isinstance(valor, float) and pd.isna(valor)):
        return "-"
    texto = str(valor).strip()
    return texto or "-"


def _badge_criticidade(valor: str) -> str:
    cor = CORES.get(_CORES_CRITICIDADE.get(valor, "texto_fraco"), "#64748B")
    return f'<span style="background:{cor};color:#fff;padding:2px 10px;border-radius:100px;font-size:11px;font-weight:600">{valor}</span>'


def render(usuario: dict) -> None:
    exigir_area(usuario, "lembretes")

    st.subheader(":material/pending_actions: Lembretes — Projetos sem PEP")
    st.caption(
        "Reúne, do módulo de Prestadores, todo projeto ativo cadastrado sem PEP. "
        "O lembrete some automaticamente assim que o PEP é informado no cadastro."
    )

    df_prest = enriquecer_prestadores(filtrar_ativos(listar_prestadores()))

    linhas = []
    if not df_prest.empty:
        sem_pep = df_prest[~df_prest["tem_pep"]]
        for _, linha in sem_pep.iterrows():
            linhas.append({
                "modulo": "Prestadores",
                "id": linha["id"],
                "item": linha["item"],
                "codigo": linha.get("codigo"),
                "nome": linha.get("prestador"),
                "disciplina": linha.get("disciplina"),
                "num_at": linha.get("num_at"),
                "responsavel": linha.get("responsavel"),
                "data_solicitacao": linha.get("data_solicitacao"),
                "dias_sem_pep": linha.get("dias_sem_pep"),
                "criticidade_pep": linha.get("criticidade_pep"),
            })

    df_lembretes = pd.DataFrame(linhas)

    total = len(df_lembretes)
    criticos = int((df_lembretes["criticidade_pep"] == CRITICIDADE_CRITICO).sum()) if total else 0
    atencao = int((df_lembretes["criticidade_pep"] == CRITICIDADE_ATENCAO).sum()) if total else 0
    informativos = int((df_lembretes["criticidade_pep"] == CRITICIDADE_INFORMATIVO).sum()) if total else 0

    renderizar_kpis([
        ("Total sem PEP", str(total), CORES["dourado"]),
        ("Críticos", str(criticos), CORES["vermelho"]),
        ("Atenção", str(atencao), CORES["dourado"]),
        ("Informativos", str(informativos), CORES["ceu"]),
    ])

    if df_lembretes.empty:
        st.success("Nenhum projeto ativo está sem PEP no momento.")
        return

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        col2, col3, col4, col5 = st.columns([2, 2, 1.4, 1])
        f_resp = col2.multiselect("Responsável", RESPONSAVEIS, key="filtro_lemb_resp")
        f_criticidade = col3.multiselect("Criticidade", [CRITICIDADE_CRITICO, CRITICIDADE_ATENCAO, CRITICIDADE_INFORMATIVO], key="filtro_lemb_criticidade")
        f_dias_min = col4.number_input("Dias sem PEP (mínimo)", min_value=0, step=1, value=0, key="filtro_lemb_dias")
        with col5:
            st.write("")
            if st.button("Limpar", icon=":material/filter_alt_off:", key="limpar_filtros_lemb"):
                for chave in ("filtro_lemb_resp", "filtro_lemb_criticidade", "filtro_lemb_dias"):
                    st.session_state.pop(chave, None)
                st.rerun()

    df_filtrado = df_lembretes.copy()
    if f_resp:
        df_filtrado = df_filtrado[df_filtrado["responsavel"].isin(f_resp)]
    if f_criticidade:
        df_filtrado = df_filtrado[df_filtrado["criticidade_pep"].isin(f_criticidade)]
    if f_dias_min:
        df_filtrado = df_filtrado[df_filtrado["dias_sem_pep"] >= f_dias_min]

    df_filtrado["_ordem"] = df_filtrado["criticidade_pep"].map(_ORDEM_CRITICIDADE)
    df_filtrado = df_filtrado.sort_values(["_ordem", "dias_sem_pep"], ascending=[True, False]).reset_index(drop=True)

    st.caption(f"{len(df_filtrado)} lembrete(s) — ordenados por criticidade.")

    for _, linha in df_filtrado.iterrows():
        col_info, col_badge, col_acao = st.columns([5, 1.3, 1.3])
        with col_info:
            st.markdown(
                f"**[{linha['modulo']}] Item {linha['item']} — {linha['nome']}** "
                f"({_ou_traco(linha['disciplina'])}) · AT {_ou_traco(linha['num_at'])} · "
                f"Responsável: {_ou_traco(linha['responsavel'])} · Entrada: {_ou_traco(linha['data_solicitacao'])} · "
                f"{int(linha['dias_sem_pep'])} dia(s) sem PEP"
            )
        with col_badge:
            st.markdown(_badge_criticidade(linha["criticidade_pep"]), unsafe_allow_html=True)
        with col_acao:
            if st.button("Abrir projeto", icon=":material/open_in_new:", key=f"abrir_lembrete_{linha['modulo']}_{linha['id']}", use_container_width=True):
                exigir_area(usuario, "prestadores.editar")
                dialog_prestador(usuario["username"], obter_prestador(int(linha["id"])))
        st.divider()
