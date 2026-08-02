"""
Regras de negócio do módulo PMO (Project Management Office).

Módulo totalmente independente do GAT — nenhuma função aqui é usada pelo
GAT nem depende de `gat.business_rules`. Contém:

* O catálogo dos 14 indicadores configuráveis por projeto (Biblioteca de
  KPIs), com objetivo/fórmula/interpretação/exemplo prático de cada um;
* O cálculo de saúde do projeto, % de execução e próximo marco;
* O motor CPM (Critical Path Method) usado para interpretar automaticamente
  o cronograma anexado (atividades, marcos, dependências e caminho crítico).
"""

from __future__ import annotations

from datetime import date

import pandas as pd

# ---------------------------------------------------------------------------
# Biblioteca de KPIs — catálogo dos 14 indicadores configuráveis
# ---------------------------------------------------------------------------

# Ordem e seleção padrão exatamente como especificado (☑ habilitado por
# padrão ao criar um projeto nesta lista; ☐ desabilitado por padrão) — o
# gerente pode alterar livremente em "Configuração dos Indicadores".
KPI_PADRAO_HABILITADO: dict[str, bool] = {
    "curva_s": True,
    "cronograma": True,
    "financeiro": True,
    "medicoes": True,
    "spi": True,
    "entregaveis": True,
    "avanco_fisico": True,
    "avanco_documental": True,
    "riscos": True,
    "comunicacoes": True,
    "custos": False,
    "cpi": False,
    "bim": False,
    "seguranca": False,
}

KPI_ORDEM: list[str] = list(KPI_PADRAO_HABILITADO.keys())

