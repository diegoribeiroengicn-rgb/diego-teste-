"""
Cálculo do tempo entre revisões consecutivas (retorno externo do Prestador
ou Cessionário) e classificação contra o SLA de 10 dias úteis.

Cada linha de `prestadores`/`cessionarios` representa uma revisão específica
de um AT — quando o mesmo Prestador/Cessionário reenvia uma nova revisão do
mesmo AT/disciplina, isso aparece como uma NOVA linha, com sua própria
Data de Solicitação (data de entrada daquela revisão). Este módulo agrupa
essas linhas por (código ou nome, N° AT, disciplina), ordena por revisão e
calcula, para cada revisão N, o tempo em dias úteis entre a entrada da
revisão N-1 e a entrada da revisão N — sempre a revisão IMEDIATAMENTE
anterior, nunca a REV0 fixa. Usa a mesma convenção de dias úteis (NETWORKDAYS
inclusivo) já validada em `gat/calendario.py::dias_uteis_decorridos`.

Registros sem N° AT utilizável (vazio ou placeholder como "***") não têm
como ser agrupados de forma confiável em uma sequência de revisões de um
único projeto — são reportados como "incompletos" e não entram no cálculo,
em vez de inventar uma correspondência.
"""

from __future__ import annotations

import pandas as pd

from gat.calendario import dias_uteis_entre

SLA_RETORNO_EXTERNO_DIAS_UTEIS = 10
_LIMIAR_PROXIMO_LIMITE = SLA_RETORNO_EXTERNO_DIAS_UTEIS - 2  # 8 e 9 dias

_AT_PLACEHOLDERS = {"", "***", "-", "--", "N/A", "NA"}

SITUACAO_SLA_EXTERNO_OPCOES = [
    "DENTRO DO SLA", "PRÓXIMO DO LIMITE", "NO LIMITE", "FORA DO SLA", "AGUARDANDO NOVA REVISÃO",
]

SITUACAO_SLA_EXTERNO_CORES = {
    "DENTRO DO SLA": "verde",
    "PRÓXIMO DO LIMITE": "dourado",
    "NO LIMITE": "laranja",
    "FORA DO SLA": "vermelho",
    "AGUARDANDO NOVA REVISÃO": "texto_dim",
}


def _at_valido(num_at) -> bool:
    return bool(num_at) and str(num_at).strip().upper() not in _AT_PLACEHOLDERS


def situacao_sla_externo(dias_uteis: int | None) -> str:
    """Classifica o tempo de retorno externo (dias úteis) contra o SLA de 10
    dias úteis, em 5 níveis (o 5º — aguardando nova revisão — cobre a
    revisão mais recente de um projeto ainda em aberto, sem próxima revisão
    registrada para comparar)."""
    if dias_uteis is None:
        return "AGUARDANDO NOVA REVISÃO"
    if dias_uteis > SLA_RETORNO_EXTERNO_DIAS_UTEIS:
        return "FORA DO SLA"
    if dias_uteis == SLA_RETORNO_EXTERNO_DIAS_UTEIS:
        return "NO LIMITE"
    if dias_uteis >= _LIMIAR_PROXIMO_LIMITE:
        return "PRÓXIMO DO LIMITE"
    return "DENTRO DO SLA"


