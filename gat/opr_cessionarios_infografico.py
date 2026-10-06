"""
One Page Report — Cessionários: infográfico mensal (modelo de referência
"GAT Cessionários", enviado pelo usuário) — reproduz exatamente a mesma
estrutura, campos e lógica de apresentação do modelo: Contribuição das
Disciplinas, Projetos Liberados no Mês (Total × C/ Substituição, por
revisão, com donut Liberado/Não Liberado), Cessionários Ativos, Resumo e
Acumulado do Ano (ano selecionado × ano anterior).

ART não é AT (regra de negócio — ver `gat.business_rules.excluir_arts`):
"análises emitidas"/"projetos liberados" nunca contam uma linha de ART,
mas "documentos analisados" sempre conta (`num_documentos`, inclusive das
linhas de ART).
"""

from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go
from docx.shared import Pt, RGBColor

from gat.business_rules import excluir_arts, filtrar_por_competencia
from gat.config import CORES, MESES_PT
from gat.export_pptx import (
    adicionar_grafico as adicionar_grafico_pptx,
    apresentacao_para_bytes,
    bloco_lateral as bloco_lateral_pptx,
    cabecalho_slide as cabecalho_slide_pptx,
    nova_apresentacao,
    novo_slide,
    rodape_slide as rodape_slide_pptx,
)
from gat.export_word import (
    cabecalho_institucional,
    documento_para_bytes,
    grafico_em_celula,
    novo_documento,
    observacoes,
    rodape_institucional,
)

_COR_ADIANTADO = CORES["verde"]
_COR_NO_PRAZO = CORES["dourado"]
_COR_ATRASADO = CORES["vermelho"]
_COR_LIBERADO = CORES["verde"]
_COR_NAO_LIBERADO = CORES["vermelho"]
_COR_TOTAL = CORES["verde"]
_COR_SUBSTITUICAO = CORES["dourado"]

_STATUS_LIBERADOS = ["LIBERADO", "LIBERADO C/ REST."]

# Paleta fixa por disciplina (mesma lógica de cores do modelo de
# referência — disciplinas conhecidas ganham uma cor estável; qualquer
# outra cai na sequência padrão de gráficos, para nunca ficar sem cor).
_CORES_DISCIPLINA = {
    "ARQUITETURA": CORES["verde"],
    "ELÉTRICA": CORES["dourado"],
    "HVAC": CORES["roxo"],
    "INCÊNDIO": CORES["vermelho"],
    "HIDROSSANITÁRIO": CORES["azul_2"],
    "HIDROSSANTÁRIO": CORES["azul_2"],
    "ESTRUTURA": CORES["texto_dim"],
    "ESTRUTURA (MC)": CORES["texto_dim"],
    "ESTRUTURAS": CORES["texto_dim"],
}


def _rotulo_mes_ano(mes: int, ano: int) -> str:
    return f"{MESES_PT[mes - 1].upper()} {ano}"


def indicadores_disciplinas(df_mes_completo: pd.DataFrame) -> list[tuple[str, int, float]]:
    """`[(disciplina, documentos, percentual)]` — "Contribuição das
    Disciplinas": participação de cada disciplina no total de documentos
    analisados no mês (ART não entra — não é uma disciplina de análise,
    é um documento associado a outra)."""
    if df_mes_completo.empty:
        return []
    base = excluir_arts(df_mes_completo)
    if base.empty:
        return []
    por_disciplina = base.groupby(base["disciplina"].fillna("—"))["num_documentos"].sum()
    por_disciplina = por_disciplina[por_disciplina > 0].sort_values(ascending=False)
    total = por_disciplina.sum()
    if not total:
        return []
    return [(disc, int(qtd), round(100 * qtd / total, 1)) for disc, qtd in por_disciplina.items()]


