"""
Geração da imagem (e do PDF compacto derivado dela) do "Resumo de Conclusão
da Análise" — um card pequeno, no padrão visual Tecnoplano, pronto para
compartilhamento em WhatsApp/Teams/e-mail (não em formato A4).

Usa Pillow (já uma dependência transitiva do Streamlit, declarada aqui de
forma direta) com a fonte DejaVu Sans embutida em `assets/fonts/`, para que
a renderização não dependa de fontes instaladas no sistema operacional do
ambiente de implantação.
"""

from __future__ import annotations

import io
from typing import Any

from PIL import Image, ImageDraw, ImageFont

from gat.config import BASE_DIR, CORES, CORES_STATUS_ANALISE, LOGO_PATH
from gat.horario import agora_br

_FONTES_DIR = BASE_DIR / "assets" / "fonts"
_FONTE_REGULAR = _FONTES_DIR / "DejaVuSans.ttf"
_FONTE_NEGRITO = _FONTES_DIR / "DejaVuSans-Bold.ttf"

_LARGURA = 1200
_MARGEM = 48
_FAIXA_STATUS_LARGURA = 16
_COR_FUNDO = "#FFFFFF"
_COR_TEXTO = CORES["texto"]
_COR_TEXTO_FRACO = CORES["texto_fraco"]
_COR_BORDA = CORES["borda"]


def _fonte(tamanho: int, negrito: bool = False) -> ImageFont.FreeTypeFont:
    caminho = _FONTE_NEGRITO if negrito else _FONTE_REGULAR
    return ImageFont.truetype(str(caminho), tamanho)


def _quebrar_linha(draw: ImageDraw.ImageDraw, texto: str, fonte: ImageFont.FreeTypeFont, largura_max: int) -> list[str]:
    if not texto:
        return [""]
    palavras = texto.split()
    linhas: list[str] = []
    atual = ""
    for palavra in palavras:
        candidato = f"{atual} {palavra}".strip()
        if draw.textlength(candidato, font=fonte) <= largura_max:
            atual = candidato
        else:
            if atual:
                linhas.append(atual)
            atual = palavra
    if atual:
        linhas.append(atual)
    return linhas or [""]


