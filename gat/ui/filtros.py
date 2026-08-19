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


def seletor_periodo(key_prefix: str, rotulo_data: str = "Data de Solicitação") -> tuple[int | None, int | None, object, object]:
    """
    Seletor de período com duas modalidades (modificação de filtro por
    intervalo de datas, itens 2 e 7): Mês/Ano (filtro rápido já existente,
    reaproveita `seletor_competencia`) ou Intervalo personalizado (Data
    Inicial/Data Final, com calendário e formato DD/MM/AAAA). Sempre uma
    modalidade OU a outra, nunca as duas somadas, para não haver ambiguidade
    sobre qual regra vale — mesma coluna de referência das duas.

    Retorna `(mes, ano, data_inicio, data_fim)`: a modalidade escolhida vem
    populada, a outra vem com ambos os valores em `None`. Em caso de Data
    Inicial posterior à Data Final, mostra uma mensagem objetiva (item 8) e
    retorna tudo em `None` — sem filtrar por período, sem interromper a
    tela.
    """
    tipo = st.radio(
        "Tipo de período", ["Mês/Ano", "Intervalo personalizado"],
        horizontal=True, key=f"{key_prefix}_tipo",
    )
    if tipo == "Mês/Ano":
        mes, ano = seletor_competencia(key_prefix)
        return mes, ano, None, None

    col_ini, col_fim = st.columns(2)
    st.session_state.setdefault(f"{key_prefix}_data_ini", None)
    st.session_state.setdefault(f"{key_prefix}_data_fim", None)
    data_ini = col_ini.date_input(f"{rotulo_data} — Data Inicial", format="DD/MM/YYYY", key=f"{key_prefix}_data_ini")
    data_fim = col_fim.date_input(f"{rotulo_data} — Data Final", format="DD/MM/YYYY", key=f"{key_prefix}_data_fim")
    if data_ini and data_fim and data_ini > data_fim:
        st.error("A Data Inicial não pode ser posterior à Data Final.", icon=":material/error:")
        return None, None, None, None
    return None, None, (data_ini or None), (data_fim or None)


def rotulo_periodo_filtro(mes: int | None, ano: int | None, data_inicio, data_fim) -> str:
    """Rótulo do período efetivamente aplicado, cobrindo as duas
    modalidades de `seletor_periodo` — usado em legendas de tela, nome de
    arquivo exportado e cabeçalho de relatório (item 13)."""
    if data_inicio or data_fim:
        ini = data_inicio.strftime("%d/%m/%Y") if data_inicio else "—"
        fim = data_fim.strftime("%d/%m/%Y") if data_fim else "—"
        return f"{ini} a {fim}"
    return rotulo_competencia(mes, ano)
