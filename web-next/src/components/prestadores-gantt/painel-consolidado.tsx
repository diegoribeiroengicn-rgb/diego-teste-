"use client";

import { useMemo, useState } from "react";
import {
  aggregate, buildItems, defaultParams, ehPrioritario, histLib, iso2dn, prepRows, project, Calendario, fmt,
  type ItemGantt, type LinhaBrutaGantt,
} from "@/lib/prestadores-gantt/motor";
import { hojeBr } from "@/lib/dias-uteis";
import { cargaPorAnalista, LIMITE_CONFLITO_PRAZO } from "@/lib/prestadores-gantt/consolidado-calculo";
import { GanttSvg } from "./gantt-svg";
import { calcularKpis, estaAberto } from "./kpis";
import { Kpi, Seg, SelectFiltro } from "./painel";
import type { AgrupamentoGantt } from "./tipos-estado";

type Marc = { documentos: string[]; prestadores: string[] };
type Fluxo = "todos" | "prestadores" | "cessionarios";

const hojeISO = () => hojeBr().toISOString().slice(0, 10);

function projetar(brutas: LinhaBrutaGantt[], fluxo: "prestadores" | "cessionarios", baseISO: string, horizonte: number, slaP: number, slaI: number, cal: Calendario) {
  const modelo = buildItems(prepRows(brutas), { inferLinks: true });
  const hist = histLib(modelo.items);
  const params = { ...defaultParams(baseISO, hist), slaPDefault: slaP, slaIDefault: slaI, horizon: horizonte };
  const res = project(modelo, params, cal);
  const items = res.items.map((it) => ({ ...it, fluxo, key: `${fluxo[0]}:${it.key}` }));
  return { items, base: res.base, hEnd: res.hEnd };
}

/** Gantt consolidado — Prestadores + Cessionários num só quadro, para ver o
 * paralelismo REAL do trabalho de cada analista. Mesmas regras e mesmas
 * fontes dos dois Gantts por fluxo (prazo operacional); projetos arquivados
 * já ficam de fora. Sem capacidade individual cadastrada, mostra volume,
 * simultaneidade e conflitos de prazo — não classifica sobrecarga. */