BIBLIOTECA_KPIS: dict[str, dict[str, str]] = {
    "curva_s": {
        "nome": "Curva S",
        "objetivo": "Comparar o avanço físico planejado com o realizado ao longo do tempo, evidenciando adiantamentos e atrasos acumulados.",
        "formula": "% Planejado = PV acumulado ÷ BAC · 100    |    % Realizado = EV acumulado ÷ BAC ÷ 100",
        "interpretacao": "Curva do realizado abaixo da curva do planejado indica atraso acumulado; acima indica adiantamento. O afastamento entre as duas curvas mede a magnitude do desvio.",
        "exemplo": "Planejado até o mês 6: 60% do escopo. Realizado até o mês 6: 48% do escopo. O projeto está 12 pontos percentuais atrás do planejado.",
    },
    "cronograma": {
        "nome": "Cronograma",
        "objetivo": "Acompanhar atividades, marcos, dependências e o caminho crítico do projeto a partir do arquivo anexado (Excel ou Primavera).",
        "formula": "Caminho crítico via CPM: Folga = Data de Início Tardio − Data de Início Cedo (folga = 0 → atividade crítica).",
        "interpretacao": "Atrasos em atividades do caminho crítico atrasam diretamente a data final do projeto; atrasos fora do caminho crítico podem ser absorvidos pela folga disponível.",
        "exemplo": "Atividade 'Fundação' tem folga = 0 dias → está no caminho crítico. Um atraso de 5 dias nela atrasa a entrega final em 5 dias.",
    },
    "financeiro": {
        "nome": "Financeiro",
        "objetivo": "Acompanhar a execução financeira do contrato frente ao valor contratado.",
        "formula": "Saldo = Valor Contratado − Valor Pago",
        "interpretacao": "Saldo decrescente ao longo do tempo indica avanço normal do desembolso; saldo estagnado com % de execução física alto pode indicar pendência de medição ou aprovação.",
        "exemplo": "Contratado R$ 1.000.000, pago R$ 650.000 → saldo de R$ 350.000 (65% do valor já desembolsado).",
    },
    "medicoes": {
        "nome": "Medições",
        "objetivo": "Acompanhar o ciclo de cada medição mensal: percentual medido, aprovação e pagamento.",
        "formula": "% Aprovado = Valor Aprovado ÷ Valor Medido · 100",
        "interpretacao": "Percentual de aprovação consistentemente baixo indica glosas recorrentes ou divergências entre o medido e o executado, exigindo atenção contratual.",
        "exemplo": "Medição de competência 06/2026: medido R$ 120.000, aprovado R$ 108.000 → 90% de aprovação (10% glosado).",
    },
    "spi": {
        "nome": "SPI – Schedule Performance Index",
        "objetivo": "Avaliar o desempenho do cronograma.",
        "formula": "SPI = EV ÷ PV",
        "interpretacao": "SPI = 1 → Projeto no prazo. SPI > 1 → Projeto adiantado. SPI < 1 → Projeto atrasado.",
        "exemplo": "Planejado: 10 entregáveis. Executados: 8. SPI = 8 ÷ 10 = 0,80. Conclusão: o projeto está executando apenas 80% do planejado.",
    },
    "entregaveis": {
        "nome": "Entregáveis",
        "objetivo": "Acompanhar a relação entre entregáveis previstos e efetivamente entregues.",
        "formula": "% Entregue = Total Entregue ÷ Total Previsto · 100",
        "interpretacao": "Percentual abaixo de 100% na data prevista indica pendências que exigem ação corretiva; deve ser lido em conjunto com o percentual documental.",
        "exemplo": "Previstos 20 entregáveis, entregues 14 → 70% de entrega, 6 pendentes.",
    },
    "avanco_fisico": {
        "nome": "Avanço Físico",
        "objetivo": "Medir o progresso físico efetivamente executado da obra/projeto.",
        "formula": "% Avanço Físico = Quantidade Executada ÷ Quantidade Total Planejada · 100",
        "interpretacao": "Comparado ao avanço documental e ao cronograma, um avanço físico muito maior que o documental indica risco de atraso na formalização/liberação.",
        "exemplo": "Planejados 500 m² de execução, executados 350 m² → 70% de avanço físico.",
    },
    "avanco_documental": {
        "nome": "Avanço Documental",
        "objetivo": "Medir o progresso da documentação técnica do projeto (projetos executivos, ARTs, as-built etc.).",
        "formula": "% Avanço Documental = Documentos Concluídos ÷ Documentos Previstos · 100",
        "interpretacao": "Avanço documental muito abaixo do avanço físico é um risco recorrente de atraso na liberação de medições e no encerramento do contrato.",
        "exemplo": "Previstos 40 documentos técnicos, concluídos 22 → 55% de avanço documental, mesmo com a obra em estágio mais avançado.",
    },
    "riscos": {
        "nome": "Riscos",
        "objetivo": "Identificar, classificar e priorizar os riscos do projeto por meio da matriz Probabilidade × Impacto.",
        "formula": "Classificação = Probabilidade (1-5) × Impacto (1-5)",
        "interpretacao": "Quanto maior o produto, mais crítico o risco: 1-4 baixo, 5-9 médio, 10-14 alto, 15-25 crítico.",
        "exemplo": "Risco 'Atraso na liberação de licença ambiental': probabilidade 4, impacto 5 → classificação 20 (crítico).",
    },
    "comunicacoes": {
        "nome": "Comunicações",
        "objetivo": "Registrar e rastrear as comunicações formais do projeto (reuniões, ofícios, e-mails relevantes, decisões).",
        "formula": "Indicador qualitativo — não possui fórmula numérica; mede-se pela completude e tempestividade dos registros.",
        "interpretacao": "Ausência de registros de comunicações formais em momentos críticos do projeto é um risco de rastreabilidade contratual, não um indicador de desempenho por si só.",
        "exemplo": "Um pedido formal de prorrogação de prazo sem registro na aba de Comunicações fragiliza a defesa contratual do prazo pleiteado.",
    },
    "custos": {
        "nome": "Custos",
        "objetivo": "Acompanhar o custo real incorrido frente ao valor orçado para o trabalho realizado.",
        "formula": "Variação de Custo (CV) = EV − AC",
        "interpretacao": "CV positivo → custo abaixo do orçado (favorável). CV negativo → estouro de custo (desfavorável).",
        "exemplo": "Valor agregado (EV) do trabalho realizado: R$ 200.000. Custo real incorrido (AC): R$ 230.000. CV = −R$ 30.000 (estouro de custo).",
    },
    "cpi": {
        "nome": "CPI – Cost Performance Index",
        "objetivo": "Avaliar a eficiência do uso do orçamento do projeto.",
        "formula": "CPI = EV ÷ AC",
        "interpretacao": "CPI = 1 → dentro do orçamento. CPI > 1 → abaixo do orçamento (eficiente). CPI < 1 → acima do orçamento (estourado).",
        "exemplo": "EV = R$ 200.000, AC = R$ 230.000. CPI = 200.000 ÷ 230.000 = 0,87. Conclusão: o projeto está gastando mais do que o valor agregado, indicando estouro de custo.",
    },
    "bim": {
        "nome": "BIM",
        "objetivo": "Acompanhar a maturidade e as entregas do modelo BIM do projeto conforme o Plano de Execução BIM (PEB) contratado.",
        "formula": "% Maturidade BIM = Etapas do Modelo Concluídas ÷ Etapas Previstas no PEB · 100",
        "interpretacao": "Indicador qualitativo de aderência ao plano BIM contratado; baixa maturidade em etapas avançadas do projeto é risco de incompatibilidades não detectadas.",
        "exemplo": "PEB prevê 8 etapas de modelagem/compatibilização; 5 concluídas → 62,5% de maturidade BIM.",
    },
    "seguranca": {
        "nome": "Segurança",
        "objetivo": "Acompanhar os indicadores de segurança do trabalho na execução do contrato.",
        "formula": "Taxa de Frequência de Acidentes = (Nº de Acidentes × 1.000.000) ÷ Horas-Homem Trabalhadas",
        "interpretacao": "Quanto menor a taxa, melhor o desempenho de segurança; picos de taxa exigem ação corretiva imediata junto à contratada.",
        "exemplo": "2 acidentes registrados em 500.000 horas-homem trabalhadas → taxa de frequência = (2 × 1.000.000) ÷ 500.000 = 4,0.",
    },
}


