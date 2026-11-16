"use client";

import { useMemo } from "react";
import { Calendario, dn2iso, dow, ehPrioritario, fmt, type ItemGantt } from "@/lib/prestadores-gantt/motor";
import { estaAberto } from "./kpis";

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const nf = (v: number, d = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const wkKey = (d: number) => d - ((dow(d) + 6) % 7);

type Celula = { d: number; p: number };
type LinhaAn = { an: string; nowD: number; nowP: number; late: number; prioD: number; b: Map<string, Celula>; totD: number; totP: number };

/** Visão "👥 Analistas": documentos que cada analista tem em análise agora
 * mais o que vai chegar (retornos dos prestadores e, se ligado, revisões
 * prováveis) por semana ou mês, até o fim do horizonte. */
export function PainelAnalistas({
  itens, base, hEnd, cal, mostrarEstimativas, gran, onGran, onVer,
}: {
  itens: ItemGantt[]; base: number; hEnd: number; cal: Calendario; mostrarEstimativas: boolean;
  gran: "w" | "m"; onGran: (g: "w" | "m") => void; onVer: (analista: string) => void;
}) {
  const { chaves, linhas } = useMemo(() => {
    const dias: number[] = [];
    for (let d = base; d <= hEnd; d++) if (cal.ehUtil(d)) dias.push(d);
    const chave = (d: number) => (gran === "m" ? dn2iso(d)!.slice(0, 7) : String(wkKey(d)));
    const chaves = [...new Set(dias.map((d) => chave(Math.max(d, base))))];
    const rows = new Map<string, LinhaAn>();
    const row = (an: string) => {
      if (!rows.has(an)) rows.set(an, { an, nowD: 0, nowP: 0, late: 0, prioD: 0, b: new Map(chaves.map((k) => [k, { d: 0, p: 0 }])), totD: 0, totP: 0 });
      return rows.get(an)!;
    };
    itens.filter((i) => !i.sim && estaAberto(i) && i.phase === "Em análise").forEach((i) => {
      const r = row(i.analyst); r.nowD += i.nDocs; r.nowP += i.pr; if (i.overdue) r.late++; if (ehPrioritario(i)) r.prioD += i.nDocs;
    });
    itens.forEach((it) => it.stages.forEach((s) => {
      if (s.kind !== "anal" || s.cat === "hist" || s.cat === "hold" || s.cat === "existente" || s.cat === "vencido") return;
      if (!mostrarEstimativas && s.cyc && s.cyc > 0) return;
      const d = Math.max(s.s, base);
      if (d > hEnd) return;
      const r = row(it.analyst);
      const c = r.b.get(chave(d));
      if (!c) return;
      c.d += s.docs * s.w; c.p += s.pr * s.w;
      if (ehPrioritario(it)) r.prioD += s.docs * s.w;
    }));
    rows.forEach((r) => {
      r.totD = r.nowD + [...r.b.values()].reduce((t, c) => t + c.d, 0);
      r.totP = r.nowP + [...r.b.values()].reduce((t, c) => t + c.p, 0);
    });
    return { chaves, linhas: [...rows.values()].filter((r) => r.totD > 0.05).sort((a, b) => b.totD - a.totD) };
  }, [itens, base, hEnd, cal, mostrarEstimativas, gran]);

  const mx = Math.max(1, ...linhas.flatMap((r) => [...r.b.values()].map((c) => c.d)));
  const rotulo = (k: string) => (gran === "m" ? `${MES[Number(k.split("-")[1]) - 1]}/${k.slice(2, 4)}` : `sem ${fmt(Number(k)).slice(0, 5)}`);
  const tot = linhas.reduce((t, r) => {
    t.nowD += r.nowD; t.nowP += r.nowP; t.late += r.late; t.totD += r.totD; t.totP += r.totP; t.prioD += r.prioD;
    r.b.forEach((c, k) => { const x = t.b.get(k) ?? { d: 0, p: 0 }; x.d += c.d; x.p += c.p; t.b.set(k, x); });
    return t;
  }, { nowD: 0, nowP: 0, late: 0, totD: 0, totP: 0, prioD: 0, b: new Map<string, Celula>() });

  const cel = (c: Celula, k: string) => {
    const t = c.d / mx;
    const bg = c.d > 0.05 ? `rgba(31,91,196,${0.08 + t * 0.55})` : "#fff";
    return (
      <td key={k} style={{ background: bg, color: t > 0.6 ? "#fff" : "#1B2433" }}>
        {c.d > 0.05 && <><b>{nf(c.d, 1)}</b><span className="sm" style={{ color: t > 0.6 ? "#E8EEF8" : "#5B6B82" }}>{nf(c.p)} pr.</span></>}
      </td>
    );
  };

  return (
    <div className="anpanel">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 18px", alignItems: "flex-end", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0B2A5B" }}>👥 Documentos por analista</div>
          <div className="note">Agora em análise + o que vai chegar para cada analista (retornos dos prestadores{mostrarEstimativas ? ", revisões prováveis" : ""}) até {fmt(hEnd)}. Valores com casa decimal são estimativas.</div>
        </div>
        <div className="fld" style={{ marginLeft: "auto" }}><label>Períodos</label>
          <div className="seg big">
            <button type="button" className={gran === "w" ? "on" : ""} onClick={() => onGran("w")}>Semanas</button>
            <button type="button" className={gran === "m" ? "on" : ""} onClick={() => onGran("m")}>Meses</button>
          </div>
        </div>
      </div>
      <div style={{ overflow: "auto", maxHeight: "70vh" }}>
        <table className="antb">
          <thead><tr><th className="l">Analista</th><th>Em análise<br />agora</th>{chaves.map((k) => <th key={k}>{rotulo(k)}</th>)}<th>Total no<br />período</th><th>★ dos<br />prioritários</th></tr></thead>
          <tbody>
            {linhas.map((r) => (
              <tr key={r.an}>
                <td className="l"><a className="an" title="Ver no Gantt só os itens deste analista" onClick={() => onVer(r.an)}>{r.an}</a></td>
                <td className="now"><span className="big">{nf(r.nowD)}</span><span className="sm">{nf(r.nowP)} pr.{r.late > 0 && <> · <b style={{ color: "#D64541" }}>{r.late} atrasad{r.late > 1 ? "os" : "o"}</b></>}</span></td>
                {chaves.map((k) => cel(r.b.get(k)!, k))}
                <td className="tot"><span className="big">{nf(r.totD)}</span><span className="sm">{nf(r.totP)} pranchas</span></td>
                <td>{r.prioD > 0.05 ? nf(r.prioD) : "—"}</td>
              </tr>
            ))}
            <tr className="total">
              <td className="l">TOTAL</td>
              <td><span className="big">{nf(tot.nowD)}</span><span className="sm">{nf(tot.nowP)} pr.{tot.late > 0 && ` · ${tot.late} atrasados`}</span></td>
              {chaves.map((k) => { const c = tot.b.get(k); return <td key={k}>{c && c.d > 0.05 && <>{nf(c.d, 1)}<span className="sm">{nf(c.p)} pr.</span></>}</td>; })}
              <td><span className="big">{nf(tot.totD)}</span><span className="sm">{nf(tot.totP)} pranchas</span></td>
              <td>{nf(tot.prioD)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="note" style={{ marginTop: 8 }}>
        <b>Em análise agora</b> = documentos (linhas da planilha) com status EM ANÁLISE hoje. <b>Colunas do período</b> = documentos que devem chegar ao analista naquele período.
        <b> Total</b> = agora + tudo que chega até o fim do horizonte. Itens sem analista definido aparecem como “NÃO ATRIBUÍDO”. Clique no nome para ver o Gantt do analista.
      </div>
    </div>
  );
}
