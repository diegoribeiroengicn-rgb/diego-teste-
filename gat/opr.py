"""
Motor de indicadores do OPR (One Page Report) institucional — versões
Resumida e Executiva, para Prestadores, Cessionários ou Consolidado, em
qualquer período (mensal, anual ou personalizado). Opera sobre um
DataFrame já enriquecido e já filtrado (módulo, período, filtros
avançados) — este módulo apenas deriva os indicadores a partir dele,
nunca decide o período ou os filtros.
"""

from __future__ import annotations

import pandas as pd

from gat.business_rules import indicadores_meta_rev2
from gat.config import STATUS_CANCELADO
from gat.relatorios_mensais import STATUS_CONCLUIDOS, STATUS_EM_ANALISE
from gat.revisoes import calcular_intervalos_revisao


def _tempo_analise_interna(df: pd.DataFrame) -> pd.Series:
    """Prestadores usa `dias_uteis_decorridos`; Cessionários usa
    `saldo_dias_uteis` — coalesce das duas para funcionar tanto em um
    módulo isolado quanto no consolidado."""
    if "dias_uteis_decorridos" in df.columns and "saldo_dias_uteis" in df.columns:
        return pd.to_numeric(df["dias_uteis_decorridos"], errors="coerce").fillna(pd.to_numeric(df["saldo_dias_uteis"], errors="coerce"))
    coluna = "dias_uteis_decorridos" if "dias_uteis_decorridos" in df.columns else "saldo_dias_uteis"
    return pd.to_numeric(df.get(coluna), errors="coerce") if coluna in df.columns else pd.Series(dtype=float)


def indicadores_executivos(df: pd.DataFrame, coluna_nome: str, meta_rev2_percentual: float = 80.0) -> dict:
    """Conjunto completo de indicadores executivos do OPR, calculado sobre
    o DataFrame já filtrado (módulo + período + filtros do OPR)."""
    vazio = {
        "total_projetos": 0, "recebidos": 0, "em_analise": 0, "concluidos": 0, "atrasados": 0,
        "dentro_do_prazo": 0, "acima_rev2": 0, "aprovados_ate_rev2": 0, "total_aprovados": 0,
        "aprovados_ate_rev2_pct": 0.0, "meta_rev2_pct": meta_rev2_percentual, "distancia_da_meta": 0.0,
        "sla_interno_pct": 0.0, "tempo_medio_analise_interna": None, "tempo_medio_entre_revisoes": None,
        "sla_externo_pct": None, "qtd_intervalos": 0, "qtd_fora_sla_externo": 0, "qtd_inconsistentes": 0,
        "documentos": 0,
    }
    if df.empty:
        return vazio

    df_ativos = df[df["status_analise"] != STATUS_CANCELADO]
    if df_ativos.empty:
        return vazio

    concluidos = df_ativos[df_ativos["status_analise"].isin(STATUS_CONCLUIDOS)]
    em_analise = df_ativos[df_ativos["status_analise"] == STATUS_EM_ANALISE]
    atrasados = df_ativos[df_ativos["status_entrega_calc"] == "ATRASADO"]
    dentro_prazo = df_ativos[df_ativos["status_entrega_calc"] != "ATRASADO"]

    meta_rev2 = indicadores_meta_rev2(df_ativos, meta_rev2_percentual)

    intervalos = calcular_intervalos_revisao(df_ativos, coluna_nome)
    intervalos_validos = intervalos[intervalos["situacao_sla"] != "DATA INCONSISTENTE"] if not intervalos.empty else intervalos
    tempo_medio_entre_revisoes = round(intervalos_validos["dias_uteis_retorno"].mean(), 1) if not intervalos_validos.empty else None
    sla_externo_pct = round(100 * (intervalos_validos["situacao_sla"] == "DENTRO DO SLA").sum() / len(intervalos_validos), 1) if not intervalos_validos.empty else None

    tempo_interno = _tempo_analise_interna(df_ativos).dropna()

    return {
        "total_projetos": len(df_ativos),
        "recebidos": len(df_ativos),
        "em_analise": len(em_analise),
        "concluidos": len(concluidos),
        "atrasados": len(atrasados),
        "dentro_do_prazo": len(dentro_prazo),
        "acima_rev2": meta_rev2["acima_rev2"],
        "aprovados_ate_rev2": meta_rev2["aprovados_ate_rev2"],
        "total_aprovados": meta_rev2["total_aprovados"],
        "aprovados_ate_rev2_pct": meta_rev2["percentual_atual"],
        "meta_rev2_pct": meta_rev2["meta"],
        "distancia_da_meta": meta_rev2["distancia_da_meta"],
        "sla_interno_pct": round(100 * len(dentro_prazo) / len(df_ativos), 1) if len(df_ativos) else 0.0,
        "tempo_medio_analise_interna": round(tempo_interno.mean(), 1) if not tempo_interno.empty else None,
        "tempo_medio_entre_revisoes": tempo_medio_entre_revisoes,
        "sla_externo_pct": sla_externo_pct,
        "qtd_intervalos": len(intervalos),
        "qtd_fora_sla_externo": int((intervalos["situacao_sla"] == "FORA DO SLA").sum()) if not intervalos.empty else 0,
        "qtd_inconsistentes": int((intervalos["situacao_sla"] == "DATA INCONSISTENTE").sum()) if not intervalos.empty else 0,
        "documentos": int(pd.to_numeric(df_ativos.get("num_documentos"), errors="coerce").fillna(0).sum()),
    }