def rotulo_kpi(chave: str) -> str:
    return BIBLIOTECA_KPIS.get(chave, {}).get("nome", chave)


# ---------------------------------------------------------------------------
# Saúde do projeto, % de execução e próximo marco
# ---------------------------------------------------------------------------

SAUDE_VERDE, SAUDE_AMARELO, SAUDE_VERMELHO = "VERDE", "AMARELO", "VERMELHO"


def calcular_percentual_execucao(atividades: pd.DataFrame) -> float:
    """% de execução do projeto: média do percentual concluído das
    atividades do cronograma vigente, ponderada pela duração de cada uma
    (atividades mais longas pesam mais no avanço global). Retorna 0 quando
    não há cronograma anexado."""
    if atividades is None or atividades.empty:
        return 0.0
    pesos = atividades["duracao_dias"].fillna(1).clip(lower=0.1)
    percentuais = atividades["percentual_concluido"].fillna(0)
    total_peso = pesos.sum()
    if total_peso <= 0:
        return round(percentuais.mean(), 1)
    return round((percentuais * pesos).sum() / total_peso, 1)


def proximo_marco(atividades: pd.DataFrame) -> tuple[str, str | None] | None:
    """Marco (atividade com `e_marco`) ainda não concluído com a data de
    término mais próxima. Retorna None quando não há cronograma ou todos
    os marcos já foram concluídos."""
    if atividades is None or atividades.empty:
        return None
    marcos = atividades[(atividades["e_marco"] == 1) & (atividades["percentual_concluido"].fillna(0) < 100)]
    if marcos.empty:
        return None
    datas = pd.to_datetime(marcos["data_fim"], errors="coerce")
    marcos = marcos.assign(_data_ord=datas).dropna(subset=["_data_ord"]).sort_values("_data_ord")
    if marcos.empty:
        return None
    linha = marcos.iloc[0]
    return linha["nome"], linha["data_fim"]


def calcular_saude_projeto(
    percentual_execucao: float,
    percentual_planejado: float | None,
    tem_atividade_critica_atrasada: bool,
    riscos_criticos_abertos: int,
    alerta_cronograma_ativo: bool,
) -> str:
    """
    Saúde do projeto (semáforo VERDE/AMARELO/VERMELHO), recalculada sempre
    que cronograma, riscos ou o alerta de cronograma pendente mudam —
    heurística transparente, não uma fórmula contratual:

    * VERMELHO — atividade crítica atrasada, ou risco crítico aberto, ou
      desvio de execução (realizado vs. planejado) maior que 15 pontos
      percentuais;
    * AMARELO — alerta de cronograma pendente ainda ativo, ou desvio de
      execução entre 5 e 15 pontos percentuais;
    * VERDE — nenhuma das condições acima.
    """
    if tem_atividade_critica_atrasada or riscos_criticos_abertos > 0:
        return SAUDE_VERMELHO
    if percentual_planejado is not None:
        desvio = percentual_planejado - percentual_execucao
        if desvio > 15:
            return SAUDE_VERMELHO
        if desvio > 5:
            return SAUDE_AMARELO
    if alerta_cronograma_ativo:
        return SAUDE_AMARELO
    return SAUDE_VERDE


