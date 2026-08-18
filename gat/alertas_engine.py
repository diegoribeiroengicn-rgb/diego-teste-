"""
Motor consolidado de alertas: reúne os 5 critérios que sugerem reunião,
cobrança ou pendência de avaliação —

* gargalo de revisão (NÃO LIBERADO com revisão >= REV2);
* atraso na análise (status de entrega ATRASADO);
* avaliação (checklist) classificada como Crítica ou Baixa;
* atraso no reenvio — retorno externo do Prestador/Cessionário acima do
  SLA de 10 dias úteis entre uma revisão e a seguinte (`gat/revisoes.py`);
* avaliação obrigatória (checklist) ainda não realizada desde que a
  Rev.01 foi concluída (revisão >= 1 e Data de Conclusão da Análise
  preenchida) — nasce quando a Rev.01 é concluída e permanece ativo em
  qualquer revisão seguinte até a avaliação ser realmente registrada,
  sem gerar um novo alerta a cada revisão. O mesmo critério (`rev1_concluida`
  + `chaves_avaliadas_obrigatoria`) também alimenta o selo visual de
  pendência em Projetos (`gat/business_rules.py::status_avaliacao_obrigatoria`)
  e a lista de pendências na área de Avaliações (`pendencias_avaliacao_obrigatoria`
  abaixo), garantindo que as três telas nunca divirjam sobre o que está pendente.

Cada alerta carrega seu ciclo de vida (Pendente/Em tratamento/Tratado/
Adiado/Retirado do radar/Reaberto), armazenado em `alertas_radar`. A
avaliação obrigatória é a única exceção: seu encerramento é sempre
automático (deixa de ser gerada assim que a avaliação existe), nunca por
ação manual de tratamento/retirada — ver `views/alertas.py`.
"""

from __future__ import annotations

import pandas as pd

from gat.business_rules import (
    classificacao_atraso,
    dias_restantes_prioridade,
    em_lista_prioridades,
    limites_alerta_vencimento,
    nivel_alerta_atraso,
)
from gat.calendario import dias_uteis_hold_aberto
from gat.database import listar_avaliacao_obrigatoria_isentos, listar_avaliacoes_checklist, listar_radar
from gat.normalizacao import booleano_seguro, inteiro_seguro, logger
from gat.revisoes import calcular_intervalos_revisao

_COLUNAS_RADAR = ["status", "providencia", "responsavel_tratamento", "data_tratamento", "justificativa", "observacao", "adiado_para"]

TIPO_PENDENTE_REUNIAO = "PENDENTE_REUNIAO"
TIPO_ATRASO_ANALISE = "ATRASO_ANALISE"
TIPO_AVALIACAO_CRITICA = "AVALIACAO_CRITICA"
TIPO_ATRASO_REENVIO = "ATRASO_REENVIO"
TIPO_AVALIACAO_OBRIGATORIA = "AVALIACAO_OBRIGATORIA"
TIPO_PRAZO_PRIORITARIO = "PRAZO_PRIORITARIO"
TIPO_ALERTA_MAXIMO = "ALERTA_MAXIMO"
TIPO_ACOMPANHAMENTO_HOLD = "ACOMPANHAMENTO_HOLD"

TIPO_ALERTA_LABELS = {
    TIPO_PENDENTE_REUNIAO: "Revisão ≥ REV2 sem liberação",
    TIPO_ATRASO_ANALISE: "Atraso na análise interna",
    TIPO_AVALIACAO_CRITICA: "Avaliação Crítica/Baixa",
    TIPO_ATRASO_REENVIO: "Atraso no reenvio (retorno externo)",
    TIPO_AVALIACAO_OBRIGATORIA: "Avaliação obrigatória pendente",
    TIPO_PRAZO_PRIORITARIO: "Prazo prioritário próximo do vencimento",
    TIPO_ALERTA_MAXIMO: "Alerta Máximo — mais de 2 dias úteis de atraso",
    TIPO_ACOMPANHAMENTO_HOLD: "Acompanhamento de HOLD (3+ dias úteis)",
}

# HOLD não é atraso: o limiar é tratado à parte dos demais alertas de
# prazo, sem herdar o tom visual/urgência dos alertas de atraso.
LIMIAR_DIAS_UTEIS_ACOMPANHAMENTO_HOLD = 3


