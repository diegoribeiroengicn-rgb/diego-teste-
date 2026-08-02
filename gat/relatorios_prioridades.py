"""Relatórios de Prioridades (item 12 do módulo de SLA/Prioridades) —
individual (um projeto) e coletivo (lista filtrada), exportáveis em Word,
Excel e PDF, reaproveitando a infraestrutura de exportação já existente."""

from __future__ import annotations

from typing import Any

import pandas as pd

from gat.export_word import (
    cabecalho_institucional,
    documento_para_bytes,
    nome_arquivo,
    novo_documento,
    rodape_institucional,
    secao,
    tabela_dataframe,
    tabela_indicadores,
)

COLUNAS_RELATORIO_PRIORIDADES = {
    "tipo": "Tipo", "nome_entidade": "Prestador/Cessionário", "codigo": "Código",
    "num_at": "N° AT", "disciplina": "Disciplina", "revisao": "Revisão",
    "responsavel": "Responsável", "origem_prioridade": "Origem da prioridade",
    "sla_dias": "SLA vigente (dias)", "sla_original": "SLA original (dias)",
    "dias_restantes": "Dias úteis restantes", "situacao_prazo": "Situação do prazo",
    "justificativa_sla": "Justificativa", "status_analise": "Status de análise",
    "sla_alterado_por": "SLA alterado por", "sla_alterado_em": "SLA alterado em",
}


def _preparar_exibicao(df: pd.DataFrame) -> pd.DataFrame:
    return df.rename(columns=COLUNAS_RELATORIO_PRIORIDADES)[list(COLUNAS_RELATORIO_PRIORIDADES.values())]


def gerar_excel_prioridades(df: pd.DataFrame) -> bytes:
    from gat.export_projetos import gerar_excel_bytes

    return gerar_excel_bytes(_preparar_exibicao(df), "Lista de Prioridades")


def gerar_word_prioridades_coletivo(df: pd.DataFrame, kpis: dict[str, Any], usuario_responsavel: str) -> bytes:
    doc = novo_documento()
    cabecalho_institucional(
        doc, "Relatório de Prioridades — Coletivo",
        "GAT 2026 · Controle de Análises Técnicas · Tecnoplano",
        periodo_label="Situação atual", filtros_aplicados=None, usuario_responsavel=usuario_responsavel,
    )
    secao(doc, "Indicadores", nivel=2)
    tabela_indicadores(doc, list(kpis.items()))
    secao(doc, "Projetos prioritários", nivel=2)
    tabela_dataframe(doc, _preparar_exibicao(df))
    rodape_institucional(doc)
    return documento_para_bytes(doc)


def gerar_word_prioridades_individual(registro: dict[str, Any], usuario_responsavel: str) -> bytes:
    doc = novo_documento()
    cabecalho_institucional(
        doc, "Relatório de Prioridades — Individual",
        f"GAT 2026 · Controle de Análises Técnicas · Tecnoplano · {registro.get('nome_entidade') or '—'}",
        periodo_label="Situação atual", filtros_aplicados=None, usuario_responsavel=usuario_responsavel,
    )
    secao(doc, "Dados do projeto prioritário", nivel=2)
    pares = [(COLUNAS_RELATORIO_PRIORIDADES.get(chave, chave), valor) for chave, valor in registro.items() if chave in COLUNAS_RELATORIO_PRIORIDADES]
    tabela_indicadores(doc, pares)
    rodape_institucional(doc)
    return documento_para_bytes(doc)


def nome_arquivo_prioridades(tipo: str, identificador: str | None = None) -> str:
    if tipo == "individual" and identificador:
        return nome_arquivo("Prioridades", "Individual", identificador)
    return nome_arquivo("Prioridades", "Coletivo")
