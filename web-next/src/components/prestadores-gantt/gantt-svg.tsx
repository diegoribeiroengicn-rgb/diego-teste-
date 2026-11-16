"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgregadoGantt, EstagioGantt, ItemGantt } from "@/lib/prestadores-gantt/motor";
import { Calendario, dow, ehPrioritario, fmt } from "@/lib/prestadores-gantt/motor";
import { aggregate } from "@/lib/prestadores-gantt/motor";
import { estaAberto } from "./kpis";
import type { AgrupamentoGantt } from "./tipos-estado";

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// Paleta idêntica ao objeto GC do protótipo de referência.
const GC = { prest: "#A3AEBF", prestEst: "#D5DBE5", anal: "#1F5BC4", analPrev: "#8DB0EA", late: "#D64541", ok: "#1E8449", hold: "#B9A2D6", grp: "#E4EAF3", today: "#C9A227" };

const ddmm = (n: number | null | undefined) => (n == null ? "—" : fmt(n).slice(0, 5));
const nf = (v: number, d = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

function lateDays(cal: Calendario, due: number, base: number): number {
  return Math.max(1, cal.net(due + 1, base) - (cal.ehUtil(base) ? 1 : 0));
}

function plainStatus(it: ItemGantt, cal: Calendario, b: number): { t: string; c: string } {
  const d = it.d;
  if (it.pend.length && !it.stages.length) return { t: "❓ Falta informação na planilha", c: "#8A5300" };
  if (it.phase === "HOLD") return { t: `⏸ Parado (HOLD)${it.N != null ? " desde " + ddmm(it.N) : ""}`, c: "#6B4FA0" };
  if (it.sim) return { t: `Simulação · análise até ${ddmm(d.anaDue?.v)}`, c: "#4A5568" };
  if (it.phase === "Com o prestador") {
    const pd = d.prestDue?.v ?? null;
    if (it.overdue && pd != null) return { t: `⚠ Prestador atrasado ${lateDays(cal, pd, b)} dias úteis (devia entregar ${ddmm(pd)})`, c: GC.late };
    return { t: `Com o prestador · entrega até ${ddmm(pd)}`, c: "#4A5568" };
  }
  if (it.phase === "Em análise") {
    const ad = d.anaDue?.v ?? null;
    if (it.N != null && it.O != null && b >= it.N && b <= it.O) return { t: `⏸ Em HOLD até ${ddmm(it.O)} · prazo repactuado ${ddmm(ad)}`, c: "#6B4FA0" };
    if (it.overdue && ad != null) return { t: `⚠ Análise atrasada ${lateDays(cal, ad, b)} dias úteis (prazo ${ddmm(ad)})`, c: GC.late };
    return { t: `Em análise · conclusão até ${ddmm(ad)}`, c: GC.anal };
  }
  if (it.closed) return { t: `✓ Liberada em ${ddmm(d.lib?.v)}`, c: GC.ok };
  return { t: it.phase ?? "", c: "#4A5568" };
}

function tituloItem(it: ItemGantt): string {
  const doc = it.at ? "AT " + it.at : it.docLbl ? it.docLbl : it.sim ? "Simulação" : `Sem nº de AT (item ${it.rows[0]?.item ?? it.rows[0]?.row ?? "—"})`;
  return `${doc} · ${(it.discAct || it.discs || []).join("/")}`;
}

const AGRUPADORES: Record<AgrupamentoGantt, (it: ItemGantt) => string> = {
  code: (it) => `${it.code} · ${it.prest}`,
  prest: (it) => it.prest,
  analyst: (it) => `Analista: ${it.analyst}`,
  sla: (it) => `SLA de análise ${it.slaI} dias úteis`,
  none: () => "Todos",
};

type Grupo = { g: string; its: ItemGantt[] };

export function GanttSvg({
  itens, agregado, base, hEnd, cal, agrupar, mostrarEstimativas, zoom, abertos, marcadores, onAlternarGrupo, onGrupos,
}: {
  itens: ItemGantt[];
  agregado: AgregadoGantt;
  base: number;
  hEnd: number;
  cal: Calendario;
  agrupar: AgrupamentoGantt;
  mostrarEstimativas: boolean;
  zoom: number;
  abertos: Set<string>;
  marcadores: { documentos: string[]; prestadores: string[] };
  onAlternarGrupo: (g: string) => void;
  onGrupos: (nomes: string[]) => void;
}) {
  const [dica, setDica] = useState<{ x: number; y: number; html: string } | null>(null);
  const [aberto, setAberto] = useState<ItemGantt | null>(null);
  const docsPrio = useMemo(() => new Set(marcadores.documentos), [marcadores]);
  const prestPrio = useMemo(() => new Set(marcadores.prestadores), [marcadores]);
  // ☆ = projeto/prestador marcado como prioritário (independente da ★ da análise).
  const marcaGrupo = (G: Grupo) => G.its.some((i) => docsPrio.has(i.code) || prestPrio.has(i.prest));
  const dlgRef = useRef<HTMLDialogElement>(null);

  const px = zoom || 9;
  const start = cal.workday(base, -10);
  const end = hEnd;
  const W = (end - start + 1) * px;
  const LW = 380, RH = 40, GH = 46, HH = 92;
  const X = (d: number) => (d - start) * px;
  const tip = (e: React.MouseEvent, html: string) => setDica({ x: e.clientX, y: e.clientY, html });
  const sem = () => setDica(null);

  const estagiosVisiveis = (it: ItemGantt) =>
    it.stages.filter((s) => (mostrarEstimativas || !(s.dk === "est" && (s.cyc ?? 0) > 0)) && s.cat !== "hist" && (s.e >= start || s.over) && s.s <= end);

  const grupos = useMemo((): Grupo[] => {
    let items = itens.filter((it) => estaAberto(it) || !!it.sim);
    items = items.filter((it) => it.stages.some((s) => s.e >= start && s.s <= end) || it.pend.length);
    const gk = AGRUPADORES[agrupar];
    const nextD = (it: ItemGantt) => it.d.recv?.v ?? it.d.prestDue?.v ?? it.d.anaDue?.v ?? 1e9;
    // Prioridade (★) — só reordena/destaca grupos quando organizado por Projeto.
    const rank = new Map<string, number>();
    if (agrupar === "code") items.forEach((it) => rank.set(it.code, Math.min(rank.get(it.code) ?? 99, it.nivelPrioridade ?? 99)));
    const ordemCodigos = [...rank.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "pt-BR")).map(([c]) => c);
    const gRank = (it: ItemGantt) => (agrupar === "code" ? ((rank.get(it.code) ?? 99) < 99 ? ordemCodigos.indexOf(it.code) : 999) : 0);
    items.sort((a, b) =>
      gRank(a) - gRank(b) || gk(a).localeCompare(gk(b), "pt-BR") ||
      (a.overdue ? 0 : 1) - (b.overdue ? 0 : 1) || nextD(a) - nextD(b) || a.key.localeCompare(b.key));
    const out: Grupo[] = []; const m = new Map<string, Grupo>();
    items.forEach((it) => {
      const g = gk(it);
      if (!m.has(g)) { const o = { g, its: [] as ItemGantt[] }; m.set(g, o); out.push(o); }
      m.get(g)!.its.push(it);
    });
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, agrupar, start, end]);

  const nomesGrupos = useMemo(() => grupos.map((g) => g.g), [grupos]);
  useEffect(() => { onGrupos(nomesGrupos); }, [nomesGrupos]); // eslint-disable-line react-hooks/exhaustive-deps
  const autoAbrir = grupos.length <= 1;

  // ---- cabeçalho: carga semanal (pranchas) + destaque dos prioritários ----
  const semanas = useMemo(() => {
    const wk = new Map<number, { k: number; idx: number[]; wd: number }>();
    agregado.days.forEach((d, i) => {
      const k = d - ((dow(d) + 6) % 7);
      if (!wk.has(k)) wk.set(k, { k, idx: [], wd: 0 });
      const w = wk.get(k)!; w.idx.push(i); w.wd++;
    });
    return [...wk.values()];
  }, [agregado]);
  const aggPrio = useMemo(() => aggregate(itens.filter(ehPrioritario), cal, base, hEnd), [itens, cal, base, hEnd]);
  const carga = (A: AgregadoGantt, idx: number[]) => idx.reduce((t, i) => t + A.cats.reduce((s, c) => s + A.load[c][i], 0), 0);
  const wTot = semanas.map((w) => carga(agregado, w.idx));
  const wPri = semanas.map((w) => carga(aggPrio, w.idx));
  const mx = Math.max(1, ...wTot);

  const dias: number[] = [];
  for (let d = start; d <= end; d++) dias.push(d);

  // Linhas (grupo + itens abertos) com posição vertical. Com "Organizar por
  // Projeto", os projetos prioritários (★) ficam num bloco fixo logo abaixo
  // do cabeçalho — não rolam junto com os demais.
  type Linha = { tipo: "g"; G: Grupo; y: number; open: boolean } | { tipo: "i"; it: ItemGantt; y: number };
  const montar = (gs: Grupo[]) => {
    const linhas: Linha[] = [];
    let y = 0;
    gs.forEach((G) => {
      const open = autoAbrir || abertos.has(G.g);
      linhas.push({ tipo: "g", G, y, open }); y += GH;
      if (open) G.its.forEach((it) => { linhas.push({ tipo: "i", it, y }); y += RH; });
    });
    return { linhas, H: y };
  };
  const ehGrupoPrio = (G: Grupo) => agrupar === "code" && G.its.some((i) => ehPrioritario(i));
  const blocoFixo = montar(grupos.filter(ehGrupoPrio));
  const blocoRolante = montar(grupos.filter((G) => !ehGrupoPrio(G)));
  // Se o bloco fixo ficar alto demais (ex.: muitos grupos abertos), deixa de
  // fixar para não tomar a tela inteira.
  const fixar = blocoFixo.linhas.length > 0 && blocoFixo.H <= 320;

  useEffect(() => {
    const d = dlgRef.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  function resumoGrupo(G: Grupo) {
    const late = G.its.filter((i) => i.overdue).length;
    const crit = G.its.filter((i) => i.crit).length;
    const nPrest = G.its.filter((i) => i.phase === "Com o prestador").length;
    const nAn = G.its.filter((i) => i.phase === "Em análise").length;
    const nPrev = G.its.filter((i) => i.sim).length;
    const nSd = G.its.filter((i) => i.phase === "Sem dados" || i.phase === "HOLD").length;
    const parts = [nPrest && `${nPrest} com o prestador`, nAn && `${nAn} em análise`, nPrev && `${nPrev} a entregar`, nSd && `${nSd} sem dados/HOLD`].filter(Boolean).join(" · ");
    return { late, crit, parts };
  }

  const corpo = ({ linhas, H }: { linhas: Linha[]; H: number }) => (
    <div className="gbody">
          <div className="glabels" style={{ width: LW }}>
            {linhas.map((l) => {
              if (l.tipo === "g") {
                const { late, crit, parts } = resumoGrupo(l.G);
                const gp = agrupar === "code" && l.G.its.some((i) => ehPrioritario(i));
                const nivel = Math.min(...l.G.its.map((i) => i.nivelPrioridade ?? 99));
                return (
                  <div key={`g-${l.G.g}`} className={`grow${gp ? " prio" : ""}`} style={{ height: GH }} onClick={() => onAlternarGrupo(l.G.g)}>
                    <span className="car">{l.open ? "▼" : "▶"}</span>
                    <div>
                      <div className="gt">{gp && <span className="star">★{nivel < 99 ? nivel : ""}</span>}{marcaGrupo(l.G) && <span className="star" title="Projeto ou prestador prioritário">☆</span>}{l.G.g}</div>
                      <div className="gs">
                        {l.G.its.length} {l.G.its.length === 1 ? "item" : "itens"} · {parts || "—"}
                        {late > 0 && <> · <b style={{ color: GC.late }}>{late} atrasado{late > 1 ? "s" : ""}</b></>}
                        {crit > 0 && <> · <b style={{ color: GC.late }}>{crit} crítica{crit > 1 ? "s" : ""}</b></>}
                      </div>
                    </div>
                  </div>
                );
              }
              const it = l.it;
              const st = plainStatus(it, cal, base);
              return (
                <div key={it.key} className="irow" style={{ height: RH }} title={`${it.obra || ""} — clique para ver o histórico`} onClick={() => setAberto(it)}>
                  <div className="it">
                    {agrupar !== "code" && ehPrioritario(it) && <span className="star">★</span>}
                    {(docsPrio.has(it.code) || prestPrio.has(it.prest)) && <span className="star" title="Projeto ou prestador prioritário">☆</span>}
                    {it.crit && <span className="tag">REV {it.revAT} · crítica</span>}
                    {agrupar !== "code" ? `${it.code} · ` : ""}{tituloItem(it)}
                  </div>
                  <div className="is" style={{ color: st.c }}>{st.t}</div>
                </div>
              );
            })}
          </div>

          <svg width={W} height={H} style={{ display: "block" }}>
            <rect x={X(base)} y={0} width={3} height={H} fill={GC.today} opacity={0.55} />
            {linhas.map((l) => {
              if (l.tipo === "g") {
                const { late, parts } = resumoGrupo(l.G);
                const all = l.G.its.flatMap((i) => estagiosVisiveis(i));
                const s0 = all.length ? Math.min(...all.map((s) => s.s)) : null;
                const ends = all.filter((s) => !(s.dk === "est" && (s.cyc ?? 0) > 0)).map((s) => s.e);
                const e0 = ends.length ? Math.max(...ends) : null;
                const libs = l.G.its.map((i) => (mostrarEstimativas ? i.d.libMed : i.d.libBest)).filter((o) => o && o.v != null).map((o) => o!.v as number);
                const lib = libs.length ? Math.max(...libs) : null;
                const yy = l.y;
                return (
                  <g key={`g-${l.G.g}`}>
                    <rect x={0} y={yy} width={W} height={GH} fill="#E8EEF7" opacity={0.55} />
                    {s0 != null && e0 != null && (() => {
                      const x1 = X(Math.max(s0, start)), x2 = X(Math.min(e0, end) + 1);
                      const html = `<b>${esc(l.G.g)}</b><br>Período com trabalho previsto: ${fmt(Math.max(s0, start))} a ${fmt(e0)}<br>${parts}${late ? `<br><b>${late} atrasado(s)</b>` : ""}`;
                      return (
                        <>
                          <rect x={x1} y={yy + 15} width={Math.max(4, x2 - x1)} height={16} rx={8} fill={GC.grp} stroke="#C3CEDF" onMouseMove={(e) => tip(e, html)} onMouseLeave={sem} />
                          {l.G.its.flatMap((i) => estagiosVisiveis(i).filter((s) => s.kind === "anal" && !(s.dk === "est" && (s.cyc ?? 0) > 0)).map((s, k) => {
                            const a = X(Math.max(s.s, start)), b2 = X(Math.min(s.e, end) + 1);
                            return <rect key={`${i.key}-${k}`} x={a} y={yy + 19} width={Math.max(2, b2 - a)} height={8} rx={4} fill={i.sim ? GC.analPrev : GC.anal} opacity={0.55} pointerEvents="none" />;
                          }))}
                          {late > 0 && <>
                            <circle cx={X(base)} cy={yy + 23} r={10} fill={GC.late} />
                            <text x={X(base)} y={yy + 27} fontSize={11} fontWeight={800} textAnchor="middle" fill="#fff" pointerEvents="none">{late}</text>
                          </>}
                        </>
                      );
                    })()}
                    {lib != null && lib <= end && (
                      <g onMouseMove={(e) => tip(e, `Tudo deste grupo liberado por volta de <b>${fmt(lib)}</b>${mostrarEstimativas ? " (considerando revisões prováveis)" : " (se tudo for aprovado na próxima análise)"}`)} onMouseLeave={sem}>
                        <circle cx={X(lib) + px / 2} cy={yy + 23} r={9} fill={GC.ok} />
                        <text x={X(lib) + px / 2} y={yy + 27} fontSize={11} fontWeight={800} textAnchor="middle" fill="#fff">✓</text>
                        <text x={X(lib) + px / 2 + 13} y={yy + 27} fontSize={11} fontWeight={700} fill={GC.ok}>{ddmm(lib)}</text>
                      </g>
                    )}
                  </g>
                );
              }
              const it = l.it, yy = l.y;
              const vs = estagiosVisiveis(it);
              const lo = mostrarEstimativas ? it.d.libMed : it.d.libBest;
              const lv = lo?.v ?? null;
              return (
                <g key={it.key}>
                  <line x1={0} x2={W} y1={yy + RH - 0.5} y2={yy + RH - 0.5} stroke="#EEF1F6" />
                  {vs.map((s, si) => {
                    const x1 = X(Math.max(s.s, start)), x2 = X(Math.min(s.e, end) + 1), w = Math.max(3, x2 - x1);
                    const est = s.dk === "est" && (s.cyc ?? 0) > 0;
                    let fill: string, stroke = "none", dash = false, txt = "", tc = "#fff";
                    if (s.kind === "hold") { fill = GC.hold; txt = "Parado"; }
                    else if (s.kind === "prest") { fill = s.dk === "est" ? GC.prestEst : GC.prest; txt = "Prestador"; tc = "#2D3748"; if (fill === GC.prestEst) { stroke = "#A3AEBF"; dash = true; } }
                    else { fill = it.sim ? GC.analPrev : GC.anal; txt = "Análise"; }
                    if (est) { fill = "#fff"; stroke = s.kind === "prest" ? "#A3AEBF" : "#8DB0EA"; dash = true; txt = s.kind === "prest" ? "nova revisão?" : "reanálise?"; tc = "#5B6B82"; }
                    const html = `<b>${esc(tituloItem(it))}</b> · ${esc(it.code)} ${esc(it.prest)}<br>${esc(it.obra || "")}<br><br><b>${s.kind === "prest" ? "Com o prestador" : s.kind === "hold" ? "Parado (HOLD)" : "Análise na Tecnoplano"}</b>${est ? ` — só acontece se houver nova revisão (${nf(s.w * 100)}% de chance)` : ""}<br>De ${fmt(s.s)} até ${fmt(s.e)}${s.kind === "prest" ? ` · prazo de ${it.slaP} dias úteis` : s.kind === "anal" ? ` · prazo de ${it.slaI} dias úteis` : ""}<br>${({ real: "Data registrada na planilha", sla: "Data calculada pelo prazo (SLA)", inf: "Data informada pelo prestador", est: "Data estimada" } as const)[s.dk]}<br>Pranchas: ${nf(s.pr, 1)} · Analista: ${esc(it.analyst)}`;
                    const vencida = s.over && s.e < base;
                    const xa = X(Math.max(s.e + 1, start)), xb = X(base);
                    return (
                      <g key={si}>
                        {s.e >= start && <rect x={x1} y={yy + 9} width={w} height={RH - 18} rx={5} fill={fill} stroke={stroke} strokeDasharray={dash ? "4 3" : undefined} onMouseMove={(e) => tip(e, html)} onMouseLeave={sem} />}
                        {s.e >= start && w >= txt.length * 6.2 + 10 && <text x={x1 + w / 2} y={yy + RH / 2 + 4} fontSize={11} fontWeight={600} textAnchor="middle" fill={tc} pointerEvents="none">{txt}</text>}
                        {vencida && xb > xa && (
                          <>
                            <rect x={xa} y={yy + 9} width={xb - xa} height={RH - 18} rx={5} fill={GC.late}
                              onMouseMove={(e) => tip(e, `<b>Atrasado</b><br>O prazo venceu em ${fmt(s.e)}.<br>Hoje são ${lateDays(cal, s.e, base)} dias úteis de atraso.`)} onMouseLeave={sem} />
                            {xb - xa > 60 && <text x={(xa + xb) / 2} y={yy + RH / 2 + 4} fontSize={11} fontWeight={700} textAnchor="middle" fill="#fff" pointerEvents="none">atrasado</text>}
                          </>
                        )}
                      </g>
                    );
                  })}
                  {lv != null && lv >= start && lv <= end && (
                    <g onMouseMove={(e) => tip(e, mostrarEstimativas ? `<b>Liberação prevista</b>: ${fmt(lv)}<br>Considera a chance de novas revisões.` : `<b>Liberação</b> em ${fmt(lv)}<br>se o documento for aprovado na próxima análise.`)} onMouseLeave={sem}>
                      <circle cx={X(lv) + px / 2} cy={yy + RH / 2} r={8} fill={GC.ok} />
                      <text x={X(lv) + px / 2} y={yy + RH / 2 + 4} fontSize={10} fontWeight={800} textAnchor="middle" fill="#fff">✓</text>
                    </g>
                  )}
                  {it.pend.length > 0 && !vs.length && (
                    <text x={X(Math.max(base, start)) + 8} y={yy + RH / 2 + 4} fontSize={11.5} fill="#8A5300">❓ {it.pend[0]}</text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
  );

  if (!grupos.length) {
    return <div className="gwrap"><div className="note" style={{ padding: 20 }}>Nenhum item para os filtros atuais.</div></div>;
  }

  return (
    <div className="gwrap">
      <div className="ginner" style={{ width: LW + W }}>
        <div className="ghead">
          <div className="gcorner" style={{ width: LW, height: HH }}>
            <div><b>{grupos.length}</b> {grupos.length === 1 ? "grupo" : "grupos"} · <b>{grupos.reduce((t, g) => t + g.its.length, 0)}</b> itens</div>
            <div style={{ marginTop: "auto", fontWeight: 600, color: "#0B2A5B" }}>Pranchas para analisar por semana ▸</div>
          </div>
          <svg width={W} height={HH} style={{ display: "block" }}>
            {dias.map((d) => {
              const dt = new Date(d * 864e5);
              return (
                <g key={d}>
                  {(dt.getUTCDate() === 1 || (d === start && !dias.slice(0, Math.ceil(46 / px)).some((x) => new Date(x * 864e5).getUTCDate() === 1))) && <text x={X(d) + 4} y={14} fontSize={12} fontWeight={700} fill="#0B2A5B">{MES[dt.getUTCMonth()]}/{String(dt.getUTCFullYear()).slice(2)}</text>}
                  {dt.getUTCDate() === 1 && <line x1={X(d)} x2={X(d)} y1={0} y2={HH} stroke="#C9D2E0" />}
                  {dow(d) === 1 && <>
                    <line x1={X(d)} x2={X(d)} y1={20} y2={HH} stroke="#EDF0F5" />
                    {px * 7 >= 34 && <text x={X(d) + 3} y={32} fontSize={10.5} fill="#5B6B82">{ddmm(d)}</text>}
                  </>}
                </g>
              );
            })}
            {semanas.map((w, j) => {
              const ws = Math.max(w.k, start), we = Math.min(w.k + 6, end);
              if (we < start) return null;
              const v = wTot[j], h = Math.round((v / mx) * 38), hp = Math.round((wPri[j] / mx) * 38);
              const x = X(ws) + 2, ww = Math.max(4, X(we + 1) - X(ws) - 4);
              const html = `<b>Semana de ${fmt(w.k)}</b><br>Pranchas para analisar: <b>${nf(v)}</b><br>★ dos prioritários: <b>${nf(wPri[j])}</b>`;
              return (
                <g key={w.k} onMouseMove={(e) => tip(e, html)} onMouseLeave={sem}>
                  <rect x={x} y={88 - h} width={ww} height={Math.max(h, 1)} rx={3} fill="#9DB9E6" />
                  {hp > 0 && <rect x={x} y={88 - hp} width={ww} height={hp} rx={3} fill="#C9A227" />}
                  {ww >= 18 && v >= 0.5 && <text x={x + ww / 2} y={84 - h} fontSize={10.5} fontWeight={700} textAnchor="middle" fill="#0B2A5B" pointerEvents="none">{nf(v)}</text>}
                </g>
              );
            })}
            <line x1={X(base)} x2={X(base)} y1={18} y2={HH} stroke={GC.today} strokeWidth={3} />
            <rect x={X(base) - 22} y={0} width={44} height={17} rx={8} fill={GC.today} />
            <text x={X(base)} y={12.5} fontSize={10.5} fontWeight={800} textAnchor="middle" fill="#0B2A5B">HOJE</text>
          </svg>
        </div>

        {fixar && <div className="gpin">{corpo(blocoFixo)}</div>}
        {corpo(fixar ? blocoRolante : montar(grupos))}
      </div>

      {dica && (
        <div id="tip" style={{ position: "fixed", left: dica.x + 12, top: dica.y + 12, display: "block" }} dangerouslySetInnerHTML={{ __html: dica.html }} />
      )}

      <dialog ref={dlgRef} onClose={() => setAberto(null)} onClick={(e) => e.target === dlgRef.current && setAberto(null)}>
        {aberto && <HistoricoItem it={aberto} onFechar={() => setAberto(null)} />}
      </dialog>
    </div>
  );
}

const DK: Record<string, string> = { real: "R", inf: "I", sla: "S", est: "E" };
const ROT_DK: Record<string, string> = { real: "Real", sla: "SLA", est: "Estimada", inf: "Informada" };
const CLASSE_PRAZO: Record<string, string> = { Vencido: "p-venc", "Próximo do vencimento": "p-prox", "Em dia": "p-dia", HOLD: "p-hold", "Sem dados": "p-sd", Liberada: "p-lib", Simulado: "p-sim", Encerrada: "p-sd" };

function Marca({ o }: { o: { v: number | null; k: string } | undefined }) {
  return o && o.v != null ? <>{fmt(o.v)}<span className={`dk ${o.k}`}>{DK[o.k]}</span></> : <span className="note">—</span>;
}

function HistoricoItem({ it, onFechar }: { it: ItemGantt; onFechar: () => void }) {
  const dts: [string, { v: number | null; k: string } | undefined][] = [
    ["Emissão da AT (M)", it.d.at], ["Enviado pelo prestador", it.d.entrega], ["Entrega prevista do prestador", it.d.prestDue],
    ["Recebimento previsto / real", it.d.recv], ["Conclusão prevista da análise", it.d.anaDue], ["Data Limite registrada (L)", it.d.Lreg],
    ["Liberação sem novas reprovações", it.d.libBest], ["Liberação estimada (mediana)", it.d.libMed],
  ];
  const titulo = `${it.code} · ${it.prest} · ${it.at ? "AT " + it.at : it.docLbl ? it.docLbl + " — " + it.obra : it.sim ? "Simulação" : "Sem nº de AT"}`;
  return (
    <>
      <div className="dh"><b>{titulo}</b><button type="button" className="btn sm" onClick={onFechar}>Fechar</button></div>
      <div className="db">
        <div className="pgrid">
          <div>
            <table className="mini"><thead><tr><th>Campo</th><th>Valor</th></tr></thead><tbody>
              <tr><td>Projeto (obra)</td><td style={{ textAlign: "left" }}>{it.obra}</td></tr>
              <tr><td>Status atual (V)</td><td>{it.state}</td></tr>
              <tr><td>Fase</td><td>{it.phase}</td></tr>
              <tr><td>REV. AT vigente</td><td>{it.revAT ?? "—"}</td></tr>
              <tr><td>Analista</td><td>{it.analyst}</td></tr>
              <tr><td>Pranchas (ciclo atual)</td><td>{it.pr}</td></tr>
              <tr><td>SLA prestador / análise</td><td>{it.slaP} / {it.slaI} du</td></tr>
              {it.nivelPrioridade != null && <tr><td>Prioridade</td><td><span className="star">★</span>Nível {it.nivelPrioridade}</td></tr>}
              <tr><td>Prazo</td><td><span className={`pill ${CLASSE_PRAZO[it.prazo ?? ""] || "p-sd"}`}>{it.prazo}</span> {it.crit && <span className="pill p-crit">CRÍTICA</span>}</td></tr>
              {it.old && <tr><td>Projeto antigo</td><td>Sim — fora da projeção principal</td></tr>}
            </tbody></table>
          </div>
          <div>
            <table className="mini"><thead><tr><th>Data projetada</th><th>Valor</th></tr></thead><tbody>
              {dts.filter(([, o]) => o && o.v != null).map(([n, o]) => <tr key={n}><td>{n}</td><td><Marca o={o} /></td></tr>)}
            </tbody></table>
            {it.pend.length > 0 && <div className="warn" style={{ marginTop: 8 }}>{it.pend.map((p, i) => <div key={i}>{p}</div>)}</div>}
            {it.flags.length > 0 && <div className="info" style={{ marginTop: 8 }}>{it.flags.map((p, i) => <div key={i}>{p}</div>)}</div>}
          </div>
        </div>
        <h4 style={{ color: "#0B2A5B", margin: "14px 0 6px" }}>Etapas projetadas</h4>
        <table className="mini"><thead><tr><th>Etapa</th><th>Início</th><th>Fim</th><th>REV</th><th>Tipo</th><th>Prob.</th><th>Pranchas</th></tr></thead><tbody>
          {it.stages.map((s: EstagioGantt, i) => (
            <tr key={i}>
              <td>{s.kind === "prest" ? "Prestador" : s.kind === "hold" ? "HOLD" : s.cat === "hist" ? "Análise (histórico)" : "Análise interna"}{s.cyc ? ` · ciclo est. ${s.cyc}` : ""}</td>
              <td>{fmt(s.s)}</td><td>{fmt(s.e)}</td><td>{s.rev ?? "—"}</td><td>{ROT_DK[s.dk]}</td><td>{nf(s.w * 100)}%</td><td>{nf(s.pr, 1)}</td>
            </tr>
          ))}
        </tbody></table>
        <div className="note" style={{ marginTop: 6 }}>R = real (planilha) · I = informada · S = calculada pelo SLA · E = estimada</div>
      </div>
    </>
  );
}
