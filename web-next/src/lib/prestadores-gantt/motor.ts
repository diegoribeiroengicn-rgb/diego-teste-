/** Motor de projeção do Gantt de Prestadores — porta fiel do protótipo de
 * referência enviado pelo usuário (engine puro, sem DOM): consolida as
 * linhas de documentos em itens por AT (com inferência de revisão para
 * reenvios sem nº de AT vinculado), projeta os ciclos futuros prestador→
 * análise usando a taxa histórica de liberação por revisão, e agrega a
 * carga diária/semanal por analista — base do heatmap de paralelismo e
 * sobrecarga, e da projeção de documentos ao longo dos meses.
 *
 * Duas adaptações deliberadas em relação ao protótipo original:
 * - `normAT` aqui só normaliza (trim + maiúsculas) em vez de validar
 *   contra o padrão antigo "NNNN/AA" — o `num_at` atual do GAT usa o
 *   formato composto (ex.: "AT-0466-26-P221-400-00"), então validar
 *   contra o padrão antigo descartaria ATs válidos.
 * - Não há mais SLA por prestador fixo no código (`slaPOver`/`slaIOver`
 *   do protótipo traziam uma lista hardcoded de 6 códigos) — o usuário
 *   configura os desvios de SLA na própria tela, sempre vazio por padrão.
 */

import { Calendario, addMonths, dn2iso, dow, fmt, iso2dn } from "./calendario";

export { iso2dn, dn2iso, fmt, dow, addMonths, Calendario };

const up = (s: unknown): string => (s == null ? "" : String(s).replace(/\s+/g, " ").trim().toUpperCase());

const AT_VAZIOS = new Set(["", "***", "-", "N/A", "NAN", "NONE"]);
function normAT(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim().toUpperCase();
  return t && !AT_VAZIOS.has(t) ? t : null;
}

export const S_LIB = "LIBERADO";
export const S_LIBR = "LIBERADO C/ REST.";
export const S_NL = "NÃO LIBERADO";
export const S_EA = "EM ANÁLISE";
export const S_HOLD = "EM HOLD";
export const S_CANC = "CANCELADO";
export const S_OBS = "OBSOLETO";
export const LIBS = new Set([S_LIB, S_LIBR]);
export const CLOSED_NEG = new Set([S_CANC, S_OBS]);
const PRECED = [S_HOLD, S_EA, S_NL, S_LIBR, S_LIB];

export type LinhaBrutaGantt = {
  row: number;
  item: number | null;
  code: string | null;
  prest: string | null;
  discE: string | null;
  disc: string | null;
  obra: string | null;
  rev: number | null;
  pr: number;
  K: string | null;
  L: string | null;
  Lmanual: boolean;
  M: string | null;
  N: string | null;
  O: string | null;
  at: string | null;
  revAT: number | null;
  resp: string | null;
  status: string | null;
};

type LinhaPreparada = {
  row: number;
  code: string;
  status: string | null;
  resp: string;
  disc: string;
  pr: number;
  rev: number | null;
  prest: string | null;
  obra: string | null;
  Kd: number | null;
  Ld: number | null;
  Md: number | null;
  Nd: number | null;
  Od: number | null;
  Lmanual: boolean;
  flags: string[];
  atN: string | null;
  revATn: number | null;
  inferredFrom: string | null;
  inferRev: number | null;
  effRev: number;
};

export function prepRows(raw: LinhaBrutaGantt[]): { rows: LinhaPreparada[] } {
  const rows = raw.map((r0): LinhaPreparada => ({
    row: r0.row,
    code: up(r0.code),
    status: up(r0.status) || null,
    resp: up(r0.resp) || "SEM RESPONSÁVEL",
    disc: up(r0.disc) || up(r0.discE) || "SEM DISCIPLINA",
    pr: typeof r0.pr === "number" ? r0.pr : 0,
    rev: typeof r0.rev === "number" ? r0.rev : null,
    prest: r0.prest,
    obra: r0.obra,
    Kd: iso2dn(r0.K),
    Ld: iso2dn(r0.L),
    Md: iso2dn(r0.M),
    Nd: iso2dn(r0.N),
    Od: iso2dn(r0.O),
    Lmanual: !!r0.Lmanual,
    flags: [],
    atN: normAT(r0.at),
    revATn: typeof r0.revAT === "number" ? r0.revAT : null,
    inferredFrom: null,
    inferRev: null,
    effRev: 0,
  }));
  return { rows };
}

