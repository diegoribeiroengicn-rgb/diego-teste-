"""
Ranking de Prestadores e Ranking de Projetistas de Cessionários —
modificação de ranking/marco das avaliações: usa exclusivamente
avaliações de checklist (`avaliacoes_checklist`) concluídas a partir do
marco oficial das avaliações (01/07/2026 — ver
`gat.alertas_engine.MARCO_AVALIACOES_OFICIAL`), sem alterar perguntas,
pesos, critérios, fórmula ou escala das avaliações já existentes — é
apenas uma nova forma de consultar os resultados que o sistema já
calcula (`pontuacao`, 0-15). Avaliação pendente nunca é considerada nota
zero: só entram no ranking avaliações que de fato foram realizadas.

O sistema ainda não possui um cadastro próprio de Projetista (mesma
observação já documentada em `gat/arquivo_business_rules.py`) — a
avaliação do projetista é sempre registrada associada diretamente ao
Cessionário (loja/quiosque/externo) avaliado, por isso "Nome do
Projetista" e "Cessionário relacionado" no Ranking de Projetistas de
Cessionários vêm da mesma identidade (nome/código do Cessionário).
"""

from __future__ import annotations

import pandas as pd

from gat.alertas_engine import MARCO_AVALIACOES_OFICIAL
from gat.business_rules import filtrar_por_competencia, filtrar_por_intervalo_datas
from gat.normalizacao import texto_seguro

COLUNAS_RANKING = [
    "posicao", "chave", "nome", "codigo", "media", "qtd_avaliacoes",
    "melhor_nota", "pior_nota", "ultima_data", "ultima_nota",
]

COLUNAS_DETALHAMENTO = [
    "at_referencia", "nome_entidade", "disciplina", "revisao", "data_avaliacao",
    "pontuacao", "classificacao", "media_acumulada",
]


def _base_avaliacoes_oficiais(tipo_entidade: str) -> pd.DataFrame:
    """Avaliações de checklist válidas para o ranking oficial: apenas as
    realizadas a partir do marco (01/07/2026), com data e nota utilizáveis
    — tratamento defensivo (item 20): nota vazia, data vazia ou registro
    incompleto simplesmente não entram, em vez de derrubar a página."""
    from gat.database import listar_avaliacoes_checklist

    df = listar_avaliacoes_checklist(tipo_entidade)
    if df.empty:
        return df
    datas = pd.to_datetime(df["data_avaliacao"], errors="coerce")
    pontuacao_valida = pd.to_numeric(df["pontuacao"], errors="coerce")
    valido = datas.notna() & pontuacao_valida.notna() & (datas.dt.date >= MARCO_AVALIACOES_OFICIAL)
    resultado = df.loc[valido].copy()
    resultado["pontuacao"] = pontuacao_valida.loc[valido]
    return resultado


def montar_ranking(
    tipo_entidade: str,
    mes: int | None = None, ano: int | None = None,
    data_inicio=None, data_fim=None,
    disciplina: list[str] | None = None, nomes: list[str] | None = None,
) -> pd.DataFrame:
    """
    Ranking de Prestadores (`tipo_entidade="PRESTADOR"`) ou Ranking de
    Projetistas de Cessionários (`tipo_entidade="CESSIONARIO"`) — sempre
    dois resultados separados, nunca misturados. Critério principal:
    média das notas finais das avaliações válidas (item 8). Desempate
    (item 9): maior quantidade de avaliações válidas; persistindo,
    maior nota na avaliação mais recente; persistindo, ordem alfabética
    (apresentação apenas — nunca altera notas).
    """
    df = _base_avaliacoes_oficiais(tipo_entidade)
    if df.empty:
        return pd.DataFrame(columns=COLUNAS_RANKING)

    if data_inicio or data_fim:
        df = filtrar_por_intervalo_datas(df, "data_avaliacao", data_inicio, data_fim)
    elif mes or ano:
        df = filtrar_por_competencia(df, "data_avaliacao", mes, ano)
    if disciplina:
        df = df[df["disciplina"].isin(disciplina)]
    if nomes:
        df = df[df["nome_entidade"].isin(nomes)]
    if df.empty:
        return pd.DataFrame(columns=COLUNAS_RANKING)

    df = df.copy()
    df["_chave"] = df["codigo_entidade"].fillna(df["nome_entidade"])
    df["_data_ord"] = pd.to_datetime(df["data_avaliacao"], errors="coerce")

    linhas = []
    for chave, grupo in df.groupby("_chave"):
        if not texto_seguro(chave).strip():
            continue
        grupo_ordenado = grupo.sort_values("_data_ord")
        ultima = grupo_ordenado.iloc[-1]
        linhas.append({
            "chave": chave,
            "nome": texto_seguro(grupo_ordenado["nome_entidade"].iloc[-1]).strip() or "—",
            "codigo": texto_seguro(grupo_ordenado["codigo_entidade"].iloc[-1]).strip() or None,
            "media": round(float(grupo_ordenado["pontuacao"].mean()), 2),
            "qtd_avaliacoes": int(len(grupo_ordenado)),
            "melhor_nota": int(grupo_ordenado["pontuacao"].max()),
            "pior_nota": int(grupo_ordenado["pontuacao"].min()),
            "ultima_data": ultima["_data_ord"],
            "ultima_nota": int(ultima["pontuacao"]),
        })

    if not linhas:
        return pd.DataFrame(columns=COLUNAS_RANKING)

    ranking = pd.DataFrame(linhas)
    ranking = ranking.sort_values(
        by=["media", "qtd_avaliacoes", "ultima_nota", "nome"],
        ascending=[False, False, False, True],
    ).reset_index(drop=True)
    ranking.insert(0, "posicao", ranking.index + 1)
    return ranking[COLUNAS_RANKING]


def detalhamento_avaliacoes(
    tipo_entidade: str, chave: str,
    mes: int | None = None, ano: int | None = None, data_inicio=None, data_fim=None,
) -> pd.DataFrame:
    """Avaliações individuais que formaram a nota média de um Prestador/
    Projetista no ranking (item 11), com a média acumulada na ordem
    cronológica de cada avaliação — permite conferir de onde veio a
    posição no ranking."""
    df = _base_avaliacoes_oficiais(tipo_entidade)
    if df.empty:
        return pd.DataFrame(columns=COLUNAS_DETALHAMENTO)

    df = df.copy()
    df["_chave"] = df["codigo_entidade"].fillna(df["nome_entidade"])
    df = df[df["_chave"] == chave]
    if data_inicio or data_fim:
        df = filtrar_por_intervalo_datas(df, "data_avaliacao", data_inicio, data_fim)
    elif mes or ano:
        df = filtrar_por_competencia(df, "data_avaliacao", mes, ano)
    if df.empty:
        return pd.DataFrame(columns=COLUNAS_DETALHAMENTO)

    df = df.sort_values("data_avaliacao").reset_index(drop=True)
    df["media_acumulada"] = df["pontuacao"].expanding().mean().round(2)
    colunas_presentes = [c for c in COLUNAS_DETALHAMENTO if c in df.columns]
    return df[colunas_presentes]
