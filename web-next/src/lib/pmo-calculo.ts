/** Regras de negócio do módulo PMO (Project Management Office) — mesmo
 * conteúdo de gat/pmo_business_rules.py. Módulo totalmente independente
 * do GAT: nenhuma função aqui depende de administracao-calculo.ts nem de
 * qualquer outro arquivo do GAT. Arquivo puro — zero import de
 * `obterPool`/`pg`, para poder ser importado por componentes client. */

export const SAUDE_VERDE = "VERDE";
export const SAUDE_AMARELO = "AMARELO";
export const SAUDE_VERMELHO = "VERMELHO";
export type Saude = typeof SAUDE_VERDE | typeof SAUDE_AMARELO | typeof SAUDE_VERMELHO;

export const STATUS_PROJETO_OPCOES = ["EM ANDAMENTO", "PAUSADO", "CONCLUÍDO", "CANCELADO"] as const;
export type StatusProjeto = (typeof STATUS_PROJETO_OPCOES)[number];

export const LABEL_STATUS: Record<string, string> = {
  "EM ANDAMENTO": "Em andamento", PAUSADO: "Pausado", "CONCLUÍDO": "Concluído", CANCELADO: "Cancelado",
};

export const TIPOS_CONTRATO_PMO = ["Empreitada Global", "Empreitada por Preço Unitário", "Administração", "Turnkey", "Outro"];

/** Ordem e seleção padrão exatamente como especificado (habilitado por
 * padrão ao criar um projeto nesta lista) — o gerente pode alterar
 * livremente em "Configuração dos Indicadores". */
export const KPI_PADRAO_HABILITADO: Record<string, boolean> = {
  curva_s: true,
  cronograma: true,
  financeiro: true,
  medicoes: true,
  spi: true,
  entregaveis: true,
  avanco_fisico: true,
  avanco_documental: true,
  riscos: true,
  comunicacoes: true,
  custos: false,
  cpi: false,
  bim: false,
  seguranca: false,
};

export const KPI_ORDEM: string[] = Object.keys(KPI_PADRAO_HABILITADO);

export type InfoKpi = { nome: string; objetivo: string; formula: string; interpretacao: string; exemplo: string };