def _classificacoes_criticas(avaliacoes: pd.DataFrame) -> set[tuple[str, str]]:
    if avaliacoes.empty:
        return set()
    df = avaliacoes.sort_values("data_avaliacao").drop_duplicates(subset=["codigo_entidade", "nome_entidade", "disciplina"], keep="last")
    criticos = df[df["classificacao"].isin(["CRÍTICO", "BAIXO"])]
    chave = criticos["codigo_entidade"].fillna(criticos["nome_entidade"])
    return set(zip(chave, criticos["disciplina"].fillna("")))


def chaves_avaliadas_obrigatoria(avaliacoes: pd.DataFrame) -> set[tuple[str, str]]:
    """Toda combinação (código/nome, disciplina) que já possui ao menos uma
    avaliação de checklist registrada — usada para saber se a avaliação
    obrigatória nascida na Rev.01 já foi cumprida. Pública porque também é
    consultada fora deste módulo (selo visual em Projetos, lista de
    pendências na área de Avaliações — ver `gat/business_rules.py`)."""
    if avaliacoes.empty:
        return set()
    chave = avaliacoes["codigo_entidade"].fillna(avaliacoes["nome_entidade"])
    return set(zip(chave, avaliacoes["disciplina"].fillna("")))


def rev1_concluida(revisao, data_analise) -> bool:
    """"AT concluiu a Rev.01": revisão >= 1 E a análise já foi concluída
    (Data de Conclusão da Análise preenchida) — não basta o número da
    revisão ter avançado enquanto a análise ainda está em andamento. Esta
    data também é a referência usada para saber a qual competência
    (mês/ano) a pendência pertence, no fechamento mensal (Fase 2)."""
    try:
        if int(revisao or 0) < 1:
            return False
    except (TypeError, ValueError):
        return False
    return bool(data_analise) and pd.notna(data_analise)


_STATUS_RADAR_ATIVOS = {"PENDENTE", "EM_TRATAMENTO", "REABERTO"}


def contar_hold_aguardando_acompanhamento(df: pd.DataFrame, modulo: str) -> int:
    """
    Quantos projetos em HOLD (ver `gat.calendario.em_hold`) já atingiram
    os 3 dias úteis de acompanhamento e cujo alerta correspondente ainda
    está ativo (nunca tratado, ou reaberto) — usado na informação
    secundária discreta do card "Projetos em HOLD" da Página Inicial
    (item 15: "N aguardando acompanhamento").
    """
    if df.empty or "em_hold" not in df.columns:
        return 0
    candidatos = df[df["em_hold"].fillna(False).astype(bool)]
    if candidatos.empty:
        return 0

    radar = listar_radar()
    status_por_projeto: dict[int, str] = {}
    if not radar.empty:
        relevantes = radar[(radar["modulo"] == modulo) & (radar["tipo_alerta"] == TIPO_ACOMPANHAMENTO_HOLD)]
        status_por_projeto = dict(zip(relevantes["projeto_id"], relevantes["status"]))

    total = 0
    for _, row in candidatos.iterrows():
        if dias_uteis_hold_aberto(row.get("hold_inicio")) < LIMIAR_DIAS_UTEIS_ACOMPANHAMENTO_HOLD:
            continue
        if status_por_projeto.get(row.get("id"), "PENDENTE") in _STATUS_RADAR_ATIVOS:
            total += 1
    return total


