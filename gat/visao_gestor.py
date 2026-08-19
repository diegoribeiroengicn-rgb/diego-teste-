"""
Visão do Gestor — painel executivo diário da equipe, restrito a Gestor e
Administrador. Consome exclusivamente dados já existentes (Prestadores,
Cessionários, Lista de Prioridades, Alertas, Avaliações, Status das
Análises) — não introduz nenhuma tabela nova nem altera a lógica desses
módulos; apenas combina o que cada um já calcula.
"""

from __future__ import annotations

import pandas as pd

from gat.alertas_engine import montar_alertas_modulo, pendencias_avaliacao_obrigatoria
from gat.business_rules import STATUS_ATIVO_ANALISE, montar_lista_prioridades
from gat.kpis_analistas_prazo import calcular_kpis_prazo_analista, preparar_base_prazo

STATUS_ALERTA_ATIVOS = {"PENDENTE", "EM_TRATAMENTO", "REABERTO"}


def montar_base_combinada(df_prest: pd.DataFrame, df_cess: pd.DataFrame) -> pd.DataFrame:
    """Base única (Prestadores + Cessionários), já com as colunas de prazo
    da mesma engine usada nos KPIs de Prazo dos Analistas, mais colunas
    comuns `entidade` (nome do prestador/cessionário) e `tipo_modulo`."""
    partes = []
    if not df_prest.empty:
        dfp = preparar_base_prazo(df_prest, "prestadores").copy()
        dfp["entidade"] = dfp.get("prestador")
        dfp["tipo_modulo"] = "Prestador"
        partes.append(dfp)
    if not df_cess.empty:
        dfc = preparar_base_prazo(df_cess, "cessionarios").copy()
        dfc["entidade"] = dfc.get("cessionario")
        dfc["tipo_modulo"] = "Cessionário"
        partes.append(dfc)
    if not partes:
        return pd.DataFrame()
    return pd.concat(partes, ignore_index=True)


def montar_alertas_ativos(df_prest: pd.DataFrame, df_cess: pd.DataFrame) -> pd.DataFrame:
    """Alertas atualmente ativos (pendentes/em tratamento/reabertos) dos
    dois módulos — mesmo motor da Central de Alertas."""
    partes = []
    if not df_prest.empty:
        a = montar_alertas_modulo(df_prest, "prestadores", "prestador")
        if not a.empty:
            partes.append(a)
    if not df_cess.empty:
        a = montar_alertas_modulo(df_cess, "cessionarios", "cessionario")
        if not a.empty:
            partes.append(a)
    if not partes:
        return pd.DataFrame()
    alertas = pd.concat(partes, ignore_index=True)
    return alertas[alertas["status"].isin(STATUS_ALERTA_ATIVOS)]


def montar_pendencias_avaliacao(df_prest: pd.DataFrame, df_cess: pd.DataFrame) -> pd.DataFrame:
    """Análises com avaliação obrigatória da Rev.01 pendente — mesmo
    critério já usado em Avaliações/Central de Alertas."""
    partes = []
    if not df_prest.empty:
        p = pendencias_avaliacao_obrigatoria(df_prest, "prestadores", "prestador")
        if not p.empty:
            partes.append(p)
    if not df_cess.empty:
        p = pendencias_avaliacao_obrigatoria(df_cess, "cessionarios", "cessionario")
        if not p.empty:
            partes.append(p)
    if not partes:
        return pd.DataFrame()
    return pd.concat(partes, ignore_index=True)


def montar_lista_prioridades_gestor(df_prest: pd.DataFrame, df_cess: pd.DataFrame) -> pd.DataFrame:
    """Reaproveita integralmente a Lista de Prioridades já existente (item
    8 da modificação de cálculo automático de data prevista) — mesmos
    critérios de entrada/ordenação, sem recriar a regra."""
    return montar_lista_prioridades(df_prest, df_cess)


