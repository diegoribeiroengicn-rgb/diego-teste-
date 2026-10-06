"""
Geração de relatórios em PDF (relatório mensal por módulo/analistas e o One
Page Report executivo), com identidade visual Tecnoplano, usando reportlab.
"""

from __future__ import annotations

import io
from typing import Any

import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from gat.config import LOGO_PATH

_NAVY = colors.HexColor("#1B3A8A")
_AZUL_2 = colors.HexColor("#2563EB")
_VERDE = colors.HexColor("#16A34A")
_VERMELHO = colors.HexColor("#DC2626")
_CINZA_CLARO = colors.HexColor("#F1F5F9")
_BORDA = colors.HexColor("#E2E8F0")

_estilos = getSampleStyleSheet()
_ESTILO_TITULO = ParagraphStyle("TituloGAT", parent=_estilos["Heading1"], textColor=_NAVY, fontSize=17, spaceAfter=2)
_ESTILO_SUBTITULO = ParagraphStyle("SubtituloGAT", parent=_estilos["Normal"], textColor=colors.HexColor("#64748B"), fontSize=10, spaceAfter=10)
_ESTILO_SECAO = ParagraphStyle("SecaoGAT", parent=_estilos["Heading2"], textColor=_NAVY, fontSize=12, spaceBefore=12, spaceAfter=6)
_ESTILO_CORPO = ParagraphStyle("CorpoGAT", parent=_estilos["Normal"], fontSize=9.5, leading=13)


def _cabecalho(titulo: str, subtitulo: str) -> list:
    elementos: list = []
    if LOGO_PATH.exists():
        try:
            elementos.append(Image(str(LOGO_PATH), width=3.2 * cm, height=1.1 * cm))
            elementos.append(Spacer(1, 6))
        except Exception:
            pass
    elementos.append(Paragraph(titulo, _ESTILO_TITULO))
    elementos.append(Paragraph(subtitulo, _ESTILO_SUBTITULO))
    return elementos


def _tabela_kpis(pares: list[tuple[str, str]]) -> Table:
    dados = [[Paragraph(f"<b>{rotulo}</b>", _ESTILO_CORPO), Paragraph(str(valor), _ESTILO_CORPO)] for rotulo, valor in pares]
    tabela = Table(dados, colWidths=[9 * cm, 6 * cm])
    tabela.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, _BORDA),
        ("BACKGROUND", (0, 0), (0, -1), _CINZA_CLARO),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return tabela


def _tabela_dataframe(df: pd.DataFrame) -> Table:
    cabecalho = [Paragraph(f"<b>{c}</b>", _ESTILO_CORPO) for c in df.columns]
    linhas = [[Paragraph(str(v), _ESTILO_CORPO) for v in linha] for linha in df.itertuples(index=False)]
    tabela = Table([cabecalho] + linhas, repeatRows=1)
    tabela.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, _BORDA),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _CINZA_CLARO]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return tabela


