"""
Regras de negócio e governança do Sistema GAT 2026.

Centraliza as regras corporativas definidas pela Tecnoplano:

* Projetos "CANCELADO" são rigorosamente excluídos dos KPIs e das visões
  ativas do painel geral;
* A meta corporativa de aprovação de projetos é até a Revisão 2 (REV2);
* Projetos "NÃO LIBERADO" com revisão >= REV2 são categorizados como
  "Pendente de Reunião" (gargalo crítico).
"""

from __future__ import annotations

import pandas as pd

from gat.calendario import dias_uteis_decorridos, saldo_dias_uteis
from gat.config import (
    META_REVISAO_APROVACAO,
    SLA_CESSIONARIOS_NOVO,
    SLA_CESSIONARIOS_REVISAO,
    SLA_PRESTADORES_DIAS_UTEIS,
    STATUS_CANCELADO,
    STATUS_NAO_LIBERADO,
    STATUS_PENDENTE_REUNIAO,
)


def calcular_sla_cessionario(tipo: str, revisao: int) -> int:
    """
    Determina o SLA (em dias úteis) de uma análise de cessionário, com base
    no tipo de operação e se é a revisão inicial (0) ou uma revisão
    subsequente — replicando a fórmula original da planilha PROJ_CESS.
    """
    if revisao == 0 and tipo in ("Quiosque", "Loja", "Externo"):
        return SLA_CESSIONARIOS_NOVO
    return SLA_CESSIONARIOS_REVISAO


def status_entrega_prestador(data_solicitacao, data_analise, hold_dias: int) -> tuple[str, int]:
    """
    Calcula os dias úteis decorridos e o status de entrega de uma análise
    de prestador, comparando com o SLA fixo de 10 dias úteis.
    """
    decorridos = dias_uteis_decorridos(data_solicitacao, data_analise, hold_dias)
    if decorridos < SLA_PRESTADORES_DIAS_UTEIS:
        status = "ANTES DO PRAZO"
    elif decorridos == SLA_PRESTADORES_DIAS_UTEIS:
        status = "NO PRAZO"
    else:
        status = "ATRASADO"
    return status, decorridos


def status_entrega_cessionario(data_solicitacao, data_analise, hold_dias: int, sla_dias: int) -> tuple[str, int]:
    """
    Calcula o saldo de dias úteis e o status de entrega de uma análise de
    cessionário, comparando o saldo com o SLA correspondente ao tipo de
    operação/revisão.
    """
    saldo = saldo_dias_uteis(data_solicitacao, sla_dias, data_analise, hold_dias)
    if saldo > 0:
        status = "ANTES DO PRAZO"
    elif saldo == 0:
        status = "NO PRAZO"
    else:
        status = "ATRASADO"
    return status, saldo


def is_cancelado(status_analise: str) -> bool:
    """Verifica se um projeto está com status CANCELADO."""
    return (status_analise or "").strip().upper() == STATUS_CANCELADO


def is_pendente_reuniao(status_analise: str, revisao: int, meta: int = META_REVISAO_APROVACAO) -> bool:
    """
    Um projeto é considerado "Pendente de Reunião" (gargalo crítico) quando
    está NÃO LIBERADO e já atingiu ou ultrapassou a meta de revisão (REV2).
    """
    status = (status_analise or "").strip().upper()
    try:
        rev = int(revisao)
    except (TypeError, ValueError):
        return False
    return status == STATUS_NAO_LIBERADO and rev >= meta


def categoria_governanca(status_analise: str, revisao: int) -> str:
    """Retorna a categoria de governança de um registro para exibição no painel."""
    if is_pendente_reuniao(status_analise, revisao):
        return STATUS_PENDENTE_REUNIAO
    return (status_analise or "").strip().upper() or "SEM STATUS"


def filtrar_ativos(df: pd.DataFrame, coluna_status: str = "status_analise") -> pd.DataFrame:
    """
    Remove rigorosamente os projetos "CANCELADO" de um DataFrame, para que
    KPIs e visões do painel geral nunca os considerem — regra obrigatória
    de governança do GAT 2026.
    """
    if df.empty or coluna_status not in df.columns:
        return df
    mascara_cancelado = df[coluna_status].astype(str).str.strip().str.upper() == STATUS_CANCELADO
    return df.loc[~mascara_cancelado].copy()


def adicionar_flags_governanca(df: pd.DataFrame, coluna_status: str = "status_analise", coluna_revisao: str = "revisao") -> pd.DataFrame:
    """Adiciona ao DataFrame as colunas `pendente_reuniao` e `categoria_governanca`."""
    if df.empty:
        df["pendente_reuniao"] = pd.Series(dtype=bool)
        df["categoria_governanca"] = pd.Series(dtype=str)
        return df
    df = df.copy()
    df["pendente_reuniao"] = df.apply(
        lambda linha: is_pendente_reuniao(linha.get(coluna_status), linha.get(coluna_revisao)), axis=1
    )
    df["categoria_governanca"] = df.apply(
        lambda linha: categoria_governanca(linha.get(coluna_status), linha.get(coluna_revisao)), axis=1
    )
    return df


def enriquecer_prestadores(df: pd.DataFrame) -> pd.DataFrame:
    """
    Adiciona ao DataFrame de prestadores as colunas calculadas
    dinamicamente: `hold_dias`, `dias_uteis_decorridos` (Coluna L) e
    `status_entrega_calc`, além das flags de governança.
    """
    from gat.calendario import calcular_hold_dias  # import local evita ciclo

    if df.empty:
        for col in ("hold_dias", "dias_uteis_decorridos", "status_entrega_calc"):
            df[col] = pd.Series(dtype=object)
        return adicionar_flags_governanca(df)

    df = df.copy()

    def _linha(linha):
        hold = calcular_hold_dias(linha.get("hold_inicio"), linha.get("hold_fim"))
        status, decorridos = status_entrega_prestador(linha.get("data_solicitacao"), linha.get("data_analise"), hold)
        return pd.Series({"hold_dias": hold, "dias_uteis_decorridos": decorridos, "status_entrega_calc": status})

    calculados = df.apply(_linha, axis=1)
    df = pd.concat([df, calculados], axis=1)
    return adicionar_flags_governanca(df)


def enriquecer_cessionarios(df: pd.DataFrame) -> pd.DataFrame:
    """
    Adiciona ao DataFrame de cessionários as colunas calculadas
    dinamicamente: `hold_dias`, `saldo_dias_uteis` (Coluna K) e
    `status_entrega_calc`, além das flags de governança.
    """
    from gat.calendario import calcular_hold_dias  # import local evita ciclo

    if df.empty:
        for col in ("hold_dias", "saldo_dias_uteis", "status_entrega_calc"):
            df[col] = pd.Series(dtype=object)
        return adicionar_flags_governanca(df)

    df = df.copy()

    def _linha(linha):
        hold = calcular_hold_dias(linha.get("hold_inicio"), linha.get("hold_fim"))
        sla = linha.get("sla_dias") or calcular_sla_cessionario(linha.get("tipo"), linha.get("revisao") or 0)
        status, saldo = status_entrega_cessionario(linha.get("data_solicitacao"), linha.get("data_analise"), hold, sla)
        return pd.Series({"hold_dias": hold, "saldo_dias_uteis": saldo, "status_entrega_calc": status})

    calculados = df.apply(_linha, axis=1)
    df = pd.concat([df, calculados], axis=1)
    return adicionar_flags_governanca(df)
