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

from gat.calendario import dias_corridos_entre, dias_uteis_entre

SLA_RETORNO_EXTERNO_DIAS_UTEIS = 10
_LIMIAR_PROXIMO_LIMITE = SLA_RETORNO_EXTERNO_DIAS_UTEIS - 2  # 8 e 9 dias

_AT_PLACEHOLDERS = {"", "***", "-", "--", "N/A", "NA"}

SITUACAO_SLA_EXTERNO_OPCOES = [
    "DENTRO DO SLA", "PRÓXIMO DO LIMITE", "NO LIMITE", "FORA DO SLA",
    "AGUARDANDO NOVA REVISÃO", "DATA INCONSISTENTE",
]

SITUACAO_SLA_EXTERNO_CORES = {
    "DENTRO DO SLA": "verde",
    "PRÓXIMO DO LIMITE": "dourado",
    "NO LIMITE": "laranja",
    "FORA DO SLA": "vermelho",
    "AGUARDANDO NOVA REVISÃO": "texto_dim",
    "DATA INCONSISTENTE": "roxo",
}


def _at_valido(num_at) -> bool:
    if pd.isna(num_at):
        return False
    return bool(num_at) and str(num_at).strip().upper() not in _AT_PLACEHOLDERS


def situacao_sla_externo(dias_uteis: int | None) -> str:
    """Classifica o tempo de retorno externo (dias úteis) contra o SLA de 10
    dias úteis, em 6 níveis. "Aguardando nova revisão" cobre a revisão mais
    recente de um projeto ainda em aberto, sem próxima revisão registrada
    para comparar. "Data inconsistente" cobre um par de revisões cuja data
    de entrada da revisão seguinte é ANTERIOR à da revisão anterior — nunca
    corrigido ou inventado automaticamente, apenas sinalizado para correção
    por um usuário autorizado (nunca tratado como um retorno dentro do SLA)."""
    if dias_uteis is None:
        return "AGUARDANDO NOVA REVISÃO"
    if dias_uteis < 0:
        return "DATA INCONSISTENTE"
    if dias_uteis > SLA_RETORNO_EXTERNO_DIAS_UTEIS:
        return "FORA DO SLA"
    if dias_uteis == SLA_RETORNO_EXTERNO_DIAS_UTEIS:
        return "NO LIMITE"
    if dias_uteis >= _LIMIAR_PROXIMO_LIMITE:
        return "PRÓXIMO DO LIMITE"
    return "DENTRO DO SLA"


def _chave_entidade_serie(df: pd.DataFrame, coluna_nome: str, coluna_codigo: str = "codigo") -> pd.Series:
    """Código do Prestador/Cessionário quando disponível; caso contrário, o
    nome — mesma regra usada para consolidar o Radar e a Linha do Tempo por
    código, já que nem todo cadastro tem código preenchido."""
    return df[coluna_codigo].where(df[coluna_codigo].notna() & (df[coluna_codigo] != ""), df[coluna_nome])


def calcular_intervalos_revisao(df: pd.DataFrame, coluna_nome: str, coluna_codigo: str = "codigo") -> pd.DataFrame:
    """
    Retorna um DataFrame, uma linha por revisão (exceto a primeira de cada
    grupo, que não tem revisão anterior para comparar), com as colunas:
    chave_grupo, chave_entidade, nome, codigo, num_at, disciplina,
    revisao_anterior, revisao_atual, data_entrada_anterior,
    data_entrada_atual, dias_uteis_retorno, dias_corridos_retorno,
    situacao_sla, e um flag `sequencial` (False quando a revisão atual não
    é exatamente a anterior + 1 — nesse caso o intervalo é reportado mas
    sinalizado como não estritamente sequencial).
    """
    colunas_saida = [
        "chave_grupo", "chave_entidade", "nome", "codigo", "num_at", "disciplina", "item", "id", "responsavel",
        "revisao_anterior", "revisao_atual", "data_entrada_anterior", "data_entrada_atual",
        "dias_uteis_retorno", "dias_corridos_retorno", "situacao_sla", "sequencial",
    ]
    if df.empty:
        return pd.DataFrame(columns=colunas_saida)

    base = df[df["num_at"].apply(_at_valido)].copy()
    if base.empty:
        return pd.DataFrame(columns=colunas_saida)

    base["_chave_entidade"] = _chave_entidade_serie(base, coluna_nome, coluna_codigo)
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
                    "chave_entidade": linha.get("_chave_entidade"),
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
                    "dias_corridos_retorno": dias_corridos_entre(anterior["data_solicitacao"], linha["data_solicitacao"]),
                    "situacao_sla": situacao_sla_externo(dias),
                    "sequencial": int(linha["revisao"]) == int(anterior["revisao"]) + 1,
                })
            anterior = linha

    return pd.DataFrame(linhas, columns=colunas_saida) if linhas else pd.DataFrame(columns=colunas_saida)


