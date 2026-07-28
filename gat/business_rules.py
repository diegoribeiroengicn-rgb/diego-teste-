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
    FAIXAS_AVALIACAO,
    META_REVISAO_APROVACAO,
    SLA_CESSIONARIOS_NOVO,
    SLA_CESSIONARIOS_REVISAO,
    SLA_PRESTADORES_DIAS_UTEIS,
    STATUS_CANCELADO,
    STATUS_NAO_LIBERADO,
    STATUS_PENDENTE_REUNIAO,
)


def classificar_nota(nota: int) -> tuple[str, str]:
    """
    Classifica a nota de avaliação de prestador (1-15) conforme a legenda
    oficial da planilha "Avaliacao_Prestadores_GAT.xlsx", retornando a
    tupla (classificação, interpretação gerencial).
    """
    try:
        valor = int(nota)
    except (TypeError, ValueError):
        return "SEM NOTA", ""
    for minimo, maximo, rotulo, interpretacao in FAIXAS_AVALIACAO:
        if minimo <= valor <= maximo:
            return rotulo, interpretacao
    return "FORA DA ESCALA", "Nota fora da escala oficial (1 a 15)."


def classificar_checklist(pontuacao: int) -> tuple[str, str]:
    """
    Classifica a pontuação do checklist de avaliação (soma de respostas
    "SIM" entre as 15 perguntas, 0 a 15) usando as mesmas faixas de
    `classificar_nota`. Uma pontuação 0 (nenhum "SIM") é tratada como
    CRÍTICO — a escala oficial começa em 1, mas 0 é ainda mais grave.
    """
    if pontuacao == 0:
        return classificar_nota(1)
    return classificar_nota(pontuacao)


def pontuar_checklist(respostas: dict[str, dict[str, str]]) -> int:
    """Soma quantas perguntas do checklist foram respondidas "SIM"
    (N/A e "NÃO" não pontuam)."""
    return sum(1 for r in respostas.values() if r.get("resposta") == "SIM")


def marcar_avaliacao_obrigatoria(
    df: pd.DataFrame, tipo_entidade: str, coluna_nome: str, coluna_codigo: str
) -> pd.Series:
    """
    Indica, por linha, se a avaliação (checklist) daquele projeto é
    obrigatória e ainda está pendente: a regra de negócio é que a avaliação
    deve acontecer exatamente na Revisão 1 (não antes, não depois — a
    partir da REV2 o sinalizador não é mais exibido, mesmo que a avaliação
    continue ausente) e é específica por disciplina (um mesmo prestador/
    cessionário pode ter disciplinas diferentes, cada uma com sua própria
    necessidade de avaliação).
    """
    from gat.database import listar_avaliacoes_checklist

    if df.empty:
        return pd.Series(dtype=bool)
    avaliadas = listar_avaliacoes_checklist(tipo_entidade)
    if avaliadas.empty:
        chaves_avaliadas: set[tuple[str, str]] = set()
    else:
        chave_entidade = avaliadas["codigo_entidade"].fillna(avaliadas["nome_entidade"])
        chaves_avaliadas = set(zip(chave_entidade, avaliadas["disciplina"].fillna("")))

    def _pendente(row: pd.Series) -> bool:
        try:
            if int(row.get("revisao") or 0) != 1:
                return False
        except (TypeError, ValueError):
            return False
        codigo = row.get(coluna_codigo)
        nome = row.get(coluna_nome)
        chave = (codigo if codigo else nome, row.get("disciplina") or "")
        return chave not in chaves_avaliadas

    return df.apply(_pendente, axis=1)


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


SITUACAO_PRAZO_CORES = {
    "DENTRO DO PRAZO": "verde",
    "VENCE EM BREVE": "dourado",
    "VENCE HOJE": "laranja",
    "ATRASADO": "vermelho",
}
_LIMIAR_VENCE_EM_BREVE_DIAS_UTEIS = 2


def situacao_prazo(dias_restantes: int | None) -> str:
    """
    Classifica a situação do prazo em 4 níveis (para o badge visual):
    DENTRO DO PRAZO (verde) / VENCE EM BREVE (amarelo, últimos 2 dias úteis)
    / VENCE HOJE (laranja) / ATRASADO (vermelho). `dias_restantes` é
    SLA - dias decorridos (Prestadores) ou o saldo de dias úteis
    (Cessionários) — positivo significa que ainda há prazo.
    """
    if dias_restantes is None:
        return "DENTRO DO PRAZO"
    if dias_restantes < 0:
        return "ATRASADO"
    if dias_restantes == 0:
        return "VENCE HOJE"
    if dias_restantes <= _LIMIAR_VENCE_EM_BREVE_DIAS_UTEIS:
        return "VENCE EM BREVE"
    return "DENTRO DO PRAZO"


