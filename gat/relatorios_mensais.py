"""
Motor de indicadores mensais (competência) — usado pelos dashboards com
filtro de Mês/Ano, pelo Painel de Analistas, pelos relatórios mensais
(Excel/PDF) e pelo One Page Report.

Observação sobre "backlog": o esquema do sistema não mantém um histórico de
mudanças de status por data (apenas o status atual de cada projeto). Por
isso, o backlog de uma competência passada é uma aproximação — projetos
ainda em "EM ANÁLISE" hoje que já haviam sido solicitados até o fim daquele
mês — e não uma reconstrução exata do backlog real naquela data.
"""

from __future__ import annotations

import calendar
from typing import Any

import pandas as pd

from gat.business_rules import filtrar_por_competencia
from gat.config import STATUS_CANCELADO

STATUS_CONCLUIDOS = ["LIBERADO", "LIBERADO C/ REST."]
STATUS_EM_ANALISE = "EM ANÁLISE"


def _fim_do_mes(mes: int, ano: int) -> pd.Timestamp:
    ultimo_dia = calendar.monthrange(ano, mes)[1]
    return pd.Timestamp(year=ano, month=mes, day=ultimo_dia, hour=23, minute=59, second=59)


def indicadores_mensais_modulo(df: pd.DataFrame, mes: int, ano: int) -> dict[str, Any]:
    """Indicadores de um módulo (Prestadores ou Cessionários já enriquecido)
    para uma competência específica: recebidos, concluídos, em análise,
    documentos, % SLA cumprido e backlog aproximado."""
    if df.empty:
        return {
            "recebidos": 0, "concluidos": 0, "em_analise": 0, "documentos": 0,
            "sla_percentual": 0.0, "backlog": 0,
        }

    df_ativos = df[df["status_analise"] != STATUS_CANCELADO]

    recebidos_df = filtrar_por_competencia(df_ativos, "data_solicitacao", mes, ano)
    concluidos_df = filtrar_por_competencia(df_ativos, "data_analise", mes, ano)
    concluidos_df = concluidos_df[concluidos_df["status_analise"].isin(STATUS_CONCLUIDOS)]
    em_analise_df = recebidos_df[recebidos_df["status_analise"] == STATUS_EM_ANALISE]

    fim_mes = _fim_do_mes(mes, ano)
    datas_solicitacao = pd.to_datetime(df_ativos["data_solicitacao"], errors="coerce")
    backlog_df = df_ativos[
        (df_ativos["status_analise"] == STATUS_EM_ANALISE) & (datas_solicitacao <= fim_mes)
    ]

    sla_cumprido = int((concluidos_df["status_entrega_calc"] != "ATRASADO").sum()) if not concluidos_df.empty else 0
    sla_percentual = round(100 * sla_cumprido / len(concluidos_df), 1) if len(concluidos_df) else 0.0

    return {
        "recebidos": len(recebidos_df),
        "concluidos": len(concluidos_df),
        "em_analise": len(em_analise_df),
        "documentos": int(recebidos_df["num_documentos"].fillna(0).sum()),
        "sla_percentual": sla_percentual,
        "backlog": len(backlog_df),
    }