def gerar_relatorio_mensal_pdf(
    titulo_modulo: str,
    competencia_label: str,
    indicadores: dict[str, Any],
    produtividade_df: pd.DataFrame | None = None,
) -> bytes:
    """Relatório mensal em PDF de um módulo (Prestadores/Cessionários/Consolidado)
    ou dos Analistas, respeitando a competência e os filtros já aplicados."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=1.5 * cm, bottomMargin=1.5 * cm, leftMargin=1.8 * cm, rightMargin=1.8 * cm)

    elementos = _cabecalho(
        f"Relatório Mensal — {titulo_modulo}",
        f"GAT 2026 · Controle de Análises Técnicas · Tecnoplano · Competência: {competencia_label}",
    )

    elementos.append(Paragraph("Indicadores do período", _ESTILO_SECAO))
    pares = [(rotulo, str(valor)) for rotulo, valor in indicadores.items()]
    elementos.append(_tabela_kpis(pares))

    if produtividade_df is not None and not produtividade_df.empty:
        elementos.append(Paragraph("Produtividade dos analistas", _ESTILO_SECAO))
        elementos.append(_tabela_dataframe(produtividade_df))

    doc.build(elementos)
    return buffer.getvalue()


def gerar_relatorio_prioridades_pdf(df: pd.DataFrame, kpis: dict[str, Any], individual: dict[str, Any] | None = None) -> bytes:
    """Relatório de Prioridades (item 12) em PDF — coletivo (lista completa
    filtrada) ou individual (um único projeto prioritário), com os mesmos
    campos exibidos na tela Lista de Prioridades."""
    buffer = io.BytesIO()
    pagesize = A4 if individual else landscape(A4)
    doc = SimpleDocTemplate(buffer, pagesize=pagesize, topMargin=1.5 * cm, bottomMargin=1.5 * cm, leftMargin=1.8 * cm, rightMargin=1.8 * cm)

    titulo = "Relatório de Prioridades — Individual" if individual else "Relatório de Prioridades — Coletivo"
    elementos = _cabecalho(titulo, "GAT 2026 · Controle de Análises Técnicas · Tecnoplano")

    if individual:
        elementos.append(Paragraph("Dados do projeto", _ESTILO_SECAO))
        pares = [(rotulo.replace("_", " ").title(), str(valor) if valor is not None else "—") for rotulo, valor in individual.items()]
        elementos.append(_tabela_kpis(pares))
    else:
        elementos.append(Paragraph("Indicadores", _ESTILO_SECAO))
        elementos.append(_tabela_kpis([(rotulo, str(valor)) for rotulo, valor in kpis.items()]))
        elementos.append(Paragraph("Projetos prioritários", _ESTILO_SECAO))
        elementos.append(_tabela_dataframe(df))

    doc.build(elementos)
    return buffer.getvalue()


def gerar_relatorio_visao_gestor_pdf(titulo: str, kpis: dict[str, Any], painel: pd.DataFrame) -> bytes:
    """Visão do Gestor — painel executivo diário da equipe, em PDF
    (indicadores executivos + painel consolidado por analista)."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), topMargin=1.5 * cm, bottomMargin=1.5 * cm, leftMargin=1.8 * cm, rightMargin=1.8 * cm)
    elementos = _cabecalho(f"Visão do Gestor — {titulo}", "GAT 2026 · Controle de Análises Técnicas · Tecnoplano")
    elementos.append(Paragraph("Indicadores executivos", _ESTILO_SECAO))
    elementos.append(_tabela_kpis([(rotulo, str(valor)) for rotulo, valor in kpis.items()]))
    elementos.append(Paragraph("Painel por analista", _ESTILO_SECAO))
    elementos.append(_tabela_dataframe(painel))
    doc.build(elementos)
    return buffer.getvalue()