def calcular_intervalos_revisao(df: pd.DataFrame, coluna_nome: str, coluna_codigo: str = "codigo") -> pd.DataFrame:
    """
    Retorna um DataFrame, uma linha por revisão (exceto a primeira de cada
    grupo, que não tem revisão anterior para comparar), com as colunas:
    chave_grupo, nome, codigo, num_at, disciplina, revisao_anterior,
    revisao_atual, data_entrada_anterior, data_entrada_atual,
    dias_uteis_retorno, situacao_sla, e um flag `sequencial` (False quando
    a revisão atual não é exatamente a anterior + 1 — nesse caso o
    intervalo é reportado mas sinalizado como não estritamente sequencial).
    """
    colunas_saida = [
        "chave_grupo", "nome", "codigo", "num_at", "disciplina", "item", "id", "responsavel",
        "revisao_anterior", "revisao_atual", "data_entrada_anterior", "data_entrada_atual",
        "dias_uteis_retorno", "situacao_sla", "sequencial",
    ]
    if df.empty:
        return pd.DataFrame(columns=colunas_saida)

    base = df[df["num_at"].apply(_at_valido)].copy()
    if base.empty:
        return pd.DataFrame(columns=colunas_saida)

    base["_chave_entidade"] = base[coluna_codigo].where(base[coluna_codigo].notna() & (base[coluna_codigo] != ""), base[coluna_nome])
    base["chave_grupo"] = base["_chave_entidade"].astype(str) + "||" + base["num_at"].astype(str) + "||" + base["disciplina"].fillna("").astype(str)

    linhas = []
    for chave, grupo in base.groupby("chave_grupo"):
        grupo = grupo.sort_values("revisao")
        anterior = None
        for _, linha in grupo.iterrows():
            if anterior is not None and pd.notna(linha.get("data_solicitacao")) and pd.notna(anterior.get("data_solicitacao")):
                dias = dias_uteis_entre(anterior["data_solicitacao"], linha["data_solicitacao"])
                linhas.append({
                    "chave_grupo": chave,
                    "nome": linha.get(coluna_nome),
                    "codigo": linha.get(coluna_codigo),
                    "num_at": linha.get("num_at"),
                    "disciplina": linha.get("disciplina"),
                    "item": linha.get("item"),
                    "id": linha.get("id"),
                    "responsavel": linha.get("responsavel"),
                    "revisao_anterior": int(anterior["revisao"]),
                    "revisao_atual": int(linha["revisao"]),
                    "data_entrada_anterior": anterior["data_solicitacao"],
                    "data_entrada_atual": linha["data_solicitacao"],
                    "dias_uteis_retorno": dias,
                    "situacao_sla": situacao_sla_externo(dias),
                    "sequencial": int(linha["revisao"]) == int(anterior["revisao"]) + 1,
                })
            anterior = linha

    return pd.DataFrame(linhas, columns=colunas_saida) if linhas else pd.DataFrame(columns=colunas_saida)


def resumo_por_grupo(intervalos: pd.DataFrame) -> pd.DataFrame:
    """Agrega os intervalos por chave_grupo: quantidade, média, maior/menor
    tempo de retorno, e quantos ficaram dentro/fora do SLA."""
    if intervalos.empty:
        return pd.DataFrame(columns=["chave_grupo", "nome", "codigo", "qtd_intervalos", "media_dias", "maior_dias", "menor_dias", "qtd_dentro_sla", "qtd_fora_sla"])

    def _agg(grupo: pd.DataFrame) -> pd.Series:
        return pd.Series({
            "nome": grupo["nome"].iloc[0],
            "codigo": grupo["codigo"].iloc[0],
            "qtd_intervalos": len(grupo),
            "media_dias": round(grupo["dias_uteis_retorno"].mean(), 1),
            "maior_dias": int(grupo["dias_uteis_retorno"].max()),
            "menor_dias": int(grupo["dias_uteis_retorno"].min()),
            "qtd_dentro_sla": int((grupo["situacao_sla"] == "DENTRO DO SLA").sum()),
            "qtd_fora_sla": int((grupo["situacao_sla"] == "FORA DO SLA").sum()),
        })

    return intervalos.groupby("chave_grupo").apply(_agg, include_groups=False).reset_index()


def alertas_atraso_reenvio(intervalos: pd.DataFrame) -> pd.DataFrame:
    """Filtra apenas os intervalos FORA DO SLA (>10 dias úteis) — candidatos
    a alerta automático de atraso no reenvio."""
    if intervalos.empty:
        return intervalos
    return intervalos[intervalos["situacao_sla"] == "FORA DO SLA"].copy()