def produtividade_analistas(
    df: pd.DataFrame,
    mes: int | None,
    ano: int | None,
    analista: str | None = None,
    disciplina: str | None = None,
) -> pd.DataFrame:
    """Produtividade por analista (coluna `responsavel`) para um módulo já
    enriquecido, filtrando opcionalmente por analista/disciplina. Quando
    mes/ano são None, considera todo o histórico do módulo."""
    if df.empty:
        return pd.DataFrame(columns=[
            "responsavel", "projetos_analisados", "documentos", "ats_emitidas",
            "tempo_medio_analise", "sla_atendido_pct", "backlog", "concluidos", "em_andamento",
        ])

    df_ativos = df[df["status_analise"] != STATUS_CANCELADO].copy()
    if disciplina:
        df_ativos = df_ativos[df_ativos["disciplina"] == disciplina]
    if analista:
        df_ativos = df_ativos[df_ativos["responsavel"] == analista]

    concluidos_df = filtrar_por_competencia(df_ativos, "data_analise", mes, ano)
    concluidos_df = concluidos_df[concluidos_df["status_analise"].isin(STATUS_CONCLUIDOS)]

    em_andamento_df = df_ativos[df_ativos["status_analise"] == STATUS_EM_ANALISE]

    if mes is not None and ano is not None:
        fim_mes = _fim_do_mes(mes, ano)
        datas_solicitacao = pd.to_datetime(df_ativos["data_solicitacao"], errors="coerce")
        backlog_df = df_ativos[(df_ativos["status_analise"] == STATUS_EM_ANALISE) & (datas_solicitacao <= fim_mes)]
    else:
        backlog_df = em_andamento_df

    # Prestadores usa `dias_uteis_decorridos` e Cessionários usa `saldo_dias_uteis`
    # como coluna de tempo de análise — ao consolidar os dois módulos num único
    # DataFrame, cada linha só preenche a coluna do seu módulo de origem, por
    # isso combinamos (coalesce) as duas em vez de escolher apenas uma.
    if "dias_uteis_decorridos" in concluidos_df.columns and "saldo_dias_uteis" in concluidos_df.columns:
        tempo_analise = concluidos_df["dias_uteis_decorridos"].fillna(concluidos_df["saldo_dias_uteis"])
    elif "dias_uteis_decorridos" in concluidos_df.columns:
        tempo_analise = concluidos_df["dias_uteis_decorridos"]
    elif "saldo_dias_uteis" in concluidos_df.columns:
        tempo_analise = concluidos_df["saldo_dias_uteis"]
    else:
        tempo_analise = pd.Series(dtype=float)
    concluidos_df = concluidos_df.assign(_tempo_analise=tempo_analise)

    linhas = []
    responsaveis = sorted(set(df_ativos["responsavel"].dropna().unique().tolist()))
    for resp in responsaveis:
        grupo_concluidos = concluidos_df[concluidos_df["responsavel"] == resp]
        grupo_backlog = backlog_df[backlog_df["responsavel"] == resp]
        grupo_andamento = em_andamento_df[em_andamento_df["responsavel"] == resp]

        sla_cumprido = int((grupo_concluidos["status_entrega_calc"] != "ATRASADO").sum()) if not grupo_concluidos.empty else 0
        sla_pct = round(100 * sla_cumprido / len(grupo_concluidos), 1) if len(grupo_concluidos) else 0.0
        tempo_medio = round(grupo_concluidos["_tempo_analise"].dropna().mean(), 1) if not grupo_concluidos.empty else 0.0
        ats_emitidas = int(grupo_concluidos["num_at"].astype(str).replace({"None": "", "nan": ""}).str.strip().ne("").sum()) if "num_at" in grupo_concluidos.columns else 0

        linhas.append({
            "responsavel": resp,
            "projetos_analisados": len(grupo_concluidos),
            "documentos": int(grupo_concluidos["num_documentos"].fillna(0).sum()) if not grupo_concluidos.empty else 0,
            "ats_emitidas": ats_emitidas,
            "tempo_medio_analise": tempo_medio if not pd.isna(tempo_medio) else 0.0,
            "sla_atendido_pct": sla_pct,
            "backlog": len(grupo_backlog),
            "concluidos": len(grupo_concluidos),
            "em_andamento": len(grupo_andamento),
        })

    return pd.DataFrame(linhas)


def mes_anterior(mes: int, ano: int) -> tuple[int, int]:
    return (12, ano - 1) if mes == 1 else (mes - 1, ano)


def comparativo_mensal(indicador_atual: dict[str, Any], indicador_anterior: dict[str, Any], chave: str) -> tuple[Any, str | None]:
    """Retorna (valor_atual, delta_formatado) para uso em `st.metric(delta=...)`."""
    atual = indicador_atual.get(chave, 0)
    anterior = indicador_anterior.get(chave, 0)
    if anterior in (0, None):
        return atual, None
    delta = atual - anterior
    sinal = "+" if delta >= 0 else ""
    return atual, f"{sinal}{delta} vs. mês anterior"


