"use client";

import { useMemo, useState } from "react";
import type { AgregadoGantt, EstagioGantt, ItemGantt } from "@/lib/prestadores-gantt/motor";
import { ehPrioritario, fmt } from "@/lib/prestadores-gantt/motor";
import { estaAberto } from "./kpis";
import type { AgrupamentoGantt } from "./tipos-estado";

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// Paleta idêntica ao objeto COLORS/GC do HTML de referência (Gantt_PROJ_PREST),
// não a paleta usada lá só no gráfico da aba "Analistas" — são palettes
// diferentes no próprio protótipo.
const COR_PREST = "#A3AEBF"; // GC.prest — "Com o prestador"
const COR_PREST_EST = "#D5DBE5"; // GC.prestEst — "Com o prestador (data estimada)"
const COR_ANAL = "#1F5BC4"; // GC.anal — "Em análise na Tecnoplano"
const COR_ANAL_PREV = "#8DB0EA"; // GC.analPrev — "Análise de documento que ainda vai chegar"
const COR_HOLD = "#B9A2D6"; // GC.hold
const COR_VENCIDO = "#D64541"; // GC.late — "Atrasado"
const COR_OK = "#1E8449"; // GC.ok — marca de liberação (círculo + ✓)
const COR_HOJE = "#C9A227"; // GC.today
const COR_PRIO_FUNDO = "#FFF6DA"; // .grow.prio — destaque dourado de prioridade
const COR_PRIO_ESTRELA = "#B8890B"; // .star
const COR_NAVY = "#0B2A5B";

function corEstagio(s: EstagioGantt, it: ItemGantt): { fill: string; stroke: string; dash: boolean } {
  const estimado = s.dk === "est" && (s.cyc ?? 0) > 0;
  if (s.kind === "hold") return { fill: COR_HOLD, stroke: "none", dash: false };
  if (s.kind === "prest") {
    if (estimado) return { fill: "#fff", stroke: COR_PREST, dash: true };
    if (s.dk === "est") return { fill: COR_PREST_EST, stroke: COR_PREST, dash: true };
    return { fill: COR_PREST, stroke: "none", dash: false };
  }
  // kind === "anal"
  if (estimado) return { fill: "#fff", stroke: COR_ANAL_PREV, dash: true };
  if (it.sim || s.cat === "nova_sim" || s.cat === "pipeline") return { fill: COR_ANAL_PREV, stroke: "none", dash: false };
  return { fill: COR_ANAL, stroke: "none", dash: false };
}