export const BIBLIOTECA_KPIS: Record<string, InfoKpi> = {
  curva_s: {
    nome: "Curva S",
    objetivo: "Comparar o avanço físico planejado com o realizado ao longo do tempo, evidenciando adiantamentos e atrasos acumulados.",
    formula: "% Planejado = PV acumulado ÷ BAC · 100    |    % Realizado = EV acumulado ÷ BAC ÷ 100",
    interpretacao: "Curva do realizado abaixo da curva do planejado indica atraso acumulado; acima indica adiantamento. O afastamento entre as duas curvas mede a magnitude do desvio.",
    exemplo: "Planejado até o mês 6: 60% do escopo. Realizado até o mês 6: 48% do escopo. O projeto está 12 pontos percentuais atrás do planejado.",
  },
  cronograma: {
    nome: "Cronograma",
    objetivo: "Acompanhar atividades, marcos, dependências e o caminho crítico do projeto a partir do arquivo anexado (Excel ou Primavera).",
    formula: "Caminho crítico via CPM: Folga = Data de Início Tardio − Data de Início Cedo (folga = 0 → atividade crítica).",
    interpretacao: "Atrasos em atividades do caminho crítico atrasam diretamente a data final do projeto; atrasos fora do caminho crítico podem ser absorvidos pela folga disponível.",
    exemplo: "Atividade 'Fundação' tem folga = 0 dias → está no caminho crítico. Um atraso de 5 dias nela atrasa a entrega final em 5 dias.",
  },
  financeiro: {
    nome: "Financeiro",
    objetivo: "Acompanhar a execução financeira do contrato frente ao valor contratado.",
    formula: "Saldo = Valor Contratado − Valor Pago",
    interpretacao: "Saldo decrescente ao longo do tempo indica avanço normal do desembolso; saldo estagnado com % de execução física alto pode indicar pendência de medição ou aprovação.",
    exemplo: "Contratado R$ 1.000.000, pago R$ 650.000 → saldo de R$ 350.000 (65% do valor já desembolsado).",
  },
  medicoes: {
    nome: "Medições",
    objetivo: "Acompanhar o ciclo de cada medição mensal: percentual medido, aprovação e pagamento.",
    formula: "% Aprovado = Valor Aprovado ÷ Valor Medido · 100",
    interpretacao: "Percentual de aprovação consistentemente baixo indica glosas recorrentes ou divergências entre o medido e o executado, exigindo atenção contratual.",
    exemplo: "Medição de competência 06/2026: medido R$ 120.000, aprovado R$ 108.000 → 90% de aprovação (10% glosado).",
  },
  spi: {
    nome: "SPI – Schedule Performance Index",
    objetivo: "Avaliar o desempenho do cronograma.",
    formula: "SPI = EV ÷ PV",
    interpretacao: "SPI = 1 → Projeto no prazo. SPI > 1 → Projeto adiantado. SPI < 1 → Projeto atrasado.",
    exemplo: "Planejado: 10 entregáveis. Executados: 8. SPI = 8 ÷ 10 = 0,80. Conclusão: o projeto está executando apenas 80% do planejado.",
  },
  entregaveis: {
    nome: "Entregáveis",
    objetivo: "Acompanhar a relação entre entregáveis previstos e efetivamente entregues.",
    formula: "% Entregue = Total Entregue ÷ Total Previsto · 100",
    interpretacao: "Percentual abaixo de 100% na data prevista indica pendências que exigem ação corretiva; deve ser lido em conjunto com o percentual documental.",
    exemplo: "Previstos 20 entregáveis, entregues 14 → 70% de entrega, 6 pendentes.",
  },
  avanco_fisico: {
    nome: "Avanço Físico",
    objetivo: "Medir o progresso físico efetivamente executado da obra/projeto.",
    formula: "% Avanço Físico = Quantidade Executada ÷ Quantidade Total Planejada · 100",
    interpretacao: "Comparado ao avanço documental e ao cronograma, um avanço físico muito maior que o documental indica risco de atraso na formalização/liberação.",
    exemplo: "Planejados 500 m² de execução, executados 350 m² → 70% de avanço físico.",
  },
  avanco_documental: {
    nome: "Avanço Documental",
    objetivo: "Medir o progresso da documentação técnica do projeto (projetos executivos, ARTs, as-built etc.).",
    formula: "% Avanço Documental = Documentos Concluídos ÷ Documentos Previstos · 100",
    interpretacao: "Avanço documental muito abaixo do avanço físico é um risco recorrente de atraso na liberação de medições e no encerramento do contrato.",
    exemplo: "Previstos 40 documentos técnicos, concluídos 22 → 55% de avanço documental, mesmo com a obra em estágio mais avançado.",
  },
  riscos: {
    nome: "Riscos",
    objetivo: "Identificar, classificar e priorizar os riscos do projeto por meio da matriz Probabilidade × Impacto.",
    formula: "Classificação = Probabilidade (1-5) × Impacto (1-5)",
    interpretacao: "Quanto maior o produto, mais crítico o risco: 1-4 baixo, 5-9 médio, 10-14 alto, 15-25 crítico.",
    exemplo: "Risco 'Atraso na liberação de licença ambiental': probabilidade 4, impacto 5 → classificação 20 (crítico).",
  },
  comunicacoes: {
    nome: "Comunicações",
    objetivo: "Registrar e rastrear as comunicações formais do projeto (reuniões, ofícios, e-mails relevantes, decisões).",
    formula: "Indicador qualitativo — não possui fórmula numérica; mede-se pela completude e tempestividade dos registros.",
    interpretacao: "Ausência de registros de comunicações formais em momentos críticos do projeto é um risco de rastreabilidade contratual, não um indicador de desempenho por si só.",
    exemplo: "Um pedido formal de prorrogação de prazo sem registro na aba de Comunicações fragiliza a defesa contratual do prazo pleiteado.",
  },
  custos: {
    nome: "Custos",
    objetivo: "Acompanhar o custo real incorrido frente ao valor orçado para o trabalho realizado.",
    formula: "Variação de Custo (CV) = EV − AC",
    interpretacao: "CV positivo → custo abaixo do orçado (favorável). CV negativo → estouro de custo (desfavorável).",
    exemplo: "Valor agregado (EV) do trabalho realizado: R$ 200.000. Custo real incorrido (AC): R$ 230.000. CV = −R$ 30.000 (estouro de custo).",
  },
  cpi: {
    nome: "CPI – Cost Performance Index",
    objetivo: "Avaliar a eficiência do uso do orçamento do projeto.",
    formula: "CPI = EV ÷ AC",
    interpretacao: "CPI = 1 → dentro do orçamento. CPI > 1 → abaixo do orçamento (eficiente). CPI < 1 → acima do orçamento (estourado).",
    exemplo: "EV = R$ 200.000, AC = R$ 230.000. CPI = 200.000 ÷ 230.000 = 0,87. Conclusão: o projeto está gastando mais do que o valor agregado, indicando estouro de custo.",
  },
  bim: {
    nome: "BIM",
    objetivo: "Acompanhar a maturidade e as entregas do modelo BIM do projeto conforme o Plano de Execução BIM (PEB) contratado.",
    formula: "% Maturidade BIM = Etapas do Modelo Concluídas ÷ Etapas Previstas no PEB · 100",
    interpretacao: "Indicador qualitativo de aderência ao plano BIM contratado; baixa maturidade em etapas avançadas do projeto é risco de incompatibilidades não detectadas.",
    exemplo: "PEB prevê 8 etapas de modelagem/compatibilização; 5 concluídas → 62,5% de maturidade BIM.",
  },
  seguranca: {
    nome: "Segurança",
    objetivo: "Acompanhar os indicadores de segurança do trabalho na execução do contrato.",
    formula: "Taxa de Frequência de Acidentes = (Nº de Acidentes × 1.000.000) ÷ Horas-Homem Trabalhadas",
    interpretacao: "Quanto menor a taxa, melhor o desempenho de segurança; picos de taxa exigem ação corretiva imediata junto à contratada.",
    exemplo: "2 acidentes registrados em 500.000 horas-homem trabalhadas → taxa de frequência = (2 × 1.000.000) ÷ 500.000 = 4,0.",
  },
};

