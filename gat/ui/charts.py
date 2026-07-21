"""Fábrica de gráficos Plotly interativos com a paleta institucional Tecnoplano."""

from __future__ import annotations

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from gat.config import CORES, CORES_STATUS_ANALISE, CORES_STATUS_ENTREGA, MESES_PT, SEQUENCIA_GRAFICOS

_LAYOUT_PADRAO = dict(
    font=dict(family="Inter, sans-serif", color=CORES["texto"]),
    plot_bgcolor="rgba(0,0,0,0)",
    paper_bgcolor="rgba(0,0,0,0)",
    margin=dict(l=10, r=10, t=40, b=10),
    legend=dict(orientation="h", yanchor="bottom", y=-0.25, xanchor="center", x=0.5),
)


def _aplicar_layout(fig: go.Figure, titulo: str | None = None) -> go.Figure:
    fig.update_layout(**_LAYOUT_PADRAO)
    if titulo:
        fig.update_layout(title=dict(text=titulo, font=dict(size=14, color=CORES["navy"])))
    return fig


def grafico_status_donut(df: pd.DataFrame, coluna: str, titulo: str, mapa_cores: dict[str, str] | None = None) -> go.Figure:
    """Gráfico de rosca com a distribuição de uma coluna categórica (ex.: status de análise)."""
    if df.empty or coluna not in df.columns:
        fig = go.Figure()
        return _aplicar_layout(fig, titulo)
    contagem = df[coluna].fillna("SEM STATUS").value_counts().reset_index()
    contagem.columns = [coluna, "quantidade"]
    if mapa_cores is None:
        mapa_cores = CORES_STATUS_ANALISE if coluna == "status_analise" else CORES_STATUS_ENTREGA
    cores = [mapa_cores.get(v, SEQUENCIA_GRAFICOS[i % len(SEQUENCIA_GRAFICOS)]) for i, v in enumerate(contagem[coluna])]
    fig = go.Figure(
        data=[go.Pie(labels=contagem[coluna], values=contagem["quantidade"], hole=0.55, marker=dict(colors=cores))]
    )
    return _aplicar_layout(fig, titulo)


def _rotulo_ano_mes(ano: int, mes: int) -> str:
    return f"{MESES_PT[mes - 1][:3]}/{str(ano)[2:]}"


def _serie_ano_mes(*dfs: pd.DataFrame) -> list[tuple[int, int]]:
    """Eixo cronológico (ano, mês) cobrindo todo o intervalo presente nos dados —
    evita somar meses de anos diferentes na mesma barra quando os dados
    abrangem mais de um ano (ex.: Junho/2025 e Junho/2026 não são somados)."""
    todas_datas = pd.concat(
        [pd.to_datetime(df["data_analise"], errors="coerce") for df in dfs if not df.empty and "data_analise" in df.columns]
    ).dropna() if any(not df.empty and "data_analise" in df.columns for df in dfs) else pd.Series(dtype="datetime64[ns]")
    if todas_datas.empty:
        return []
    inicio = todas_datas.min()
    fim = todas_datas.max()
    eixo: list[tuple[int, int]] = []
    ano, mes = inicio.year, inicio.month
    while (ano, mes) <= (fim.year, fim.month):
        eixo.append((ano, mes))
        mes += 1
        if mes > 12:
            mes = 1
            ano += 1
    return eixo


def _por_ano_mes(df: pd.DataFrame, eixo: list[tuple[int, int]]) -> pd.Series:
    rotulos = [_rotulo_ano_mes(a, m) for a, m in eixo]
    if df.empty or "data_analise" not in df.columns or not eixo:
        return pd.Series(0, index=rotulos)
    datas = pd.to_datetime(df["data_analise"], errors="coerce").dropna()
    if datas.empty:
        return pd.Series(0, index=rotulos)
    contagem = datas.dt.to_period("M").value_counts()
    valores = [contagem.get(pd.Period(year=a, month=m, freq="M"), 0) for a, m in eixo]
    return pd.Series(valores, index=rotulos)