function worst(statuses: (string | null)[]): string | null {
  for (const s of PRECED) if (statuses.includes(s)) return s;
  return statuses[0] ?? null;
}

function assignEffRev(rows: LinhaPreparada[]): void {
  rows.sort((a, b) => (a.Kd ?? 0) - (b.Kd ?? 0) || a.row - b.row);
  let lastRev: number | null = null;
  let lastRow: LinhaPreparada | null = null;
  rows.forEach((r) => {
    if (r.revATn != null) r.effRev = r.revATn;
    else if (r.inferRev != null) r.effRev = r.inferRev;
    else if (lastRev == null) r.effRev = 0;
    else {
      const bump = !!(
        lastRow &&
        lastRow.status === S_NL &&
        lastRow.Md != null &&
        (r.Kd ?? -Infinity) >= lastRow.Md &&
        (r.status === S_EA || r.status === S_HOLD)
      );
      r.effRev = lastRev + (bump ? 1 : 0);
    }
    lastRev = Math.max(lastRev ?? -1, r.effRev);
    lastRow = r;
  });
}

export type MarcaData = { v: number | null; k: "real" | "inf" | "sla" | "est" };

export type EstagioGantt = {
  it: ItemGantt;
  kind: "prest" | "anal" | "hold";
  s: number;
  e: number;
  w: number;
  dk: "real" | "sla" | "est" | "inf";
  cat: string;
  cyc?: number;
  rev?: number | null;
  pr: number;
  docs: number;
  over?: boolean;
};

export type ItemGantt = {
  key: string;
  rows: LinhaPreparada[];
  code: string;
  prest: string;
  at: string | null;
  firstK?: number;
  lastMove?: number;
  obra: string;
  discs: string[];
  revI: number;
  flags: string[];
  pend: string[];
  state: string;
  closed?: boolean;
  active?: LinhaPreparada[];
  revAT: number;
  pr: number;
  nDocs: number;
  analyst: string;
  K0?: number | null;
  M?: number | null;
  Lreg?: number | null;
  Lmanual?: boolean;
  N?: number | null;
  O?: number | null;
  discAct?: string[];
  inferred?: boolean;
  isAT?: boolean;
  old?: boolean;
  sim?: boolean | "futura" | "pipeline";
  crit?: boolean;
  phase?: string;
  d: Record<string, MarcaData | undefined>;
  stages: EstagioGantt[];
  slaP?: number;
  slaI?: number;
  overdue?: boolean;
  nextDue?: number | null;
  prazo?: string;
  pRest?: number;
  docLbl?: string;
};

function summarize(key: string, rows: LinhaPreparada[], canon: Record<string, string>): ItemGantt {
  assignEffRev(rows);
  const valid = rows.filter((r) => !CLOSED_NEG.has(r.status ?? ""));
  const it: ItemGantt = {
    key,
    rows,
    code: rows[0].code,
    prest: canon[rows[0].code] || rows[0].prest || "",
    at: rows[0].atN || null,
    firstK: Math.min(...rows.map((r) => r.Kd ?? Infinity)),
    lastMove: Math.max(...rows.map((r) => Math.max(r.Kd ?? -1, r.Md ?? -1))),
    obra: rows[rows.length - 1].obra || "",
    discs: [...new Set(rows.map((r) => r.disc))],
    revI: Math.max(...rows.map((r) => r.rev ?? 0)),
    flags: [],
    pend: [],
    state: "",
    closed: false,
    active: [],
    revAT: 0,
    pr: 0,
    nDocs: 0,
    analyst: "",
    d: {},
    stages: [],
  };
  if (!valid.length) {
    it.state = worst(rows.map((r) => r.status)) || "SEM STATUS";
    it.closed = true;
    it.active = [];
    it.revAT = Math.max(...rows.map((r) => r.effRev));
    it.pr = 0;
    it.nDocs = 0;
    it.analyst = rows[rows.length - 1].resp;
    return it;
  }
  let maxRev = Math.max(...valid.map((r) => r.effRev));
  if (!it.at && rows.every((r) => r.revATn == null && r.inferRev == null)) {
    valid.forEach((r) => { r.effRev = r.rev ?? 0; });
    maxRev = Math.max(...valid.map((r) => r.effRev));
  }
  const cyc = valid.filter((r) => r.effRev === maxRev);
  const st = worst(cyc.map((r) => r.status));
  const act = cyc.filter((r) => r.status === st);
  it.revAT = maxRev;
  it.state = st || "SEM STATUS";
  it.active = act;
  it.closed = LIBS.has(st ?? "");
  it.pr = act.reduce((s, r) => s + r.pr, 0);
  it.nDocs = act.length;
  it.analyst = act[act.length - 1].resp;
  it.K0 = Math.min(...act.map((r) => r.Kd ?? Infinity));
  const ms = act.map((r) => r.Md).filter((x): x is number => x != null);
  it.M = ms.length ? Math.max(...ms) : null;
  const ls = act.map((r) => r.Ld).filter((x): x is number => x != null);
  it.Lreg = ls.length ? Math.max(...ls) : null;
  it.Lmanual = act.some((r) => r.Lmanual);
  const hr = act.find((r) => r.Nd != null || r.Od != null);
  it.N = hr ? hr.Nd : null;
  it.O = hr ? hr.Od : null;
  it.discAct = [...new Set(act.map((r) => r.disc))];
  it.inferred = rows.some((r) => r.inferredFrom);
  return it;
}