export function rotuloKpi(chave: string): string {
  return BIBLIOTECA_KPIS[chave]?.nome ?? chave;
}

/** Saúde do projeto (semáforo VERDE/AMARELO/VERMELHO) — mesma heurística
 * de gat/pmo_business_rules.py::calcular_saude_projeto:
 * VERMELHO — atividade crítica atrasada, ou risco crítico aberto, ou
 * desvio de execução (realizado vs. planejado) maior que 15 p.p.;
 * AMARELO — alerta de cronograma pendente ainda ativo, ou desvio entre
 * 5 e 15 p.p.; VERDE — nenhuma das condições acima. Este primeiro
 * incremento do PMO ainda não tem Cronograma/Riscos construídos, então
 * `percentualPlanejado`/`temAtividadeCriticaAtrasada`/`riscosCriticosAbertos`
 * chegam sempre "vazios" e a saúde se reduz a
 * `alertaCronogramaAtivo ? AMARELO : VERDE` — degradação graciosa,
 * intencional, da mesma fórmula completa. */
export function calcularSaudeProjeto(
  percentualExecucao: number,
  percentualPlanejado: number | null,
  temAtividadeCriticaAtrasada: boolean,
  riscosCriticosAbertos: number,
  alertaCronogramaAtivo: boolean,
): Saude {
  if (temAtividadeCriticaAtrasada || riscosCriticosAbertos > 0) return SAUDE_VERMELHO;
  if (percentualPlanejado != null) {
    const desvio = percentualPlanejado - percentualExecucao;
    if (desvio > 15) return SAUDE_VERMELHO;
    if (desvio > 5) return SAUDE_AMARELO;
  }
  if (alertaCronogramaAtivo) return SAUDE_AMARELO;
  return SAUDE_VERDE;
}

