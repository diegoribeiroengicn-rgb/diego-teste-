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
};

export const FILTROS_PADRAO: FiltrosGanttEstado = {
  busca: "",
  prestadores: [],
  analistas: [],
  apenasCriticas: false,
  apenasVencidas: false,
  apenasPrioritarios: false,
  codigo: "", obra: "", at: "", disciplina: "", criticidade: "", prazo: "", fase: "", statusLib: "pend",
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
};

export type EntregaFuturaEstado = EntregaFutura & { id: string };
