"""Relatórios do módulo PMO (Executivo, Completo, Financeiro, Medições,
Riscos, Cronograma, Pendências) e OPR — Word e Excel, reaproveitando a
infraestrutura de exportação já existente no sistema (`gat.export_word`,
`gat.export_projetos`), sem nenhuma dependência das regras do GAT."""

from __future__ import annotations

from typing import Any

import pandas as pd

import gat.pmo_database as pmodb
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

TITULOS_RELATORIO = {
    "executivo": "Relatório Executivo", "completo": "Relatório Completo", "financeiro": "Relatório Financeiro",
    "medicoes": "Relatório de Medições", "riscos": "Relatório de Riscos", "cronograma": "Relatório do Cronograma",
    "pendencias": "Relatório de Pendências",
}


def _cabecalho_projeto(doc, titulo: str, projeto: dict, usuario: str, compacto: bool = False) -> None:
    subtitulo = f"{projeto['nome']} — Cliente: {projeto.get('cliente') or '—'} · Contratada: {projeto.get('contratada') or '—'}"
    cabecalho_institucional(
        doc, f"PMO — {titulo}", subtitulo, periodo_label="Situação atual", filtros_aplicados=None,
        usuario_responsavel=usuario, compacto=compacto,
    )


def _dados_gerais(projeto: dict) -> list[tuple[str, Any]]:
    return [
        ("Gerente do projeto", projeto.get("gerente") or "—"), ("Status", projeto.get("status") or "—"),
        ("Saúde do projeto", projeto.get("saude") or "—"), ("% de execução", f"{projeto.get('percentual_execucao') or 0:.0f}%"),
        ("Próximo marco", projeto.get("proximo_marco") or "Nenhum marco pendente"),
        ("Data de início", projeto.get("data_inicio") or "—"),
        ("Data prevista de término", projeto.get("data_prevista_termino") or "—"),
        ("Valor contratual", f"R$ {projeto['valor_contratual']:,.2f}" if projeto.get("valor_contratual") else "—"),
    ]


def _secao_financeiro(doc, projeto_id: int) -> None:
    secao(doc, "Financeiro", nivel=2)
    resumo = pmodb.resumo_financeiro(projeto_id)
    tabela_indicadores(doc, [
        ("Valor contratado", f"R$ {resumo['valor_contratado']:,.2f}"), ("Valor medido", f"R$ {resumo['valor_medido']:,.2f}"),
        ("Valor aprovado", f"R$ {resumo['valor_aprovado']:,.2f}"), ("Valor pago", f"R$ {resumo['valor_pago']:,.2f}"),
        ("Valor glosado", f"R$ {resumo['valor_glosado']:,.2f}"), ("Saldo", f"R$ {resumo['saldo']:,.2f}"),
    ])


def _secao_medicoes(doc, projeto_id: int) -> None:
    secao(doc, "Medições", nivel=2)
    medicoes = pmodb.listar_medicoes(projeto_id)
    if medicoes.empty:
        doc.add_paragraph("Nenhuma medição registrada.")
        return
    tabela_dataframe(doc, medicoes[["competencia_mes", "competencia_ano", "percentual", "valor_medido", "situacao", "valor_aprovado", "valor_pago", "valor_glosado"]].rename(columns={
        "competencia_mes": "Mês", "competencia_ano": "Ano", "percentual": "%", "valor_medido": "Medido",
        "situacao": "Situação", "valor_aprovado": "Aprovado", "valor_pago": "Pago", "valor_glosado": "Glosado",
    }))


def _secao_riscos(doc, projeto_id: int, apenas_abertos: bool = False) -> None:
    secao(doc, "Riscos", nivel=2)
    riscos = pmodb.listar_riscos(projeto_id)
    if apenas_abertos and not riscos.empty:
        riscos = riscos[riscos["status"] == "ABERTO"]
    if riscos.empty:
        doc.add_paragraph("Nenhum risco registrado." if not apenas_abertos else "Nenhum risco aberto no momento.")
        return
    exibicao = riscos.copy()
    exibicao["classificacao"] = exibicao["probabilidade"] * exibicao["impacto"]
    tabela_dataframe(doc, exibicao[["descricao", "probabilidade", "impacto", "classificacao", "status", "responsavel"]].rename(columns={
        "descricao": "Descrição", "probabilidade": "Probabilidade", "impacto": "Impacto",
        "classificacao": "Classificação", "status": "Status", "responsavel": "Responsável",
    }))


def _secao_cronograma(doc, projeto_id: int) -> None:
    secao(doc, "Cronograma", nivel=2)
    atividades = pmodb.listar_atividades_cronograma(projeto_id)
    if atividades.empty:
        doc.add_paragraph("Nenhum cronograma anexado.")
        return
    tabela_dataframe(doc, atividades[["nome", "data_inicio", "data_fim", "duracao_dias", "percentual_concluido", "e_marco", "caminho_critico"]].rename(columns={
        "nome": "Atividade", "data_inicio": "Início", "data_fim": "Término", "duracao_dias": "Duração (dias)",
        "percentual_concluido": "% Concluído", "e_marco": "Marco", "caminho_critico": "Caminho Crítico",
    }))