export const TITULO_ALERTA_CRONOGRAMA = "Cronograma pendente de recebimento.";
export const MENSAGEM_LEMBRETE_CRONOGRAMA =
  "O projeto ainda não possui cronograma anexado. Solicite o cronograma à contratada " +
  "para dar continuidade ao acompanhamento do projeto.";
const INTERVALO_LEMBRETE_DIAS_UTEIS_PADRAO = 3;

/** Próxima data de lembrete, `intervaloDiasUteis` dias úteis (seg-sex,
 * sem feriados — o PMO não compartilha o calendário de feriados do GAT)
 * após `aPartirDe` — mesma regra de
 * gat/pmo_business_rules.py::proximo_lembrete_cronograma. */
export function proximoLembreteCronograma(aPartirDe: Date, intervaloDiasUteis = INTERVALO_LEMBRETE_DIAS_UTEIS_PADRAO): Date {
  const data = new Date(aPartirDe);
  let diasAvancados = 0;
  while (diasAvancados < intervaloDiasUteis) {
    data.setDate(data.getDate() + 1);
    if (data.getDay() !== 0 && data.getDay() !== 6) diasAvancados += 1;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Cronograma — % de execução, próximo marco, Curva S, SPI
// ---------------------------------------------------------------------------

export type AtividadeCronograma = {
  id: number;
  arquivo_id: number;
  projeto_id: number;
  identificador_origem: string | null;
  nome: string;
  data_inicio: string | null;
  data_fim: string | null;
  duracao_dias: number | null;
  percentual_concluido: number;
  e_marco: number;
  predecessoras: string | null;
  caminho_critico: number;
  folga_dias: number | null;
};

/** % de execução do projeto: média do percentual concluído das
 * atividades do cronograma vigente, ponderada pela duração de cada uma
 * (atividades mais longas pesam mais no avanço global). Retorna 0 quando
 * não há cronograma anexado. Mesma regra de
 * gat/pmo_business_rules.py::calcular_percentual_execucao. */
export function calcularPercentualExecucao(atividades: AtividadeCronograma[]): number {
  if (!atividades.length) return 0;
  const pesos = atividades.map((a) => Math.max(a.duracao_dias ?? 1, 0.1));
  const totalPeso = pesos.reduce((s, p) => s + p, 0);
  if (totalPeso <= 0) {
    return Math.round((atividades.reduce((s, a) => s + (a.percentual_concluido ?? 0), 0) / atividades.length) * 10) / 10;
  }
  const soma = atividades.reduce((s, a, i) => s + (a.percentual_concluido ?? 0) * pesos[i], 0);
  return Math.round((soma / totalPeso) * 10) / 10;
}

/** Marco (atividade com `e_marco`) ainda não concluído com a data de
 * término mais próxima. Retorna null quando não há cronograma ou todos
 * os marcos já foram concluídos. Mesma regra de
 * gat/pmo_business_rules.py::proximo_marco. */
export function proximoMarco(atividades: AtividadeCronograma[]): { nome: string; dataFim: string | null } | null {
  const marcos = atividades.filter((a) => a.e_marco === 1 && (a.percentual_concluido ?? 0) < 100 && a.data_fim);
  if (!marcos.length) return null;
  const ordenados = [...marcos].sort((a, b) => new Date(a.data_fim!).getTime() - new Date(b.data_fim!).getTime());
  return { nome: ordenados[0].nome, dataFim: ordenados[0].data_fim };
}

/** Curva planejada (% acumulado do peso do cronograma concluído até cada
 * mês, considerando a data de término prevista de cada atividade) — um
 * ponto por mês entre o início e o término previstos do cronograma.
 * Mesma regra de gat/pmo_business_rules.py::curva_s_planejada. */
export function curvaSPlanejada(atividades: AtividadeCronograma[]): { data: Date; pctPlanejado: number }[] {
  if (!atividades.length) return [];
  const pesos = atividades.map((a) => Math.max(a.duracao_dias ?? 1, 0.1));
  const totalPeso = pesos.reduce((s, p) => s + p, 0);
  if (totalPeso <= 0) return [];

  const datasFim = atividades.map((a) => (a.data_fim ? new Date(a.data_fim) : null));
  const datasInicio = atividades.map((a) => (a.data_inicio ? new Date(a.data_inicio) : null));
  const fimValidas = datasFim.filter((d): d is Date => d != null && !Number.isNaN(d.getTime()));
  const inicioValidas = datasInicio.filter((d): d is Date => d != null && !Number.isNaN(d.getTime()));
  if (!fimValidas.length || !inicioValidas.length) return [];

  const inicio = new Date(Math.min(...inicioValidas.map((d) => d.getTime())));
  const fim = new Date(Math.max(...fimValidas.map((d) => d.getTime())));
  if (inicio >= fim) return [];

  const pontos: Date[] = [];
  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  while (cursor <= fim) {
    pontos.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (!pontos.length || pontos[pontos.length - 1].getTime() !== fim.getTime()) pontos.push(new Date(fim));

  return pontos.map((ponto) => {
    const somaAteOPonto = atividades.reduce((s, a, i) => {
      const df = datasFim[i];
      return df && df.getTime() <= ponto.getTime() ? s + pesos[i] : s;
    }, 0);
    return { data: ponto, pctPlanejado: Math.round((somaAteOPonto / totalPeso) * 1000) / 10 };
  });
}

/** % planejado acumulado até uma data de referência (tipicamente hoje) —
 * usado para calcular o desvio de execução e o SPI. Mesma regra de
 * gat/pmo_business_rules.py::percentual_planejado_ate. */
export function percentualPlanejadoAte(atividades: AtividadeCronograma[], dataReferencia: Date): number {
  if (!atividades.length) return 0;
  const pesos = atividades.map((a) => Math.max(a.duracao_dias ?? 1, 0.1));
  const totalPeso = pesos.reduce((s, p) => s + p, 0);
  if (totalPeso <= 0) return 0;
  const soma = atividades.reduce((s, a, i) => {
    if (!a.data_fim) return s;
    const df = new Date(a.data_fim);
    return df.getTime() <= dataReferencia.getTime() ? s + pesos[i] : s;
  }, 0);
  return Math.round((soma / totalPeso) * 1000) / 10;
}

/** SPI = EV ÷ PV, aproximado aqui por % realizado ÷ % planejado (a mesma
 * base usada na Curva S). Retorna null quando ainda não há planejamento
 * suficiente para o cálculo. Mesma regra de
 * gat/pmo_business_rules.py::calcular_spi. */
export function calcularSpi(percentualRealizado: number, percentualPlanejado: number): number | null {
  if (!percentualPlanejado) return null;
  return Math.round((percentualRealizado / percentualPlanejado) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Cronograma — importação (formatos aceitos) e CPM (caminho crítico)
// ---------------------------------------------------------------------------

export const FORMATOS_INTERPRETAVEIS = new Set(["excel", "xer"]);
export const FORMATOS_ACEITOS = new Set(["excel", "xer", "mpp"]);

/** Mesma regra de gat/pmo_cronograma_import.py::detectar_formato. */
export function detectarFormatoCronograma(nomeArquivo: string): string {
  const extensao = nomeArquivo.includes(".") ? nomeArquivo.split(".").pop()!.toLowerCase() : "";
  if (["xlsx", "xls", "xlsm"].includes(extensao)) return "excel";
  if (extensao === "xer") return "xer";
  if (extensao === "mpp") return "mpp";
  throw new Error(`Formato de arquivo não suportado: .${extensao}. Envie um arquivo Excel (.xlsx), Primavera (.xer) ou MS Project (.mpp).`);
}

/** Atividade já interpretada (de Excel ou XER), antes do CPM ser
 * calculado — mesmas colunas de
 * gat/pmo_cronograma_import.py::COLUNAS_ATIVIDADE_SAIDA. */
export type AtividadeInterpretada = {
  identificador_origem: string | null;
  nome: string;
  data_inicio: string | null;
  data_fim: string | null;
  duracao_dias: number;
  percentual_concluido: number;
  e_marco: number;
  predecessoras: string | null;
};

export type AtividadeComCpm = AtividadeInterpretada & { folga_dias: number; caminho_critico: number };

/** Ordenação topológica (Kahn) do grafo de dependências. Ciclos
 * porventura presentes no arquivo de origem (erro de digitação nas
 * predecessoras) são quebrados mantendo a ordem original das atividades
 * restantes, para nunca travar o processamento do cronograma. Mesma
 * regra de gat/pmo_business_rules.py::_ordenacao_topologica. */
function ordenacaoTopologica(indices: number[], predecessorasPorIndice: Map<number, number[]>): number[] {
  const grauEntrada = new Map(indices.map((i) => [i, predecessorasPorIndice.get(i)!.length]));
  const sucessoras = new Map<number, number[]>(indices.map((i) => [i, []]));
  for (const [idx, preds] of predecessorasPorIndice) {
    for (const pred of preds) sucessoras.get(pred)!.push(idx);
  }

  const fila = indices.filter((i) => grauEntrada.get(i) === 0);
  const ordenados: number[] = [];
  while (fila.length) {
    const atual = fila.shift()!;
    ordenados.push(atual);
    for (const suc of sucessoras.get(atual)!) {
      grauEntrada.set(suc, grauEntrada.get(suc)! - 1);
      if (grauEntrada.get(suc) === 0) fila.push(suc);
    }
  }

  if (ordenados.length < indices.length) {
    const restantes = indices.filter((i) => !ordenados.includes(i));
    ordenados.push(...restantes);
  }
  return ordenados;
}

/** Calcula, a partir das atividades e suas predecessoras (identificadores
 * de origem do arquivo importado), a Data de Início Cedo/Tardio, a folga
 * e se cada atividade está no caminho crítico (folga = 0).
 *
 * Implementação clássica de CPM (forward pass + backward pass) sobre um
 * grafo de dependências, em dias relativos — não depende do calendário de
 * dias úteis do GAT. Atividades com dependência não resolvida
 * (predecessora inexistente no arquivo) são tratadas como sem
 * predecessoras, para nunca travar o cálculo por causa de um dado
 * incompleto na planilha de origem. Mesma regra de
 * gat/pmo_business_rules.py::calcular_caminho_critico. */
export function calcularCaminhoCritico(atividades: AtividadeInterpretada[]): AtividadeComCpm[] {
  if (!atividades.length) return [];

  const porId = new Map<string, number>();
  atividades.forEach((a, idx) => {
    if (a.identificador_origem) porId.set(a.identificador_origem, idx);
  });

  function predecessorasIndices(valor: string | null): number[] {
    if (!valor || !valor.trim()) return [];
    return valor
      .split(",")
      .map((c) => c.trim())
      .filter((c) => porId.has(c))
      .map((c) => porId.get(c)!);
  }

  const indices = atividades.map((_, i) => i);
  const predecessorasPorIndice = new Map<number, number[]>(indices.map((i) => [i, predecessorasIndices(atividades[i].predecessoras)]));
  const sucessorasPorIndice = new Map<number, number[]>(indices.map((i) => [i, []]));
  for (const [idx, preds] of predecessorasPorIndice) {
    for (const pred of preds) sucessorasPorIndice.get(pred)!.push(idx);
  }

  const ordem = ordenacaoTopologica(indices, predecessorasPorIndice);

  const duracao = atividades.map((a) => Math.max(a.duracao_dias || 0, 0));
  const inicioCedo = new Map<number, number>(indices.map((i) => [i, 0]));
  const fimCedo = new Map<number, number>(indices.map((i) => [i, 0]));
  for (const idx of ordem) {
    const preds = predecessorasPorIndice.get(idx)!;
    const ic = preds.length ? Math.max(...preds.map((p) => fimCedo.get(p)!)) : 0;
    inicioCedo.set(idx, ic);
    fimCedo.set(idx, ic + duracao[idx]);
  }

  const duracaoProjeto = Math.max(0, ...Array.from(fimCedo.values()));

  const fimTardio = new Map<number, number>(indices.map((i) => [i, duracaoProjeto]));
  const inicioTardio = new Map<number, number>(indices.map((i) => [i, duracaoProjeto]));
  for (const idx of [...ordem].reverse()) {
    const sucs = sucessorasPorIndice.get(idx)!;
    const ft = sucs.length ? Math.min(...sucs.map((s) => inicioTardio.get(s)!)) : duracaoProjeto;
    fimTardio.set(idx, ft);
    inicioTardio.set(idx, ft - duracao[idx]);
  }

  return atividades.map((a, idx) => {
    const folga = Math.round((inicioTardio.get(idx)! - inicioCedo.get(idx)!) * 100) / 100;
    return { ...a, duracao_dias: duracao[idx], folga_dias: folga, caminho_critico: folga <= 0.01 ? 1 : 0 };
  });
}

// ---------------------------------------------------------------------------
// Medições, Entregáveis, Riscos, Comunicações
// ---------------------------------------------------------------------------

export const SITUACOES_MEDICAO = ["EM ANÁLISE", "APROVADA", "APROVADA COM RESSALVA", "REPROVADA"];
export const STATUS_RISCO_OPCOES = ["ABERTO", "EM MITIGAÇÃO", "ENCERRADO"];
export const TIPOS_COMUNICACAO = ["Reunião", "Ofício", "E-mail", "Ata", "Outro"];

export type Medicao = {
  id: number;
  projeto_id: number;
  competencia_mes: number;
  competencia_ano: number;
  percentual: number | null;
  valor_medido: number | null;
  situacao: string;
  valor_aprovado: number | null;
  data_aprovacao: string | null;
  valor_pago: number | null;
  data_pagamento: string | null;
  valor_glosado: number;
  criado_por: string;
  criado_em: string;
};

export type Entregavel = {
  id: number;
  projeto_id: number;
  nome: string;
  previsto: number;
  entregue: number;
  data_prevista: string | null;
  data_entrega: string | null;
  percentual_documental: number;
  observacoes: string | null;
};

export type Risco = {
  id: number;
  projeto_id: number;
  descricao: string;
  probabilidade: number;
  impacto: number;
  status: string;
  responsavel: string | null;
  plano_mitigacao: string | null;
};

export type Comunicacao = {
  id: number;
  projeto_id: number;
  data: string;
  tipo: string | null;
  descricao: string;
  responsavel: string | null;
};

export type ResumoFinanceiro = {
  valor_contratado: number;
  valor_medido: number;
  valor_aprovado: number;
  valor_pago: number;
  valor_glosado: number;
  saldo: number;
};

export type ProjetoPmo = {
  id: number;
  nome: string;
  cliente: string | null;
  contratada: string | null;
  gerente: string | null;
  data_inicio: string | null;
  data_prevista_termino: string | null;
  valor_contratual: number | null;
  tipo_contrato: string | null;
  observacoes: string | null;
  status: string;
  saude: string;
  percentual_execucao: number;
  proximo_marco: string | null;
  proximo_marco_data: string | null;
  criado_em: string;
  criado_por: string;
  atualizado_em: string | null;
  atualizado_por: string | null;
};

export function formatarDataBr(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString("pt-BR");
}

export function formatarMoeda(valor: number | null): string {
  if (valor == null) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type AlertaPmo = {
  id: number;
  modulo: string;
  projeto_id: number | null;
  titulo: string;
  descricao: string | null;
  prioridade: string | null;
  vencimento: string | null;
  status: string;
  criado_por: string;
  criado_em: string;
};

export type FiltrosPortfolioPmo = { status: string[]; saude: string[]; nome: string };

/** Mesma regra de filtragem de views/pmo_portfolio.py::render (filtros de
 * Status/Saúde/busca por nome-cliente-contratada). */
export function aplicarFiltrosPortfolioPmo(projetos: ProjetoPmo[], filtros: FiltrosPortfolioPmo): ProjetoPmo[] {
  let resultado = projetos;
  if (filtros.status.length) resultado = resultado.filter((p) => filtros.status.includes(p.status));
  if (filtros.saude.length) resultado = resultado.filter((p) => filtros.saude.includes(p.saude));
  const termo = filtros.nome.trim().toLowerCase();
  if (termo) {
    resultado = resultado.filter(
      (p) =>
        p.nome.toLowerCase().includes(termo) ||
        (p.cliente ?? "").toLowerCase().includes(termo) ||
        (p.contratada ?? "").toLowerCase().includes(termo),
    );
  }
  return resultado;
}