# ---------------------------------------------------------------------------
# Curva S e SPI
# ---------------------------------------------------------------------------


def curva_s_planejada(atividades: pd.DataFrame) -> pd.DataFrame:
    """
    Curva planejada (% acumulado do peso do cronograma concluído até cada
    mês, considerando a data de término prevista de cada atividade) — um
    ponto por mês entre o início e o término previstos do cronograma.
    Retorna colunas `data` e `pct_planejado`.
    """
    if atividades is None or atividades.empty:
        return pd.DataFrame()
    pesos = atividades["duracao_dias"].fillna(1).clip(lower=0.1)
    total_peso = pesos.sum()
    if total_peso <= 0:
        return pd.DataFrame()
    datas_fim = pd.to_datetime(atividades["data_fim"], errors="coerce")
    datas_inicio = pd.to_datetime(atividades["data_inicio"], errors="coerce")
    if datas_fim.isna().all() or datas_inicio.isna().all():
        return pd.DataFrame()
    inicio, fim = datas_inicio.min(), datas_fim.max()
    if pd.isna(inicio) or pd.isna(fim) or inicio >= fim:
        return pd.DataFrame()
    pontos = pd.date_range(inicio, fim, freq="MS")
    if fim not in pontos:
        pontos = pontos.append(pd.DatetimeIndex([fim]))
    linhas = [
        {"data": ponto, "pct_planejado": round(pesos[datas_fim <= ponto].sum() / total_peso * 100, 1)}
        for ponto in pontos
    ]
    return pd.DataFrame(linhas)


def percentual_planejado_ate(atividades: pd.DataFrame, data_referencia) -> float:
    """% planejado acumulado até uma data de referência (tipicamente
    hoje) — usado para calcular o desvio de execução e o SPI."""
    if atividades is None or atividades.empty:
        return 0.0
    pesos = atividades["duracao_dias"].fillna(1).clip(lower=0.1)
    total_peso = pesos.sum()
    if total_peso <= 0:
        return 0.0
    datas_fim = pd.to_datetime(atividades["data_fim"], errors="coerce")
    referencia = pd.Timestamp(data_referencia)
    return round(pesos[datas_fim <= referencia].sum() / total_peso * 100, 1)


def calcular_spi(percentual_realizado: float, percentual_planejado: float) -> float | None:
    """SPI = EV ÷ PV, aproximado aqui por % realizado ÷ % planejado (a
    mesma base usada na Curva S). Retorna None quando ainda não há
    planejamento suficiente para o cálculo (ex.: hoje é anterior ao
    início do cronograma)."""
    if not percentual_planejado:
        return None
    return round(percentual_realizado / percentual_planejado, 2)


# ---------------------------------------------------------------------------
# CPM — Critical Path Method
# ---------------------------------------------------------------------------


