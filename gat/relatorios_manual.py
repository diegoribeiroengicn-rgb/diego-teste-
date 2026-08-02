"""Exportação do Manual do Sistema em Word e PDF — manual completo ou um
único capítulo, reaproveitando a infraestrutura de exportação já existente."""

from __future__ import annotations

import io

import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from gat.export_word import (
    cabecalho_institucional,
    documento_para_bytes,
    nome_arquivo,
    novo_documento,
    paragrafo,
    rodape_institucional,
    secao,
)

_NAVY = colors.HexColor("#1B3A8A")
_estilos = getSampleStyleSheet()
_ESTILO_TITULO = ParagraphStyle("ManualTitulo", parent=_estilos["Heading1"], textColor=_NAVY, fontSize=16, spaceAfter=4)
_ESTILO_CAPITULO = ParagraphStyle("ManualCapitulo", parent=_estilos["Heading2"], textColor=_NAVY, fontSize=12.5, spaceBefore=10, spaceAfter=4)
_ESTILO_CORPO = ParagraphStyle("ManualCorpo", parent=_estilos["Normal"], fontSize=10, leading=14, spaceAfter=6)


def _texto_pdf(conteudo: str) -> str:
    """Converte a marcação leve usada no manual (negrito **texto**, quebras
    de linha) para HTML simples aceito pelo Paragraph do reportlab."""
    import re

    texto = (conteudo or "").replace("\n\n", "<br/><br/>").replace("\n", "<br/>")
    texto = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", texto)
    return texto


def gerar_word_manual(capitulos: pd.DataFrame, versao: int, usuario_responsavel: str, capitulo_unico: dict | None = None) -> bytes:
    doc = novo_documento()
    titulo = f"Manual do Sistema — {capitulo_unico['titulo']}" if capitulo_unico else "Manual do Sistema GAT"
    cabecalho_institucional(
        doc, titulo, "GAT 2026 · Controle de Análises Técnicas · Tecnoplano",
        periodo_label=f"Versão {versao}", filtros_aplicados=None, usuario_responsavel=usuario_responsavel,
    )
    alvo = [capitulo_unico] if capitulo_unico else capitulos.to_dict("records")
    for capitulo in alvo:
        secao(doc, capitulo["titulo"], nivel=2)
        for paragrafo_texto in (capitulo.get("conteudo") or "Sem conteúdo cadastrado.").split("\n\n"):
            paragrafo(doc, paragrafo_texto.replace("**", ""))
    rodape_institucional(doc)
    return documento_para_bytes(doc)


def gerar_pdf_manual(capitulos: pd.DataFrame, versao: int, capitulo_unico: dict | None = None) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=1.5 * cm, bottomMargin=1.5 * cm, leftMargin=1.8 * cm, rightMargin=1.8 * cm)

    titulo = f"Manual do Sistema — {capitulo_unico['titulo']}" if capitulo_unico else "Manual do Sistema GAT"
    elementos: list = [
        Paragraph(titulo, _ESTILO_TITULO),
        Paragraph(f"GAT 2026 · Controle de Análises Técnicas · Tecnoplano · Versão {versao}", _ESTILO_CORPO),
        Spacer(1, 6),
    ]
    alvo = [capitulo_unico] if capitulo_unico else capitulos.to_dict("records")
    for capitulo in alvo:
        elementos.append(Paragraph(capitulo["titulo"], _ESTILO_CAPITULO))
        elementos.append(Paragraph(_texto_pdf(capitulo.get("conteudo") or "Sem conteúdo cadastrado."), _ESTILO_CORPO))

    doc.build(elementos)
    return buffer.getvalue()


def nome_arquivo_manual(versao: int, capitulo_titulo: str | None = None) -> str:
    if capitulo_titulo:
        return nome_arquivo("Manual_GAT", capitulo_titulo, f"v{versao}")
    return nome_arquivo("Manual_GAT_Completo", f"v{versao}")
