import { type Calendario, type ItemGantt, weekKey } from "./motor";
import { CLOSED_NEG } from "./motor";

/** Carga e simultaneidade por analista no Gantt consolidado (Prestadores +
 * Cessionários). A sobrecarga NÃO é classificada: sem capacidade individual
 * cadastrada, o que se mede é volume, simultaneidade temporal e conflitos de
 * prazo — nunca só a quantidade total de projetos. */

export const LIMITE_CONFLITO_PRAZO = 3;

export type CargaAnalista = {
  analista: string;
  atividades: number;
  prestadores: number;
  cessionarios: number;
  prioritarias: number;
  atrasadas: number;
  pranchas: number;
  /** Maior nº de análises com trabalho previsto NO MESMO DIA útil. */
  picoSimultaneas: number;
  picoEm: number | null;
  mediaSimultaneas: number;
  /** Dias úteis em que vencem ≥ LIMITE_CONFLITO_PRAZO análises do analista. */
  diasConflitoPrazo: number;
  semanaMaisCheia: { semana: number | null; pranchas: number };
};

const aberto = (it: ItemGantt) => !it.closed && !CLOSED_NEG.has(it.state);

/** Estágios de análise interna reais ou do ciclo atual (os ciclos estimados
 * não entram na simultaneidade — são projeção probabilística). */
function estagiosAnalise(it: ItemGantt, incluirEstimados: boolean) {
  return it.stages.filter((s) => s.kind === "anal" && s.cat !== "hist" && s.cat !== "hold" && (incluirEstimados || !(s.dk === "est" && (s.cyc ?? 0) > 0)));
}

export function cargaPorAnalista(items: ItemGantt[], base: number, hEnd: number, cal: Calendario, incluirEstimados = false): CargaAnalista[] {
  const dias: number[] = [];
  for (let d = base; d <= hEnd; d++) if (cal.ehUtil(d)) dias.push(d);
  const porAn = new Map<string, ItemGantt[]>();
  items.filter((it) => aberto(it) && !it.sim).forEach((it) => { const a = it.analyst || "NÃO ATRIBUÍDO"; (porAn.get(a) ?? porAn.set(a, []).get(a)!).push(it); });

  const out: CargaAnalista[] = [];
  for (const [analista, its] of porAn) {
    const simult = new Map<number, number>();
    const vencem = new Map<number, number>();
    const semana = new Map<number, number>();
    for (const it of its) {
      for (const s of estagiosAnalise(it, incluirEstimados)) {
        const ini = Math.max(s.s, base), fim = s.e < base ? base : Math.min(s.e, hEnd);
        for (const d of dias) if (d >= ini && d <= fim) simult.set(d, (simult.get(d) ?? 0) + 1);
        const dd = s.e < base ? base : s.e;
        if (!s.cyc && dd >= base && dd <= hEnd) vencem.set(dd, (vencem.get(dd) ?? 0) + 1);
        const tot = Math.max(1, dias.filter((d) => d >= ini && d <= fim).length);
        for (const d of dias) if (d >= ini && d <= fim) semana.set(weekKey(d), (semana.get(weekKey(d)) ?? 0) + (s.pr * s.w) / tot);
      }
    }
    let pico = 0, picoEm: number | null = null, soma = 0;
    for (const d of dias) { const v = simult.get(d) ?? 0; soma += v; if (v > pico) { pico = v; picoEm = d; } }
    let sem: number | null = null, semV = 0;
    semana.forEach((v, k) => { if (v > semV) { semV = v; sem = k; } });
    out.push({
      analista,
      atividades: its.length,
      prestadores: its.filter((i) => i.fluxo === "prestadores").length,
      cessionarios: its.filter((i) => i.fluxo === "cessionarios").length,
      prioritarias: its.filter((i) => i.nivelPrioridade != null).length,
      atrasadas: its.filter((i) => i.overdue).length,
      pranchas: its.reduce((t, i) => t + i.pr, 0),
      picoSimultaneas: pico,
      picoEm,
      mediaSimultaneas: dias.length ? soma / dias.length : 0,
      diasConflitoPrazo: [...vencem.values()].filter((n) => n >= LIMITE_CONFLITO_PRAZO).length,
      semanaMaisCheia: { semana: sem, pranchas: semV },
    });
  }
  return out.sort((a, b) => b.atividades - a.atividades || b.picoSimultaneas - a.picoSimultaneas || a.analista.localeCompare(b.analista));
}