def indicadores_liberados_por_revisao(df_mes_completo: pd.DataFrame) -> pd.DataFrame:
    """Projetos LIBERADOS/LIBERADOS C/ REST. cuja Data de Análise (conclusão)
    caiu no mês, agrupados por revisão — colunas `total`/`com_substituicao`
    (campo "Esse projeto teve substituição?", ver `gat.ui.modals`)."""
    if df_mes_completo.empty:
        return pd.DataFrame(columns=["revisao", "total", "com_substituicao"])
    base = excluir_arts(df_mes_completo)
    liberados = base[base["status_analise"].isin(_STATUS_LIBERADOS)]
    if liberados.empty:
        return pd.DataFrame(columns=["revisao", "total", "com_substituicao"])
    agrupado = liberados.groupby("revisao").agg(
        total=("id", "count"),
        com_substituicao=("teve_substituicao", lambda s: int(pd.to_numeric(s, errors="coerce").fillna(0).astype(bool).sum())),
    ).reset_index().sort_values("revisao")
    return agrupado


def indicadores_liberado_nao_liberado(df_mes_recebidos: pd.DataFrame) -> tuple[int, int]:
    """(liberados, não liberados) dentre as análises RECEBIDAS no mês
    (ART já excluída pelo chamador), pelo status atual."""
    if df_mes_recebidos.empty:
        return 0, 0
    liberados = int(df_mes_recebidos["status_analise"].isin(_STATUS_LIBERADOS).sum())
    return liberados, len(df_mes_recebidos) - liberados


def resumo_mensal(df_completo: pd.DataFrame, mes: int, ano: int) -> dict:
    """Indicadores do "Resumo" do mês — análises emitidas (ART excluída),
    documentos analisados (ART incluída) e a distribuição Adiantado/No
    Prazo/Atrasado desses documentos, pela situação de entrega (coluna
    `status_entrega_calc`) da linha que os originou."""
    vazio = {
        "analises_emitidas": 0, "documentos": 0,
        "adiantados": 0, "no_prazo": 0, "atrasados": 0,
        "adiantados_pct": 0.0, "no_prazo_pct": 0.0, "atrasados_pct": 0.0,
        "liberados": 0, "nao_liberados": 0,
    }
    if df_completo.empty:
        return vazio

    recebidos_completo = filtrar_por_competencia(df_completo, "data_solicitacao", mes, ano)
    if recebidos_completo.empty:
        return vazio
    documentos = int(recebidos_completo["num_documentos"].fillna(0).sum())

    recebidos = excluir_arts(recebidos_completo)
    analises_emitidas = len(recebidos)
    liberados, nao_liberados = indicadores_liberado_nao_liberado(recebidos)

    docs_por_situacao = recebidos_completo.groupby("status_entrega_calc")["num_documentos"].sum()
    adiantados = int(docs_por_situacao.get("ANTES DO PRAZO", 0))
    no_prazo = int(docs_por_situacao.get("NO PRAZO", 0))
    atrasados = int(docs_por_situacao.get("ATRASADO", 0))
    base_pct = adiantados + no_prazo + atrasados

    return {
        "analises_emitidas": analises_emitidas,
        "documentos": documentos,
        "adiantados": adiantados, "no_prazo": no_prazo, "atrasados": atrasados,
        "adiantados_pct": round(100 * adiantados / base_pct, 1) if base_pct else 0.0,
        "no_prazo_pct": round(100 * no_prazo / base_pct, 1) if base_pct else 0.0,
        "atrasados_pct": round(100 * atrasados / base_pct, 1) if base_pct else 0.0,
        "liberados": liberados, "nao_liberados": nao_liberados,
    }