def acima_da_meta_revisao(revisao: int | None) -> bool:
    """True quando a revisão do projeto já ultrapassou a meta corporativa
    (acima da REV2) — usado para o destaque visual específico."""
    try:
        return int(revisao or 0) > META_REVISAO_APROVACAO
    except (TypeError, ValueError):
        return False


STATUS_APROVADOS = ["LIBERADO", "LIBERADO C/ REST."]


def indicadores_meta_rev2(df: pd.DataFrame, meta_percentual: float | None = None) -> dict:
    """
    Acompanhamento da meta de aprovação até a REV2: quantos projetos
    aprovados (LIBERADO/LIBERADO C/ REST.) o foram na REV0, REV1, REV2 e
    acima da REV2, o percentual aprovado até a REV2 sobre o total de
    aprovados, e a distância (em pontos percentuais) para a meta
    configurada. `meta_percentual` pode ser passada explicitamente (ex.:
    vinda de `configuracoes`); se omitida, usa `META_REVISAO_APROVACAO`
    apenas como referência de revisão (a meta percentual default é 80%).
    """
    if df.empty:
        aprovados = df
    else:
        aprovados = df[df["status_analise"].isin(STATUS_APROVADOS)]

    total_aprovados = len(aprovados)
    aprovados_rev0 = int((aprovados["revisao"] == 0).sum()) if total_aprovados else 0
    aprovados_rev1 = int((aprovados["revisao"] == 1).sum()) if total_aprovados else 0
    aprovados_rev2 = int((aprovados["revisao"] == META_REVISAO_APROVACAO).sum()) if total_aprovados else 0
    aprovados_ate_rev2 = int((aprovados["revisao"] <= META_REVISAO_APROVACAO).sum()) if total_aprovados else 0
    acima_rev2 = int((df["revisao"] > META_REVISAO_APROVACAO).sum()) if not df.empty else 0

    percentual_atual = round((aprovados_ate_rev2 / total_aprovados) * 100, 1) if total_aprovados else 0.0
    meta = float(meta_percentual) if meta_percentual is not None else 80.0
    distancia = round(percentual_atual - meta, 1)

    return {
        "aprovados_rev0": aprovados_rev0,
        "aprovados_rev1": aprovados_rev1,
        "aprovados_rev2": aprovados_rev2,
        "aprovados_ate_rev2": aprovados_ate_rev2,
        "acima_rev2": acima_rev2,
        "total_aprovados": total_aprovados,
        "percentual_atual": percentual_atual,
        "meta": meta,
        "distancia_da_meta": distancia,
    }


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
        for col in ("hold_dias", "dias_uteis_decorridos", "status_entrega_calc", "situacao_pep"):
            df[col] = pd.Series(dtype=object)
        return adicionar_flags_governanca(df)

    df = df.copy()

    def _linha(linha):
        hold = calcular_hold_dias(linha.get("hold_inicio"), linha.get("hold_fim"))
        status, decorridos = status_entrega_prestador(linha.get("data_solicitacao"), linha.get("data_analise"), hold)
        return pd.Series({"hold_dias": hold, "dias_uteis_decorridos": decorridos, "status_entrega_calc": status})

    calculados = df.apply(_linha, axis=1)
    df = pd.concat([df, calculados], axis=1)
    df["peps_efetivo"] = _pep_efetivo_prestadores(df)
    df = enriquecer_situacao_pep(df, "peps_efetivo")
    df["situacao_pep"] = df["tem_pep"].map({True: "OK", False: "SEM PEP"})
    return adicionar_flags_governanca(df)


def _pep_efetivo_prestadores(df: pd.DataFrame) -> pd.Series:
    """PEP efetivo de cada projeto de prestador: usa o cadastro mestre do
    prestador vinculado (`prestador_cadastro_id`) quando ele já tiver PEP
    informado — assim, atualizar o PEP no Cadastro de Prestadores propaga
    automaticamente para todos os projetos do mesmo código, sem precisar
    digitar em cada um. Projetos ainda sem vínculo de cadastro (dado
    histórico) ou cujo cadastro não tem PEP continuam usando o valor
    gravado no próprio projeto (`peps`), sem perder histórico."""
    if "prestador_cadastro_id" not in df.columns:
        return df["peps"]

    from gat.database import listar_cadastro_prestadores

    cadastro = listar_cadastro_prestadores().set_index("id")

    def _linha(linha):
        cadastro_id = linha.get("prestador_cadastro_id")
        if pd.notna(cadastro_id) and int(cadastro_id) in cadastro.index:
            registro = cadastro.loc[int(cadastro_id)]
            numero_pep = registro.get("numero_pep")
            if registro.get("possui_pep") == "SIM" and numero_pep and str(numero_pep).strip():
                return numero_pep
        return linha.get("peps")

    return df.apply(_linha, axis=1)