def gerar_card_resumo(dados: dict[str, Any]) -> Image.Image:
    """
    Monta a imagem do Resumo de Conclusão a partir dos dados já resolvidos
    por `gat.resumo_conclusao.montar_dados_resumo` — número da AT, texto de
    disponibilização, prestador/cessionário + obra, disciplina + revisão e
    status por extenso.
    """
    largura_util = _LARGURA - (_MARGEM * 2) - _FAIXA_STATUS_LARGURA - 24

    medidor = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    fonte_rotulo = _fonte(22)
    fonte_at = _fonte(46, negrito=True)
    fonte_linha = _fonte(30)
    fonte_status = _fonte(30, negrito=True)
    fonte_rodape = _fonte(20)

    linhas_at = _quebrar_linha(medidor, dados["numero_at"], fonte_at, largura_util)
    linhas_disp = _quebrar_linha(medidor, dados["texto_disponibilizacao"], fonte_linha, largura_util) if dados["texto_disponibilizacao"] else []
    linhas_entidade = _quebrar_linha(medidor, dados["entidade_obra"], fonte_linha, largura_util)
    linhas_disciplina = _quebrar_linha(medidor, dados["disciplina_revisao"], fonte_linha, largura_util)
    texto_status = f"Status: {dados['status_extenso']}"
    linhas_status = _quebrar_linha(medidor, texto_status, fonte_status, largura_util)

    altura_topo = 130
    altura_linha_at = len(linhas_at) * 58
    altura_linha_disp = len(linhas_disp) * 40 if linhas_disp else 0
    altura_linha_entidade = len(linhas_entidade) * 40
    altura_linha_disciplina = len(linhas_disciplina) * 40
    altura_status = len(linhas_status) * 44 + 24
    altura_rodape = 56
    espacamentos = 18 * 4

    altura_total = (
        altura_topo + altura_linha_at + altura_linha_disp + altura_linha_entidade
        + altura_linha_disciplina + altura_status + altura_rodape + espacamentos + (_MARGEM * 2)
    )
    altura_total = max(altura_total, 560)

    imagem = Image.new("RGB", (_LARGURA, int(altura_total)), _COR_FUNDO)
    draw = ImageDraw.Draw(imagem)

    cor_status = CORES_STATUS_ANALISE.get(dados.get("status_bruto") or "", CORES["texto_fraco"])
    draw.rectangle([0, 0, _FAIXA_STATUS_LARGURA, altura_total], fill=cor_status)

    draw.rectangle([0, 0, _LARGURA - 1, int(altura_total) - 1], outline=_COR_BORDA, width=2)

    x0 = _MARGEM + _FAIXA_STATUS_LARGURA + 24

    try:
        logo = Image.open(LOGO_PATH).convert("RGB")
        proporcao = 56 / logo.height
        logo = logo.resize((max(1, int(logo.width * proporcao)), 56))
        imagem.paste(logo, (x0, 40))
    except (FileNotFoundError, OSError):
        draw.text((x0, 40), "TECNOPLANO", font=fonte_rotulo, fill=_COR_TEXTO)

    texto_topo = "GAT 2026 · Resumo de Conclusão da Análise"
    largura_topo = draw.textlength(texto_topo, font=fonte_rotulo)
    draw.text((_LARGURA - _MARGEM - largura_topo, 56), texto_topo, font=fonte_rotulo, fill=_COR_TEXTO_FRACO)

    y = 40 + 56 + 30
    draw.line([(x0, y), (_LARGURA - _MARGEM, y)], fill=_COR_BORDA, width=2)
    y += 24

    for linha in linhas_at:
        draw.text((x0, y), linha, font=fonte_at, fill=CORES["navy"])
        y += 58
    y += 10

    for linha in linhas_disp:
        draw.text((x0, y), linha, font=fonte_linha, fill=_COR_TEXTO)
        y += 40
    if linhas_disp:
        y += 6

    for linha in linhas_entidade:
        draw.text((x0, y), linha, font=fonte_linha, fill=_COR_TEXTO)
        y += 40
    for linha in linhas_disciplina:
        draw.text((x0, y), linha, font=fonte_linha, fill=_COR_TEXTO)
        y += 40
    y += 18

    largura_pill = max(draw.textlength(l, font=fonte_status) for l in linhas_status) + 48
    altura_pill = len(linhas_status) * 44 + 20
    draw.rounded_rectangle(
        [x0, y, x0 + largura_pill, y + altura_pill], radius=10,
        fill=_tom_claro(cor_status), outline=cor_status, width=2,
    )
    y_texto = y + 10
    for linha in linhas_status:
        draw.text((x0 + 24, y_texto), linha, font=fonte_status, fill=cor_status)
        y_texto += 44

    rodape_y = int(altura_total) - _MARGEM - 24
    draw.line([(x0, rodape_y - 16), (_LARGURA - _MARGEM, rodape_y - 16)], fill=_COR_BORDA, width=2)
    texto_rodape = f"Gerado automaticamente pelo GAT 2026 em {agora_br().strftime('%d/%m/%Y %H:%M')}"
    draw.text((x0, rodape_y), texto_rodape, font=fonte_rodape, fill=_COR_TEXTO_FRACO)

    return imagem


def _tom_claro(cor_hex: str) -> str:
    """Deriva um tom bem claro da cor de status para o fundo da etiqueta,
    mantendo boa legibilidade do texto na mesma cor (mais escura, em negrito)."""
    cor_hex = cor_hex.lstrip("#")
    r, g, b = (int(cor_hex[i:i + 2], 16) for i in (0, 2, 4))
    mistura = lambda c: int(c + (255 - c) * 0.88)
    return f"#{mistura(r):02X}{mistura(g):02X}{mistura(b):02X}"


def imagem_para_png_bytes(imagem: Image.Image) -> bytes:
    buffer = io.BytesIO()
    imagem.save(buffer, format="PNG")
    return buffer.getvalue()


def imagem_para_pdf_bytes(imagem: Image.Image) -> bytes:
    """
    PDF compacto no mesmo tamanho do card (não A4) — o próprio Pillow gera
    uma página do PDF do tamanho exato da imagem fornecida.
    """
    buffer = io.BytesIO()
    imagem.convert("RGB").save(buffer, format="PDF", resolution=150.0)
    return buffer.getvalue()