export type ModeloGantt = { items: ItemGantt[]; canon: Record<string, string> };

export function buildItems(prep: { rows: LinhaPreparada[] }, opts: { inferLinks: boolean }): ModeloGantt {
  const rows = prep.rows.map((r) => ({ ...r, inferredFrom: null as string | null, inferRev: null as number | null }));

  const cnt: Record<string, Record<string, number>> = {};
  rows.forEach((r) => {
    if (!r.prest) return;
    const c = (cnt[r.code] = cnt[r.code] || {});
    const p = up(r.prest);
    c[p] = (c[p] || 0) + 1;
  });
  const canon: Record<string, string> = {};
  Object.keys(cnt).forEach((c) => {
    canon[c] = Object.entries(cnt[c]).sort((a, b) => b[1] - a[1])[0][0];
  });

  const g = new Map<string, LinhaPreparada[]>();
  rows.forEach((r) => {
    const k = r.atN ? `${r.code}|${r.atN}` : `${r.code}|L${r.row}`;
    if (!g.has(k)) g.set(k, []);
    g.get(k)!.push(r);
  });

  if (opts.inferLinks) {
    const atItems = [...g.entries()]
      .filter(([k]) => !k.includes("|L"))
      .map(([k, rs]) => summarize(k, rs.slice(), canon));
    for (const [k, rs] of [...g.entries()]) {
      if (!k.includes("|L")) continue;
      const r = rs[0];
      if (!(r.status === S_EA || r.status === S_HOLD) || !(r.rev != null && r.rev >= 1)) continue;
      const cands = atItems.filter(
        (it) =>
          it.code === r.code &&
          it.state === S_NL &&
          it.discs.includes(r.disc) &&
          Math.max(...it.rows.map((x) => x.Kd ?? -Infinity)) < (r.Kd ?? Infinity) &&
          (it.M == null || it.M <= (r.Kd ?? -Infinity)),
      );
      if (cands.length === 1) {
        const c = cands[0];
        r.inferredFrom = c.key;
        r.inferRev = c.revAT + 1;
        g.get(c.key)!.push(r);
        g.delete(k);
      }
    }
  }
  const items = [...g.entries()].map(([k, rs]) => summarize(k, rs, canon));
  items.forEach((it) => { if (it.inferred) it.flags.push("Reenvio sem nº AT vinculado por inferência"); });
  return { items, canon };
}

export type FaixaHistorica = { n: number; lib: number; p: number | null };

/** Taxa histórica de liberação por revisão da AT (ciclos concluídos) —
 * alimenta a probabilidade usada na projeção dos ciclos futuros. */