def gerar_one_page_report_pdf(
    competencia_label: str,
    resumo: dict[str, Any],
    comparativo: dict[str, Any] | None,
    observacoes: str,
) -> bytes:
    """One Page Report — resumo executivo de uma única página para apresentação à gestão."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=1.4 * cm, bottomMargin=1.4 * cm, leftMargin=1.8 * cm, rightMargin=1.8 * cm)

    elementos = _cabecalho(
        "One Page Report — Resumo Executivo",
        f"GAT 2026 · Controle de Análises Técnicas · Tecnoplano · Competência: {competencia_label}",
    )

    linha1 = [
        ("Total de Projetos", resumo.get("total_projetos", 0)),
        ("Projetos — Prestadores", resumo.get("total_prestadores", 0)),
        ("Projetos — Cessionários", resumo.get("total_cessionarios", 0)),
        ("Projetos Concluídos", resumo.get("concluidos", 0)),
        ("Projetos em Análise", resumo.get("em_analise", 0)),
        ("Documentos Analisados", resumo.get("documentos", 0)),
    ]
    linha2 = [
        ("% SLA Cumprido", f"{resumo.get('sla_percentual', 0)}%"),
        ("Backlog do Período", resumo.get("backlog", 0)),
        ("Projetos sem PEP (Prestadores)", resumo.get("sem_pep", 0)),
        ("Produtividade — Projetos/Analista", resumo.get("produtividade_media", 0)),
    ]

    elementos.append(Paragraph("Principais indicadores do mês", _ESTILO_SECAO))
    elementos.append(_tabela_kpis([(r, str(v)) for r, v in linha1]))
    elementos.append(Spacer(1, 6))
    elementos.append(_tabela_kpis([(r, str(v)) for r, v in linha2]))

    if comparativo:
        elementos.append(Paragraph("Comparativo com o mês anterior", _ESTILO_SECAO))
        linhas_comp = [(r, str(v)) for r, v in comparativo.items()]
        elementos.append(_tabela_kpis(linhas_comp))

    elementos.append(Paragraph("Observações gerenciais", _ESTILO_SECAO))
    elementos.append(Paragraph(observacoes or "Nenhuma observação registrada para esta competência.", _ESTILO_CORPO))

    doc.build(elementos)
    return buffer.getvalue()


def gerar_opr_infografico_cessionarios_pdf(
    titulo_mes_ano: str,
    imagens: dict[str, bytes],
    cessionarios_ativos: list[tuple[str, int]],
    resumo: dict,
) -> bytes:
    """One Page Report — Cessionários (infográfico mensal), reproduzindo a
    estrutura do modelo de referência: Contribuição das Disciplinas,
    Projetos Liberados no Mês + Liberado/Não Liberado, Cessionários
    Ativos, Resumo e Acumulado do Ano (atual × anterior). `imagens` traz os
    gráficos já rasterizados (ver `gat.opr_cessionarios_infografico` +
    `gat.export_word.figura_para_imagem`): "disciplinas", "revisao",
    "liberado_donut", "acumulado_atual", "acumulado_anterior"."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(A4),
        topMargin=1.0 * cm, bottomMargin=1.0 * cm, leftMargin=1.2 * cm, rightMargin=1.2 * cm,
    )

    elementos = _cabecalho("GAT Cessionários", f"{titulo_mes_ano} · GAT 2026 · Controle de Análises Técnicas · Tecnoplano")

    def _img(chave: str, largura: float, altura: float):
        conteudo = imagens.get(chave)
        if not conteudo:
            return Paragraph("", _ESTILO_CORPO)
        return Image(io.BytesIO(conteudo), width=largura, height=altura)

    linhas_ativos = [Paragraph(f"• {qtd} {categoria}", _ESTILO_CORPO) for categoria, qtd in cessionarios_ativos] or [
        Paragraph("Nenhum cessionário ativo cadastrado.", _ESTILO_CORPO)
    ]
    bloco_resumo = Table(
        [[Paragraph("<b>CESSIONÁRIOS ATIVOS</b>", _ESTILO_CORPO)]] + [[linha] for linha in linhas_ativos]
        + [[Spacer(1, 6)]]
        + [[Paragraph("<b>RESUMO</b>", _ESTILO_CORPO)]]
        + [[Paragraph(texto, _ESTILO_CORPO)] for texto in (
            f"{resumo.get('analises_emitidas', 0)} análises emitidas",
            f"{resumo.get('documentos', 0)} docs analisados",
            f"{resumo.get('adiantados', 0)} adiantados ({resumo.get('adiantados_pct', 0)}%)",
            f"{resumo.get('no_prazo', 0)} no prazo ({resumo.get('no_prazo_pct', 0)}%)",
            f"{resumo.get('atrasados', 0)} atrasados ({resumo.get('atrasados_pct', 0)}%)",
        )],
        colWidths=[5.2 * cm],
    )
    bloco_resumo.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    linha_topo = Table(
        [[_img("disciplinas", 9 * cm, 6.5 * cm), _img("revisao", 9 * cm, 6.5 * cm), _img("liberado_donut", 5.5 * cm, 6.5 * cm), bloco_resumo]],
        colWidths=[9 * cm, 9 * cm, 5.5 * cm, 5.2 * cm],
    )
    linha_topo.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elementos.append(linha_topo)
    elementos.append(Spacer(1, 6))

    linha_baixo = Table(
        [[_img("acumulado_atual", 13.5 * cm, 6 * cm), _img("acumulado_anterior", 13.5 * cm, 6 * cm)]],
        colWidths=[13.5 * cm, 13.5 * cm],
    )
    linha_baixo.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elementos.append(linha_baixo)

    doc.build(elementos)
    return buffer.getvalue()
