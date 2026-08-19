"""
KPIs de prazo dos analistas (itens 13-20 da modificação de cálculo automático
de data prevista): desempenho de cada analista frente à data prevista de
entrega — entregue antes do prazo / no dia / com atraso, médias de dias
úteis de antecipação/atraso, análises ativas atrasadas e análises que vencem
nos próximos 2 dias úteis. Combina Prestadores e Cessionários (um analista
trabalha nos dois módulos), unificado pela coluna `responsavel`.

Item 14 — definições:
* Entregue antes do prazo: data efetiva de entrega < data prevista;
* Entregue no dia: data efetiva de entrega = data prevista;
* Entregue com atraso: data efetiva de entrega > data prevista;
* Análise ativa atrasada: ainda sem status final E hoje é posterior à data
  prevista — nunca misturada com concluídos com atraso (são contadores
  distintos: um é histórico congelado, o outro muda dia a dia).
"""

from __future__ import annotations

from datetime import date

import pandas as pd

from gat.business_rules import STATUS_CONCLUIDO_ENTREGA, dias_restantes_prioridade
from gat.normalizacao import calculo_seguro

CLASSIFICACAO_ANTES_PRAZO = "ANTES_DO_PRAZO"
CLASSIFICACAO_NO_DIA = "NO_DIA"
CLASSIFICACAO_COM_ATRASO = "COM_ATRASO"

_LABEL_CLASSIFICACAO = {
    CLASSIFICACAO_ANTES_PRAZO: "Antes do prazo",
    CLASSIFICACAO_NO_DIA: "No dia",
    CLASSIFICACAO_COM_ATRASO: "Com atraso",
}


def _classificar_entrega_prazo(data_limite, data_analise) -> str | None:
    """Classificação item 14.1/14.2/14.3 — comparação direta de datas
    (calendário, não dias úteis): só se aplica a análises já concluídas
    (com data efetiva de entrega registrada)."""
    if pd.isna(data_limite) or pd.isna(data_analise):
        return None
    d_lim = pd.to_datetime(data_limite, errors="coerce")
    d_ana = pd.to_datetime(data_analise, errors="coerce")
    if pd.isna(d_lim) or pd.isna(d_ana):
        return None
    d_lim, d_ana = d_lim.date(), d_ana.date()
    if d_ana < d_lim:
        return CLASSIFICACAO_ANTES_PRAZO
    if d_ana == d_lim:
        return CLASSIFICACAO_NO_DIA
    return CLASSIFICACAO_COM_ATRASO


def _dias_uteis_diferenca(data_limite, data_analise) -> float | None:
    """Dias úteis de antecipação (negativo) ou atraso (positivo) entre a
    data prevista e a data efetiva — 0 quando caem no mesmo dia."""
    from gat.calendario import dias_uteis_entre

    if pd.isna(data_limite) or pd.isna(data_analise):
        return None
    d_lim = pd.to_datetime(data_limite, errors="coerce")
    d_ana = pd.to_datetime(data_analise, errors="coerce")
    if pd.isna(d_lim) or pd.isna(d_ana):
        return None
    d_lim, d_ana = d_lim.date(), d_ana.date()
    if d_ana == d_lim:
        return 0
    dias = dias_uteis_entre(d_lim, d_ana)
    return dias - 1 if dias > 0 else dias + 1


def preparar_base_prazo(df: pd.DataFrame, modulo: str) -> pd.DataFrame:
    """Acrescenta, sem alterar nenhuma coluna existente, as colunas
    auxiliares usadas pelos KPIs de prazo: classificação da entrega, dias
    úteis de diferença, se está ativa e atrasada, e se vence nos próximos 2
    dias úteis (item 8, mesmo limiar já usado na Lista de Prioridades)."""
    if df.empty:
        return df
    df = df.copy()
    df["_classificacao_entrega"] = df.apply(
        lambda r: _classificar_entrega_prazo(r.get("data_limite"), r.get("data_analise")), axis=1
    )
    df["_dias_uteis_diferenca"] = df.apply(
        lambda r: _dias_uteis_diferenca(r.get("data_limite"), r.get("data_analise")), axis=1
    )
    status_final = df["status_analise"].astype(str).str.strip().str.upper().isin(STATUS_CONCLUIDO_ENTREGA)
    em_hold_atual = df.get("em_hold", pd.Series(False, index=df.index)).fillna(False).astype(bool)
    dias_restantes = df.apply(
        lambda r: calculo_seguro(dias_restantes_prioridade, r, modulo, contexto="dias_restantes_prioridade"), axis=1,
    )
    df["_dias_restantes"] = dias_restantes
    # HOLD pausa o SLA: uma análise em HOLD aberto nunca conta como
    # "ativa atrasada" nem como "vencendo em 2 dias", mesmo que o valor
    # congelado de dias_restantes já esteja negativo/baixo (ver
    # gat.business_rules.status_entrega_prestador/status_entrega_cessionario).
    df["_ativa_atrasada"] = (~status_final) & (~em_hold_atual) & dias_restantes.apply(lambda d: d is not None and d < 0)
    df["_vence_2_dias"] = (~status_final) & (~em_hold_atual) & dias_restantes.apply(lambda d: d is not None and 0 <= d <= 2)
    df["_modulo"] = modulo
    return df


COLUNAS_BASE_PADRAO = [
    "responsavel", "disciplina", "revisao", "status_analise", "data_solicitacao",
    "data_limite", "data_analise", "sla_dias", "sla_reduzido", "nivel_prioridade",
]


