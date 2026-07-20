"""
Exportação de relatórios e OPRs em Microsoft Word (.docx) totalmente
editável — títulos, subtítulos, textos, observações, indicadores, tabelas,
cabeçalhos, rodapés e conclusões são inseridos como conteúdo real do
documento (parágrafos e tabelas nativas do Word), nunca como imagem ou
captura de tela.

Gráficos são a única exceção: são inseridos como imagens individuais em
alta resolução (renderizadas via Kaleido a partir da mesma figura Plotly
usada na tela, reaproveitando o Chromium já instalado no ambiente), cada
uma com título acima e legenda abaixo, podendo ser removida, movida ou
substituída no Word sem afetar o restante do documento — nunca o
documento inteiro é gerado como uma imagem única.
"""

from __future__ import annotations

import io
import re
from datetime import datetime

import pandas as pd
import plotly.graph_objects as go
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt, RGBColor

from gat.config import LOGO_PATH

_NAVY = RGBColor(0x1B, 0x3A, 0x8A)
_TEXTO_FRACO = RGBColor(0x64, 0x74, 0x8B)
_ESTILO_TABELA = "Light Grid Accent 1"

# Chromium do Playwright já provisionado no ambiente — reaproveitado pelo
# Kaleido para renderizar os gráficos Plotly como PNG, evitando um novo
# download de navegador só para a exportação de relatórios.
_KALEIDO_CHROME_PATH = "/opt/pw-browsers/chromium"


def figura_para_imagem(fig: go.Figure, largura_px: int = 1400, altura_px: int = 800, escala: float = 2.0) -> bytes:
    """Renderiza uma figura Plotly como PNG em alta resolução, para
    inserção individual no Word (nunca uma captura da tela inteira)."""
    import kaleido

    return kaleido.calc_fig_sync(
        fig,
        opts={"width": largura_px, "height": altura_px, "scale": escala},
        kopts={"path": _KALEIDO_CHROME_PATH},
    )


def novo_documento() -> Document:
    """Cria um documento Word em branco com a formatação-base institucional
    (fonte, margens) — todo o conteúdo adicionado a partir daqui continua
    integralmente editável pelo usuário final."""
    doc = Document()
    estilo_normal = doc.styles["Normal"]
    estilo_normal.font.name = "Calibri"
    estilo_normal.font.size = Pt(10.5)
    for secao_doc in doc.sections:
        secao_doc.left_margin = Cm(2)
        secao_doc.right_margin = Cm(2)
        secao_doc.top_margin = Cm(1.8)
        secao_doc.bottom_margin = Cm(1.8)
    return doc


def _paragrafo(doc: Document, texto: str, cor: RGBColor | None = None, tamanho: float | None = None, negrito: bool = False):
    p = doc.add_paragraph()
    run = p.add_run(texto)
    if cor is not None:
        run.font.color.rgb = cor
    if tamanho is not None:
        run.font.size = Pt(tamanho)
    run.font.bold = negrito
    return p


def cabecalho_institucional(
    doc: Document,
    titulo: str,
    subtitulo: str,
    periodo_label: str,
    filtros_aplicados: dict[str, str] | None,
    usuario_responsavel: str,
) -> None:
    """Cabeçalho institucional do relatório: logo, título, subtítulo,
    período selecionado, filtros aplicados, data/hora de geração e usuário
    responsável — cada um como parágrafo próprio, editável individualmente."""
    if LOGO_PATH.exists():
        doc.add_picture(str(LOGO_PATH), width=Cm(4.2))

    _paragrafo(doc, titulo, cor=_NAVY, tamanho=18, negrito=True)
    _paragrafo(doc, subtitulo, cor=_TEXTO_FRACO, tamanho=10.5)

    p_periodo = doc.add_paragraph()
    p_periodo.add_run("Período selecionado: ").bold = True
    p_periodo.add_run(periodo_label or "Todos os períodos")

    texto_filtros = "; ".join(f"{k}: {v}" for k, v in (filtros_aplicados or {}).items() if v)
    p_filtros = doc.add_paragraph()
    p_filtros.add_run("Filtros aplicados: ").bold = True
    p_filtros.add_run(texto_filtros or "Nenhum filtro adicional aplicado.")

    p_geracao = doc.add_paragraph()
    p_geracao.add_run("Gerado em: ").bold = True
    p_geracao.add_run(datetime.now().strftime("%d/%m/%Y às %H:%M"))
    p_geracao.add_run("    ·    Responsável: ").bold = True
    p_geracao.add_run(usuario_responsavel or "—")

    doc.add_paragraph()


