"""Relatórios do módulo Arquivo — Arquivamentos, Exclusões e Restaurações —
gerados em Word a partir de `arquivo_auditoria` (mesma infraestrutura
genérica de `gat/export_word.py` já usada pelo GAT e pelo PMO)."""

from __future__ import annotations

from datetime import datetime

import pandas as pd

from gat.arquivo_business_rules import TIPO_ARQUIVAMENTO, TIPO_EXCLUSAO, TIPO_RESTAURACAO
from gat.export_word import (
    cabecalho_institucional,
    documento_para_bytes,
    nome_arquivo,
    novo_documento,
    rodape_institucional,
    secao,
    tabela_dataframe,
)

TITULOS_RELATORIO_ARQUIVO = {
    TIPO_ARQUIVAMENTO: "Relatório de Arquivamentos",
    TIPO_RESTAURACAO: "Relatório de Restaurações",
    TIPO_EXCLUSAO: "Relatório de Exclusões",
}

_COLUNAS_RELATORIO = ["data_hora", "tabela", "descricao_registro", "usuario", "origem", "justificativa"]
_RENOMEAR_COLUNAS = {
    "data_hora": "Data/Hora", "tabela": "Tabela", "descricao_registro": "Registro",
    "usuario": "Usuário", "origem": "Origem", "justificativa": "Justificativa",
}


def gerar_relatorio_arquivo(tipo_operacao: str, auditoria: pd.DataFrame, usuario_responsavel: str) -> bytes:
    """`tipo_operacao` é um dos `TIPO_ARQUIVAMENTO`/`TIPO_RESTAURACAO`/`TIPO_EXCLUSAO`."""
    titulo = TITULOS_RELATORIO_ARQUIVO[tipo_operacao]
    doc = novo_documento()
    cabecalho_institucional(
        doc, titulo, "Módulo Arquivo — Sistema GAT 2026", "Todos os períodos",
        {"Tipo de operação": titulo}, usuario_responsavel,
    )

    secao(doc, titulo)
    if auditoria.empty:
        doc.add_paragraph("Nenhuma operação registrada para este relatório.")
    else:
        exibicao = auditoria[_COLUNAS_RELATORIO].rename(columns=_RENOMEAR_COLUNAS).fillna("—")
        tabela_dataframe(doc, exibicao, titulo=f"{len(auditoria)} operação(ões) registrada(s)")

    rodape_institucional(doc)
    return documento_para_bytes(doc)


def nome_arquivo_relatorio_arquivo(tipo_operacao: str) -> str:
    return nome_arquivo("arquivo", tipo_operacao.lower(), datetime.now().strftime("%Y%m%d_%H%M%S"))
