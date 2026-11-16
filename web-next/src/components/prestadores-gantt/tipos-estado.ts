import type { EntregaFutura } from "@/lib/prestadores-gantt/motor";

export type AgrupamentoGantt = "code" | "prest" | "analyst" | "sla" | "none";

export type FiltrosGanttEstado = {
  busca: string;
  prestadores: string[];
  analistas: string[];
  apenasCriticas: boolean;
  apenasVencidas: boolean;
  /** "Mostrar: Todos / ★ Só prioritários" — mesma lista de prioridades
   * administrada centralmente (prestadores.nivel_prioridade). */
  apenasPrioritarios: boolean;
  codigo: string;
  obra: string;
  at: string;
  disciplina: string;
  /** "" = todos, "crit" = críticos, "norm" = não críticos */
  criticidade: string;
  prazo: string;
  /** "" = todas, "prest" = com o prestador, "analise" = em análise */
  fase: string;
  /** "pend" (padrão) | "lib" | "todos" */
  statusLib: string;
  /** Intervalos (ISO) — entrega prevista do prestador, retorno/recebimento
   * previsto e conclusão prevista da análise. */
  pd1: string; pd2: string; rv1: string; rv2: string; ad1: string; ad2: string;
};

export type UiGanttEstado = {
  horizonte: number;
  agrupar: AgrupamentoGantt;
  mostrarEstimativas: boolean;
  zoom: number;
  /** Data-base da projeção (ISO) — vazio = hoje. */
  base: string;
  slaP: number;
  slaI: number;
  incluirAntigos: boolean;
  /** "atual" oculta ciclos/entregas estimados; "simulado" os inclui. */
  cenario: "atual" | "simulado";
  visao: "gantt" | "an";
  anGran: "w" | "m";
};

export const FILTROS_PADRAO: FiltrosGanttEstado = {
  busca: "",
  prestadores: [],
  analistas: [],
  apenasCriticas: false,
  apenasVencidas: false,
  apenasPrioritarios: false,
  codigo: "", obra: "", at: "", disciplina: "", criticidade: "", prazo: "", fase: "", statusLib: "pend",
  pd1: "", pd2: "", rv1: "", rv2: "", ad1: "", ad2: "",
};

export const UI_PADRAO: UiGanttEstado = {
  horizonte: 90,
  agrupar: "prest",
  mostrarEstimativas: true,
  zoom: 9,
  base: "",
  slaP: 10,
  slaI: 10,
  incluirAntigos: false,
  cenario: "simulado",
  visao: "gantt",
  anGran: "w",
};

export type EntregaFuturaEstado = EntregaFutura & { id: string };

/** Premissas editáveis do Gantt (janela "Editar premissas") — nunca alteram
 * a planilha nem o banco; ficam salvas neste navegador e podem ser
 * guardadas como cenário. */
export type PremissasEstado = {
  slaPOver: Record<string, number>;
  slaIOver: Record<string, number>;
  prox: number;
  critRev: number;
  oldMonths: number;
  oldRef: "at" | "projeto" | "ultimo";
  overdueMode: "base" | "excluir" | "espalhar";
  overdueSpread: number;
  useL: boolean;
  /** Probabilidade (%) de liberação por revisão; `null` = usar o histórico. */
  pLib: (number | null)[];
  maxCycles: number;
  minW: number;
  volFactor: number;
  feriadosExtras: string[];
  feriadosRemovidos: string[];
};

export const PREMISSAS_PADRAO: PremissasEstado = {
  slaPOver: {}, slaIOver: {}, prox: 3, critRev: 2, oldMonths: 6, oldRef: "at",
  overdueMode: "base", overdueSpread: 10, useL: true, pLib: [null, null, null, null],
  maxCycles: 3, minW: 5, volFactor: 100, feriadosExtras: [], feriadosRemovidos: [],
};

export type CenarioSalvo = { nome: string; premissas: PremissasEstado; slaP: number; slaI: number; criado: string };
