"""
Relatório do Prestador / Relatório do Cessionário — documento Word
completo, com quantas páginas forem necessárias (NÃO é um OPR de uma
única página). Para cada projeto do código selecionado, apresenta: N° AT,
identificação do projeto, todas as revisões existentes, datas de entrada
e saída de cada revisão, tempo de retorno entre revisões (dias úteis E
corridos), tempo médio de resposta interna/externa, tempo total até a
aprovação, a linha do tempo visual de cada revisão e os indicadores de
SLA nas cores padronizadas do sistema (sombreamento de célula).

Quando o código possui mais de um projeto, todos entram no mesmo
documento, cada um em sua própria seção claramente identificada.
"""

from __future__ import annotations

import pandas as pd

from gat.calendario import dias_corridos_entre, dias_uteis_entre
from gat.config import CORES
from gat.export_word import (
    cabecalho_institucional,
    documento_para_bytes,
    grafico,
    nome_arquivo,
    novo_documento,
    observacoes,
    paragrafo,
    rodape_institucional,
    secao,
    sombrear_celula,
    tabela_dataframe,
    tabela_indicadores,
)
from gat.revisoes import SITUACAO_SLA_EXTERNO_CORES, calcular_intervalos_revisao, projetos_por_entidade
from gat.ui.charts import grafico_linha_tempo_projeto

_STATUS_APROVADOS = ["LIBERADO", "LIBERADO C/ REST."]


def _ou_traco(valor) -> str:
    """`str(valor)` protegido contra NaN — `bool(float('nan'))` é `True` em
    Python, então um `valor or '—'` ingênuo deixaria passar o literal "nan"."""
    return str(valor) if pd.notna(valor) and str(valor).strip() else "—"


def _fmt_data(valor) -> str:
    if pd.isna(valor):
        return "—"
    convertido = pd.to_datetime(valor, errors="coerce")
    return convertido.strftime("%d/%m/%Y") if pd.notna(convertido) else "—"


def _tempo_interno_revisao(linha) -> int | None:
    """Dias úteis de análise interna daquela revisão (postagem → resposta
    da Tecnoplano); `None` quando alguma das duas datas está ausente —
    nunca inventado."""
    if pd.isna(linha.get("data_solicitacao")) or pd.isna(linha.get("data_analise")):
        return None
    return dias_uteis_entre(linha["data_solicitacao"], linha["data_analise"])


def _tabela_revisoes(doc, projeto_linhas: pd.DataFrame) -> list[int]:
    """Tabela com TODAS as revisões do projeto: entrada, saída e tempo de
    análise interna de cada uma. Retorna a lista de tempos internos
    válidos (para a média do projeto)."""
    tempos_internos: list[int] = []
    linhas_tabela = []
    for _, linha in projeto_linhas.iterrows():
        tempo_interno = _tempo_interno_revisao(linha)
        if tempo_interno is not None:
            tempos_internos.append(tempo_interno)
        linhas_tabela.append({
            "Revisão": f"REV{int(linha['revisao']):02d}",
            "Data Entrada": _fmt_data(linha.get("data_solicitacao")),
            "Data Saída (resposta)": _fmt_data(linha.get("data_analise")),
            "Status": _ou_traco(linha.get("status_analise")),
            "Tempo interno (dias úteis)": tempo_interno if tempo_interno is not None else "—",
        })
    tabela_dataframe(doc, pd.DataFrame(linhas_tabela), titulo="Revisões do projeto")
    return tempos_internos


def _tabela_intervalos(doc, intervalos_projeto: pd.DataFrame) -> None:
    """Tabela de tempo de retorno entre revisões consecutivas, em dias
    úteis E dias corridos, com a Situação do SLA sombreada na cor
    padronizada do sistema."""
    secao(doc, "Tempo de retorno entre revisões", nivel=3)
    if intervalos_projeto.empty:
        paragrafo(doc, "Este projeto possui apenas uma revisão registrada — não há intervalo entre revisões para calcular.", italico=True)
        return

    tabela = doc.add_table(rows=1, cols=4)
    tabela.style = "Light Grid Accent 1"
    for idx, titulo_coluna in enumerate(["Transição", "Dias Úteis", "Dias Corridos", "Situação do SLA"]):
        celula = tabela.rows[0].cells[idx]
        celula.text = titulo_coluna
        celula.paragraphs[0].runs[0].font.bold = True

    for _, linha in intervalos_projeto.iterrows():
        celulas = tabela.add_row().cells
        celulas[0].text = f"REV{int(linha['revisao_anterior']):02d} → REV{int(linha['revisao_atual']):02d}"
        celulas[1].text = str(linha["dias_uteis_retorno"])
        celulas[2].text = str(int(linha["dias_corridos_retorno"])) if pd.notna(linha["dias_corridos_retorno"]) else "—"
        celulas[3].text = linha["situacao_sla"]
        cor_chave = SITUACAO_SLA_EXTERNO_CORES.get(linha["situacao_sla"], "texto_dim")
        sombrear_celula(celulas[3], CORES[cor_chave])
    doc.add_paragraph()


