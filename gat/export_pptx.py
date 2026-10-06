"""
Exportação de relatórios/OPRs em PowerPoint (.pptx) — formato widescreen
(16:9), pensado para apresentação projetada ou em tela, com fontes bem
maiores que o relatório em PDF/A4: títulos, indicadores e textos entram
como caixas de texto nativas do PowerPoint (totalmente editáveis depois),
e cada gráfico é inserido como uma imagem individual em alta resolução
(mesmo mecanismo de `gat.export_word.figura_para_imagem`, reaproveitado
daqui para não duplicar a lógica de renderização/Kaleido) — nunca o slide
inteiro é uma captura de tela.
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
_BRANCO = RGBColor(0xFF, 0xFF, 0xFF)

LARGURA_SLIDE = Inches(13.333)
ALTURA_SLIDE = Inches(7.5)


def nova_apresentacao() -> Presentation:
    """Apresentação widescreen (16:9) em branco — todo o conteúdo
    adicionado a partir daqui é texto/imagem editável, nunca um slide
    gerado como captura de tela única."""
    prs = Presentation()
    prs.slide_width = LARGURA_SLIDE
    prs.slide_height = ALTURA_SLIDE
    return prs


def novo_slide(prs: Presentation):
    """Slide em branco (layout 6 — sem placeholders padrão do PowerPoint,
    que atrapalhariam o posicionamento manual dos elementos)."""
    layout_em_branco = prs.slide_layouts[6]
    return prs.slides.add_slide(layout_em_branco)


def _caixa_texto(slide, texto: str, left, top, width, height, tamanho: float, cor: RGBColor = _NAVY,
                  negrito: bool = False, italico: bool = False, alinhamento=PP_ALIGN.LEFT):
    caixa = slide.shapes.add_textbox(left, top, width, height)
    tf = caixa.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = alinhamento
    run = p.add_run()
    run.text = texto
    run.font.size = Pt(tamanho)
    run.font.color.rgb = cor
    run.font.bold = negrito
    run.font.italic = italico
    return caixa


def slide_capa(prs: Presentation, titulo: str, subtitulo: str, periodo_label: str, usuario_responsavel: str):
    """Slide de abertura — logo, título e subtítulo institucional em fonte
    grande (pensada para o primeiro slide ser lido à distância), igual ao
    cabeçalho do PDF/Word, mas em tamanho de apresentação."""
    slide = novo_slide(prs)
    if LOGO_PATH.exists():
        slide.shapes.add_picture(str(LOGO_PATH), Inches(0.6), Inches(0.5), height=Inches(0.9))
    _caixa_texto(slide, titulo, Inches(0.6), Inches(1.6), Inches(12.0), Inches(1.0), tamanho=40, negrito=True)
    _caixa_texto(slide, subtitulo, Inches(0.6), Inches(2.5), Inches(12.0), Inches(0.6), tamanho=18, cor=_TEXTO_FRACO)
    _caixa_texto(slide, periodo_label, Inches(0.6), Inches(3.2), Inches(12.0), Inches(0.8), tamanho=26, cor=_NAVY, negrito=True)
    rodape_slide(slide, usuario_responsavel)
    return slide


def rodape_slide(slide, usuario_responsavel: str) -> None:
    texto = (
        f"GAT 2026 · Controle de Análises Técnicas · Tecnoplano   ·   "
        f"Gerado em {agora_br().strftime('%d/%m/%Y às %H:%M')}   ·   Responsável: {usuario_responsavel or '—'}"
    )
    _caixa_texto(slide, texto, Inches(0.6), Inches(7.0), Inches(12.0), Inches(0.4), tamanho=10, cor=_TEXTO_FRACO)


def titulo_slide(slide, texto: str) -> None:
    """Título grande no topo de um slide de conteúdo — mesmo papel do
    título do gráfico no PDF/tela, mas em tamanho de apresentação (os
    gráficos inseridos abaixo já trazem seu próprio título também, este é
    o título do slide em si, para quem está vendo projetado de longe)."""
    _caixa_texto(slide, texto, Inches(0.6), Inches(0.3), Inches(12.0), Inches(0.8), tamanho=28, negrito=True)


def mensagem_slide(slide, texto: str, top_in: float = 1.4) -> None:
    """Mensagem simples (ex.: estado vazio) no corpo de um slide de
    conteúdo — texto itálico, cor institucional de texto secundário."""
    _caixa_texto(slide, texto, Inches(0.6), Inches(top_in), Inches(12.0), Inches(0.6), tamanho=16, cor=_TEXTO_FRACO, italico=True)


def adicionar_grafico(slide, fig: go.Figure, left_in: float, top_in: float, width_in: float) -> None:
    """Insere um gráfico Plotly como imagem em alta resolução — o mesmo
    `figura_para_imagem` usado no Word/PDF, garantindo que os rótulos
    numéricos e o tamanho de fonte definidos na figura cheguem idênticos
    ao PowerPoint."""
    imagem_bytes = figura_para_imagem(fig, largura_px=1900, altura_px=950, escala=2.0)
    slide.shapes.add_picture(io.BytesIO(imagem_bytes), Inches(left_in), Inches(top_in), width=Inches(width_in))


def tabela_indicadores_slide(slide, pares: list[tuple[str, object]], left_in: float, top_in: float, width_in: float, colunas: int = 1) -> None:
    """Tabela de indicadores nativa do PowerPoint (editável célula a
    célula), em fonte grande — usada no slide de Resumo."""
    linhas_necessarias = -(-len(pares) // colunas)
    tabela_shape = slide.shapes.add_table(linhas_necessarias, colunas * 2, Inches(left_in), Inches(top_in), Inches(width_in), Inches(0.6 * linhas_necessarias))
    tabela = tabela_shape.table
    for idx, (rotulo, valor) in enumerate(pares):
        linha_idx, bloco_idx = divmod(idx, colunas)
        celula_rotulo = tabela.cell(linha_idx, bloco_idx * 2)
        celula_valor = tabela.cell(linha_idx, bloco_idx * 2 + 1)
        celula_rotulo.text = str(rotulo)
        celula_valor.text = "—" if valor is None else str(valor)
        for celula, negrito, cor in ((celula_rotulo, True, _NAVY), (celula_valor, True, RGBColor(0x1A, 0x1A, 0x1A))):
            run = celula.text_frame.paragraphs[0].runs[0]
            run.font.size = Pt(16)
            run.font.bold = negrito
            run.font.color.rgb = cor
            celula.vertical_anchor = 3  # MSO_ANCHOR.MIDDLE


def tabela_dados_slide(slide, cabecalho: list[str], linhas: list[tuple], left_in: float, top_in: float, width_in: float) -> None:
    """Tabela genérica (ex.: Cessionários Ativos) com cabeçalho em destaque
    — texto nativo, editável."""
    n_linhas = len(linhas) + 1
    tabela_shape = slide.shapes.add_table(n_linhas, len(cabecalho), Inches(left_in), Inches(top_in), Inches(width_in), Inches(0.5 * n_linhas))
    tabela = tabela_shape.table
    for col, texto in enumerate(cabecalho):
        celula = tabela.cell(0, col)
        celula.text = texto
        run = celula.text_frame.paragraphs[0].runs[0]
        run.font.size = Pt(15)
        run.font.bold = True
        run.font.color.rgb = _BRANCO
        celula.fill.solid()
        celula.fill.fore_color.rgb = _NAVY
    for lin_idx, linha in enumerate(linhas, start=1):
        for col_idx, valor in enumerate(linha):
            celula = tabela.cell(lin_idx, col_idx)
            celula.text = str(valor)
            run = celula.text_frame.paragraphs[0].runs[0]
            run.font.size = Pt(14)


def apresentacao_para_bytes(prs: Presentation) -> bytes:
    buffer = io.BytesIO()
    prs.save(buffer)
    return buffer.getvalue()