def acumulado_documentos_por_mes(df_completo: pd.DataFrame, ano: int) -> pd.DataFrame:
    """Para cada mês (1-12) de `ano`: total de documentos recebidos e sua
    distribuição Adiantado/No Prazo/Atrasado — base do gráfico "Acumulado
    do Ano" (cada barra é o total do respectivo mês, não uma soma
    corrida)."""
    linhas = []
    for mes in range(1, 13):
        if df_completo.empty:
            linhas.append({"mes": mes, "adiantado": 0, "no_prazo": 0, "atrasado": 0, "total": 0})
            continue
        recebidos_mes = filtrar_por_competencia(df_completo, "data_solicitacao", mes, ano)
        if recebidos_mes.empty:
            linhas.append({"mes": mes, "adiantado": 0, "no_prazo": 0, "atrasado": 0, "total": 0})
            continue
        por_situacao = recebidos_mes.groupby("status_entrega_calc")["num_documentos"].sum()
        adiantado = int(por_situacao.get("ANTES DO PRAZO", 0))
        no_prazo = int(por_situacao.get("NO PRAZO", 0))
        atrasado = int(por_situacao.get("ATRASADO", 0))
        linhas.append({"mes": mes, "adiantado": adiantado, "no_prazo": no_prazo, "atrasado": atrasado, "total": adiantado + no_prazo + atrasado})
    return pd.DataFrame(linhas)


# ---------------------------------------------------------------------------
# Gráficos (Plotly) — mesmo estilo institucional de `gat.ui.charts`
# ---------------------------------------------------------------------------

# Tamanhos pensados para apresentação projetada/tela (não só relatório
# impresso em A4) — por isso bem maiores que o padrão de um gráfico de
# dashboard comum: título, eixos e legenda precisam ser lidos à distância.
_TAM_TITULO = 20
_TAM_ROTULO = 15
_TAM_LEGENDA = 13

_LAYOUT_BASE = dict(
    font=dict(family="Inter, sans-serif", color=CORES["texto"], size=14),
    plot_bgcolor="rgba(0,0,0,0)",
    paper_bgcolor="rgba(0,0,0,0)",
    margin=dict(l=44, r=10, t=46, b=10),
    yaxis=dict(automargin=True, tickfont=dict(size=13)),
    xaxis=dict(automargin=True, tickfont=dict(size=13)),
)


def _legenda(**kwargs) -> dict:
    """Legenda padrão do infográfico, sempre com a fonte em tamanho de
    apresentação — chame com os mesmos kwargs de posicionamento usados
    antes (orientation/yanchor/y/xanchor/x)."""
    return dict(font=dict(size=_TAM_LEGENDA), **kwargs)


def grafico_disciplinas(dados: list[tuple[str, int, float]]) -> go.Figure:
    if not dados:
        return go.Figure(layout=dict(**_LAYOUT_BASE, title=dict(text="Contribuição das Disciplinas", font=dict(size=_TAM_TITULO, color=CORES["navy"]))))
    labels = [d for d, _, _ in dados]
    valores = [q for _, q, _ in dados]
    cores = [_CORES_DISCIPLINA.get(l, CORES["ceu"]) for l in labels]
    # `value+percent` (não só `percent`): no papel/PDF impresso não dá pra
    # passar o mouse por cima pra ver o número exato — o rótulo precisa
    # trazer o valor junto, não só a fatia percentual.
    fig = go.Figure(data=[go.Pie(
        labels=labels, values=valores, hole=0.45, marker=dict(colors=cores),
        textinfo="value+percent", textfont=dict(color="#ffffff", size=_TAM_ROTULO),
    )])
    fig.update_layout(**_LAYOUT_BASE, title=dict(text="Contribuição das Disciplinas", font=dict(size=_TAM_TITULO, color=CORES["navy"])),
                       legend=_legenda(orientation="v", yanchor="middle", y=0.5, xanchor="left", x=1.02))
    return fig


