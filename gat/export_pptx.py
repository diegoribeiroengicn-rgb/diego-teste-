"""
Exportação do OPR em PowerPoint (.pptx) — UMA ÚNICA PÁGINA/SLIDE,
reproduzindo exatamente a mesma estrutura do One Page Report em PDF
(`gat.export_pdf.gerar_opr_infografico_cessionarios_pdf`): cabeçalho,
linha de cima com 3 gráficos + Resumo/Cessionários Ativos, linha de baixo
com Acumulado do Ano (atual × anterior) — não é uma apresentação de vários
slides, é o mesmo relatório de uma página, só editável e com fontes
maiores (pensadas para tela/projeção, não A4 impresso).

Títulos, indicadores e textos entram como caixas de texto nativas do
PowerPoint (editáveis); cada gráfico é inserido como uma imagem individual
em alta resolução (mesmo mecanismo de `gat.export_word.figura_para_imagem`,
reaproveitado daqui para não duplicar a lógica de renderização/Kaleido).
"""

from __future__ import annotations

import io

import plotly.graph_objects as go
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt

from gat.config import LOGO_PATH
from gat.export_word import figura_para_imagem
from gat.horario import agora_br

_NAVY = RGBColor(0x1B, 0x3A, 0x8A)
_TEXTO_FRACO = RGBColor(0x64, 0x74, 0x8B)
_TEXTO = RGBColor(0x1A, 0x1A, 0x1A)

LARGURA_SLIDE = Inches(13.333)
ALTURA_SLIDE = Inches(7.5)


def nova_apresentacao() -> Presentation:
    """Apresentação widescreen (16:9) em branco, com UM slide só (o OPR é
    uma página, não uma apresentação de vários slides)."""
    prs = Presentation()
    prs.slide_width = LARGURA_SLIDE
    prs.slide_height = ALTURA_SLIDE
    return prs


def novo_slide(prs: Presentation):
    """Slide em branco (layout 6 — sem placeholders padrão do PowerPoint,
    que atrapalhariam o posicionamento manual dos elementos)."""
    layout_em_branco = prs.slide_layouts[6]
    return prs.slides.add_slide(layout_em_branco)


def _caixa_texto(slide, left_in: float, top_in: float, width_in: float, height_in: float):
    caixa = slide.shapes.add_textbox(Inches(left_in), Inches(top_in), Inches(width_in), Inches(height_in))
    caixa.text_frame.word_wrap = True
    return caixa


def _run(paragrafo, texto: str, tamanho: float, cor: RGBColor = _TEXTO, negrito: bool = False, italico: bool = False):
    run = paragrafo.add_run()
    run.text = texto
    run.font.size = Pt(tamanho)
    run.font.color.rgb = cor
    run.font.bold = negrito
    run.font.italic = italico
    return run


def cabecalho_slide(slide, titulo: str, subtitulo: str, periodo_label: str) -> None:
    """Cabeçalho compacto no topo do slide único — logo, título, subtítulo
    institucional e período, em fontes de apresentação (bem maiores que o
    cabeçalho do PDF em A4)."""
    if LOGO_PATH.exists():
        slide.shapes.add_picture(str(LOGO_PATH), Inches(0.3), Inches(0.18), height=Inches(0.55))
    caixa = _caixa_texto(slide, 2.1, 0.12, 9.0, 0.95)
    tf = caixa.text_frame
    p1 = tf.paragraphs[0]
    _run(p1, titulo, tamanho=24, cor=_NAVY, negrito=True)
    p2 = tf.add_paragraph()
    _run(p2, f"{subtitulo}  ·  {periodo_label}", tamanho=13, cor=_TEXTO_FRACO)


def rodape_slide(slide, usuario_responsavel: str) -> None:
    texto = (
        f"GAT 2026 · Controle de Análises Técnicas · Tecnoplano   ·   "
        f"Gerado em {agora_br().strftime('%d/%m/%Y às %H:%M')}   ·   Responsável: {usuario_responsavel or '—'}   ·   Documento editável"
    )
    caixa = _caixa_texto(slide, 0.3, 7.18, 12.7, 0.3)
    _run(caixa.text_frame.paragraphs[0], texto, tamanho=9, cor=_TEXTO_FRACO)


def adicionar_grafico(slide, fig: go.Figure, left_in: float, top_in: float, width_in: float,
                       largura_px: int = 1400, altura_px: int = 900) -> None:
    """Insere um gráfico Plotly como imagem em alta resolução — o mesmo
    `figura_para_imagem` usado no Word/PDF, garantindo que os rótulos
    numéricos e o tamanho de fonte definidos na figura cheguem idênticos
    ao PowerPoint. `largura_px`/`altura_px` seguem a proporção de cada
    gráfico (igual ao já usado na geração do PDF), para não esticar/achatar
    a imagem."""
    imagem_bytes = figura_para_imagem(fig, largura_px=largura_px, altura_px=altura_px, escala=2.0)
    slide.shapes.add_picture(io.BytesIO(imagem_bytes), Inches(left_in), Inches(top_in), width=Inches(width_in))


def bloco_lateral(slide, titulo_ativos: str, linhas_ativos: list[str], titulo_resumo: str, linhas_resumo: list[str],
                   left_in: float, top_in: float, width_in: float) -> None:
    """Bloco de texto "Cessionários Ativos" + "Resumo" (mesmo conteúdo da
    coluna lateral do PDF), em caixas de texto editáveis — fonte maior que
    o PDF para continuar legível mesmo ocupando uma coluna estreita."""
    caixa = _caixa_texto(slide, left_in, top_in, width_in, 5.6)
    tf = caixa.text_frame
    primeiro = True

    def _paragrafo():
        nonlocal primeiro
        if primeiro:
            primeiro = False
            return tf.paragraphs[0]
        return tf.add_paragraph()

    _run(_paragrafo(), titulo_ativos, tamanho=13, cor=_NAVY, negrito=True)
    for linha in linhas_ativos:
        _run(_paragrafo(), linha, tamanho=11, cor=_TEXTO)

    p_espaco = _paragrafo()
    p_espaco.space_before = Pt(8)
    _run(p_espaco, titulo_resumo, tamanho=13, cor=_NAVY, negrito=True)
    for linha in linhas_resumo:
        _run(_paragrafo(), linha, tamanho=11, cor=_TEXTO)


def apresentacao_para_bytes(prs: Presentation) -> bytes:
    buffer = io.BytesIO()
    prs.save(buffer)
    return buffer.getvalue()