def _secao_pendencias(doc, projeto_id: int) -> None:
    secao(doc, "Pendências", nivel=2)
    entregaveis = pmodb.listar_entregaveis(projeto_id)
    pendentes = entregaveis[entregaveis["entregue"] == 0] if not entregaveis.empty else entregaveis
    doc.add_paragraph("Entregáveis pendentes:").runs[0].bold = True
    if pendentes.empty:
        doc.add_paragraph("Nenhum entregável pendente.")
    else:
        tabela_dataframe(doc, pendentes[["nome", "data_prevista", "percentual_documental"]].rename(columns={
            "nome": "Entregável", "data_prevista": "Data Prevista", "percentual_documental": "% Documental",
        }))
    riscos = pmodb.listar_riscos(projeto_id)
    abertos = riscos[riscos["status"] == "ABERTO"] if not riscos.empty else riscos
    doc.add_paragraph("Riscos abertos:").runs[0].bold = True
    if abertos.empty:
        doc.add_paragraph("Nenhum risco aberto.")
    else:
        tabela_dataframe(doc, abertos[["descricao", "responsavel"]].rename(columns={"descricao": "Descrição", "responsavel": "Responsável"}))
    planos = pmodb.listar_planos_acao_projeto(projeto_id)
    pendentes_plano = planos[planos["status"] != "CONCLUÍDO"] if not planos.empty else planos
    doc.add_paragraph("Planos de ação pendentes:").runs[0].bold = True
    if pendentes_plano.empty:
        doc.add_paragraph("Nenhum plano de ação pendente.")
    else:
        tabela_dataframe(doc, pendentes_plano[["descricao", "responsavel", "prazo", "status"]].rename(columns={
            "descricao": "Descrição", "responsavel": "Responsável", "prazo": "Prazo", "status": "Status",
        }))


def gerar_relatorio_pmo(projeto: dict, tipo: str, habilitados: set[str], usuario: str) -> bytes:
    """Gera um dos 7 relatórios do PMO em Word, incluindo apenas as seções
    cujo KPI correspondente esteja habilitado no projeto (indicadores
    desabilitados nunca aparecem nos relatórios, do mesmo jeito que somem
    do Dashboard)."""
    projeto_id = projeto["id"]
    doc = novo_documento()
    _cabecalho_projeto(doc, TITULOS_RELATORIO.get(tipo, "Relatório"), projeto, usuario)
    secao(doc, "Dados gerais", nivel=2)
    tabela_indicadores(doc, _dados_gerais(projeto))

    if tipo in ("executivo", "completo", "financeiro") and "financeiro" in habilitados:
        _secao_financeiro(doc, projeto_id)
    if tipo in ("completo", "medicoes") and "medicoes" in habilitados:
        _secao_medicoes(doc, projeto_id)
    if tipo in ("executivo", "completo", "riscos") and "riscos" in habilitados:
        _secao_riscos(doc, projeto_id, apenas_abertos=(tipo == "executivo"))
    if tipo in ("completo", "cronograma") and "cronograma" in habilitados:
        _secao_cronograma(doc, projeto_id)
    if tipo in ("completo", "pendencias"):
        _secao_pendencias(doc, projeto_id)

    rodape_institucional(doc)
    return documento_para_bytes(doc)


def gerar_opr_pmo(projeto: dict, habilitados: set[str], usuario: str) -> bytes:
    """OPR (One Page Report) automático do projeto — visão compacta com
    dados gerais, KPIs habilitados, Curva S/Cronograma/Financeiro/
    Medições/Riscos/Pendências e próximos marcos, tudo o que a
    especificação do PMO exige em uma única página."""
    projeto_id = projeto["id"]
    doc = novo_documento()
    _cabecalho_projeto(doc, "OPR — One Page Report", projeto, usuario, compacto=True)
    tabela_indicadores(doc, _dados_gerais(projeto))

    if "cronograma" in habilitados:
        _secao_cronograma(doc, projeto_id)
    if "financeiro" in habilitados:
        _secao_financeiro(doc, projeto_id)
    if "medicoes" in habilitados:
        _secao_medicoes(doc, projeto_id)
    if "riscos" in habilitados:
        _secao_riscos(doc, projeto_id, apenas_abertos=True)
    _secao_pendencias(doc, projeto_id)

    rodape_institucional(doc)
    return documento_para_bytes(doc)


def gerar_excel_relatorio(df: pd.DataFrame, nome_aba: str) -> bytes:
    return gerar_excel_bytes(df, nome_aba)


def nome_arquivo_relatorio_pmo(projeto_nome: str, tipo: str) -> str:
    return nome_arquivo("PMO", projeto_nome.replace(" ", "_"), TITULOS_RELATORIO.get(tipo, tipo))
