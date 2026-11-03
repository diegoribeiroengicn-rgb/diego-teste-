export const MESES_PT = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO",
  "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
] as const;

export const MESES_PT_ABREV = MESES_PT.map((m) => m.slice(0, 3));

/** "Agosto de 2026" — mesmo rótulo de gat/ui/filtros.py::rotulo_competencia. */
export function rotuloCompetencia(mes: number, ano: number): string {
  const nome = MESES_PT[mes - 1];
  return `${nome.charAt(0)}${nome.slice(1).toLowerCase()} de ${ano}`;
}