export function histLib(items: ItemGantt[]): FaixaHistorica[] {
  const b = [0, 1, 2, 3].map(() => ({ lib: 0, n: 0 }));
  items.forEach((it) => {
    const byRev: Record<number, (string | null)[]> = {};
    it.rows.forEach((r) => {
      if (CLOSED_NEG.has(r.status ?? "")) return;
      (byRev[r.effRev] = byRev[r.effRev] || []).push(r.status);
    });
    Object.entries(byRev).forEach(([rv, sts]) => {
      if (sts.some((s) => s === S_EA || s === S_HOLD || !s)) return;
      const lib = sts.every((s) => LIBS.has(s ?? ""));
      const bi = Math.min(3, Number(rv));
      b[bi].n++;
      if (lib) b[bi].lib++;
    });
  });
  return b.map((x) => ({ n: x.n, lib: x.lib, p: x.n ? x.lib / x.n : null }));
}

export type EntregaFutura = { code: string; obra?: string; disc?: string; analyst?: string; date: string; n: number; pr: number; slaI?: number };

export type ParametrosGantt = {
  base: string;
  slaPDefault: number;
  slaIDefault: number;
  slaPOver: Record<string, number>;
  slaIOver: Record<string, number>;
  horizon: number;
  prox: number;
  critRev: number;
  oldMonths: number;
  oldRef: "at" | "projeto" | "ultimo";
  includeOld: boolean;
  overdueMode: "base" | "excluir" | "espalhar";
  overdueSpread: number;
  inferLinks: boolean;
  pLib: number[];
  maxCycles: number;
  minW: number;
  volFactor: number;
  futuras: EntregaFutura[];
};

export function defaultParams(baseISO: string, hist: FaixaHistorica[]): ParametrosGantt {
  return {
    base: baseISO,
    slaPDefault: 10,
    slaIDefault: 10,
    slaPOver: {},
    slaIOver: {},
    horizon: 90,
    prox: 3,
    critRev: 2,
    oldMonths: 6,
    oldRef: "at",
    includeOld: false,
    overdueMode: "base",
    overdueSpread: 10,
    inferLinks: true,
    pLib: hist.map((h) => (h.p == null ? 0.5 : Math.round(h.p * 100) / 100)),
    maxCycles: 3,
    minW: 0.05,
    volFactor: 100,
    futuras: [],
  };
}

function chain(
  it: ItemGantt,
  stages: EstagioGantt[],
  end: number,
  rev: number,
  w0: number,
  cat: string,
  sp: number,
  si: number,
  prF: number,
  docsF: number,
  cal: Calendario,
  pLib: (rev: number) => number,
  maxCycles: number,
  minW: number,
): { med: number | null; pRest: number } {
  let cum = 0;
  let med: number | null = null;
  let w = w0;
  let e = end;
  let r = rev;
  let n = 0;
  for (;;) {
    const p = pLib(r);
    cum += w * p;
    if (med == null && cum >= 0.5 - 1e-9) med = e;
    w = w * (1 - p);
    if (n >= maxCycles || w < minW) break;
    n++;
    r++;
    const pd = cal.workday(e, sp);
    stages.push({ it, kind: "prest", s: e, e: pd, w, dk: "est", cat, cyc: n, rev: r, pr: prF, docs: docsF });
    const ad = cal.workday(pd - 1, si);
    stages.push({ it, kind: "anal", s: pd, e: ad, w, dk: "est", cat, cyc: n, rev: r, pr: prF, docs: docsF });
    e = ad;
  }
  return { med, pRest: w };
}

export type ResultadoProjecao = { items: ItemGantt[]; base: number; baseW: number; hEnd: number };

/** Projeta o estado atual de cada AT/item no horizonte configurado:
 * "Com o prestador", "Em análise", "HOLD", liberadas, e os ciclos
 * futuros estimados (probabilísticos) até a próxima liberação. */
