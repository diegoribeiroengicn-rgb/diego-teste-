"""Relatório individual dos KPIs de Prazo do Analista (item 19) — gerado em
Word, reaproveitando a infraestrutura de exportação já existente. Só pode ser
gerado pelo próprio analista, pelo Gestor ou pelo Administrador (enforcement
já feito na view antes de chamar este módulo)."""

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


def gerar_relatorio_individual_word(analista: str, rotulo_periodo: str, kpis: dict[str, Any], relacao: pd.DataFrame, usuario_responsavel: str) -> bytes:
    doc = novo_documento()
    cabecalho_institucional(
        doc, "Relatório Individual — KPIs de Prazo",
        f"GAT 2026 · Controle de Análises Técnicas · Tecnoplano · Analista: {analista}",
        periodo_label=rotulo_periodo, filtros_aplicados=None, usuario_responsavel=usuario_responsavel,
    )
    secao(doc, "Indicadores", nivel=2)
    tabela_indicadores(doc, [
        ("Total entregue", kpis["total_entregue"]),
        ("Entregues antes do prazo", kpis["antes_prazo"]),
        ("Entregues no dia", kpis["no_dia"]),
        ("Entregues com atraso", kpis["com_atraso"]),
        ("% Cumprimento do prazo", f"{kpis['pct_cumprimento_prazo']}%"),
        ("Análises atualmente atrasadas", kpis["atrasados_em_analise"]),
        ("Vencem em até 2 dias úteis", kpis["vencem_2_dias_uteis"]),
        ("Média dias úteis de antecipação", kpis["media_dias_antecipacao"]),
        ("Média dias úteis de atraso", kpis["media_dias_atraso"]),
    ])
    secao(doc, "Relação de análises", nivel=2)
    tabela_dataframe(doc, relacao)
    rodape_institucional(doc)
    return documento_para_bytes(doc)


def nome_arquivo_kpis_prazo(analista: str) -> str:
    return nome_arquivo("KPIs_Prazo", analista.replace(" ", "_"))