def grafico_liberados_por_revisao(df_revisao: pd.DataFrame) -> go.Figure:
    titulo = dict(text="Projetos Liberados no Mês", font=dict(size=_TAM_TITULO, color=CORES["navy"]))
    if df_revisao.empty:
        return go.Figure(layout=dict(**_LAYOUT_BASE, title=titulo))
    rotulos = [f"R{int(r):02d}" for r in df_revisao["revisao"]]
    fig = go.Figure(data=[
        go.Bar(name="Total", x=rotulos, y=df_revisao["total"], marker_color=_COR_TOTAL,
               text=df_revisao["total"], textposition="outside", textfont=dict(color=CORES["texto"], size=_TAM_ROTULO)),
        go.Bar(name="C/ Substituição", x=rotulos, y=df_revisao["com_substituicao"], marker_color=_COR_SUBSTITUICAO,
               text=df_revisao["com_substituicao"], textposition="outside", textfont=dict(color=CORES["texto"], size=_TAM_ROTULO)),
    ])
    fig.update_layout(**_LAYOUT_BASE, title=titulo, barmode="group",
                       legend=_legenda(orientation="h", yanchor="bottom", y=1.0, xanchor="left", x=0))
    return fig


def grafico_liberado_nao_liberado(liberados: int, nao_liberados: int) -> go.Figure:
    fig = go.Figure(data=[go.Pie(
        labels=["LIBERADO", "NÃO LIBERADO"], values=[liberados, nao_liberados], hole=0.45,
        marker=dict(colors=[_COR_LIBERADO, _COR_NAO_LIBERADO]),
        textinfo="value+percent", textfont=dict(color="#ffffff", size=_TAM_ROTULO + 1),
    )])
    fig.update_layout(**_LAYOUT_BASE, legend=_legenda(orientation="h", yanchor="bottom", y=-0.15, xanchor="center", x=0.5))
    return fig


def grafico_acumulado_ano(df_acumulado: pd.DataFrame, ano: int) -> go.Figure:
    titulo = dict(text=f"Acumulado do Ano de {ano}", font=dict(size=_TAM_TITULO, color=CORES["navy"]))
    rotulos = [MESES_PT[m - 1][:3].upper() for m in df_acumulado["mes"]]

    def _texto_segmento(valores: pd.Series) -> list[str]:
        # Oculta o rótulo quando o segmento é 0 (não impresso) — "0" dentro
        # de uma fatia inexistente só polui o gráfico sem informar nada.
        return [str(int(v)) if v else "" for v in valores]

    fig = go.Figure(data=[
        go.Bar(name="Atrasado", x=rotulos, y=df_acumulado["atrasado"], marker_color=_COR_ATRASADO,
               text=_texto_segmento(df_acumulado["atrasado"]), textposition="inside", textfont=dict(color="#ffffff", size=_TAM_ROTULO)),
        go.Bar(name="No Prazo", x=rotulos, y=df_acumulado["no_prazo"], marker_color=_COR_NO_PRAZO,
               text=_texto_segmento(df_acumulado["no_prazo"]), textposition="inside", textfont=dict(color="#ffffff", size=_TAM_ROTULO)),
        go.Bar(name="Adiantado", x=rotulos, y=df_acumulado["adiantado"], marker_color=_COR_ADIANTADO,
               text=_texto_segmento(df_acumulado["adiantado"]), textposition="inside", textfont=dict(color="#ffffff", size=_TAM_ROTULO)),
    ])
    # Total acima de cada barra — não dá pra somar os 3 segmentos de cabeça
    # olhando o papel impresso/projetado.
    anotacoes = [
        dict(x=rotulo, y=total, text=f"<b>{int(total)}</b>", showarrow=False, yshift=14, font=dict(size=_TAM_TITULO - 3, color=CORES["navy"]))
        for rotulo, total in zip(rotulos, df_acumulado["total"]) if total
    ]
    fig.update_layout(**_LAYOUT_BASE, title=titulo, barmode="stack", annotations=anotacoes,
                       legend=_legenda(orientation="h", yanchor="bottom", y=1.0, xanchor="left", x=0))
    return fig