def grafico_evolucao_mensal(df_prest: pd.DataFrame, df_cess: pd.DataFrame) -> go.Figure:
    """Evolução mensal do volume de pranchas analisadas: Prestadores x Cessionários."""
    eixo = _serie_ano_mes(df_prest, df_cess)
    if not eixo:
        eixo = [(_ano_atual_fallback(), i + 1) for i in range(12)]
    serie_prest = _por_ano_mes(df_prest, eixo)
    serie_cess = _por_ano_mes(df_cess, eixo)

    fig = go.Figure()
    fig.add_trace(go.Bar(x=serie_prest.index, y=serie_prest.values, name="Prestadores", marker_color=CORES["navy"]))
    fig.add_trace(go.Bar(x=serie_cess.index, y=serie_cess.values, name="Cessionários", marker_color=CORES["azul_2"]))
    fig.update_layout(barmode="group")
    return _aplicar_layout(fig, "Evolução Mensal — Pranchas Analisadas")


def grafico_evolucao_mensal_unico(df: pd.DataFrame, nome_serie: str, cor: str) -> go.Figure:
    """Evolução mensal do volume de pranchas analisadas de um único módulo."""
    eixo = _serie_ano_mes(df)
    if not eixo:
        eixo = [(_ano_atual_fallback(), i + 1) for i in range(12)]
    serie = _por_ano_mes(df, eixo)

    fig = go.Figure(go.Bar(x=serie.index, y=serie.values, name=nome_serie, marker_color=cor))
    return _aplicar_layout(fig, f"Evolução Mensal — {nome_serie}")


def _ano_atual_fallback() -> int:
    from datetime import date
    return date.today().year


def grafico_por_categoria(df: pd.DataFrame, coluna: str, titulo: str, cor: str, top_n: int | None = None) -> go.Figure:
    """Gráfico de barras genérico de contagem por uma coluna categórica (ex.: Tipo, Cessionário)."""
    if df.empty or coluna not in df.columns:
        fig = go.Figure()
        return _aplicar_layout(fig, titulo)
    contagem = df[coluna].value_counts()
    if top_n:
        contagem = contagem.head(top_n)
    contagem = contagem.reset_index()
    contagem.columns = [coluna, "quantidade"]
    fig = px.bar(contagem, x=coluna, y="quantidade", color_discrete_sequence=[cor])
    fig.update_xaxes(tickangle=-35)
    return _aplicar_layout(fig, titulo)


def grafico_top_responsaveis(df: pd.DataFrame, coluna_responsavel: str = "responsavel", top_n: int = 10) -> go.Figure:
    """Ranking dos analistas por volume de projetos sob responsabilidade."""
    if df.empty or coluna_responsavel not in df.columns:
        fig = go.Figure()
        return _aplicar_layout(fig, "Volume por Responsável")
    contagem = df[coluna_responsavel].value_counts().head(top_n).sort_values()
    fig = go.Figure(
        go.Bar(x=contagem.values, y=contagem.index, orientation="h", marker_color=CORES["navy"])
    )
    return _aplicar_layout(fig, "Volume por Responsável")


def grafico_aging(df: pd.DataFrame, coluna_dias: str) -> go.Figure:
    """Histograma de aging: distribuição de dias úteis decorridos/saldo das análises em aberto."""
    if df.empty or coluna_dias not in df.columns:
        fig = go.Figure()
        return _aplicar_layout(fig, "Aging das Análises")
    fig = px.histogram(df, x=coluna_dias, nbins=20, color_discrete_sequence=[CORES["azul_2"]])
    return _aplicar_layout(fig, "Aging das Análises (dias úteis)")


def gauge_sla(percentual_cumprido: float, titulo: str = "SLA Cumprido") -> go.Figure:
    """Indicador (gauge) de percentual de SLA cumprido no prazo, com faixas de cor de governança."""
    cor = CORES["verde"] if percentual_cumprido >= 80 else CORES["dourado"] if percentual_cumprido >= 60 else CORES["vermelho"]
    fig = go.Figure(
        go.Indicator(
            mode="gauge+number",
            value=percentual_cumprido,
            number={"suffix": "%"},
            gauge={
                "axis": {"range": [0, 100]},
                "bar": {"color": cor},
                "steps": [
                    {"range": [0, 60], "color": CORES["vermelho_bg"]},
                    {"range": [60, 80], "color": CORES["dourado_bg"]},
                    {"range": [80, 100], "color": CORES["verde_bg"]},
                ],
            },
        )
    )
    return _aplicar_layout(fig, titulo)