def acumulado_ano(df: pd.DataFrame, ano: int) -> dict[str, Any]:
    """Indicadores acumulados do ano inteiro (todos os meses de `ano`)."""
    if df.empty:
        return {"recebidos": 0, "concluidos": 0, "documentos": 0}
    df_ativos = df[df["status_analise"] != STATUS_CANCELADO]
    recebidos_df = filtrar_por_competencia(df_ativos, "data_solicitacao", None, ano)
    concluidos_df = filtrar_por_competencia(df_ativos, "data_analise", None, ano)
    concluidos_df = concluidos_df[concluidos_df["status_analise"].isin(STATUS_CONCLUIDOS)]
    return {
        "recebidos": len(recebidos_df),
        "concluidos": len(concluidos_df),
        "documentos": int(recebidos_df["num_documentos"].fillna(0).sum()),
    }


def avaliacoes_obrigatorias_do_mes(analista: str, mes: int, ano: int) -> dict[str, Any]:
    """
    Para um analista e uma competência (mês/ano), quantas avaliações
    obrigatórias (Prestador + Cessionário) tinham a Rev.01 concluída até o
    fim dessa competência, e quantas permaneciam pendentes no fechamento
    (sem avaliação de checklist registrada até essa data) — usado na
    penalização/bonificação da nota do analista e no relatório gerencial.

    Uma avaliação feita em um mês posterior não "cura" retroativamente a
    pendência do mês em que ela ficou parada — o que importa é o estado
    no fechamento daquela competência específica, por isso o cálculo é
    sempre feito a partir das datas (Data de Conclusão da Análise / Data
    da Avaliação), nunca do estado "atual" dos alertas.

    Projetos congelados como isentos (migração 8 — já estavam em revisão
    >= 1 sem avaliação antes desta regra existir) não entram na conta,
    para não penalizar o analista por uma pendência que nem aparece na
    Central de Alertas.
    """
    from gat.database import listar_avaliacao_obrigatoria_isentos, listar_avaliacoes_checklist, listar_cessionarios, listar_prestadores

    fim_mes = _fim_do_mes(mes, ano)
    obrigatorias = 0
    pendentes = 0
    at_pendentes: list[str] = []

    for modulo, tipo_entidade, coluna_nome, listar_fn in (
        ("prestadores", "PRESTADOR", "prestador", listar_prestadores),
        ("cessionarios", "CESSIONARIO", "cessionario", listar_cessionarios),
    ):
        df = listar_fn()
        if df.empty:
            continue
        df = df[(df["status_analise"] != STATUS_CANCELADO) & (df["responsavel"] == analista)]
        if df.empty:
            continue

        datas_analise = pd.to_datetime(df["data_analise"], errors="coerce")
        revisao_valida = pd.to_numeric(df["revisao"], errors="coerce").fillna(0) >= 1
        concluida_ate_fim_mes = revisao_valida & datas_analise.notna() & (datas_analise <= fim_mes)
        candidatos = df[concluida_ate_fim_mes]
        if candidatos.empty:
            continue

        isentos = listar_avaliacao_obrigatoria_isentos(modulo)
        avaliadas = listar_avaliacoes_checklist(tipo_entidade)
        avaliadas_ate_fim_mes: set[tuple[str, str]] = set()
        if not avaliadas.empty:
            datas_avaliacao = pd.to_datetime(avaliadas["data_avaliacao"], errors="coerce")
            avaliadas_validas = avaliadas[datas_avaliacao.notna() & (datas_avaliacao <= fim_mes)]
            chave_avaliada = avaliadas_validas["codigo_entidade"].fillna(avaliadas_validas["nome_entidade"])
            avaliadas_ate_fim_mes = set(zip(chave_avaliada, avaliadas_validas["disciplina"].fillna("")))

        for _, row in candidatos.iterrows():
            if int(row["id"]) in isentos:
                continue
            codigo = row.get("codigo") or row.get(coluna_nome)
            chave = (codigo, row.get("disciplina") or "")
            obrigatorias += 1
            if chave not in avaliadas_ate_fim_mes:
                pendentes += 1
                at_pendentes.append(str(row.get("num_at") or f"Item {row.get('item')}"))

    return {
        "obrigatorias": obrigatorias, "pendentes": pendentes,
        "realizadas": obrigatorias - pendentes, "at_pendentes": at_pendentes,
    }
