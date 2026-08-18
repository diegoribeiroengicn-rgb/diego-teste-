"""
Normalização segura de valores numéricos usados em regras de negócio e KPIs
— fonte única de tratamento para dados vindos do banco (SQLite/pandas),
de formulários ou de registros legados, em vez de espalhar tratamentos
diferentes (e às vezes inseguros) por cada tela.

Motivação: `valor or padrao` não é uma proteção confiável contra ausência
de dado, porque `NaN` (float) é *truthy* em Python — `NaN or padrao`
retorna `NaN`, não `padrao`. Como colunas numéricas lidas via pandas
convertem `NULL` do SQL em `NaN` (diferente de um `dict` vindo de
`sqlite3.Row`, onde `NULL` se torna `None`), qualquer `int(x.get(...) or
padrao)` aplicado sobre uma linha de DataFrame é uma fonte recorrente de
`ValueError` em produção sempre que o campo estiver vazio.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, TypeVar

import pandas as pd

logger = logging.getLogger("gat.kpis")

T = TypeVar("T")

_TEXTOS_SEM_VALOR = {"", "nan", "none", "null", "nat"}


def inteiro_seguro(valor: Any, padrao: int) -> int:
    """
    Converte `valor` para `int` de forma tolerante a todas as formas que um
    campo numérico "vazio" pode assumir na prática: `None`, `NaN`, `pd.NA`,
    `NaT`, string vazia, `"nan"`/`"None"`/`"null"` (texto), números
    armazenados como string (`"10"`, `"10.0"`) e `float` (`10.0`). Usar no
    lugar de `int(x.get(...) or padrao)` em qualquer ponto do sistema que
    leia um campo numérico potencialmente ausente ou legado.

    `padrao` só é retornado quando realmente não existir um valor válido —
    nunca substitui um valor legítimo (incluindo `0`) por engano.
    """
    try:
        if pd.isna(valor):
            return padrao
    except (TypeError, ValueError):
        pass
    if valor is None:
        return padrao
    texto = str(valor).strip()
    if texto.lower() in _TEXTOS_SEM_VALOR:
        return padrao
    try:
        return int(float(texto))
    except (ValueError, TypeError, OverflowError):
        logger.warning("inteiro_seguro: valor inválido %r — aplicando padrão %r", valor, padrao)
        return padrao


def texto_seguro(valor: Any) -> str:
    """Converte `valor` para `str`, tratando `NaN`/`None`/`NaT` como texto
    vazio — `str(x or "")` não protege contra isso porque `NaN` é truthy
    e chega inteiro em `.strip()`/`.upper()` como `float`, levantando
    `AttributeError` em vez de tratar o campo como ausente."""
    try:
        if pd.isna(valor):
            return ""
    except (TypeError, ValueError):
        pass
    return "" if valor is None else str(valor)


def booleano_seguro(valor: Any) -> bool:
    """Converte `valor` para `bool` tratando `NaN`/`None`/`NaT` como
    `False` — `bool(float("nan"))` é `True` em Python (float não-zero é
    truthy), o que faz um campo booleano ausente (`sla_reduzido` de um
    registro legado, por exemplo) ser lido como "verdadeiro" por engano."""
    try:
        if pd.isna(valor):
            return False
    except (TypeError, ValueError):
        pass
    return bool(valor)


def inteiro_ou_none(valor: Any) -> int | None:
    """Como `inteiro_seguro`, mas para os casos em que não existe um
    padrão aplicável e a ausência de valor válido deve ser propagada como
    `None` (ex.: "dias restantes" quando a data base do cálculo também
    está ausente) — em vez de inventar um número."""
    sentinela = object()
    resultado = inteiro_seguro(valor, sentinela)  # type: ignore[arg-type]
    return None if resultado is sentinela else resultado


def calculo_seguro(func: Callable[..., T], *args: Any, contexto: str | None = None, **kwargs: Any) -> T | None:
    """
    Executa `func(*args, **kwargs)` isolando o chamador de falhas
    previsíveis de dados: um único registro/linha inconsistente não pode
    derrubar o cálculo de um KPI inteiro nem o dashboard que o exibe. Em
    caso de erro esperado (dado malformado), registra um aviso técnico no
    log e retorna `None`. Erros inesperados (bugs de programação) continuam
    se propagando normalmente — esta função não deve mascará-los.
    """
    try:
        return func(*args, **kwargs)
    except (ValueError, TypeError, OverflowError, KeyError, AttributeError, ZeroDivisionError) as exc:
        logger.warning("calculo_seguro: falha ao calcular %s: %s", contexto or getattr(func, "__name__", func), exc)
        return None