def secao(doc: Document, titulo: str, nivel: int = 1) -> None:
    doc.add_heading(titulo, level=nivel)


def paragrafo(doc: Document, texto: str, negrito: bool = False, italico: bool = False) -> None:
    p = doc.add_paragraph()
    run = p.add_run(texto)
    run.bold = negrito
    run.italic = italico


def tabela_indicadores(doc: Document, pares: list[tuple[str, object]], titulo: str | None = None) -> None:
    """Tabela de duas colunas (indicador/valor) — cada indicador é uma linha
    editável da tabela nativa do Word."""
    if titulo:
        secao(doc, titulo, nivel=2)
    if not pares:
        paragrafo(doc, "Nenhum indicador disponível para os filtros aplicados.", italico=True)
        return
    tabela = doc.add_table(rows=0, cols=2)
    tabela.style = _ESTILO_TABELA
    for rotulo, valor in pares:
        linha = tabela.add_row()
        linha.cells[0].text = str(rotulo)
        linha.cells[0].paragraphs[0].runs[0].font.bold = True
        linha.cells[1].text = "—" if valor is None else str(valor)
    doc.add_paragraph()


def tabela_dataframe(doc: Document, df: pd.DataFrame, titulo: str | None = None, max_linhas: int | None = None) -> None:
    """Tabela nativa do Word a partir de um DataFrame — cabeçalho e cada
    célula continuam editáveis individualmente."""
    if titulo:
        secao(doc, titulo, nivel=2)
    if df is None or df.empty:
        paragrafo(doc, "Nenhum registro encontrado para os filtros aplicados.", italico=True)
        return
    dados = df.head(max_linhas) if max_linhas else df
    tabela = doc.add_table(rows=1, cols=len(dados.columns))
    tabela.style = _ESTILO_TABELA
    for idx, coluna in enumerate(dados.columns):
        celula = tabela.rows[0].cells[idx]
        celula.text = str(coluna)
        celula.paragraphs[0].runs[0].font.bold = True
    for _, linha in dados.iterrows():
        celulas = tabela.add_row().cells
        for idx, valor in enumerate(linha):
            celulas[idx].text = "—" if pd.isna(valor) else str(valor)
    if max_linhas and len(df) > max_linhas:
        paragrafo(doc, f"Exibindo {max_linhas} de {len(df)} registros — a base completa está disponível na tela de origem.", italico=True)
    doc.add_paragraph()


def grafico(doc: Document, fig: go.Figure, titulo: str, legenda: str | None = None, largura_cm: float = 15.5) -> None:
    """Insere um gráfico como imagem individual em alta resolução, com
    título acima e legenda abaixo — cada gráfico pode ser removido, movido
    ou substituído no Word sem afetar o restante do relatório."""
    _paragrafo(doc, titulo, cor=_NAVY, tamanho=11.5, negrito=True)
    imagem_bytes = figura_para_imagem(fig)
    doc.add_picture(io.BytesIO(imagem_bytes), width=Cm(largura_cm))
    doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
    if legenda:
        p_legenda = doc.add_paragraph()
        p_legenda.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p_legenda.add_run(legenda)
        run.italic = True
        run.font.size = Pt(9)
        run.font.color.rgb = _TEXTO_FRACO
    doc.add_paragraph()


def observacoes(doc: Document, titulo: str, texto: str | None, marcador_padrao: str = "Nenhuma observação registrada para este período.") -> None:
    secao(doc, titulo, nivel=2)
    paragrafo(doc, texto or marcador_padrao)


def rodape_institucional(doc: Document) -> None:
    rodape = doc.sections[0].footer
    p = rodape.paragraphs[0] if rodape.paragraphs else rodape.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("GAT 2026 · Controle de Análises Técnicas · Tecnoplano — documento gerado automaticamente pelo sistema; totalmente editável.")
    run.font.size = Pt(8)
    run.font.color.rgb = _TEXTO_FRACO


def documento_para_bytes(doc: Document) -> bytes:
    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def nome_arquivo(*partes: str) -> str:
    """Monta um nome de arquivo seguro a partir das partes informadas,
    seguindo a convenção institucional (ex.: OPR_Prestador_P0123_Julho_2026.docx)."""
    limpo = [re.sub(r"[^\w-]", "", str(p).replace(" ", "_")) for p in partes if p]
    return "_".join(limpo) + ".docx"