def montar_alertas_modulo(df: pd.DataFrame, modulo: str, coluna_nome: str, coluna_codigo: str = "codigo") -> pd.DataFrame:
    """Retorna uma linha por alerta (um projeto pode gerar mais de um alerta,
    um por critério atendido), já com o status atual do ciclo de vida."""
    if df.empty:
        return pd.DataFrame()

    tipo_entidade = "PRESTADOR" if modulo == "prestadores" else "CESSIONARIO"
    avaliacoes = listar_avaliacoes_checklist(tipo_entidade)
    criticos = _classificacoes_criticas(avaliacoes)
    avaliados = chaves_avaliadas_obrigatoria(avaliacoes)
    isentos = listar_avaliacao_obrigatoria_isentos(modulo)

    registros = []
    for _, row in df.iterrows():
        try:
            codigo = row.get(coluna_codigo) or row.get(coluna_nome)
            chave_entidade = (codigo, row.get("disciplina") or "")
            base = {
                "modulo": modulo, "projeto_id": int(row["id"]), "nome": row.get(coluna_nome),
                "codigo": row.get(coluna_codigo), "disciplina": row.get("disciplina"),
                "num_at": row.get("num_at"), "revisao": row.get("revisao"), "responsavel": row.get("responsavel"),
                "item": row.get("item"), "data_analise": row.get("data_analise"),
            }
            if row.get("pendente_reuniao"):
                registros.append({**base, "tipo_alerta": TIPO_PENDENTE_REUNIAO, "detalhe": None})
            em_hold_atual = booleano_seguro(row.get("em_hold"))
            if row.get("status_entrega_calc") == "ATRASADO" and not em_hold_atual:
                registros.append({**base, "tipo_alerta": TIPO_ATRASO_ANALISE, "detalhe": None})
            if classificacao_atraso(row.get("status_analise"), row.get("status_entrega_calc"), em_hold=em_hold_atual) == "ATIVO_ATRASADO":
                dias_restantes_atraso = dias_restantes_prioridade(row, modulo)
                if nivel_alerta_atraso(dias_restantes_atraso) == "ALERTA_MAXIMO":
                    dias_atraso = int(-dias_restantes_atraso) if dias_restantes_atraso is not None else None
                    registros.append({
                        **base, "tipo_alerta": TIPO_ALERTA_MAXIMO,
                        "detalhe": (
                            f"ATENÇÃO: esta análise está com mais de 2 dias úteis de atraso ({dias_atraso} dia(s) útil(eis)) "
                            "e exige atuação imediata."
                        ),
                    })
            if chave_entidade in criticos:
                registros.append({**base, "tipo_alerta": TIPO_AVALIACAO_CRITICA, "detalhe": None})
            if (
                rev1_concluida(row.get("revisao"), row.get("data_analise"))
                and chave_entidade not in avaliados
                and int(row["id"]) not in isentos
            ):
                rotulo_avaliacao = "avaliação de prestador" if tipo_entidade == "PRESTADOR" else "avaliação do projetista do cessionário"
                registros.append({
                    **base, "tipo_alerta": TIPO_AVALIACAO_OBRIGATORIA,
                    "detalhe": f"Existe uma {rotulo_avaliacao} pendente para a AT {row.get('num_at') or '—'}.",
                })
            if em_lista_prioridades(row):
                dias_restantes = dias_restantes_prioridade(row, modulo)
                if dias_restantes is not None:
                    limite5, limite3, limite1 = limites_alerta_vencimento(inteiro_seguro(row.get("sla_dias"), 10))
                    if dias_restantes <= limite5:
                        registros.append({
                            **base, "tipo_alerta": TIPO_PRAZO_PRIORITARIO,
                            "detalhe": f"Prazo prioritário: restam {dias_restantes} dia(s) útil(eis) (limites de alerta: {limite5}/{limite3}/{limite1}).",
                        })
            if em_hold_atual:
                dias_hold = dias_uteis_hold_aberto(row.get("hold_inicio"))
                if dias_hold >= LIMIAR_DIAS_UTEIS_ACOMPANHAMENTO_HOLD:
                    registros.append({
                        **base, "tipo_alerta": TIPO_ACOMPANHAMENTO_HOLD,
                        "detalhe": f"Em HOLD há {dias_hold} dia(s) útil(eis) — acompanhamento com o especialista recomendado.",
                    })
        except (ValueError, TypeError, OverflowError, KeyError, AttributeError) as exc:
            logger.warning("montar_alertas_modulo: registro id=%r ignorado (%s)", row.get("id"), exc)
            continue

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


def pendencias_avaliacao_obrigatoria(df: pd.DataFrame, modulo: str, coluna_nome: str, coluna_codigo: str = "codigo") -> pd.DataFrame:
    """Subconjunto de `df` (uma linha por projeto/disciplina) cuja avaliação
    obrigatória da Rev.01 está pendente — usado pela lista de tarefas da
    área de Avaliações (`views/avaliacao_prestadores.py`). Mesmo critério
    de `montar_alertas_modulo`, isolado aqui para reaproveitamento sem
    precisar montar todos os demais tipos de alerta."""
    if df.empty:
        return df

    tipo_entidade = "PRESTADOR" if modulo == "prestadores" else "CESSIONARIO"
    avaliados = chaves_avaliadas_obrigatoria(listar_avaliacoes_checklist(tipo_entidade))
    isentos = listar_avaliacao_obrigatoria_isentos(modulo)

    def _pendente(row: pd.Series) -> bool:
        chave = (row.get(coluna_codigo) or row.get(coluna_nome), row.get("disciplina") or "")
        return (
            rev1_concluida(row.get("revisao"), row.get("data_analise"))
            and chave not in avaliados
            and int(row["id"]) not in isentos
        )

    return df[df.apply(_pendente, axis=1)]