def grafico_situacao_sla_externo(intervalos: pd.DataFrame) -> go.Figure:
    """Rosca com a distribuição dos intervalos entre revisões por situação
    de SLA externo (Dentro do SLA / Próximo do limite / No limite / Fora do
    SLA) — consolidado por código na Linha do Tempo."""
    from gat.revisoes import SITUACAO_SLA_EXTERNO_CORES

    mapa_cores = {situacao: CORES[chave] for situacao, chave in SITUACAO_SLA_EXTERNO_CORES.items()}
    return grafico_status_donut(intervalos, "situacao_sla", "Situação do Retorno Externo (SLA)", mapa_cores)


def grafico_evolucao_mensal_retorno(intervalos: pd.DataFrame) -> go.Figure:
    """Evolução mensal do tempo médio de retorno externo (dias úteis),
    tomando a data de entrada da revisão atual como referência temporal."""
    titulo = "Evolução Mensal — Tempo Médio de Retorno Externo"
    if intervalos.empty:
        return _aplicar_layout(go.Figure(), titulo)
    datas = pd.to_datetime(intervalos["data_entrada_atual"], errors="coerce")
    serie = intervalos.assign(_periodo=datas.dt.to_period("M")).dropna(subset=["_periodo"])
    if serie.empty:
        return _aplicar_layout(go.Figure(), titulo)
    agrupado = serie.groupby("_periodo")["dias_uteis_retorno"].mean().sort_index()
    rotulos = [_rotulo_ano_mes(p.year, p.month) for p in agrupado.index]
    fig = go.Figure(go.Scatter(x=rotulos, y=agrupado.values.round(1), mode="lines+markers", line=dict(color=CORES["navy"])))
    fig.add_hline(y=10, line_dash="dash", line_color=CORES["vermelho"], annotation_text="SLA (10 dias úteis)")
    return _aplicar_layout(fig, titulo)


def grafico_projetos_por_revisao(intervalos: pd.DataFrame) -> go.Figure:
    """Quantidade de intervalos calculados por número da revisão atual —
    evidencia em qual revisão os projetos mais concentram atraso no
    reenvio."""
    titulo = "Projetos por Revisão"
    if intervalos.empty:
        return _aplicar_layout(go.Figure(), titulo)
    contagem = intervalos["revisao_atual"].value_counts().sort_index()
    fig = go.Figure(go.Bar(x=[f"REV{int(r):02d}" for r in contagem.index], y=contagem.values, marker_color=CORES["azul_2"]))
    return _aplicar_layout(fig, titulo)


def grafico_top_atraso_entidades(resumo_codigo: pd.DataFrame, top_n: int = 10) -> go.Figure:
    """Ranking dos Prestadores/Cessionários (por código) com maior tempo
    médio de retorno externo — os principais gargalos."""
    titulo = "Maior Tempo Médio de Retorno Externo (dias úteis)"
    if resumo_codigo.empty:
        return _aplicar_layout(go.Figure(), titulo)
    top = resumo_codigo.sort_values("media_dias", ascending=False).head(top_n).sort_values("media_dias")
    rotulos = [f"{r['codigo'] or r['nome']} — {r['nome']}" for _, r in top.iterrows()]
    fig = go.Figure(go.Bar(x=top["media_dias"], y=rotulos, orientation="h", marker_color=CORES["laranja"]))
    return _aplicar_layout(fig, titulo)


def grafico_interno_vs_externo(media_interno: float, media_externo: float) -> go.Figure:
    """Comparação entre o tempo médio de análise interna (Tecnoplano) e o
    tempo médio de retorno externo (Prestador/Cessionário)."""
    fig = go.Figure(go.Bar(
        x=["Análise interna (Tecnoplano)", "Retorno externo (Prestador/Cessionário)"],
        y=[media_interno, media_externo],
        marker_color=[CORES["navy"], CORES["laranja"]],
    ))
    return _aplicar_layout(fig, "Tempo Médio — Interno x Externo (dias úteis)")