def combinar_executivos(exec_prest: dict, exec_cess: dict) -> dict:
    """Combina os indicadores executivos de Prestadores e Cessionários em
    um único conjunto consolidado — contagens são somadas; percentuais são
    recalculados a partir das contagens (não uma média simples dos dois
    percentuais, para não distorcer quando os volumes são muito diferentes)."""
    total_projetos = exec_prest["total_projetos"] + exec_cess["total_projetos"]
    dentro_prazo = exec_prest["dentro_do_prazo"] + exec_cess["dentro_do_prazo"]
    total_aprovados = exec_prest["total_aprovados"] + exec_cess["total_aprovados"]
    aprovados_ate_rev2 = exec_prest["aprovados_ate_rev2"] + exec_cess["aprovados_ate_rev2"]
    qtd_intervalos = exec_prest["qtd_intervalos"] + exec_cess["qtd_intervalos"]
    qtd_fora_sla = exec_prest["qtd_fora_sla_externo"] + exec_cess["qtd_fora_sla_externo"]
    qtd_validos = qtd_intervalos - exec_prest["qtd_inconsistentes"] - exec_cess["qtd_inconsistentes"]

    def _media_ponderada(v1, n1, v2, n2):
        if v1 is None and v2 is None:
            return None
        if v1 is None:
            return v2
        if v2 is None:
            return v1
        peso_total = n1 + n2
        return round((v1 * n1 + v2 * n2) / peso_total, 1) if peso_total else round((v1 + v2) / 2, 1)

    meta_rev2_pct = exec_prest["meta_rev2_pct"] or exec_cess["meta_rev2_pct"]
    aprovados_pct = round(100 * aprovados_ate_rev2 / total_aprovados, 1) if total_aprovados else 0.0

    return {
        "total_projetos": total_projetos,
        "recebidos": total_projetos,
        "em_analise": exec_prest["em_analise"] + exec_cess["em_analise"],
        "concluidos": exec_prest["concluidos"] + exec_cess["concluidos"],
        "atrasados": exec_prest["atrasados"] + exec_cess["atrasados"],
        "dentro_do_prazo": dentro_prazo,
        "acima_rev2": exec_prest["acima_rev2"] + exec_cess["acima_rev2"],
        "aprovados_ate_rev2": aprovados_ate_rev2,
        "total_aprovados": total_aprovados,
        "aprovados_ate_rev2_pct": aprovados_pct,
        "meta_rev2_pct": meta_rev2_pct,
        "distancia_da_meta": round(aprovados_pct - meta_rev2_pct, 1),
        "sla_interno_pct": round(100 * dentro_prazo / total_projetos, 1) if total_projetos else 0.0,
        "tempo_medio_analise_interna": _media_ponderada(
            exec_prest["tempo_medio_analise_interna"], exec_prest["total_projetos"],
            exec_cess["tempo_medio_analise_interna"], exec_cess["total_projetos"],
        ),
        "tempo_medio_entre_revisoes": _media_ponderada(
            exec_prest["tempo_medio_entre_revisoes"], exec_prest["qtd_intervalos"],
            exec_cess["tempo_medio_entre_revisoes"], exec_cess["qtd_intervalos"],
        ),
        "sla_externo_pct": round(100 * (qtd_validos - qtd_fora_sla) / qtd_validos, 1) if qtd_validos else None,
        "qtd_intervalos": qtd_intervalos,
        "qtd_fora_sla_externo": qtd_fora_sla,
        "qtd_inconsistentes": exec_prest["qtd_inconsistentes"] + exec_cess["qtd_inconsistentes"],
        "documentos": exec_prest["documentos"] + exec_cess["documentos"],
    }


