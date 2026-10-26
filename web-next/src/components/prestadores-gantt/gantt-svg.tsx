"use client";

import { useMemo, useState } from "react";
import type { AgregadoGantt, EstagioGantt, ItemGantt } from "@/lib/prestadores-gantt/motor";
import { fmt } from "@/lib/prestadores-gantt/motor";
import { estaAberto } from "./kpis";
import type { AgrupamentoGantt } from "./tipos-estado";

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

const COR_PREST = "#8A99B0";
const COR_ANAL_REAL = "#0040A6";
const COR_ANAL_SLA = "#3D7DD8";
const COR_ANAL_EST = "#9DB9E6";
const COR_HOLD = "#7C3AED";
const COR_HIST = "#8FBF9F";
const COR_SIM = "#C9A227";
const COR_VENCIDO = "#C0392B";
const COR_NAVY = "#0B2A5B";

function corEstagio(s: EstagioGantt): { fill: string; dash: boolean; opacity: number } {
  if (s.kind === "hold") return { fill: COR_HOLD, dash: false, opacity: 1 };
  if (s.kind === "prest") return { fill: COR_PREST, dash: s.dk === "est", opacity: s.dk === "est" ? 0.35 + 0.65 * s.w : 1 };
  if (s.cat === "hist") return { fill: COR_HIST, dash: false, opacity: 1 };
  if (s.cat === "nova_sim" || s.cat === "pipeline") return { fill: COR_SIM, dash: (s.cyc ?? 0) > 0, opacity: (s.cyc ?? 0) > 0 ? 0.35 + 0.65 * s.w : 1 };
  if (s.dk === "est") return { fill: COR_ANAL_EST, dash: true, opacity: 0.35 + 0.65 * s.w };
  if (s.dk === "real") return { fill: COR_ANAL_REAL, dash: false, opacity: 1 };
  return { fill: COR_ANAL_SLA, dash: false, opacity: 1 };
}

type LinhaVisual = { tipo: "grupo"; rotulo: string; qtd: number; pr: number } | { tipo: "item"; it: ItemGantt };

const AGRUPADORES: Record<AgrupamentoGantt, (it: ItemGantt) => string> = {
  code: (it) => `${it.code} · ${it.prest}`,
  prest: (it) => it.prest,
  analyst: (it) => it.analyst,
  none: () => "",
};

