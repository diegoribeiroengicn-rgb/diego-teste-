import { FERIADOS_RJ_ISO } from "@/lib/dias-uteis";

/** Calendário em "números de dia" (dias desde a época Unix) — mesma
 * representação do motor de projeção de referência (mais rápida para
 * iterar dia a dia sobre um horizonte de meses do que trabalhar com
 * objetos Date a cada passo). Porta de gat/calendario.py (mesmos
 * feriados) na forma usada pelo Gantt. */

const DIA_MS = 86400000;

export function iso2dn(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const partes = String(valor).slice(0, 10).split("-").map(Number);
  const [ano, mes, dia] = partes;
  if (!ano || !mes || !dia) return null;
  return Math.round(Date.UTC(ano, mes - 1, dia) / DIA_MS);
}

export function dn2iso(dn: number | null): string | null {
  if (dn == null) return null;
  return new Date(dn * DIA_MS).toISOString().slice(0, 10);
}

export function fmt(dn: number | null): string {
  if (dn == null) return "—";
  const s = dn2iso(dn)!;
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}`;
}

export function dow(dn: number): number {
  return (((dn + 4) % 7) + 7) % 7; // 0 = domingo
}

export function addMonths(dn: number, k: number): number {
  const d = new Date(dn * DIA_MS);
  d.setUTCMonth(d.getUTCMonth() + k);
  return Math.round(d.getTime() / DIA_MS);
}

export class Calendario {
  private feriados: Set<number>;

  constructor(feriadosISO: readonly string[] = FERIADOS_RJ_ISO) {
    this.feriados = new Set(feriadosISO.map(iso2dn).filter((x): x is number => x != null));
  }

  ehUtil(dn: number): boolean {
    const w = dow(dn);
    return w !== 0 && w !== 6 && !this.feriados.has(dn);
  }

  /** Equivalente ao WORKDAY do Excel: avança k dias úteis sem contar o dia inicial. */
  workday(dn: number, k: number): number {
    if (k === 0) return dn;
    let d = dn;
    let c = 0;
    const passo = k > 0 ? 1 : -1;
    const alvo = Math.abs(k);
    while (c < alvo) {
      d += passo;
      if (this.ehUtil(d)) c++;
    }
    return d;
  }

  /** Equivalente ao NETWORKDAYS do Excel (inclusivo). */
  net(a: number, b: number): number {
    if (a > b) return -this.net(b, a);
    let c = 0;
    for (let d = a; d <= b; d++) if (this.ehUtil(d)) c++;
    return c;
  }

  proximoUtil(dn: number): number {
    let d = dn;
    while (!this.ehUtil(d)) d++;
    return d;
  }
}