def calcular_caminho_critico(atividades: pd.DataFrame) -> pd.DataFrame:
    """
    Calcula, a partir das atividades e suas predecessoras (identificadores
    de origem do arquivo importado), a Data de Início Cedo/Tardio, a folga
    e se cada atividade está no caminho crítico (folga = 0).

    Implementação clássica de CPM (forward pass + backward pass) sobre um
    grafo de dependências, em dias relativos — não depende do calendário de
    dias úteis do GAT (o cronograma é uma estrutura própria do PMO).
    Atividades com dependência não resolvida (predecessora inexistente no
    arquivo) são tratadas como sem predecessoras, para nunca travar o
    cálculo por causa de um dado incompleto na planilha de origem.
    """
    if atividades is None or atividades.empty:
        return atividades

    df = atividades.copy().reset_index(drop=True)
    df["duracao_dias"] = pd.to_numeric(df["duracao_dias"], errors="coerce").fillna(0).clip(lower=0)

    por_id = {str(row["identificador_origem"]): idx for idx, row in df.iterrows() if pd.notna(row.get("identificador_origem"))}

    def _predecessoras_indices(valor: str | None) -> list[int]:
        if not valor or not str(valor).strip():
            return []
        indices = []
        for cod in str(valor).split(","):
            cod = cod.strip()
            if cod in por_id:
                indices.append(por_id[cod])
        return indices

    predecessoras_por_indice: dict[int, list[int]] = {
        idx: _predecessoras_indices(row.get("predecessoras")) for idx, row in df.iterrows()
    }
    sucessoras_por_indice: dict[int, list[int]] = {idx: [] for idx in df.index}
    for idx, preds in predecessoras_por_indice.items():
        for pred in preds:
            sucessoras_por_indice[pred].append(idx)

    ordem = _ordenacao_topologica(list(df.index), predecessoras_por_indice)

    inicio_cedo = {idx: 0.0 for idx in df.index}
    fim_cedo = {idx: 0.0 for idx in df.index}
    for idx in ordem:
        preds = predecessoras_por_indice[idx]
        inicio_cedo[idx] = max((fim_cedo[p] for p in preds), default=0.0)
        fim_cedo[idx] = inicio_cedo[idx] + df.at[idx, "duracao_dias"]

    duracao_projeto = max(fim_cedo.values(), default=0.0)

    fim_tardio = {idx: duracao_projeto for idx in df.index}
    inicio_tardio = {idx: duracao_projeto for idx in df.index}
    for idx in reversed(ordem):
        sucs = sucessoras_por_indice[idx]
        fim_tardio[idx] = min((inicio_tardio[s] for s in sucs), default=duracao_projeto)
        inicio_tardio[idx] = fim_tardio[idx] - df.at[idx, "duracao_dias"]

    df["_inicio_cedo"] = [inicio_cedo[idx] for idx in df.index]
    df["_fim_cedo"] = [fim_cedo[idx] for idx in df.index]
    df["_inicio_tardio"] = [inicio_tardio[idx] for idx in df.index]
    df["folga_dias"] = [round(inicio_tardio[idx] - inicio_cedo[idx], 2) for idx in df.index]
    df["caminho_critico"] = (df["folga_dias"] <= 0.01).astype(int)
    return df.drop(columns=["_inicio_cedo", "_fim_cedo", "_inicio_tardio"])


def _ordenacao_topologica(indices: list[int], predecessoras_por_indice: dict[int, list[int]]) -> list[int]:
    """Ordenação topológica (Kahn) do grafo de dependências. Ciclos
    porventura presentes no arquivo de origem (erro de digitação nas
    predecessoras) são quebrados mantendo a ordem original das atividades
    restantes, para nunca travar o processamento do cronograma."""
    grau_entrada = {idx: len(predecessoras_por_indice[idx]) for idx in indices}
    sucessoras: dict[int, list[int]] = {idx: [] for idx in indices}
    for idx, preds in predecessoras_por_indice.items():
        for pred in preds:
            sucessoras[pred].append(idx)

    fila = [idx for idx in indices if grau_entrada[idx] == 0]
    ordenados: list[int] = []
    while fila:
        atual = fila.pop(0)
        ordenados.append(atual)
        for suc in sucessoras[atual]:
            grau_entrada[suc] -= 1
            if grau_entrada[suc] == 0:
                fila.append(suc)

    if len(ordenados) < len(indices):
        restantes = [idx for idx in indices if idx not in ordenados]
        ordenados.extend(restantes)
    return ordenados


# ---------------------------------------------------------------------------
# Alerta automático de cronograma pendente
# ---------------------------------------------------------------------------

TITULO_ALERTA_CRONOGRAMA = "Cronograma pendente de recebimento."
MENSAGEM_LEMBRETE_CRONOGRAMA = (
    "O projeto ainda não possui cronograma anexado. Solicite o cronograma à contratada "
    "para dar continuidade ao acompanhamento do projeto."
)
INTERVALO_LEMBRETE_DIAS_UTEIS_PADRAO = 3


def proximo_lembrete_cronograma(a_partir_de: date, intervalo_dias_uteis: int = INTERVALO_LEMBRETE_DIAS_UTEIS_PADRAO) -> date:
    """Próxima data de lembrete, `intervalo_dias_uteis` dias úteis (seg-sex,
    sem feriados — o PMO não compartilha o calendário de feriados do GAT)
    após `a_partir_de`."""
    from datetime import timedelta

    data = a_partir_de
    dias_avancados = 0
    while dias_avancados < intervalo_dias_uteis:
        data += timedelta(days=1)
        if data.weekday() < 5:
            dias_avancados += 1
    return data