def _secao_projeto(doc, projeto_linhas: pd.DataFrame, intervalos_projeto: pd.DataFrame) -> None:
    projeto_linhas = projeto_linhas.sort_values("revisao").reset_index(drop=True)
    primeira, ultima = projeto_linhas.iloc[0], projeto_linhas.iloc[-1]

    secao(doc, f"Projeto — AT {_ou_traco(primeira.get('num_at'))} · {_ou_traco(primeira.get('disciplina'))}", nivel=2)
    paragrafo(
        doc,
        f"{len(projeto_linhas)} revisão(ões) registrada(s) · Item {_ou_traco(primeira.get('item'))} · "
        f"Status atual: {_ou_traco(ultima.get('status_analise'))}",
        negrito=True,
    )

    tempos_internos = _tabela_revisoes(doc, projeto_linhas)
    _tabela_intervalos(doc, intervalos_projeto)

    media_interno = round(sum(tempos_internos) / len(tempos_internos), 1) if tempos_internos else None
    intervalos_validos = intervalos_projeto[intervalos_projeto["situacao_sla"] != "DATA INCONSISTENTE"] if not intervalos_projeto.empty else intervalos_projeto
    media_externo_uteis = round(intervalos_validos["dias_uteis_retorno"].mean(), 1) if not intervalos_validos.empty else None
    media_externo_corridos = round(intervalos_validos["dias_corridos_retorno"].dropna().mean(), 1) if not intervalos_validos.empty and intervalos_validos["dias_corridos_retorno"].notna().any() else None

    aprovado = (ultima.get("status_analise") or "") in _STATUS_APROVADOS
    if aprovado and pd.notna(primeira.get("data_solicitacao")) and pd.notna(ultima.get("data_analise")):
        total_uteis = dias_uteis_entre(primeira["data_solicitacao"], ultima["data_analise"])
        total_corridos = dias_corridos_entre(primeira["data_solicitacao"], ultima["data_analise"])
        tempo_total_label = f"{total_uteis} dias úteis / {total_corridos} dias corridos"
    elif aprovado:
        tempo_total_label = "Aprovado, mas com datas incompletas — não é possível calcular o tempo total"
    else:
        tempo_total_label = "Em andamento — ainda não aprovado"

    tabela_indicadores(doc, [
        ("Tempo médio de resposta interna (análise)", f"{media_interno} dias úteis" if media_interno is not None else "—"),
        ("Tempo médio de resposta externa (retorno) — dias úteis", f"{media_externo_uteis}" if media_externo_uteis is not None else "—"),
        ("Tempo médio de resposta externa (retorno) — dias corridos", f"{media_externo_corridos}" if media_externo_corridos is not None else "—"),
        ("Tempo total do projeto até a aprovação", tempo_total_label),
    ])

    if not intervalos_projeto.empty:
        grafico(doc, grafico_linha_tempo_projeto(intervalos_projeto), "Linha do Tempo Visual das Revisões", largura_cm=15.5)

    doc.add_paragraph()


def gerar_relatorio_prestador(
    df_entidade: pd.DataFrame,
    coluna_nome: str,
    modulo: str,
    identificador: str,
    nome_entidade: str,
    periodo_label: str,
    filtros_dict: dict[str, str],
    usuario_label: str,
    observacoes_texto: str | None,
) -> bytes:
    """Gera o Relatório do Prestador (ou Relatório do Cessionário) — Word
    completo, quantas páginas forem necessárias, com uma seção por
    projeto do código selecionado."""
    titulo_tipo = "Prestador" if modulo == "prestadores" else "Cessionário"

    doc = novo_documento()
    cabecalho_institucional(
        doc, f"Relatório do {titulo_tipo} — {identificador} ({nome_entidade})",
        "GAT 2026 · Controle de Análises Técnicas · Tecnoplano",
        periodo_label, filtros_dict, usuario_label,
    )

    if df_entidade.empty:
        paragrafo(doc, "Nenhum projeto encontrado para este código no período/filtros selecionados.", italico=True)
    else:
        intervalos = calcular_intervalos_revisao(df_entidade, coluna_nome)
        projetos = projetos_por_entidade(df_entidade, coluna_nome)
        secao(doc, f"Projetos consolidados ({len(projetos)})", nivel=1)
        for _, projeto in projetos.sort_values(["disciplina", "num_at"]).iterrows():
            projeto_linhas = df_entidade[df_entidade["id"].isin(projeto["ids"])]
            intervalos_projeto = intervalos[intervalos["id"].isin(projeto["ids"])] if not intervalos.empty else intervalos
            _secao_projeto(doc, projeto_linhas, intervalos_projeto)

    observacoes(doc, "Observações gerenciais", observacoes_texto)
    rodape_institucional(doc)
    return documento_para_bytes(doc)


def nome_arquivo_relatorio(modulo: str, identificador: str, *partes_periodo: str) -> str:
    tipo = "Prestador" if modulo == "prestadores" else "Cessionario"
    return nome_arquivo("Relatorio", tipo, identificador, *partes_periodo)
