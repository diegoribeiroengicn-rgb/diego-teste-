"""Relatórios da Visão do Gestor (individual por analista e consolidado da
equipe) — Word, Excel e PDF, reaproveitando a infraestrutura de exportação
já existente no sistema."""

from __future__ import annotations

from typing import Any

import pandas as pd

from gat.export_pdf import gerar_relatorio_visao_gestor_pdf
from gat.export_projetos import gerar_excel_bytes
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


def gerar_word_visao_gestor(
    titulo: str, kpis: dict[str, Any], painel: pd.DataFrame, prioridades: pd.DataFrame, usuario_responsavel: str,
) -> bytes:
    doc = novo_documento()
    cabecalho_institucional(
        doc, "Visão do Gestor", titulo, periodo_label="Situação atual", filtros_aplicados=None,
        usuario_responsavel=usuario_responsavel,
    )
    secao(doc, "Indicadores executivos", nivel=2)
    tabela_indicadores(doc, list(kpis.items()))
    secao(doc, "Quem está fazendo o quê / Distribuição de carga", nivel=2)
    tabela_dataframe(doc, painel)
    if prioridades is not None and not prioridades.empty:
        secao(doc, "O que deveria estar sendo analisado (Lista de Prioridades)", nivel=2)
        tabela_dataframe(doc, prioridades)
    rodape_institucional(doc)
    return documento_para_bytes(doc)


def gerar_excel_visao_gestor(painel: pd.DataFrame) -> bytes:
    return gerar_excel_bytes(painel, "Visao do Gestor")


def gerar_pdf_visao_gestor(titulo: str, kpis: dict[str, Any], painel: pd.DataFrame) -> bytes:
    return gerar_relatorio_visao_gestor_pdf(titulo, kpis, painel)


def nome_arquivo_visao_gestor(tipo: str, identificador: str | None = None) -> str:
    if tipo == "individual" and identificador:
        return nome_arquivo("VisaoGestor", "Individual", identificador)
    return nome_arquivo("VisaoGestor", "Consolidado")