type LinhaVisual =
  | { tipo: "grupo"; rotulo: string; qtd: number; pr: number; prioritario: boolean; rankPrioridade: number | null }
  | { tipo: "item"; it: ItemGantt };

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

    // Nível de prioridade de cada grupo (menor nível = mais crítico) —
    // igual ao protótipo de referência, cujos projetos prioritários
    // "aparecem no topo do Gantt, com destaque dourado" só quando
    // organizado por Projeto (gRank do protótipo só vale para
    // UI.gGroup === 'code'; nos outros agrupamentos só a estrela por
    // item aparece, sem reordenar nem destacar o grupo). A prioridade em
    // si vem só do nível administrado centralmente (nivelPrioridade).
    const rankGrupo = new Map<string, number>();
    if (agrupar === "code") {
      exibidos.forEach((it) => {
        const g = gk(it);
        const nivel = it.nivelPrioridade ?? 99;
        rankGrupo.set(g, Math.min(rankGrupo.get(g) ?? 99, nivel));
      });
    }
    const grupoOrdenado = [...rankGrupo.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "pt-BR"));
    const ordemGrupo = new Map(grupoOrdenado.map(([g], i) => [g, i]));

    exibidos = exibidos
      .slice()
      .sort(
        (a, b) =>
          (ordemGrupo.get(gk(a)) ?? 0) - (ordemGrupo.get(gk(b)) ?? 0) ||
          gk(a).localeCompare(gk(b), "pt-BR") ||
          next(a) - next(b) ||
          a.key.localeCompare(b.key),
      );
    const out: LinhaVisual[] = [];
    let last: string | null = null;
    exibidos.forEach((it) => {
      const g = gk(it);
      if (agrupar !== "none" && g !== last) {
        const doGrupo = exibidos.filter((x) => gk(x) === g);
        const rank = rankGrupo.get(g) ?? 99;
        out.push({
          tipo: "grupo",
          rotulo: g,
          qtd: doGrupo.length,
          pr: doGrupo.reduce((s, x) => s + x.pr, 0),
          prioritario: rank < 99,
          rankPrioridade: rank < 99 ? grupoOrdenado.findIndex(([gg]) => gg === g) : null,
        });
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
              <line x1={x(base)} x2={x(base)} y1={0} y2={HH} stroke={COR_HOJE} strokeWidth={3} strokeOpacity={0.55} />
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
                    style={
                      l.prioritario
                        ? { height: RH, background: COR_PRIO_FUNDO, borderLeft: `4px solid ${COR_HOJE}` }
                        : { height: RH }
                    }
                    title={l.rotulo}
                  >
                    {l.prioritario && (
                      <span style={{ color: COR_PRIO_ESTRELA, fontWeight: 800 }}>
                        ★{l.rankPrioridade != null ? l.rankPrioridade + 1 : ""}
                      </span>
                    )}
                    <span className="truncate">{l.rotulo}</span>
                    <span className="ml-1 shrink-0 font-normal text-(--color-text-dim)">
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
                    {agrupar !== "code" && ehPrioritario(l.it) && (
                      <span style={{ color: COR_PRIO_ESTRELA, fontWeight: 800 }}>★</span>
                    )}
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
                if (l.tipo === "grupo") {
                  return (
                    <rect
                      key={`gb-${i}`}
                      x={0} y={y} width={W} height={RH}
                      fill={l.prioritario ? COR_PRIO_FUNDO : "var(--color-surface-2)"}
                    />
                  );
                }
                const it = l.it;
                return (
                  <g key={it.key}>
                    <line x1={0} x2={W} y1={y + RH - 0.5} y2={y + RH - 0.5} stroke="var(--color-border)" />
                    {it.stages.map((s, si) => {
                      if (!mostrarEstimativas && s.dk === "est" && (s.cyc ?? 0) > 0) return null;
                      if (s.e < start || s.s > end) return null;
                      const x1 = x(Math.max(s.s, start)), x2 = x(Math.min(s.e, end) + 1), w = Math.max(2, x2 - x1);
                      const { fill, stroke, dash } = corEstagio(s, it);
                      const tip = `<b>${esc(it.code)}${it.at ? " · AT " + esc(it.at) : ""}</b> · ${esc(it.prest)}<br/>${s.kind === "prest" ? "Com o prestador" : s.kind === "hold" ? "HOLD" : "Análise"} · REV ${s.rev ?? "-"}${s.cyc ? " · ciclo estimado " + s.cyc : ""}<br/>${fmt(s.s)} → ${fmt(s.e)}<br/>Pranchas: ${s.pr.toFixed(1)} · Analista: ${esc(it.analyst)}${s.over ? "<br/><b>Prazo vencido</b>" : ""}`;
                      return (
                        <rect
                          key={si}
                          x={x1} y={y + 4} width={w} height={RH - 8} rx={2}
                          fill={fill}
                          stroke={dash ? stroke : "none"} strokeDasharray={dash ? "4 3" : undefined}
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
                        return xb > xa ? <rect x={xa} y={y + 7} width={xb - xa} height={RH - 14} fill={COR_VENCIDO} /> : null;
                      })()}
                    {it.d.libMed?.v != null && it.d.libMed.v >= start && it.d.libMed.v <= end && (() => {
                      const cx = x(it.d.libMed.v) + px / 2, cy = y + RH / 2;
                      return (
                        <g>
                          <circle cx={cx} cy={cy} r={8} fill={COR_OK} />
                          <text x={cx} y={cy + 1} fontSize={10} fontWeight={800} textAnchor="middle" dominantBaseline="middle" fill="#fff">
                            ✓
                          </text>
                        </g>
                      );
                    })()}
                  </g>
                );
              })}
              <line x1={x(base)} x2={x(base)} y1={0} y2={H} stroke={COR_HOJE} strokeWidth={3} strokeOpacity={0.55} />
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
      {/* Legenda — mesmos 9 itens do protótipo de referência, exceto "Novas
          ATs previstas (ritmo)" (aba "📈 Previsão", não portada — ver nota
          em motor.ts). */}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[11px] text-(--color-text-dim)">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-[18px] rounded-sm" style={{ background: COR_PREST }} /> Com o prestador</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-[18px] rounded-sm border border-dashed" style={{ background: COR_PREST_EST, borderColor: COR_PREST }} />
          Com o prestador (data estimada)
        </span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-[18px] rounded-sm" style={{ background: COR_ANAL }} /> Em análise na Tecnoplano</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-[18px] rounded-sm" style={{ background: COR_ANAL_PREV }} /> Análise de documento que ainda vai chegar</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-[18px] rounded-sm" style={{ background: COR_VENCIDO }} /> Atrasado</span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ background: COR_OK }}
          >
            ✓
          </span>
          Liberação
        </span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-1 rounded-sm" style={{ background: COR_HOJE }} /> Hoje</span>
        <span className="inline-flex items-center gap-1"><span style={{ color: COR_PRIO_ESTRELA, fontWeight: 800 }}>★</span> Prioritário</span>
      </p>
    </div>
  );
}
