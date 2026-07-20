"""
Motor consolidado de alertas: reúne os 4 critérios que sugerem reunião ou
cobrança —

* gargalo de revisão (NÃO LIBERADO com revisão >= REV2);
* atraso na análise (status de entrega ATRASADO);
* avaliação (checklist) classificada como Crítica ou Baixa;
* atraso no reenvio — retorno externo do Prestador/Cessionário acima do
  SLA de 10 dias úteis entre uma revisão e a seguinte (`gat/revisoes.py`).

Cada alerta carrega seu ciclo de vida (Pendente/Em tratamento/Tratado/
Adiado/Retirado do radar/Reaberto), armazenado em `alertas_radar`.
"""

from __future__ import annotations

import pandas as pd

from gat.database import listar_avaliacoes_checklist, listar_radar
from gat.revisoes import calcular_intervalos_revisao

_COLUNAS_RADAR = ["status", "providencia", "responsavel_tratamento", "data_tratamento", "justificativa", "observacao", "adiado_para"]

TIPO_PENDENTE_REUNIAO = "PENDENTE_REUNIAO"
TIPO_ATRASO_ANALISE = "ATRASO_ANALISE"
TIPO_AVALIACAO_CRITICA = "AVALIACAO_CRITICA"
TIPO_ATRASO_REENVIO = "ATRASO_REENVIO"

TIPO_ALERTA_LABELS = {
    TIPO_PENDENTE_REUNIAO: "Revisão ≥ REV2 sem liberação",
    TIPO_ATRASO_ANALISE: "Atraso na análise interna",
    TIPO_AVALIACAO_CRITICA: "Avaliação Crítica/Baixa",
    TIPO_ATRASO_REENVIO: "Atraso no reenvio (retorno externo)",
}


def _classificacoes_criticas(tipo_entidade: str) -> set[tuple[str, str]]:
    df = listar_avaliacoes_checklist(tipo_entidade)
    if df.empty:
        return set()
    df = df.sort_values("data_avaliacao").drop_duplicates(subset=["codigo_entidade", "nome_entidade", "disciplina"], keep="last")
    criticos = df[df["classificacao"].isin(["CRÍTICO", "BAIXO"])]
    chave = criticos["codigo_entidade"].fillna(criticos["nome_entidade"])
    return set(zip(chave, criticos["disciplina"].fillna("")))


def montar_alertas_modulo(df: pd.DataFrame, modulo: str, coluna_nome: str, coluna_codigo: str = "codigo") -> pd.DataFrame:
    """Retorna uma linha por alerta (um projeto pode gerar mais de um alerta,
    um por critério atendido), já com o status atual do ciclo de vida."""
    if df.empty:
        return pd.DataFrame()

    tipo_entidade = "PRESTADOR" if modulo == "prestadores" else "CESSIONARIO"
    criticos = _classificacoes_criticas(tipo_entidade)

    registros = []
    for _, row in df.iterrows():
        codigo = row.get(coluna_codigo) or row.get(coluna_nome)
        base = {
            "modulo": modulo, "projeto_id": int(row["id"]), "nome": row.get(coluna_nome),
            "codigo": row.get(coluna_codigo), "disciplina": row.get("disciplina"),
            "num_at": row.get("num_at"), "revisao": row.get("revisao"), "responsavel": row.get("responsavel"),
            "item": row.get("item"),
        }
        if row.get("pendente_reuniao"):
            registros.append({**base, "tipo_alerta": TIPO_PENDENTE_REUNIAO, "detalhe": None})
        if row.get("status_entrega_calc") == "ATRASADO":
            registros.append({**base, "tipo_alerta": TIPO_ATRASO_ANALISE, "detalhe": None})
        if (codigo, row.get("disciplina") or "") in criticos:
            registros.append({**base, "tipo_alerta": TIPO_AVALIACAO_CRITICA, "detalhe": None})

    intervalos = calcular_intervalos_revisao(df, coluna_nome, coluna_codigo)
    if not intervalos.empty:
        fora_sla = intervalos[intervalos["situacao_sla"] == "FORA DO SLA"]
        for _, row in fora_sla.iterrows():
            registros.append({
                "modulo": modulo, "projeto_id": int(row["id"]), "nome": row.get("nome"),
                "codigo": row.get("codigo"), "disciplina": row.get("disciplina"),
                "num_at": row.get("num_at"), "revisao": row.get("revisao_atual"), "responsavel": row.get("responsavel"),
                "item": row.get("item"), "tipo_alerta": TIPO_ATRASO_REENVIO,
                "detalhe": f"REV{int(row['revisao_anterior']):02d}→REV{int(row['revisao_atual']):02d}: {int(row['dias_uteis_retorno'])} dias úteis sem retorno",
            })

    if not registros:
        return pd.DataFrame()

    alertas = pd.DataFrame(registros)
    alertas["motivo_label"] = alertas["tipo_alerta"].map(TIPO_ALERTA_LABELS)

    radar = listar_radar()
    if not radar.empty:
        radar_chave = radar[["modulo", "projeto_id", "tipo_alerta", *_COLUNAS_RADAR]].drop_duplicates(
            subset=["modulo", "projeto_id", "tipo_alerta"], keep="last"
        )
        alertas = alertas.merge(radar_chave, on=["modulo", "projeto_id", "tipo_alerta"], how="left")
    else:
        for coluna in _COLUNAS_RADAR:
            alertas[coluna] = None
    alertas["status"] = alertas["status"].fillna("PENDENTE")
    return alertas