# ---------------------------------------------------------------------------
# Versão Word (.docx) e PowerPoint (.pptx) — a MESMA estrutura de página
# única do PDF (`gat.export_pdf.gerar_opr_infografico_cessionarios_pdf`):
# cabeçalho, uma linha com 3 gráficos + bloco "Cessionários Ativos/Resumo",
# e uma segunda linha com os 2 gráficos de Acumulado do Ano — não é um
# layout diferente por formato, é o mesmo relatório, só que editável
# (texto real, não imagem) e com fontes maiores que o A4 impresso.
# ---------------------------------------------------------------------------


def _linhas_resumo_texto(resumo: dict) -> list[str]:
    return [
        f"{resumo['analises_emitidas']} análises emitidas",
        f"{resumo['documentos']} docs analisados",
        f"{resumo['adiantados']} adiantados ({resumo['adiantados_pct']}%)",
        f"{resumo['no_prazo']} no prazo ({resumo['no_prazo_pct']}%)",
        f"{resumo['atrasados']} atrasados ({resumo['atrasados_pct']}%)",
    ]


def _linhas_ativos_texto(cessionarios_ativos: list[tuple[str, int]]) -> list[str]:
    return [f"{qtd} {categoria}" for categoria, qtd in cessionarios_ativos] or ["Nenhum cessionário ativo cadastrado."]


def _bloco_lateral_word(celula, cessionarios_ativos: list[tuple[str, int]], resumo: dict) -> None:
    p_titulo_ativos = celula.paragraphs[0]
    run = p_titulo_ativos.add_run("CESSIONÁRIOS ATIVOS")
    run.font.bold = True
    run.font.size = Pt(9)
    run.font.color.rgb = RGBColor(0x1B, 0x3A, 0x8A)
    for linha in _linhas_ativos_texto(cessionarios_ativos):
        p = celula.add_paragraph()
        p.add_run(linha).font.size = Pt(8.5)

    p_titulo_resumo = celula.add_paragraph()
    p_titulo_resumo.paragraph_format.space_before = Pt(8)
    run_resumo = p_titulo_resumo.add_run("RESUMO")
    run_resumo.font.bold = True
    run_resumo.font.size = Pt(9)
    run_resumo.font.color.rgb = RGBColor(0x1B, 0x3A, 0x8A)
    for linha in _linhas_resumo_texto(resumo):
        p = celula.add_paragraph()
        p.add_run(linha).font.size = Pt(8.5)


def gerar_opr_infografico_cessionarios_word(
    mes: int, ano: int,
    disciplinas: list[tuple[str, int, float]],
    por_revisao: pd.DataFrame,
    resumo: dict,
    cessionarios_ativos: list[tuple[str, int]],
    acumulado_atual: pd.DataFrame,
    acumulado_anterior: pd.DataFrame,
    usuario_responsavel: str,
) -> bytes:
    titulo_mes_ano = _rotulo_mes_ano(mes, ano)

    doc = novo_documento()
    cabecalho_institucional(
        doc, "GAT Cessionários — One Page Report",
        "GAT 2026 · Controle de Análises Técnicas · Tecnoplano",
        titulo_mes_ano, None, usuario_responsavel, compacto=True,
    )

    # Linha de cima: 3 gráficos + bloco lateral (Cessionários Ativos + Resumo) —
    # mesma disposição do PDF, numa única tabela de 4 colunas.
    tabela_topo = doc.add_table(rows=1, cols=4)
    tabela_topo.autofit = True
    celula_disciplinas, celula_revisao, celula_donut, celula_lateral = tabela_topo.rows[0].cells
    grafico_em_celula(celula_disciplinas, grafico_disciplinas(disciplinas), "Contribuição das Disciplinas", largura_cm=5.4)
    grafico_em_celula(celula_revisao, grafico_liberados_por_revisao(por_revisao), "Projetos Liberados no Mês", largura_cm=5.4)
    grafico_em_celula(celula_donut, grafico_liberado_nao_liberado(resumo["liberados"], resumo["nao_liberados"]), "Liberado × Não Liberado", largura_cm=3.6)
    _bloco_lateral_word(celula_lateral, cessionarios_ativos, resumo)
    doc.add_paragraph()

    # Linha de baixo: Acumulado do Ano (ano selecionado × anterior).
    tabela_baixo = doc.add_table(rows=1, cols=2)
    tabela_baixo.autofit = True
    celula_atual, celula_anterior = tabela_baixo.rows[0].cells
    grafico_em_celula(celula_atual, grafico_acumulado_ano(acumulado_atual, ano), f"Acumulado do Ano de {ano}", largura_cm=9.0)
    grafico_em_celula(celula_anterior, grafico_acumulado_ano(acumulado_anterior, ano - 1), f"Acumulado do Ano de {ano - 1}", largura_cm=9.0)
    doc.add_paragraph()

    observacoes(doc, "Observações", None, marcador_padrao="Espaço livre para anotações — edite este parágrafo diretamente no Word.")
    rodape_institucional(doc)

    return documento_para_bytes(doc)