def montar_painel_por_analista(
    df_base: pd.DataFrame, lista_prioridades: pd.DataFrame, alertas_ativos: pd.DataFrame,
    pendencias_avaliacao: pd.DataFrame, analistas: list[str],
) -> pd.DataFrame:
    """Painel 'Quem está fazendo o quê' + distribuição de carga — uma
    linha por analista com os indicadores agregados (itens 1 e 4)."""
    linhas = []
    for analista in analistas:
        sub = df_base[df_base["responsavel"] == analista]
        status_upper = sub["status_analise"].astype(str).str.strip().str.upper()
        em_andamento = sub[status_upper.isin(STATUS_ATIVO_ANALISE)]
        kpis = calcular_kpis_prazo_analista(df_base, analista)
        prioridades_analista = lista_prioridades[lista_prioridades["responsavel"] == analista] if not lista_prioridades.empty else pd.DataFrame()
        alertas_analista = alertas_ativos[alertas_ativos["responsavel"] == analista] if not alertas_ativos.empty else pd.DataFrame()
        pendencias_analista = pendencias_avaliacao[pendencias_avaliacao["responsavel"] == analista] if not pendencias_avaliacao.empty else pd.DataFrame()

        tempo_col = em_andamento.get("dias_uteis_decorridos")
        if tempo_col is None or tempo_col.isna().all():
            tempo_col = em_andamento.get("saldo_dias_uteis")
        tempo_medio = pd.to_numeric(tempo_col, errors="coerce").mean() if tempo_col is not None else None

        if sub.empty and prioridades_analista.empty and alertas_analista.empty:
            continue

        em_hold_qtd = int(sub.get("em_hold", pd.Series(dtype=bool)).fillna(False).astype(bool).sum())

        linhas.append({
            "analista": analista,
            "em_andamento": len(em_andamento),
            "concluidos": kpis["total_entregue"],
            "atrasados": int(kpis["atrasados_em_analise"]),
            "em_hold": em_hold_qtd,
            "prioridades": len(prioridades_analista),
            "alertas_ativos": len(alertas_analista),
            "aguardando_avaliacao": len(pendencias_analista),
            "tempo_medio_dias": round(tempo_medio, 1) if pd.notna(tempo_medio) else 0.0,
            "vence_2_dias": int(kpis["vencem_2_dias_uteis"]),
            "pct_no_prazo": kpis["pct_cumprimento_prazo"],
            "pct_atraso": kpis["pct_atraso"],
            "sla_reduzido_qtd": int(sub["sla_reduzido"].fillna(False).astype(bool).sum()) if "sla_reduzido" in sub.columns else 0,
        })
    return pd.DataFrame(linhas)


def status_operacional(atrasados: int, vence_2_dias: int, em_andamento: int) -> str:
    """Situação operacional resumida do analista, para o cartão (item de
    organização visual)."""
    if atrasados > 0:
        return "ATRASADO"
    if vence_2_dias > 0:
        return "ATENCAO"
    if em_andamento > 0:
        return "EM_DIA"
    return "SEM_PENDENCIAS"


def analise_atual_provavel(df_base: pd.DataFrame, analista: str) -> pd.Series | None:
    """Proxy do que o analista 'está analisando agora': entre as análises
    ativas sob sua responsabilidade, a de data de solicitação mais antiga
    (ordem de chegada/FIFO) — o sistema não registra foco de tela a tela,
    então esta é a melhor aproximação a partir dos dados já existentes."""
    sub = df_base[df_base["responsavel"] == analista]
    status_upper = sub["status_analise"].astype(str).str.strip().str.upper()
    ativos = sub[status_upper.isin(STATUS_ATIVO_ANALISE)]
    if ativos.empty:
        return None
    datas = pd.to_datetime(ativos["data_solicitacao"], errors="coerce")
    return ativos.loc[datas.idxmin()] if datas.notna().any() else ativos.iloc[0]


def _valor_texto(valor) -> str | None:
    """`valor` pode vir de uma linha de DataFrame como NaN (float) — NaN é
    truthy em Python, então um simples `or` deixaria passar `nan` no lugar
    de cair para o próximo valor/fallback."""
    return valor if pd.notna(valor) else None


def comparativo_atual_vs_prioridade(df_base: pd.DataFrame, lista_prioridades: pd.DataFrame, analista: str) -> dict | None:
    """Comparativo do item 3: o que o analista está (provavelmente)
    analisando agora x a análise de maior criticidade recomendada pela
    Lista de Prioridades. Retorna None quando não há divergência a
    relatar (sem prioridades pendentes, ou já alinhado)."""
    prioridades_analista = lista_prioridades[lista_prioridades["responsavel"] == analista] if not lista_prioridades.empty else pd.DataFrame()
    if prioridades_analista.empty:
        return None
    topo = prioridades_analista.iloc[0]
    atual = analise_atual_provavel(df_base, analista)
    at_topo = _valor_texto(topo.get("num_at")) or _valor_texto(topo.get("codigo"))
    at_atual = _valor_texto(atual.get("num_at")) if atual is not None else None
    if atual is not None and at_atual and at_topo and str(at_atual) == str(at_topo):
        return None  # já alinhado — nada a destacar

    prioridade_atual = "Normal"
    if atual is not None and at_atual:
        atual_na_lista = prioridades_analista[prioridades_analista["num_at"].astype(str) == str(at_atual)]
        if not atual_na_lista.empty:
            prioridade_atual = _valor_texto(atual_na_lista.iloc[0].get("origem_prioridade")) or "Normal"

    return {
        "analista": analista,
        "at_atual": at_atual or "—",
        "prioridade_atual": prioridade_atual,
        "at_recomendado": at_topo or "—",
        "motivo_recomendado": _valor_texto(topo.get("motivos_entrada_label")) or _valor_texto(topo.get("origem_prioridade")) or "—",
        "dias_restantes_recomendado": topo.get("dias_restantes") if pd.notna(topo.get("dias_restantes")) else None,
    }
