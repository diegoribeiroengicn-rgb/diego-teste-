"""Formatação de datas no padrão brasileiro (DD/MM/AAAA) para exibição em
telas, tabelas e relatórios — o armazenamento no banco permanece sempre no
formato técnico (ISO 8601); apenas a apresentação ao usuário muda."""

from __future__ import annotations

from datetime import date, datetime

import pandas as pd


def formatar_data_br(valor) -> str:
    """
    Converte um valor de data (string ISO, `date`, `datetime`,
    `pandas.Timestamp` ou vazio/None) para o padrão brasileiro DD/MM/AAAA.
    Nunca lança exceção: valores ausentes viram string vazia; valores que
    não representem uma data válida são devolvidos como vieram (evita
    corromper texto que não seja realmente uma data).
    """
    if valor is None:
        return ""
    if isinstance(valor, float) and pd.isna(valor):
        return ""
    if isinstance(valor, str) and not valor.strip():
        return ""
    if isinstance(valor, (datetime, date, pd.Timestamp)):
        return valor.strftime("%d/%m/%Y")
    convertido = pd.to_datetime(valor, errors="coerce")
    if pd.isna(convertido):
        return str(valor)
    return convertido.strftime("%d/%m/%Y")


def formatar_datahora_br(valor) -> str:
    """Como `formatar_data_br`, mas incluindo hora e minuto (DD/MM/AAAA HH:MM) —
    usado em campos de auditoria/histórico (quando ocorreu a alteração)."""
    if valor is None:
        return ""
    if isinstance(valor, float) and pd.isna(valor):
        return ""
    if isinstance(valor, str) and not valor.strip():
        return ""
    if isinstance(valor, (datetime, pd.Timestamp)):
        return valor.strftime("%d/%m/%Y %H:%M")
    convertido = pd.to_datetime(valor, errors="coerce")
    if pd.isna(convertido):
        return str(valor)
    return convertido.strftime("%d/%m/%Y %H:%M")


def formatar_datas_df(df: pd.DataFrame, colunas: list[str]) -> pd.DataFrame:
    """Retorna uma cópia de `df` com as `colunas` informadas (se presentes)
    reformatadas para DD/MM/AAAA — uso típico logo antes de exibir a tabela
    (`st.dataframe`) ou de gerar um relatório (Word/Excel/PDF)."""
    if df is None or df.empty:
        return df
    resultado = df.copy()
    for coluna in colunas:
        if coluna in resultado.columns:
            resultado[coluna] = resultado[coluna].apply(formatar_data_br)
    return resultado


def formatar_datahoras_df(df: pd.DataFrame, colunas: list[str]) -> pd.DataFrame:
    """Como `formatar_datas_df`, para colunas de data/hora (auditoria)."""
    if df is None or df.empty:
        return df
    resultado = df.copy()
    for coluna in colunas:
        if coluna in resultado.columns:
            resultado[coluna] = resultado[coluna].apply(formatar_datahora_br)
    return resultado