def resumo_por_grupo(intervalos: pd.DataFrame) -> pd.DataFrame:
    """Agrega os intervalos por chave_grupo (um projeto = código/nome + AT +
    disciplina): quantidade, média, maior/menor tempo de retorno, e quantos
    ficaram dentro/fora do SLA. Intervalos com "DATA INCONSISTENTE" (revisão
    seguinte com data de entrada anterior à revisão anterior — problema de
    cadastro, não um retorno rápido) são contados separadamente e nunca
    entram nas médias/máximos/mínimos de dias."""
    colunas = ["chave_grupo", "nome", "codigo", "qtd_intervalos", "media_dias", "maior_dias", "menor_dias", "qtd_dentro_sla", "qtd_fora_sla", "qtd_inconsistentes"]
    if intervalos.empty:
        return pd.DataFrame(columns=colunas)

    def _agg(grupo: pd.DataFrame) -> pd.Series:
        validos = grupo[grupo["situacao_sla"] != "DATA INCONSISTENTE"]
        return pd.Series({
            "nome": grupo["nome"].iloc[0],
            "codigo": grupo["codigo"].iloc[0],
            "qtd_intervalos": len(grupo),
            "media_dias": round(validos["dias_uteis_retorno"].mean(), 1) if not validos.empty else None,
            "maior_dias": int(validos["dias_uteis_retorno"].max()) if not validos.empty else None,
            "menor_dias": int(validos["dias_uteis_retorno"].min()) if not validos.empty else None,
            "qtd_dentro_sla": int((grupo["situacao_sla"] == "DENTRO DO SLA").sum()),
            "qtd_fora_sla": int((grupo["situacao_sla"] == "FORA DO SLA").sum()),
            "qtd_inconsistentes": int((grupo["situacao_sla"] == "DATA INCONSISTENTE").sum()),
        })

    return intervalos.groupby("chave_grupo").apply(_agg, include_groups=False).reset_index()


def resumo_por_codigo(intervalos: pd.DataFrame) -> pd.DataFrame:
    """Agrega os intervalos por código/nome (chave_entidade) — consolidando
    TODOS os projetos/ATs/disciplinas do mesmo Prestador/Cessionário em uma
    única linha, com métricas agregadas de tempo de retorno e conformidade
    com o SLA. Base da visão principal da Linha do Tempo por código.
    Intervalos com "DATA INCONSISTENTE" ficam fora das médias/percentuais
    de dias (não representam nem cumprimento nem descumprimento do SLA —
    são um problema de cadastro a ser corrigido por um usuário autorizado)."""
    colunas = [
        "chave_entidade", "nome", "codigo", "qtd_projetos", "qtd_intervalos", "media_dias",
        "maior_dias", "menor_dias", "qtd_dentro_sla", "qtd_fora_sla", "qtd_no_limite",
        "qtd_proximo_limite", "qtd_inconsistentes", "pct_dentro_sla",
    ]
    if intervalos.empty:
        return pd.DataFrame(columns=colunas)

    def _agg(grupo: pd.DataFrame) -> pd.Series:
        validos = grupo[grupo["situacao_sla"] != "DATA INCONSISTENTE"]
        qtd_validos = len(validos)
        dentro = int((grupo["situacao_sla"] == "DENTRO DO SLA").sum())
        return pd.Series({
            "nome": grupo["nome"].iloc[0],
            "codigo": grupo["codigo"].iloc[0],
            "qtd_projetos": grupo["chave_grupo"].nunique(),
            "qtd_intervalos": len(grupo),
            "media_dias": round(validos["dias_uteis_retorno"].mean(), 1) if qtd_validos else None,
            "maior_dias": int(validos["dias_uteis_retorno"].max()) if qtd_validos else None,
            "menor_dias": int(validos["dias_uteis_retorno"].min()) if qtd_validos else None,
            "qtd_dentro_sla": dentro,
            "qtd_fora_sla": int((grupo["situacao_sla"] == "FORA DO SLA").sum()),
            "qtd_no_limite": int((grupo["situacao_sla"] == "NO LIMITE").sum()),
            "qtd_proximo_limite": int((grupo["situacao_sla"] == "PRÓXIMO DO LIMITE").sum()),
            "qtd_inconsistentes": int((grupo["situacao_sla"] == "DATA INCONSISTENTE").sum()),
            "pct_dentro_sla": round(100 * dentro / qtd_validos, 1) if qtd_validos else 0.0,
        })

    return intervalos.groupby("chave_entidade").apply(_agg, include_groups=False).reset_index()


