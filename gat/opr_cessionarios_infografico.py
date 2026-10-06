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

from gat.business_rules import excluir_arts, filtrar_por_competencia
from gat.config import CORES, MESES_PT
from gat.export_word import (
    cabecalho_institucional,
    documento_para_bytes,
    graficos_em_grade,
    nome_arquivo,
    novo_documento,
    observacoes,
    paragrafo,
    rodape_institucional,
    secao,
    tabela_indicadores_compacta,
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

_LAYOUT_BASE = dict(
    font=dict(family="Inter, sans-serif", color=CORES["texto"]),
    plot_bgcolor="rgba(0,0,0,0)",
    paper_bgcolor="rgba(0,0,0,0)",
    margin=dict(l=10, r=10, t=36, b=10),
)


def grafico_disciplinas(dados: list[tuple[str, int, float]]) -> go.Figure:
    if not dados:
        return go.Figure(layout=dict(**_LAYOUT_BASE, title=dict(text="Contribuição das Disciplinas", font=dict(size=14, color=CORES["navy"]))))
    labels = [d for d, _, _ in dados]
    valores = [q for _, q, _ in dados]
    cores = [_CORES_DISCIPLINA.get(l, CORES["ceu"]) for l in labels]
    # `value+percent` (não só `percent`): no papel/PDF impresso não dá pra
    # passar o mouse por cima pra ver o número exato — o rótulo precisa
    # trazer o valor junto, não só a fatia percentual.
    fig = go.Figure(data=[go.Pie(
        labels=labels, values=valores, hole=0.45, marker=dict(colors=cores),
        textinfo="value+percent", textfont=dict(color="#ffffff", size=12),
    )])
    fig.update_layout(**_LAYOUT_BASE, title=dict(text="Contribuição das Disciplinas", font=dict(size=14, color=CORES["navy"])),
                       legend=dict(orientation="v", yanchor="middle", y=0.5, xanchor="left", x=1.02))
    return fig


def grafico_liberados_por_revisao(df_revisao: pd.DataFrame) -> go.Figure:
    titulo = dict(text="Projetos Liberados no Mês", font=dict(size=14, color=CORES["navy"]))
    if df_revisao.empty:
        return go.Figure(layout=dict(**_LAYOUT_BASE, title=titulo))
    rotulos = [f"R{int(r):02d}" for r in df_revisao["revisao"]]
    fig = go.Figure(data=[
        go.Bar(name="Total", x=rotulos, y=df_revisao["total"], marker_color=_COR_TOTAL,
               text=df_revisao["total"], textposition="outside", textfont=dict(color=CORES["texto"], size=12)),
        go.Bar(name="C/ Substituição", x=rotulos, y=df_revisao["com_substituicao"], marker_color=_COR_SUBSTITUICAO,
               text=df_revisao["com_substituicao"], textposition="outside", textfont=dict(color=CORES["texto"], size=12)),
    ])
    fig.update_layout(**_LAYOUT_BASE, title=titulo, barmode="group",
                       legend=dict(orientation="h", yanchor="bottom", y=1.0, xanchor="left", x=0))
    return fig


def grafico_liberado_nao_liberado(liberados: int, nao_liberados: int) -> go.Figure:
    fig = go.Figure(data=[go.Pie(
        labels=["LIBERADO", "NÃO LIBERADO"], values=[liberados, nao_liberados], hole=0.45,
        marker=dict(colors=[_COR_LIBERADO, _COR_NAO_LIBERADO]),
        textinfo="value+percent", textfont=dict(color="#ffffff", size=13),
    )])
    fig.update_layout(**_LAYOUT_BASE, legend=dict(orientation="h", yanchor="bottom", y=-0.15, xanchor="center", x=0.5))
    return fig


def grafico_acumulado_ano(df_acumulado: pd.DataFrame, ano: int) -> go.Figure:
    titulo = dict(text=f"Acumulado do Ano de {ano}", font=dict(size=14, color=CORES["navy"]))
    rotulos = [MESES_PT[m - 1][:3].upper() for m in df_acumulado["mes"]]

    def _texto_segmento(valores: pd.Series) -> list[str]:
        # Oculta o rótulo quando o segmento é 0 (não impresso) — "0" dentro
        # de uma fatia inexistente só polui o gráfico sem informar nada.
        return [str(int(v)) if v else "" for v in valores]

    fig = go.Figure(data=[
        go.Bar(name="Atrasado", x=rotulos, y=df_acumulado["atrasado"], marker_color=_COR_ATRASADO,
               text=_texto_segmento(df_acumulado["atrasado"]), textposition="inside", textfont=dict(color="#ffffff", size=11)),
        go.Bar(name="No Prazo", x=rotulos, y=df_acumulado["no_prazo"], marker_color=_COR_NO_PRAZO,
               text=_texto_segmento(df_acumulado["no_prazo"]), textposition="inside", textfont=dict(color="#ffffff", size=11)),
        go.Bar(name="Adiantado", x=rotulos, y=df_acumulado["adiantado"], marker_color=_COR_ADIANTADO,
               text=_texto_segmento(df_acumulado["adiantado"]), textposition="inside", textfont=dict(color="#ffffff", size=11)),
    ])
    # Total acima de cada barra — não dá pra somar os 3 segmentos de cabeça
    # olhando o papel impresso.
    anotacoes = [
        dict(x=rotulo, y=total, text=f"<b>{int(total)}</b>", showarrow=False, yshift=10, font=dict(size=12, color=CORES["navy"]))
        for rotulo, total in zip(rotulos, df_acumulado["total"]) if total
    ]
    fig.update_layout(**_LAYOUT_BASE, title=titulo, barmode="stack", annotations=anotacoes,
                       legend=dict(orientation="h", yanchor="bottom", y=1.0, xanchor="left", x=0))
    return fig


# ---------------------------------------------------------------------------
# Versão Word (.docx) — totalmente editável, para anotar ou corrigir dados
# diretamente no documento (mesmo mecanismo já usado no OPR institucional
# de `views/relatorios_mensais.py`): Resumo e Cessionários Ativos entram
# como tabelas nativas do Word (texto real, editável célula a célula); só
# os gráficos são imagens individuais (Kaleido), cada um podendo ser
# removido/movido sem afetar o resto do documento.
# ---------------------------------------------------------------------------


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

    tabela_indicadores_compacta(doc, [
        ("Análises Emitidas", resumo["analises_emitidas"]),
        ("Docs Analisados", resumo["documentos"]),
        ("Adiantados", f"{resumo['adiantados']} ({resumo['adiantados_pct']}%)"),
        ("No Prazo", f"{resumo['no_prazo']} ({resumo['no_prazo_pct']}%)"),
        ("Atrasados", f"{resumo['atrasados']} ({resumo['atrasados_pct']}%)"),
    ], titulo="Resumo", colunas=3)

    secao(doc, "Cessionários Ativos", nivel=2)
    if cessionarios_ativos:
        tabela = doc.add_table(rows=1, cols=2)
        tabela.style = "Light Grid Accent 1"
        tabela.rows[0].cells[0].text = "Categoria"
        tabela.rows[0].cells[0].paragraphs[0].runs[0].font.bold = True
        tabela.rows[0].cells[1].text = "Quantidade"
        tabela.rows[0].cells[1].paragraphs[0].runs[0].font.bold = True
        for categoria, quantidade in cessionarios_ativos:
            linha = tabela.add_row()
            linha.cells[0].text = str(categoria)
            linha.cells[1].text = str(quantidade)
        doc.add_paragraph()
    else:
        paragrafo(doc, "Nenhum cessionário ativo cadastrado — gerencie em Cessionários > Cessionários Ativos.", italico=True)

    secao(doc, "Gráficos", nivel=2)
    graficos_em_grade(doc, [
        {"fig": grafico_disciplinas(disciplinas), "titulo": "Contribuição das Disciplinas"},
        {"fig": grafico_liberados_por_revisao(por_revisao), "titulo": "Projetos Liberados no Mês"},
        {"fig": grafico_liberado_nao_liberado(resumo["liberados"], resumo["nao_liberados"]), "titulo": "Liberado × Não Liberado"},
    ], colunas=3, largura_cm=6.0)
    graficos_em_grade(doc, [
        {"fig": grafico_acumulado_ano(acumulado_atual, ano), "titulo": f"Acumulado do Ano de {ano}"},
        {"fig": grafico_acumulado_ano(acumulado_anterior, ano - 1), "titulo": f"Acumulado do Ano de {ano - 1}"},
    ], colunas=2, largura_cm=9.0)

    observacoes(doc, "Observações", None, marcador_padrao="Espaço livre para anotações — edite este parágrafo diretamente no Word.")
    rodape_institucional(doc)

    return documento_para_bytes(doc)
