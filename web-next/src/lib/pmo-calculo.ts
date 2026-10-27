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