# ---------------------------------------------------------------------------
# Situação do PEP (projeto sem PEP: alerta, pendência e lembrete automáticos)
# ---------------------------------------------------------------------------

CRITICIDADE_INFORMATIVO = "INFORMATIVO"
CRITICIDADE_ATENCAO = "ATENÇÃO"
CRITICIDADE_CRITICO = "CRÍTICO"


def _limiares_criticidade_pep() -> tuple[int, int]:
    """
    Lê da tabela `configuracoes` os limiares (em dias) que definem a
    criticidade de um projeto sem PEP — parametrizável via Administração,
    nunca fixo no código-fonte.
    """
    from gat.database import obter_configuracao  # import local evita ciclo

    dias_atencao = int(obter_configuracao("pep_dias_atencao", "3"))
    dias_critico = int(obter_configuracao("pep_dias_critico", "6"))
    return dias_atencao, dias_critico


def criticidade_pep(dias_sem_pep: int) -> str:
    """
    Classifica a criticidade de um projeto sem PEP conforme os limiares
    parametrizáveis: INFORMATIVO, ATENÇÃO ou CRÍTICO.
    """
    dias_atencao, dias_critico = _limiares_criticidade_pep()
    if dias_sem_pep >= dias_critico:
        return CRITICIDADE_CRITICO
    if dias_sem_pep >= dias_atencao:
        return CRITICIDADE_ATENCAO
    return CRITICIDADE_INFORMATIVO


def enriquecer_situacao_pep(df: pd.DataFrame, coluna_pep: str) -> pd.DataFrame:
    """
    Adiciona ao DataFrame as colunas `tem_pep`, `dias_sem_pep` e
    `criticidade_pep`. A contagem de dias sem PEP é calculada a partir da
    Data de Solicitação (data de entrada do projeto no GAT) até hoje,
    permanecendo dinâmica enquanto o campo PEP estiver vazio.
    """
    from datetime import date

    from gat.calendario import _to_date

    if df.empty:
        df["tem_pep"] = pd.Series(dtype=bool)
        df["dias_sem_pep"] = pd.Series(dtype="Int64")
        df["criticidade_pep"] = pd.Series(dtype=str)
        return df

    df = df.copy()
    hoje = date.today()

    def _linha(linha):
        valor_pep = linha.get(coluna_pep)
        # `valor_pep` pode ser NaN (float) quando lido via pandas a partir de
        # uma coluna SQL nula — e bool(nan) é True em Python, então a
        # ausência de PEP precisa ser checada explicitamente com pd.isna()
        # antes de qualquer teste de "verdadeiro" sobre o valor.
        if valor_pep is None or (isinstance(valor_pep, float) and pd.isna(valor_pep)):
            tem_pep = False
        else:
            tem_pep = bool(str(valor_pep).strip())
        if tem_pep:
            return pd.Series({"tem_pep": True, "dias_sem_pep": None, "criticidade_pep": None})
        entrada = _to_date(linha.get("data_solicitacao")) or hoje
        dias = max((hoje - entrada).days, 0)
        return pd.Series({"tem_pep": False, "dias_sem_pep": dias, "criticidade_pep": criticidade_pep(dias)})

    calculados = df.apply(_linha, axis=1)
    return pd.concat([df, calculados], axis=1)


def enriquecer_cessionarios(df: pd.DataFrame) -> pd.DataFrame:
    """
    Adiciona ao DataFrame de cessionários as colunas calculadas
    dinamicamente: `hold_dias`, `saldo_dias_uteis` (Coluna K) e
    `status_entrega_calc`, além das flags de governança.
    """
    from gat.calendario import calcular_hold_dias  # import local evita ciclo

    if df.empty:
        for col in ("hold_dias", "saldo_dias_uteis", "status_entrega_calc", "situacao_pep"):
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
    df = enriquecer_situacao_pep(df, "pep")
    df["situacao_pep"] = df["tem_pep"].map({True: "OK", False: "SEM PEP"})
    return adicionar_flags_governanca(df)


def filtrar_por_competencia(df: pd.DataFrame, coluna: str, mes: int | None, ano: int | None) -> pd.DataFrame:
    """
    Filtra `df` pelo mês/ano de referência (competência) de `coluna` (tipicamente
    `data_solicitacao` para "recebidos" ou `data_analise` para "concluídos").
    `mes`/`ano` iguais a None não filtram por aquela dimensão ("Todos").
    """
    if df.empty or coluna not in df.columns or (mes is None and ano is None):
        return df
    datas = pd.to_datetime(df[coluna], errors="coerce")
    mascara = pd.Series(True, index=df.index)
    if mes is not None:
        mascara &= datas.dt.month == mes
    if ano is not None:
        mascara &= datas.dt.year == ano
    mascara &= datas.notna()
    return df.loc[mascara].copy()