# ---------------------------------------------------------------------------
# Versão PowerPoint (.pptx) — a MESMA estrutura de página única do PDF e do
# Word (ver comentário acima da versão Word): um slide só, cabeçalho + 3
# gráficos/bloco lateral + 2 gráficos de Acumulado do Ano — não é uma
# apresentação de vários slides, é o relatório de sempre, editável, com
# fontes de tamanho de tela/projeção.
# ---------------------------------------------------------------------------


def gerar_opr_infografico_cessionarios_pptx(
    mes: int, ano: int,
    disciplinas: list[tuple[str, int, float]],
    por_revisao: pd.DataFrame,
    resumo: dict,
    cessionarios_ativos: list[tuple[str, int]],
    acumulado_atual: pd.DataFrame,
    acumulado_anterior: pd.DataFrame,
    usuario_responsavel: str,
) -> bytes:
    titulo_mes_ano = _rotulo_mes_ano(mes, ano)

    prs = nova_apresentacao()
    slide = novo_slide(prs)

    cabecalho_slide_pptx(
        slide, "GAT Cessionários — One Page Report",
        "GAT 2026 · Controle de Análises Técnicas · Tecnoplano", titulo_mes_ano,
    )

    # Linha de cima: 3 gráficos + bloco lateral — mesma disposição do PDF.
    adicionar_grafico_pptx(slide, grafico_disciplinas(disciplinas), left_in=0.25, top_in=1.25, width_in=4.1, largura_px=1100, altura_px=800)
    adicionar_grafico_pptx(slide, grafico_liberados_por_revisao(por_revisao), left_in=4.45, top_in=1.25, width_in=4.1, largura_px=1100, altura_px=800)
    adicionar_grafico_pptx(slide, grafico_liberado_nao_liberado(resumo["liberados"], resumo["nao_liberados"]), left_in=8.65, top_in=1.25, width_in=2.55, largura_px=700, altura_px=800)
    bloco_lateral_pptx(
        slide, "CESSIONÁRIOS ATIVOS", _linhas_ativos_texto(cessionarios_ativos),
        "RESUMO", _linhas_resumo_texto(resumo),
        left_in=11.3, top_in=1.25, width_in=1.9,
    )

    # Linha de baixo: Acumulado do Ano (ano selecionado × anterior).
    adicionar_grafico_pptx(slide, grafico_acumulado_ano(acumulado_atual, ano), left_in=0.25, top_in=4.35, width_in=6.3, largura_px=1700, altura_px=750)
    adicionar_grafico_pptx(slide, grafico_acumulado_ano(acumulado_anterior, ano - 1), left_in=6.65, top_in=4.35, width_in=6.3, largura_px=1700, altura_px=750)

    rodape_slide_pptx(slide, usuario_responsavel)

    return apresentacao_para_bytes(prs)
