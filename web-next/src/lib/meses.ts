export const MESES_PT = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO",
  "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
] as const;

export const MESES_PT_ABREV = MESES_PT.map((m) => m.slice(0, 3));

/** `mes === 0` significa "ano todo" nos relatórios e OPR. */
export const ANO_TODO = 0;

/** "AGOSTO" (ou "ANO TODO" quando `mes` é 0) — para títulos de relatório. */
export function nomeMes(mes: number): string {
  return mes === ANO_TODO ? "ANO TODO" : MESES_PT[mes - 1];
}

/** "Agosto de 2026" ("Ano todo de 2026" quando `mes` é 0) — mesmo rótulo de
 * gat/ui/filtros.py::rotulo_competencia. */
export function rotuloCompetencia(mes: number, ano: number): string {
  if (mes === ANO_TODO) return `Ano todo de ${ano}`;
  const nome = MESES_PT[mes - 1];
  return `${nome.charAt(0)}${nome.slice(1).toLowerCase()} de ${ano}`;
}
