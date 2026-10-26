import type { EntregaFutura } from "@/lib/prestadores-gantt/motor";

export type AgrupamentoGantt = "code" | "prest" | "analyst" | "none";

export type FiltrosGanttEstado = {
  busca: string;
  prestadores: string[];
  analistas: string[];
  apenasCriticas: boolean;
  apenasVencidas: boolean;
};

export type UiGanttEstado = {
  horizonte: number;
  agrupar: AgrupamentoGantt;
  mostrarEstimativas: boolean;
  zoom: number;
};

export const FILTROS_PADRAO: FiltrosGanttEstado = {
  busca: "",
  prestadores: [],
  analistas: [],
  apenasCriticas: false,
  apenasVencidas: false,
};

export const UI_PADRAO: UiGanttEstado = {
  horizonte: 90,
  agrupar: "prest",
  mostrarEstimativas: true,
  zoom: 6,
};

export type EntregaFuturaEstado = EntregaFutura & { id: string };