export function project(model: ModeloGantt, P: ParametrosGantt, cal: Calendario): ResultadoProjecao {
  const base = iso2dn(P.base)!;
  const hEnd = base + (+P.horizon || 90);
  const baseW = cal.proximoUtil(base);
  const slaP = (c: string) => (P.slaPOver[c] != null ? +P.slaPOver[c] : +P.slaPDefault);
  const slaI = (c: string) => (P.slaIOver[c] != null ? +P.slaIOver[c] : +P.slaIDefault);
  const pLib = (rev: number) => {
    const v = P.pLib[Math.min(3, Math.max(0, rev))];
    return Math.min(1, Math.max(0, +v));
  };
  const vf = (+P.volFactor || 0) / 100;
  const oldLimit = addMonths(base, -(+P.oldMonths || 6));
  const firstKCode: Record<string, number> = {};
  model.items.forEach((it) => { firstKCode[it.code] = Math.min(firstKCode[it.code] ?? 1e9, it.firstK!); });

  const isOld = (it: ItemGantt) => {
    const ref = (P.oldRef === "projeto" ? firstKCode[it.code] : P.oldRef === "ultimo" ? it.lastMove : it.firstK)!;
    return !it.closed && !CLOSED_NEG.has(it.state) && ref < oldLimit;
  };

  const spreadSlot = new Map<string, number>();
  if (P.overdueMode === "espalhar") {
    const od = model.items
      .filter((it) => it.state === S_NL && it.M != null && (P.includeOld || !isOld(it)))
      .map((it) => ({ it, pd: cal.workday(it.M!, slaP(it.code)) }))
      .filter((x) => x.pd < base)
      .sort((a, b) => a.pd - b.pd || a.it.firstK! - b.it.firstK!);
    const N = Math.max(1, Math.floor(+P.overdueSpread || 10));
    od.forEach((x, i) => spreadSlot.set(x.it.key, cal.workday(baseW - 1, 1 + Math.floor((i * N) / od.length))));
  }

  const out: ItemGantt[] = [];
  for (const it0 of model.items) {
    const it: ItemGantt = { ...it0, flags: it0.flags.slice(), pend: [], d: {}, stages: [] };
    const sp = slaP(it.code), si = slaI(it.code);
    it.slaP = sp;
    it.slaI = si;
    const st: EstagioGantt[] = [];
    it.stages = st;
    it.old = isOld(it);
    it.isAT = !!it.at;
    it.sim = false;
    it.crit = !it.closed && !CLOSED_NEG.has(it.state) && it.revAT > +P.critRev;
    const prF = it.pr * vf, docsF = it.nDocs;

    if (it.closed) {
      it.phase = "Liberada";
      if (it.K0 != null) st.push({ it, kind: "anal", s: it.K0, e: it.M ?? it.K0, w: 1, dk: "real", cat: "hist", pr: 0, docs: 0 });
      it.d.lib = { v: it.M ?? null, k: "real" };
    } else if (CLOSED_NEG.has(it.state)) {
      it.phase = it.state;
    } else if (it.state === S_EA || (it.state === S_HOLD && it.N != null && it.O != null)) {
      if (it.state === S_HOLD) it.pend.push("Status EM HOLD com HOLD já encerrado — tratado como em análise");
      const hd = it.N != null && it.O != null ? cal.net(it.N, it.O) : 0;
      if (it.K0 == null) {
        it.pend.push("Falta Data de Solicitação");
        it.phase = "Sem dados";
      } else {
        const due = cal.workday(it.K0 - 1, si + hd);
        it.phase = "Em análise";
        it.d.recv = { v: it.K0, k: "real" };
        it.d.anaDue = { v: due, k: "sla" };
        if (it.Lreg != null) it.d.Lreg = { v: it.Lreg, k: "inf" };
        it.overdue = due < base;
        st.push({ it, kind: "anal", s: it.K0, e: due, w: 1, dk: "real", cat: "existente", cyc: 0, rev: it.revAT, pr: it.pr, docs: it.nDocs, over: it.overdue });
        const end = it.overdue ? baseW : due;
        if (it.overdue) it.flags.push(`Análise vencida em ${fmt(due)} — continuação projetada a partir da data-base`);
        it.d.libBest = { v: end, k: it.overdue ? "est" : "sla" };
        const c = chain(it, st, end, it.revAT, 1, "retorno_est", sp, si, prF, docsF, cal, pLib, +P.maxCycles, +P.minW);
        it.d.libMed = { v: c.med, k: "est" };
        it.pRest = c.pRest;
        it.nextDue = due;
      }
    } else if (it.state === S_NL) {
      if (it.M == null) {
        it.pend.push("Falta Data Análise — impossível calcular o prazo do prestador");
        it.phase = "Sem dados";
      } else {
        const pd = cal.workday(it.M, sp);
        it.phase = "Com o prestador";
        it.d.at = { v: it.M, k: "real" };
        it.d.prestDue = { v: pd, k: "sla" };
        it.overdue = pd < base;
        it.nextDue = pd;
        st.push({ it, kind: "prest", s: it.M, e: pd, w: 1, dk: "sla", cat: "retorno_sla", cyc: 0, rev: it.revAT, pr: prF, docs: docsF, over: it.overdue });
        let recv: number | null = pd, rk: "real" | "sla" | "est" | "inf" = "sla";
        if (it.overdue) {
          if (P.overdueMode === "excluir") {
            it.pend.push(`Retorno do prestador vencido em ${fmt(pd)} — sem data de reenvio informada`);
            recv = null;
          } else if (P.overdueMode === "espalhar" && spreadSlot.has(it.key)) {
            recv = spreadSlot.get(it.key)!;
            rk = "est";
            it.flags.push(`Retorno do prestador vencido em ${fmt(pd)} — recebimento distribuído para ${fmt(recv)} (premissa)`);
          } else {
            recv = baseW;
            rk = "est";
            it.flags.push(`Retorno do prestador vencido em ${fmt(pd)} — recebimento assumido na data-base`);
          }
        }
        if (recv != null) {
          const ad = cal.workday(recv - 1, si);
          it.d.recv = { v: recv, k: rk };
          it.d.anaDue = { v: ad, k: rk };
          st.push({ it, kind: "anal", s: recv, e: ad, w: 1, dk: rk, cat: "retorno_sla", cyc: 0, rev: it.revAT + 1, pr: prF, docs: docsF });
          it.d.libBest = { v: ad, k: rk };
          const c = chain(it, st, ad, it.revAT + 1, 1, "retorno_est", sp, si, prF, docsF, cal, pLib, +P.maxCycles, +P.minW);
          it.d.libMed = { v: c.med, k: "est" };
          it.pRest = c.pRest;
        }
      }
    } else if (it.state === S_HOLD) {
      it.phase = "HOLD";
      if (it.N != null) {
        st.push({ it, kind: "hold", s: it.N, e: Math.max(it.N, base), w: 1, dk: "real", cat: "hold", pr: 0, docs: 0 });
        it.pend.push("HOLD em aberto — falta Hold (Fim); retorno não projetado");
      } else it.pend.push("EM HOLD sem Hold (Início)/(Fim); retorno não projetado");
    } else {
      it.phase = "Sem dados";
      it.pend.push("Status Análise não reconhecido/vazio");
    }
    out.push(it);
  }

  // ----- simulações: entregas futuras informadas manualmente -----
  (P.futuras || []).forEach((f, fi) => {
    const d0 = iso2dn(f.date);
    const n = Math.max(0, Math.floor(+f.n || 0));
    if (d0 == null || !n) return;
    const code = up(f.code) || "FUTURA";
    const si = f.slaI != null ? +f.slaI : slaI(code);
    const sp = slaP(code);
    for (let j = 0; j < n; j++) {
      const it: ItemGantt = {
        key: `SIM-F${fi + 1}-${j + 1}`, code, prest: model.canon[code] || code, at: null, isAT: true, sim: "futura", rows: [],
        obra: f.obra || "Entrega futura simulada", discs: [up(f.disc) || "N/D"], discAct: [up(f.disc) || "N/D"], revAT: 0, revI: 0,
        state: "SIMULADO", phase: "Simulado", analyst: up(f.analyst) || "NÃO ATRIBUÍDO", pr: +f.pr || 0, nDocs: 1,
        flags: ["Entrega futura simulada (premissa)"], pend: [], d: {}, slaP: sp, slaI: si, crit: false, old: false, stages: [],
      };
      const st: EstagioGantt[] = [];
      it.stages = st;
      const ad = cal.workday(d0 - 1, si);
      it.d.recv = { v: d0, k: "est" };
      it.d.anaDue = { v: ad, k: "est" };
      it.d.libBest = { v: ad, k: "est" };
      st.push({ it, kind: "anal", s: d0, e: ad, w: 1, dk: "est", cat: "nova_sim", cyc: 0, rev: 0, pr: it.pr, docs: 1 });
      const c = chain(it, st, ad, 0, 1, "nova_sim", sp, si, it.pr * vf, 1, cal, pLib, +P.maxCycles, +P.minW);
      it.d.libMed = { v: c.med, k: "est" };
      out.push(it);
    }
  });

  out.forEach((it) => {
    if (it.closed) it.prazo = "Liberada";
    else if (CLOSED_NEG.has(it.state)) it.prazo = "Encerrada";
    else if (it.sim) it.prazo = "Simulado";
    else if (it.pend.length && it.nextDue == null) it.prazo = it.state === S_HOLD ? "HOLD" : "Sem dados";
    else if (it.overdue) it.prazo = "Vencido";
    else if (it.nextDue != null && cal.net(base, it.nextDue) - (cal.ehUtil(base) ? 1 : 0) <= +P.prox) it.prazo = "Próximo do vencimento";
    else it.prazo = "Em dia";
  });

  return { items: out, base, baseW, hEnd };
}