export function PainelGanttConsolidado({ prestadores, cessionarios, marcPrest, marcCess }: {
  prestadores: LinhaBrutaGantt[]; cessionarios: LinhaBrutaGantt[]; marcPrest: Marc; marcCess: Marc;
}) {
  const [base, setBase] = useState("");
  const [horizonte, setHorizonte] = useState(90);
  const [slaP, setSlaP] = useState(10);
  const [slaI, setSlaI] = useState(10);
  const [fluxo, setFluxo] = useState<Fluxo>("todos");
  const [analista, setAnalista] = useState("");
  const [disciplina, setDisciplina] = useState("");
  const [entidade, setEntidade] = useState("");
  const [prioridade, setPrioridade] = useState("");
  const [prazo, setPrazo] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [agrupar, setAgrupar] = useState<AgrupamentoGantt>("analyst");
  const [zoom, setZoom] = useState(9);
  const [estimativas, setEstimativas] = useState(false);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [grupos, setGrupos] = useState<string[]>([]);

  const baseISO = base || hojeISO();
  const cal = useMemo(() => new Calendario(), []);
  const marcadores = useMemo(() => ({ documentos: [...marcPrest.documentos, ...marcCess.documentos], prestadores: [...marcPrest.prestadores, ...marcCess.prestadores] }), [marcPrest, marcCess]);

  const { todos, baseDn, hEnd } = useMemo(() => {
    const a = projetar(prestadores, "prestadores", baseISO, horizonte, slaP, slaI, cal);
    const b = projetar(cessionarios, "cessionarios", baseISO, horizonte, slaP, slaI, cal);
    return { todos: [...a.items, ...b.items] as ItemGantt[], baseDn: a.base, hEnd: a.hEnd };
  }, [prestadores, cessionarios, baseISO, horizonte, slaP, slaI, cal]);

  const docs = useMemo(() => new Set(marcadores.documentos), [marcadores]);
  const prests = useMemo(() => new Set(marcadores.prestadores), [marcadores]);
  const analistas = useMemo(() => [...new Set(todos.map((i) => i.analyst).filter(Boolean))].sort(), [todos]);
  const disciplinas = useMemo(() => [...new Set(todos.flatMap((i) => i.discs))].filter(Boolean).sort(), [todos]);
  const entidades = useMemo(() => [...new Set(todos.filter((i) => fluxo === "todos" || i.fluxo === fluxo).map((i) => i.prest))].filter(Boolean).sort(), [todos, fluxo]);

  const itens = useMemo(() => {
    let out = todos.filter((it) => estaAberto(it) || !!it.sim);
    if (fluxo !== "todos") out = out.filter((i) => i.fluxo === fluxo);
    if (analista) out = out.filter((i) => i.analyst === analista);
    if (disciplina) out = out.filter((i) => i.discs.includes(disciplina));
    if (entidade) out = out.filter((i) => i.prest === entidade);
    if (prioridade === "analise") out = out.filter(ehPrioritario);
    if (prioridade === "marcador") out = out.filter((i) => docs.has(i.code) || prests.has(i.prest));
    if (prazo) out = out.filter((i) => i.prazo === prazo);
    const lo = iso2dn(de), hi = iso2dn(ate);
    if (lo != null || hi != null) out = out.filter((i) => { const v = i.d.anaDue?.v ?? i.d.prestDue?.v; return v != null && (lo == null || v >= lo) && (hi == null || v <= hi); });
    return out;
  }, [todos, fluxo, analista, disciplina, entidade, prioridade, prazo, de, ate, docs, prests]);

  const agregado = useMemo(() => aggregate(itens, cal, baseDn, hEnd), [itens, cal, baseDn, hEnd]);
  const kpis = useMemo(() => calcularKpis(itens, agregado), [itens, agregado]);
  const carga = useMemo(() => cargaPorAnalista(itens, baseDn, hEnd, cal, estimativas), [itens, baseDn, hEnd, cal, estimativas]);

  const abertosN = itens.filter((i) => !i.sim && estaAberto(i));
  const nP = abertosN.filter((i) => i.fluxo === "prestadores").length;
  const nC = abertosN.filter((i) => i.fluxo === "cessionarios").length;
  const topSim = carga.reduce<typeof carga[number] | null>((m, c) => (!m || c.picoSimultaneas > m.picoSimultaneas ? c : m), null);
  const diasConflito = carga.reduce((t, c) => t + c.diasConflitoPrazo, 0);

  function limpar() { setFluxo("todos"); setAnalista(""); setDisciplina(""); setEntidade(""); setPrioridade(""); setPrazo(""); setDe(""); setAte(""); }

  return (
    <div className="gref">
      <header className="top">
        <div className="logo"><img alt="Tecnoplano" src="/tecnoplano_logo.png" /></div>
        <div>
          <h1>Gantt consolidado — Prestadores + Cessionários</h1>
          <div className="sub">Paralelismo real do trabalho de cada analista · {prestadores.length} linhas de Prestadores · {cessionarios.length} de Cessionários · projetos arquivados fora</div>
        </div>
        <div className="right">Data-base: <b>{fmt(baseDn)}</b> · Horizonte até <b>{fmt(hEnd)}</b></div>
      </header>

      <div className="bar">
        <div className="fld"><label>Data-base</label><input type="date" value={base || baseISO} onChange={(e) => setBase(e.target.value)} /></div>
        <div className="fld"><label>Horizonte (dias)</label><input type="number" min={7} max={730} value={horizonte} onChange={(e) => setHorizonte(Math.max(7, Math.min(730, Number(e.target.value) || 90)))} /></div>
        <div className="fld"><label>SLA do solicitante padrão (du)</label><input type="number" min={1} max={120} value={slaP} onChange={(e) => setSlaP(Math.max(1, Number(e.target.value) || 10))} /></div>
        <div className="fld"><label>SLA análise padrão (du)</label><input type="number" min={1} max={120} value={slaI} onChange={(e) => setSlaI(Math.max(1, Number(e.target.value) || 10))} /></div>
        <div className="fld"><label>Fluxo</label>
          <Seg valor={fluxo} opcoes={[["todos", "Todos os fluxos"], ["prestadores", "Somente prestadores"], ["cessionarios", "Somente cessionários"]]} onChange={(v) => { setFluxo(v as Fluxo); setEntidade(""); }} /></div>
        <SelectFiltro rotulo="Analista" valor={analista} opcoes={analistas} onChange={setAnalista} />
        <SelectFiltro rotulo="Disciplina" valor={disciplina} opcoes={disciplinas} onChange={setDisciplina} />
        <SelectFiltro rotulo={fluxo === "cessionarios" ? "Cessionário" : fluxo === "prestadores" ? "Prestador" : "Prestador / cessionário"} valor={entidade} opcoes={entidades} onChange={setEntidade} />
        <SelectFiltro rotulo="Prioridade" valor={prioridade} opcoes={[["analise", "★ Análises prioritárias"], ["marcador", "☆ Projetos / prestadores prioritários"]]} onChange={setPrioridade} />
        <SelectFiltro rotulo="Situação operacional" valor={prazo} opcoes={["Vencido", "Próximo do vencimento", "Em dia", "HOLD", "Sem dados"]} onChange={setPrazo} />
        <div className="fld"><label>Período (vencimento operacional)</label>
          <div><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /> a <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div></div>
        <div className="fld"><label>&nbsp;</label><button type="button" className="btn sm" onClick={limpar}>Limpar filtros</button></div>
      </div>

      <main>
        <div className="grid kpis" style={{ marginBottom: 12 }}>
          <Kpi ico="📋" lbl="Atividades abertas" val={String(abertosN.length)} cls="" det={`${nP} de prestadores · ${nC} de cessionários`} />
          <Kpi ico="👥" lbl="Analistas com atividades" val={String(carga.length)} cls="" det={carga[0] ? `maior volume: ${carga[0].analista} (${carga[0].atividades})` : "—"} />
          <Kpi ico="⏱" lbl="Maior simultaneidade" val={topSim ? <>{topSim.picoSimultaneas}<small> ao mesmo tempo</small></> : "—"} cls=""
            det={topSim && topSim.picoEm != null ? `${topSim.analista} · ${fmt(topSim.picoEm)}` : "sem atividades"} />
          <Kpi ico="📅" lbl="Conflitos de prazo" val={String(diasConflito)} cls="" det={`dias com ${LIMITE_CONFLITO_PRAZO}+ vencimentos do mesmo analista`} />
          <Kpi ico="★" lbl="Prioritárias" val={String(kpis.prioritarios)} cls="gold" det="análises com prioridade própria" />
          <Kpi ico="📈" lbl="Semana mais cheia" val={kpis.picoSemanal.semana != null ? <>{kpis.picoSemanal.v.toFixed(0)}<small> pranchas</small></> : "—"} cls=""
            det={kpis.picoSemanal.semana != null ? `semana de ${fmt(kpis.picoSemanal.semana)}` : ""} />
          <Kpi ico="⚠" lbl="Vencidas" val={String(kpis.vencidos)} cls={kpis.vencidos ? "red" : ""} det={`próximas do vencimento: ${kpis.proximos}`} />
        </div>

        <div className="card" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0B2A5B" }}>Carga por analista</div>
          <div className="note" style={{ marginBottom: 8 }}>
            Volume, simultaneidade (análises com trabalho previsto no mesmo dia útil) e conflitos de prazo. Sem capacidade individual cadastrada, a situação <b>não é classificada como sobrecarga</b>.
            Clique no analista para filtrar.
          </div>
          <div style={{ overflow: "auto", maxHeight: 340 }}>
            <table className="antb">
              <thead><tr><th className="l">Analista</th><th>Atividades</th><th>Prestadores</th><th>Cessionários</th><th>★ Prioritárias</th><th>Atrasadas</th><th>Pico simultâneo</th><th>Média/dia</th><th>Dias c/ conflito de prazo</th><th>Semana mais cheia</th></tr></thead>
              <tbody>
                {carga.map((c) => (
                  <tr key={c.analista}>
                    <td className="l"><a className="an" onClick={() => setAnalista(c.analista)}>{c.analista}</a></td>
                    <td className="now"><span className="big">{c.atividades}</span><span className="sm">{c.pranchas} pr.</span></td>
                    <td>{c.prestadores}</td><td>{c.cessionarios}</td><td>{c.prioritarias || "—"}</td><td>{c.atrasadas || "—"}</td>
                    <td><span className="big">{c.picoSimultaneas}</span><span className="sm">{c.picoEm != null ? fmt(c.picoEm) : ""}</span></td>
                    <td>{c.mediaSimultaneas.toFixed(1)}</td><td>{c.diasConflitoPrazo || "—"}</td>
                    <td>{c.semanaMaisCheia.semana != null ? <>{c.semanaMaisCheia.pranchas.toFixed(0)} pr.<span className="sm">{fmt(c.semanaMaisCheia.semana)}</span></> : "—"}</td>
                  </tr>
                ))}
                {!carga.length && <tr><td colSpan={10} className="note">Nenhuma atividade para os filtros atuais.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 18px", alignItems: "flex-end" }}>
            <div className="fld"><label>Visualização</label>
              <Seg grande valor={agrupar} opcoes={[["analyst", "Por analista"], ["code", "Por projeto"], ["disc", "Por disciplina"], ["none", "Consolidada"]]} onChange={(v) => setAgrupar(v as AgrupamentoGantt)} /></div>
            <div className="fld"><label>Zoom</label>
              <Seg grande valor={String(zoom)} opcoes={[["5", "Meses"], ["9", "Semanas"], ["16", "Dias"]]} onChange={(v) => setZoom(Number(v))} /></div>
            <div className="fld"><label>Revisões futuras</label>
              <Seg grande valor={estimativas ? "1" : "0"} opcoes={[["0", "Não mostrar"], ["1", "Mostrar prováveis"]]} onChange={(v) => setEstimativas(v === "1")} /></div>
            <div className="fld"><label>Grupos</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="btn" onClick={() => setAbertos(new Set(grupos))}>Abrir todos</button>
                <button type="button" className="btn" onClick={() => setAbertos(new Set())}>Fechar todos</button>
              </div></div>
          </div>
          <div className="legend" style={{ marginTop: 12 }}>
            <span><i style={{ background: "#A3AEBF" }} />Com o solicitante</span>
            <span><i style={{ background: "#1F5BC4" }} />Em análise na Tecnoplano</span>
            <span><i style={{ background: "#8DB0EA" }} />Análise de documento que ainda vai chegar</span>
            <span><i style={{ background: "#D64541" }} />Atrasado</span>
            <span><b className="okc">✓</b>Liberação</span>
            <span><i style={{ background: "#5B6B82", width: 36, color: "#fff", fontSize: 9, textAlign: "center", lineHeight: "14px" }}>PREST</i>Prestador</span>
            <span><i style={{ background: "#7B4FB3", width: 36, color: "#fff", fontSize: 9, textAlign: "center", lineHeight: "14px" }}>CESS</i>Cessionário</span>
            <span><span className="star">★</span>Análise prioritária</span>
            <span><span className="star">☆</span>Projeto/prestador prioritário</span>
          </div>
          <div className="note" style={{ marginTop: 8 }}>
            Prazo exibido: operacional (referência do analista). Clique no nome de um grupo para abrir ou fechar e numa linha para ver o histórico.
          </div>
        </div>

        <GanttSvg
          itens={itens} agregado={agregado} base={baseDn} hEnd={hEnd} cal={cal} agrupar={agrupar} mostrarEstimativas={estimativas} zoom={zoom}
          abertos={abertos} marcadores={marcadores} modulo="consolidado" contratuais={null}
          onAlternarGrupo={(g) => setAbertos((a) => { const n = new Set(a); if (n.has(g)) n.delete(g); else n.add(g); return n; })}
          onGrupos={setGrupos}
        />
      </main>
    </div>
  );
}