def grafico_por_revisao(df: pd.DataFrame, coluna_revisao: str = "revisao") -> go.Figure:
    """Quantidade de projetos por número de revisão atual — usado no OPR
    executivo para evidenciar em qual revisão os projetos se concentram."""
    titulo = "Projetos por Revisão"
    if df.empty or coluna_revisao not in df.columns:
        return _aplicar_layout(go.Figure(), titulo)
    contagem = df[coluna_revisao].dropna().astype(int).value_counts().sort_index()
    fig = go.Figure(go.Bar(x=[f"REV{r:02d}" for r in contagem.index], y=contagem.values, marker_color=CORES["navy"]))
    return _aplicar_layout(fig, titulo)


def grafico_aprovacao_rev2(meta_rev2: dict) -> go.Figure:
    """Distribuição dos projetos aprovados por revisão (REV0/REV1/REV2/
    acima da REV2) frente à meta corporativa de aprovação até a REV2."""
    titulo = "Aprovação até a REV2"
    categorias = ["REV0", "REV1", "REV2", "Acima da REV2"]
    valores = [
        meta_rev2.get("aprovados_rev0", 0), meta_rev2.get("aprovados_rev1", 0),
        meta_rev2.get("aprovados_rev2", 0), meta_rev2.get("acima_rev2", 0),
    ]
    cores = [CORES["verde"], CORES["lima"], CORES["dourado"], CORES["vermelho"]]
    fig = go.Figure(go.Bar(x=categorias, y=valores, marker_color=cores))
    fig.add_annotation(
        text=f"{meta_rev2.get('percentual_atual', 0)}% até a REV2 (meta: {meta_rev2.get('meta', 80)}%)",
        xref="paper", yref="paper", x=0.5, y=1.12, showarrow=False,
        font=dict(size=11, color=CORES["texto_fraco"]),
    )
    return _aplicar_layout(fig, titulo)


def grafico_linha_tempo_projeto(intervalos_projeto: pd.DataFrame) -> go.Figure:
    """Linha do tempo visual de UM projeto: dias úteis entre cada par de
    revisões consecutivas, com a barra colorida pela situação de SLA
    daquela transição — usada no Relatório do Prestador/Cessionário."""
    from gat.revisoes import SITUACAO_SLA_EXTERNO_CORES

    titulo = "Linha do Tempo — Dias entre Revisões"
    if intervalos_projeto.empty:
        return _aplicar_layout(go.Figure(), titulo)
    rotulos = [f"REV{int(r['revisao_anterior']):02d}→REV{int(r['revisao_atual']):02d}" for _, r in intervalos_projeto.iterrows()]
    cores = [CORES[SITUACAO_SLA_EXTERNO_CORES.get(s, "texto_dim")] for s in intervalos_projeto["situacao_sla"]]
    fig = go.Figure(go.Bar(x=rotulos, y=intervalos_projeto["dias_uteis_retorno"], marker_color=cores, text=intervalos_projeto["situacao_sla"], textposition="outside"))
    fig.add_hline(y=10, line_dash="dash", line_color=CORES["vermelho"], annotation_text="SLA (10 dias úteis)")
    fig.update_xaxes(tickangle=-20)
    return _aplicar_layout(fig, titulo)


def grafico_disciplina(df: pd.DataFrame, coluna_disciplina: str = "disciplina") -> go.Figure:
    """Distribuição de projetos por disciplina técnica."""
    if df.empty or coluna_disciplina not in df.columns:
        fig = go.Figure()
        return _aplicar_layout(fig, "Projetos por Disciplina")
    contagem = df[coluna_disciplina].value_counts().reset_index()
    contagem.columns = [coluna_disciplina, "quantidade"]
    fig = px.bar(
        contagem, x=coluna_disciplina, y="quantidade",
        color_discrete_sequence=[CORES["navy"]],
    )
    fig.update_xaxes(tickangle=-35)
    return _aplicar_layout(fig, "Projetos por Disciplina")
