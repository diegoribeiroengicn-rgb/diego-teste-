"""Filtro de competência (Mês/Ano) reutilizável entre dashboards e relatórios."""

from __future__ import annotations

import streamlit as st

from gat.config import MESES_PT
from gat.database import listar_anos_disponiveis
from gat.horario import hoje_br

_TODOS = "Todos"


def seletor_competencia(key_prefix: str, rotulo: str = "Competência") -> tuple[int | None, int | None]:
    """Renderiza os seletores de Mês/Ano e retorna (mes, ano) — None em cada
    posição significa "Todos" (sem filtro naquela dimensão)."""
    anos = listar_anos_disponiveis()
    opcoes_ano = [_TODOS] + [str(a) for a in anos]

    col_mes, col_ano = st.columns(2)
    mes_label = col_mes.selectbox(f"{rotulo} — Mês", [_TODOS] + MESES_PT, key=f"{key_prefix}_mes")
    ano_label = col_ano.selectbox(f"{rotulo} — Ano", opcoes_ano, key=f"{key_prefix}_ano")

    mes = None if mes_label == _TODOS else MESES_PT.index(mes_label) + 1
    ano = None if ano_label == _TODOS else int(ano_label)
    return mes, ano


def competencia_atual() -> tuple[int, int]:
    hoje = hoje_br()
    return hoje.month, hoje.year


def rotulo_competencia(mes: int | None, ano: int | None) -> str:
    if mes is None and ano is None:
        return "Todos os períodos"
    if mes is None:
        return str(ano)
    if ano is None:
        return MESES_PT[mes - 1].title()
    return f"{MESES_PT[mes - 1].title()}/{ano}"


def chave_competencia(mes: int, ano: int) -> str:
    """Chave estável "AAAA-MM" usada como identificador de competência (ex.: observações mensais)."""
    return f"{ano:04d}-{mes:02d}"