export function GanttSvg({
  itens,
  agregado,
  base,
  hEnd,
  horizonteVisivelDias,
  agrupar,
  mostrarEstimativas,
  zoom,
}: {
  itens: ItemGantt[];
  agregado: AgregadoGantt;
  base: number;
  hEnd: number;
  horizonteVisivelDias: number;
  agrupar: AgrupamentoGantt;
  mostrarEstimativas: boolean;
  zoom: number;
}) {
  const [dica, setDica] = useState<{ x: number; y: number; html: string } | null>(null);
  const start = base;
  const end = Math.min(hEnd, base + horizonteVisivelDias);
  const nd = end - start + 1;
  const px = zoom;
  const W = nd * px;
  const LW = 260;
  const RH = 24;
  const HH = 56;

  const linhas = useMemo((): LinhaVisual[] => {
    let exibidos = itens.filter((it) => estaAberto(it) || !!it.sim);
    exibidos = exibidos.filter((it) => it.stages.some((s) => s.e >= start && s.s <= end) || it.pend.length);
    const gk = AGRUPADORES[agrupar];
    const next = (it: ItemGantt) => it.d.recv?.v ?? it.d.prestDue?.v ?? it.d.anaDue?.v ?? 1e9;
    exibidos = exibidos
      .slice()
      .sort((a, b) => gk(a).localeCompare(gk(b), "pt-BR") || next(a) - next(b) || a.key.localeCompare(b.key));
    const out: LinhaVisual[] = [];
    let last: string | null = null;
    exibidos.forEach((it) => {
      const g = gk(it);
      if (agrupar !== "none" && g !== last) {
        const doGrupo = exibidos.filter((x) => gk(x) === g);
        out.push({ tipo: "grupo", rotulo: g, qtd: doGrupo.length, pr: doGrupo.reduce((s, x) => s + x.pr, 0) });
        last = g;
      }
      out.push({ tipo: "item", it });
    });
    return out;
  }, [itens, agrupar, start, end]);

  const x = (d: number) => (d - start) * px;
  const mxCarga = useMemo(() => {
    let m = 0;
    agregado.days.forEach((_d, i) => {
      const v = agregado.cats.reduce((t, c) => t + agregado.load[c][i], 0);
      m = Math.max(m, v);
    });
    return m;
  }, [agregado]);
  const mxProj = useMemo(() => Math.max(0, ...agregado.projCount), [agregado]);

  const diasVisiveis: number[] = [];
  for (let d = start; d <= end; d++) diasVisiveis.push(d);

  const H = linhas.length * RH;

  return (
    <div className="relative rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
      <div className="overflow-x-auto">
        <div style={{ width: LW + W, minWidth: "100%" }}>
          {/* cabeçalho: meses + heatmap de carga/paralelismo */}
          <div className="flex">
            <div
              className="sticky left-0 z-10 flex shrink-0 flex-col justify-end gap-0.5 border-r border-b border-(--color-border) bg-(--color-surface-1) px-3 py-1.5 text-[10px] text-(--color-text-dim)"
              style={{ width: LW, height: HH }}
            >
              <span>{linhas.filter((l) => l.tipo === "item").length} itens · {fmt(start)} → {fmt(end)}</span>
              <span>Pranchas/dia em análise ▸</span>
              <span>Projetos simultâneos ▸</span>
            </div>
            <svg width={W} height={HH} className="block border-b border-(--color-border)">
              {diasVisiveis.map((d) => {
                const dt = new Date(d * 86400000);
                const ehDia1 = dt.getUTCDate() === 1 || d === start;
                return ehDia1 ? (
                  <g key={`mes-${d}`}>
                    <text x={x(d) + 3} y={12} fontSize={11} fontWeight={700} fill={COR_NAVY}>
                      {MESES_ABREV[dt.getUTCMonth()]}/{String(dt.getUTCFullYear()).slice(2)}
                    </text>
                    <line x1={x(d)} x2={x(d)} y1={0} y2={HH} stroke="var(--color-border)" />
                  </g>
                ) : null;
              })}
              {agregado.days.map((d, i) => {
                if (d < start || d > end) return null;
                const carga = agregado.cats.reduce((t, c) => t + agregado.load[c][i], 0);
                const corCarga = `rgba(0,64,166,${0.06 + (mxCarga ? carga / mxCarga : 0) * 0.85})`;
                const pc = agregado.projCount[i];
                const corProj = `rgba(201,162,39,${0.08 + (mxProj ? pc / mxProj : 0) * 0.9})`;
                const tip = `<b>${fmt(d)}</b><br/>Pranchas em análise (esperado): ${carga.toFixed(1)}<br/>Projetos simultâneos: ${pc}`;
                return (
                  <g key={`hm-${d}`}>
                    <rect
                      x={x(d)} y={34} width={Math.max(1, px)} height={10} fill={corCarga}
                      onMouseEnter={(e) => setDica({ x: e.clientX, y: e.clientY, html: tip })}
                      onMouseLeave={() => setDica(null)}
                    />
                    <rect
                      x={x(d)} y={45} width={Math.max(1, px)} height={10} fill={corProj}
                      onMouseEnter={(e) => setDica({ x: e.clientX, y: e.clientY, html: tip })}
                      onMouseLeave={() => setDica(null)}
                    />
                  </g>
                );
              })}
              <line x1={x(base)} x2={x(base)} y1={0} y2={HH} stroke="#C9A227" strokeWidth={2} />
            </svg>
          </div>

          {/* corpo: rótulos + barras */}
          <div className="flex">
            <div className="sticky left-0 z-10 shrink-0 bg-(--color-surface-1)" style={{ width: LW }}>
              {linhas.map((l, i) =>
                l.tipo === "grupo" ? (
                  <div
                    key={`g-${i}`}
                    className="flex items-center truncate bg-(--color-surface-2) px-3 text-xs font-semibold text-(--color-text)"
                    style={{ height: RH }}
                    title={l.rotulo}
                  >
                    {l.rotulo}
                    <span className="ml-1 font-normal text-(--color-text-dim)">
                      · {l.qtd} {l.qtd === 1 ? "item" : "itens"} · {l.pr.toFixed(0)} pr.
                    </span>
                  </div>
                ) : (
                  <div
                    key={l.it.key}
                    className="flex items-center gap-1 truncate border-t border-(--color-border) px-3 text-xs text-(--color-text)"
                    style={{ height: RH }}
                    title={`${l.it.code} · ${l.it.at ? "AT " + l.it.at : "sem AT"} · R${l.it.revAT ?? "-"} · ${l.it.analyst}`}
                  >
                    {l.it.crit && <span className="rounded bg-(--color-red) px-1 text-[9px] font-bold text-white">CRÍT</span>}
                    {l.it.prazo === "Vencido" && <span className="rounded bg-(--color-orange) px-1 text-[9px] font-bold text-white">VENC</span>}
                    <span className="truncate">
                      {l.it.code} · {l.it.at ? `AT ${l.it.at}` : l.it.sim ? "simulação" : "s/ AT"} · R{l.it.revAT ?? "-"}
                    </span>
                  </div>
                ),
              )}
            </div>
            <svg width={W} height={H} className="block">
              {px >= 10 && diasVisiveis.map((d) => {
                const dt = new Date(d * 86400000);
                const fds = dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
                return fds ? <rect key={`fds-${d}`} x={x(d)} y={0} width={px} height={H} fill="var(--color-surface-2)" opacity={0.5} /> : null;
              })}
              {linhas.map((l, i) => {
                const y = i * RH;
                if (l.tipo === "grupo") return <rect key={`gb-${i}`} x={0} y={y} width={W} height={RH} fill="var(--color-surface-2)" />;
                const it = l.it;
                return (
                  <g key={it.key}>
                    <line x1={0} x2={W} y1={y + RH - 0.5} y2={y + RH - 0.5} stroke="var(--color-border)" />
                    {it.stages.map((s, si) => {
                      if (!mostrarEstimativas && s.dk === "est" && (s.cyc ?? 0) > 0) return null;
                      if (s.e < start || s.s > end) return null;
                      const x1 = x(Math.max(s.s, start)), x2 = x(Math.min(s.e, end) + 1), w = Math.max(2, x2 - x1);
                      const { fill, dash, opacity } = corEstagio(s);
                      const tip = `<b>${esc(it.code)}${it.at ? " · AT " + esc(it.at) : ""}</b> · ${esc(it.prest)}<br/>${s.kind === "prest" ? "Com o prestador" : s.kind === "hold" ? "HOLD" : "Análise"} · REV ${s.rev ?? "-"}${s.cyc ? " · ciclo estimado " + s.cyc : ""}<br/>${fmt(s.s)} → ${fmt(s.e)}<br/>Pranchas: ${s.pr.toFixed(1)} · Analista: ${esc(it.analyst)}${s.over ? "<br/><b>Prazo vencido</b>" : ""}`;
                      return (
                        <rect
                          key={si}
                          x={x1} y={y + 4} width={w} height={RH - 8} rx={2}
                          fill={fill} opacity={opacity}
                          stroke={dash ? fill : "none"} strokeDasharray={dash ? "3 2" : undefined}
                          onMouseEnter={(e) => setDica({ x: e.clientX, y: e.clientY, html: tip })}
                          onMouseLeave={() => setDica(null)}
                        />
                      );
                    })}
                    {it.overdue &&
                      it.stages.some((s) => s.over && s.e < base) &&
                      (() => {
                        const sVenc = it.stages.find((s) => s.over && s.e < base)!;
                        const xa = x(Math.max(sVenc.e + 1, start)), xb = x(base);
                        return xb > xa ? <rect x={xa} y={y + 7} width={xb - xa} height={RH - 14} fill={COR_VENCIDO} opacity={0.75} /> : null;
                      })()}
                    {it.d.libMed?.v != null && it.d.libMed.v >= start && it.d.libMed.v <= end && (
                      <path
                        d={(() => {
                          const cx = x(it.d.libMed.v) + px / 2, cy = y + RH / 2;
                          return `M${cx} ${cy - 6} L${cx + 6} ${cy} L${cx} ${cy + 6} L${cx - 6} ${cy} Z`;
                        })()}
                        fill="#fff" stroke="#1E8449" strokeWidth={2}
                      />
                    )}
                  </g>
                );
              })}
              <line x1={x(base)} x2={x(base)} y1={0} y2={H} stroke="#C9A227" strokeWidth={2} />
            </svg>
          </div>
        </div>
      </div>
      {dica && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs text-(--color-text) shadow-lg"
          style={{ left: dica.x + 12, top: dica.y + 12 }}
          dangerouslySetInnerHTML={{ __html: dica.html }}
        />
      )}
      {linhas.filter((l) => l.tipo === "item").length === 0 && (
        <p className="p-8 text-center text-sm text-(--color-text-weak)">Nenhum item para os filtros atuais.</p>
      )}
      <p className="px-4 py-2 text-[11px] text-(--color-text-dim)">
        <span className="mr-3"><span className="inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: COR_ANAL_REAL }} /> Em análise</span>
        <span className="mr-3"><span className="inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: COR_PREST }} /> Com o prestador</span>
        <span className="mr-3"><span className="inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: COR_HOLD }} /> HOLD</span>
        <span className="mr-3"><span className="inline-block h-2.5 w-2.5 rounded-sm align-middle border border-dashed" style={{ background: COR_ANAL_EST, borderColor: COR_ANAL_EST }} /> Estimado</span>
        <span className="mr-3"><span className="inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: COR_SIM }} /> Simulado</span>
        <span><span className="inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: COR_VENCIDO }} /> Vencido</span>
      </p>
    </div>
  );
}