export type AgregadoGantt = {
  days: number[];
  load: Record<string, Float64Array>;
  loadD: Record<string, Float64Array>;
  byAn: Record<string, Float64Array>;
  byAnCat: Record<string, Record<string, Float64Array>>;
  projCount: number[];
  projCodes: string[][];
  itemsDay: Float64Array;
  docsDay: Float64Array;
  cats: string[];
};

const CATS = ["vencido", "existente", "retorno_sla", "retorno_est", "nova_sim", "pipeline"];

/** Agrega a carga por dia útil (pranchas e documentos ponderados pela
 * probabilidade do ciclo) — série usada no heatmap de paralelismo/
 * sobrecarga e na projeção mensal de documentos analisados. */
export function aggregate(items: ItemGantt[], cal: Calendario, base: number, hEnd: number): AgregadoGantt {
  const baseW = cal.proximoUtil(base);
  const days: number[] = [];
  for (let d = base; d <= hEnd; d++) if (cal.ehUtil(d)) days.push(d);
  const idx = new Map(days.map((d, i) => [d, i]));
  const load: Record<string, Float64Array> = {};
  const loadD: Record<string, Float64Array> = {};
  CATS.forEach((c) => { load[c] = new Float64Array(days.length); loadD[c] = new Float64Array(days.length); });
  const byAn: Record<string, Float64Array> = {};
  const byAnCat: Record<string, Record<string, Float64Array>> = {};
  const anArr = (an: string, cat: string): [Float64Array, Float64Array] => {
    if (!byAn[an]) {
      byAn[an] = new Float64Array(days.length);
      byAnCat[an] = {};
      CATS.forEach((c) => { byAnCat[an][c] = new Float64Array(days.length); });
    }
    return [byAn[an], byAnCat[an][cat]];
  };
  const projDay: Map<string, number>[] = days.map(() => new Map());
  const itemsDay = new Float64Array(days.length);
  const docsDay = new Float64Array(days.length);

  for (const it of items) {
    for (const s of it.stages) {
      if (s.cat === "hist" || s.cat === "hold") continue;
      if (s.kind === "prest") continue;
      const amount = s.pr * s.w;
      if (s.e < base) {
        const i = idx.get(baseW);
        if (i == null) continue;
        const [an, ac] = anArr(it.analyst, "vencido");
        load.vencido[i] += amount; loadD.vencido[i] += s.docs * s.w;
        an[i] += amount; ac[i] += amount; itemsDay[i] += s.w; docsDay[i] += s.docs * s.w;
        const m = projDay[i]; m.set(it.code, Math.max(m.get(it.code) || 0, s.w));
        continue;
      }
      const tot = Math.max(1, cal.net(s.s, s.e));
      const per = amount / tot, perD = (s.docs * s.w) / tot;
      const cat = CATS.includes(s.cat) ? s.cat : "retorno_est";
      const [an, ac] = anArr(it.analyst, cat);
      for (let d = Math.max(s.s, base); d <= Math.min(s.e, hEnd); d++) {
        const i = idx.get(d);
        if (i == null) continue;
        load[cat][i] += per; loadD[cat][i] += perD;
        an[i] += per; ac[i] += per; itemsDay[i] += s.w; docsDay[i] += s.docs * s.w;
        const m = projDay[i]; m.set(it.code, Math.max(m.get(it.code) || 0, s.w));
      }
    }
  }
  const thr = 0.5;
  const projCount = projDay.map((m) => [...m.values()].filter((w) => w >= thr).length);
  const projCodes = projDay.map((m) => [...m.entries()].filter(([, w]) => w >= thr).map(([c]) => c));
  return { days, load, loadD, byAn, byAnCat, projCount, projCodes, itemsDay, docsDay, cats: CATS };
}

export function weekKey(d: number): number {
  return d - ((dow(d) + 6) % 7); // segunda-feira
}