def indicadores_resumidos(executivos: dict) -> list[tuple[str, object]]:
    """Subconjunto de indicadores para o OPR Resumido — visão rápida sem o
    detalhamento completo da versão Executiva."""
    return [
        ("Total de projetos", executivos["total_projetos"]),
        ("Concluídos", executivos["concluidos"]),
        ("Em análise", executivos["em_analise"]),
        ("Atrasados", executivos["atrasados"]),
        ("% dentro do prazo (SLA interno)", f"{executivos['sla_interno_pct']}%"),
        ("Aprovados até a REV2", f"{executivos['aprovados_ate_rev2_pct']}%"),
    ]


def indicadores_completos(executivos: dict) -> list[tuple[str, object]]:
    """Lista completa de indicadores para o OPR Executivo (seção 3 do
    ajuste): total, recebidos, em análise, concluídos, atrasados, dentro do
    prazo, acima da REV2, aprovação até REV2, distância da meta, SLA
    interno, SLA externo (retorno), tempo médio de análise, tempo médio
    entre revisões, e alertas fora do SLA externo."""
    def _fmt(valor, sufixo=""):
        return "—" if valor is None else f"{valor}{sufixo}"

    return [
        ("Total de projetos no período", executivos["total_projetos"]),
        ("Recebidos", executivos["recebidos"]),
        ("Em análise", executivos["em_analise"]),
        ("Concluídos", executivos["concluidos"]),
        ("Atrasados", executivos["atrasados"]),
        ("Dentro do prazo", executivos["dentro_do_prazo"]),
        ("Acima da REV2", executivos["acima_rev2"]),
        ("Aprovados até a REV2", f"{executivos['aprovados_ate_rev2']} de {executivos['total_aprovados']} aprovados"),
        ("% aprovação até a REV2", f"{executivos['aprovados_ate_rev2_pct']}%"),
        ("Meta de aprovação até a REV2", f"{executivos['meta_rev2_pct']}%"),
        ("Distância da meta (p.p.)", executivos["distancia_da_meta"]),
        ("SLA interno cumprido", f"{executivos['sla_interno_pct']}%"),
        ("Tempo médio de análise interna (dias úteis)", _fmt(executivos["tempo_medio_analise_interna"])),
        ("Tempo médio entre revisões — retorno externo (dias úteis)", _fmt(executivos["tempo_medio_entre_revisoes"])),
        ("SLA externo cumprido (retorno em até 10 dias úteis)", _fmt(executivos["sla_externo_pct"], "%")),
        ("Intervalos de retorno calculados", executivos["qtd_intervalos"]),
        ("Fora do SLA externo (retorno > 10 dias úteis)", executivos["qtd_fora_sla_externo"]),
        ("Datas de revisão inconsistentes (pendente de correção)", executivos["qtd_inconsistentes"]),
        ("Documentos analisados", executivos["documentos"]),
    ]