def aplicar_filtros_prazo(
    df: pd.DataFrame,
    disciplina: list[str] | None = None,
    revisao: list[int] | None = None,
    status: list[str] | None = None,
    tipo_projeto: list[str] | None = None,
    sla_reduzido: bool | None = None,
    prioridade: list[int] | None = None,
    entidade: str | None = None,
) -> pd.DataFrame:
    """Item 15 — filtros adicionais (além de Mês/Ano/Período, já aplicados
    separadamente via `filtrar_por_competencia`/intervalo de datas)."""
    if df.empty:
        return df
    resultado = df
    if disciplina:
        resultado = resultado[resultado["disciplina"].isin(disciplina)]
    if revisao:
        resultado = resultado[resultado["revisao"].isin(revisao)]
    if status:
        resultado = resultado[resultado["status_analise"].isin(status)]
    if tipo_projeto and "tipo" in resultado.columns:
        resultado = resultado[resultado["tipo"].isin(tipo_projeto)]
    if sla_reduzido is not None:
        resultado = resultado[resultado["sla_reduzido"].astype(bool) == sla_reduzido]
    if prioridade and "nivel_prioridade" in resultado.columns:
        resultado = resultado[resultado["nivel_prioridade"].isin(prioridade)]
    if entidade:
        coluna_entidade = "prestador" if "prestador" in resultado.columns else "cessionario"
        if coluna_entidade in resultado.columns:
            resultado = resultado[resultado[coluna_entidade].astype(str).str.contains(entidade, case=False, na=False, regex=False)]
    return resultado


def calcular_kpis_prazo_analista(df: pd.DataFrame, analista: str | None = None) -> dict:
    """
    Item 13/14 — indicadores de prazo de um analista (ou de toda a base
    filtrada, quando `analista` é None — visão consolidada do item 20).
    `df` já deve estar filtrado pelos filtros do item 15 e conter as
    colunas auxiliares de `preparar_base_prazo`.
    """
    sub = df[df["responsavel"] == analista] if analista else df
    if sub.empty:
        return _kpis_vazio()

    concluidos = sub[sub["_classificacao_entrega"].notna()]
    antes = concluidos[concluidos["_classificacao_entrega"] == CLASSIFICACAO_ANTES_PRAZO]
    no_dia = concluidos[concluidos["_classificacao_entrega"] == CLASSIFICACAO_NO_DIA]
    atraso = concluidos[concluidos["_classificacao_entrega"] == CLASSIFICACAO_COM_ATRASO]
    total = len(concluidos)

    media_antecipacao = round(-antes["_dias_uteis_diferenca"].mean(), 1) if not antes.empty else 0.0
    media_atraso = round(atraso["_dias_uteis_diferenca"].mean(), 1) if not atraso.empty else 0.0

    return {
        "total_entregue": total,
        "antes_prazo": len(antes),
        "no_dia": len(no_dia),
        "com_atraso": len(atraso),
        "pct_antes_prazo": round(len(antes) / total * 100, 1) if total else 0.0,
        "pct_no_dia": round(len(no_dia) / total * 100, 1) if total else 0.0,
        "pct_atraso": round(len(atraso) / total * 100, 1) if total else 0.0,
        "pct_cumprimento_prazo": round((len(antes) + len(no_dia)) / total * 100, 1) if total else 0.0,
        "media_dias_antecipacao": media_antecipacao,
        "media_dias_atraso": media_atraso,
        "atrasados_em_analise": int(sub["_ativa_atrasada"].sum()),
        "vencem_2_dias_uteis": int(sub["_vence_2_dias"].sum()),
    }


def _kpis_vazio() -> dict:
    return {
        "total_entregue": 0, "antes_prazo": 0, "no_dia": 0, "com_atraso": 0,
        "pct_antes_prazo": 0.0, "pct_no_dia": 0.0, "pct_atraso": 0.0, "pct_cumprimento_prazo": 0.0,
        "media_dias_antecipacao": 0.0, "media_dias_atraso": 0.0,
        "atrasados_em_analise": 0, "vencem_2_dias_uteis": 0,
    }


def tabela_consolidada_por_analista(df: pd.DataFrame, analistas: list[str]) -> pd.DataFrame:
    """Item 20 — indicadores consolidados por analista, lado a lado, para
    Gestor/Administrador (nunca exibido a analistas comuns)."""
    linhas = []
    for analista in analistas:
        kpis = calcular_kpis_prazo_analista(df, analista)
        if kpis["total_entregue"] == 0 and kpis["atrasados_em_analise"] == 0 and kpis["vencem_2_dias_uteis"] == 0:
            continue
        linhas.append({"Analista": analista, **kpis})
    if not linhas:
        return pd.DataFrame()
    return pd.DataFrame(linhas)


def relacao_analises_analista(df: pd.DataFrame, analista: str) -> pd.DataFrame:
    """Item 19 — relação detalhada das ATs de um analista para o relatório
    individual (disciplina, revisão, datas, dias úteis de antecipação/atraso, status)."""
    sub = df[df["responsavel"] == analista].copy()
    if sub.empty:
        return sub
    sub["classificacao_entrega"] = sub["_classificacao_entrega"].map(_LABEL_CLASSIFICACAO).fillna(
        sub["_ativa_atrasada"].map({True: "Ativa — atrasada"})
    ).fillna("Em análise")
    return sub
