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