def projetos_por_entidade(df: pd.DataFrame, coluna_nome: str, coluna_codigo: str = "codigo") -> pd.DataFrame:
    """Uma linha por projeto (código/nome + N° AT + disciplina) — inclui
    também projetos sem N° AT utilizável (marcados `at_valido=False`, sem
    entrar no cálculo de intervalos, em vez de forçar um agrupamento
    inventado). Traz a situação da revisão mais recente de cada projeto,
    para compor a visão consolidada por código."""
    colunas = [
        "chave_entidade", "nome", "codigo", "num_at", "disciplina", "at_valido", "qtd_revisoes",
        "revisao_atual", "data_ultima_entrada", "responsavel_atual", "status_analise_atual",
        "status_entrega_atual", "ids",
    ]
    if df.empty:
        return pd.DataFrame(columns=colunas)

    base = df.copy()
    base["_chave_entidade"] = _chave_entidade_serie(base, coluna_nome, coluna_codigo)
    base["_at_valido"] = base["num_at"].apply(_at_valido)
    # Registros sem AT válido (placeholder "***"/"-"/etc.) nunca são agrupados
    # entre si — cada um vira seu próprio projeto (chave única pelo id), já
    # que um AT placeholder repetido não indica que sejam o mesmo projeto.
    chave_at = base["_chave_entidade"].astype(str) + "||" + base["num_at"].astype(str) + "||" + base["disciplina"].fillna("").astype(str)
    chave_unica = base["_chave_entidade"].astype(str) + "||SEMAT||" + base["id"].astype(str)
    base["_chave_projeto"] = chave_at.where(base["_at_valido"], chave_unica)

    linhas = []
    for _, grupo in base.groupby("_chave_projeto"):
        grupo = grupo.sort_values("revisao")
        ultima = grupo.iloc[-1]
        linhas.append({
            "chave_entidade": ultima["_chave_entidade"],
            "nome": ultima.get(coluna_nome),
            "codigo": ultima.get(coluna_codigo),
            "num_at": ultima.get("num_at"),
            "disciplina": ultima.get("disciplina"),
            "at_valido": bool(ultima["_at_valido"]),
            "qtd_revisoes": len(grupo),
            "revisao_atual": int(ultima["revisao"]),
            "data_ultima_entrada": ultima.get("data_solicitacao"),
            "responsavel_atual": ultima.get("responsavel"),
            "status_analise_atual": ultima.get("status_analise"),
            "status_entrega_atual": ultima.get("status_entrega_calc"),
            "ids": list(grupo["id"]),
        })

    return pd.DataFrame(linhas, columns=colunas)


def consolidado_por_entidade(df: pd.DataFrame, coluna_nome: str, coluna_codigo: str = "codigo") -> pd.DataFrame:
    """Visão principal da Linha do Tempo: uma linha por código/nome,
    consolidando TODOS os projetos (inclusive os sem N° AT utilizável,
    sinalizados aqui mas fora do cálculo de intervalos) com métricas
    agregadas de tempo de retorno externo e status atual."""
    colunas = [
        "chave_entidade", "nome", "codigo", "qtd_projetos", "qtd_ats", "qtd_disciplinas",
        "qtd_atrasados_atual", "qtd_projetos_sem_at_valido", "qtd_intervalos", "media_dias",
        "maior_dias", "menor_dias", "qtd_dentro_sla", "qtd_fora_sla", "qtd_inconsistentes", "pct_dentro_sla",
    ]
    projetos = projetos_por_entidade(df, coluna_nome, coluna_codigo)
    if projetos.empty:
        return pd.DataFrame(columns=colunas)

    def _agg(grupo: pd.DataFrame) -> pd.Series:
        return pd.Series({
            "nome": grupo["nome"].iloc[0],
            "codigo": grupo["codigo"].iloc[0],
            "qtd_projetos": len(grupo),
            "qtd_ats": grupo["num_at"].nunique(),
            "qtd_disciplinas": grupo["disciplina"].nunique(),
            "qtd_atrasados_atual": int((grupo["status_entrega_atual"] == "ATRASADO").sum()),
            "qtd_projetos_sem_at_valido": int((~grupo["at_valido"]).sum()),
        })

    entidades = projetos.groupby("chave_entidade").apply(_agg, include_groups=False).reset_index()

    intervalos = calcular_intervalos_revisao(df, coluna_nome, coluna_codigo)
    resumo = resumo_por_codigo(intervalos)
    if resumo.empty:
        for coluna in ["qtd_intervalos", "media_dias", "maior_dias", "menor_dias", "qtd_dentro_sla", "qtd_fora_sla", "qtd_inconsistentes", "pct_dentro_sla"]:
            entidades[coluna] = 0 if coluna != "media_dias" else None
    else:
        entidades = entidades.merge(
            resumo[["chave_entidade", "qtd_intervalos", "media_dias", "maior_dias", "menor_dias", "qtd_dentro_sla", "qtd_fora_sla", "qtd_inconsistentes", "pct_dentro_sla"]],
            on="chave_entidade", how="left",
        )
        for coluna in ["qtd_intervalos", "qtd_dentro_sla", "qtd_fora_sla", "qtd_inconsistentes"]:
            entidades[coluna] = entidades[coluna].fillna(0).astype(int)
    return entidades.reindex(columns=colunas)


def alertas_atraso_reenvio(intervalos: pd.DataFrame) -> pd.DataFrame:
    """Filtra apenas os intervalos FORA DO SLA (>10 dias úteis) — candidatos
    a alerta automático de atraso no reenvio."""
    if intervalos.empty:
        return intervalos
    return intervalos[intervalos["situacao_sla"] == "FORA DO SLA"].copy()
