"use client";

import { useEffect, useMemo, useState } from "react";
import {
  aggregate,
  buildItems,
  defaultParams,
  ehPrioritario,
  histLib,
  prepRows,
  project,
  Calendario,
  fmt,
  type EntregaFutura,
  type ItemGantt,
  type LinhaBrutaGantt,
} from "@/lib/prestadores-gantt/motor";
import { hojeBr } from "@/lib/dias-uteis";
import { GanttSvg } from "./gantt-svg";
import { PainelAnalistas } from "./painel-analistas";
import { calcularKpis, estaAberto } from "./kpis";
import { useRouter } from "next/navigation";
import { PremissasDialog } from "./premissas-dialog";
import { FILTROS_PADRAO, PREMISSAS_PADRAO, UI_PADRAO, type CenarioSalvo, type EntregaFuturaEstado, type FiltrosGanttEstado, type PremissasEstado, type UiGanttEstado } from "./tipos-estado";
import { FERIADOS_RJ_ISO } from "@/lib/dias-uteis";
import { iso2dn } from "@/lib/prestadores-gantt/motor";

const CHAVE_BASE = "gat_gantt_prestadores_v1";
const CHAVE_CENARIOS_BASE = "gat_gantt_prestadores_cenarios_v1";
let CHAVE_LOCALSTORAGE = CHAVE_BASE;
let CHAVE_CENARIOS = CHAVE_CENARIOS_BASE;

function hojeISO(): string {
  const d = hojeBr();
  return d.toISOString().slice(0, 10);
}

function carregarEstadoSalvo(): { filtros?: FiltrosGanttEstado; ui?: UiGanttEstado; futuras?: EntregaFuturaEstado[]; premissas?: PremissasEstado } {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCALSTORAGE);
    return bruto ? JSON.parse(bruto) : {};
  } catch {
    return {};
  }
}

function salvarEstado(dados: { filtros: FiltrosGanttEstado; ui: UiGanttEstado; futuras: EntregaFuturaEstado[]; premissas: PremissasEstado }): void {
  try {
    localStorage.setItem(CHAVE_LOCALSTORAGE, JSON.stringify(dados));
  } catch {
    // armazenamento indisponível — segue sem persistir
  }
}

export type ModuloPainelGantt = "prestadores" | "cessionarios";

export function PainelGanttPrestadores({ linhasBrutas, geradoEm, marcadores, podeDefinirPrioridade, modulo = "prestadores", contratuais = null }: {
  linhasBrutas: LinhaBrutaGantt[]; geradoEm?: string; marcadores: { documentos: string[]; prestadores: string[] }; podeDefinirPrioridade: boolean;
  modulo?: ModuloPainelGantt;
  /** Vencimento contratual por análise (id) — só chega a Gestor/Admin; `null` para os demais. */
  contratuais?: Record<number, { vencimento: string; sla: number }> | null;
}) {
  const cess = modulo === "cessionarios";
  // Chaves de armazenamento separadas por módulo (cada Gantt guarda seus filtros e cenários).
  CHAVE_LOCALSTORAGE = cess ? "gat_gantt_cessionarios_v1" : CHAVE_BASE;
  CHAVE_CENARIOS = cess ? "gat_gantt_cessionarios_cenarios_v1" : CHAVE_CENARIOS_BASE;
  const R = cess
    ? { ent: "Cessionário", entMin: "cessionário", obra: "Tipo", aba: "PROJ_CESS", com: "Com o cessionário", titulo: "Gantt de Cessionários — Fluxo Cessionário × Análise e Paralelismo", sla: "SLA cessionário padrão (du)" }
    : { ent: "Prestador", entMin: "prestador", obra: "Projeto (obra)", aba: "PROJ_PREST", com: "Com o prestador", titulo: "Gantt de ATs — Fluxo Prestador × Análise e Paralelismo", sla: "SLA prestador padrão (du)" };
  const [filtros, setFiltros] = useState<FiltrosGanttEstado>(
    () => ({ ...FILTROS_PADRAO, ...carregarEstadoSalvo().filtros }),
  );
  const [ui, setUi] = useState<UiGanttEstado>(() => ({ ...UI_PADRAO, ...carregarEstadoSalvo().ui }));
  const [futuras, setFuturas] = useState<EntregaFuturaEstado[]>(() => carregarEstadoSalvo().futuras ?? []);
  const [premissas, setPremissas] = useState<PremissasEstado>(() => ({ ...PREMISSAS_PADRAO, ...carregarEstadoSalvo().premissas }));
  const router = useRouter();
  const [datasAbertas, setDatasAbertas] = useState(false);
  const [editandoPremissas, setEditandoPremissas] = useState(false);
  const [abaPremissas, setAbaPremissas] = useState<"prio" | "sla" | "cal" | "adv" | undefined>(undefined);
  const [cenarios, setCenarios] = useState<CenarioSalvo[]>(() => {
    try { return JSON.parse(localStorage.getItem(CHAVE_CENARIOS) || "[]"); } catch { return []; }
  });
  const [cenAtivo, setCenAtivo] = useState<number | null>(null);
  const [comparar, setComparar] = useState("");
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(() => new Set());
  const [gruposDisponiveis, setGruposDisponiveis] = useState<string[]>([]);

  useEffect(() => {
    salvarEstado({ filtros, ui, futuras, premissas });
  }, [filtros, ui, futuras, premissas]);
  useEffect(() => {
    try { localStorage.setItem(CHAVE_CENARIOS, JSON.stringify(cenarios)); } catch { /* sem armazenamento */ }
  }, [cenarios]);

  const prep = useMemo(() => prepRows(linhasBrutas), [linhasBrutas]);
  const modelo = useMemo(() => buildItems(prep, { inferLinks: true }), [prep]);
  const hist = useMemo(() => histLib(modelo.items), [modelo]);
  const feriadosISO = useMemo(
    () => [...new Set([...FERIADOS_RJ_ISO, ...premissas.feriadosExtras])].filter((f) => !premissas.feriadosRemovidos.includes(f)),
    [premissas.feriadosExtras, premissas.feriadosRemovidos],
  );
  const cal = useMemo(() => new Calendario(feriadosISO), [feriadosISO]);

  const simulado = ui.cenario === "simulado";
  const baseISO = ui.base || hojeISO();

  const todosPrestadores = useMemo(() => [...new Set(modelo.items.map((it) => it.prest))].filter(Boolean).sort(), [modelo]);
  const todosCodigos = useMemo(() => [...new Set(modelo.items.map((it) => it.code))].filter(Boolean).sort(), [modelo]);
  const todasObras = useMemo(() => [...new Set(modelo.items.map((it) => it.obra))].filter(Boolean).sort(), [modelo]);
  const todasAts = useMemo(() => [...new Set(modelo.items.map((it) => it.at || ""))].filter(Boolean).sort(), [modelo]);
  const todasDisciplinas = useMemo(() => [...new Set(modelo.items.flatMap((it) => it.discs))].filter(Boolean).sort(), [modelo]);
  const todosAnalistas = useMemo(
    () => [...new Set(linhasBrutas.map((r) => (r.resp || "").trim().toUpperCase()))].filter((a) => a && a !== "SEM RESPONSÁVEL").sort(),
    [linhasBrutas],
  );

  function montarParams(prem: PremissasEstado, slaP: number, slaI: number) {
    const base = defaultParams(baseISO, hist);
    return {
      ...base,
      slaPDefault: slaP,
      slaIDefault: slaI,
      slaPOver: prem.slaPOver,
      slaIOver: prem.slaIOver,
      prox: prem.prox,
      critRev: prem.critRev,
      oldMonths: prem.oldMonths,
      oldRef: prem.oldRef,
      overdueMode: prem.overdueMode,
      overdueSpread: prem.overdueSpread,
      useL: prem.useL,
      pLib: base.pLib.map((v, i) => (prem.pLib[i] != null ? (prem.pLib[i] as number) / 100 : v)),
      maxCycles: prem.maxCycles,
      minW: prem.minW / 100,
      volFactor: prem.volFactor,
      includeOld: ui.incluirAntigos,
      horizon: ui.horizonte,
      futuras: simulado
        ? futuras.map((f): EntregaFutura => ({
            code: f.code, obra: f.obra, disc: f.disc, analyst: f.analyst, date: f.date, n: f.n, pr: f.pr, slaI: f.slaI,
          }))
        : [],
    };
  }

  const params = useMemo(
    () => montarParams(premissas, ui.slaP, ui.slaI),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hist, baseISO, premissas, ui.slaP, ui.slaI, ui.incluirAntigos, ui.horizonte, futuras, simulado],
  );

  const resultado = useMemo(() => project(modelo, params, cal), [modelo, params, cal]);

  function filtrar(todos: ItemGantt[]): ItemGantt[] {
    let out: ItemGantt[] = todos;
    const termo = filtros.busca.trim().toUpperCase();
    if (termo) {
      out = out.filter(
        (it) =>
          it.code.includes(termo) ||
          (it.at || "").toUpperCase().includes(termo) ||
          (it.obra || "").toUpperCase().includes(termo) ||
          it.prest.toUpperCase().includes(termo),
      );
    }
    if (filtros.codigo) out = out.filter((it) => it.code === filtros.codigo);
    if (filtros.prestadores.length) out = out.filter((it) => filtros.prestadores.includes(it.prest));
    if (filtros.obra) out = out.filter((it) => it.obra === filtros.obra);
    if (filtros.at) out = out.filter((it) => it.at === filtros.at);
    if (filtros.disciplina) out = out.filter((it) => it.discs.includes(filtros.disciplina));
    if (filtros.analistas.length) out = out.filter((it) => filtros.analistas.includes(it.analyst));
    if (filtros.criticidade === "crit") out = out.filter((it) => it.crit);
    if (filtros.criticidade === "norm") out = out.filter((it) => !it.crit);
    if (filtros.prazo) out = out.filter((it) => it.prazo === filtros.prazo);
    if (filtros.fase === "analise") out = out.filter((it) => it.state === "EM ANÁLISE");
    if (filtros.fase === "prest") out = out.filter((it) => estaAberto(it) && it.state !== "EM ANÁLISE");
    if (filtros.statusLib === "pend") out = out.filter((it) => estaAberto(it) || !!it.sim);
    if (filtros.statusLib === "lib") out = out.filter((it) => !!it.closed);
    if (filtros.apenasCriticas) out = out.filter((it) => it.crit);
    if (filtros.apenasVencidas) out = out.filter((it) => it.prazo === "Vencido");
    if (filtros.apenasPrioritarios) out = out.filter(ehPrioritario);
    const faixa = (a: string, b: string, chave: "prestDue" | "recv" | "anaDue") => {
      const lo = iso2dn(a), hi = iso2dn(b);
      if (lo == null && hi == null) return;
      out = out.filter((it) => {
        const v = it.d[chave]?.v;
        return v != null && (lo == null || v >= lo) && (hi == null || v <= hi);
      });
    };
    faixa(filtros.pd1, filtros.pd2, "prestDue");
    faixa(filtros.rv1, filtros.rv2, "recv");
    faixa(filtros.ad1, filtros.ad2, "anaDue");
    return out;
  }

  const itensFiltrados = useMemo(() => filtrar(resultado.items), [resultado, filtros]); // eslint-disable-line react-hooks/exhaustive-deps

  const agregadoFiltrado = useMemo(() => aggregate(itensFiltrados, cal, resultado.base, resultado.hEnd), [itensFiltrados, cal, resultado]);
  const kpis = useMemo(() => calcularKpis(itensFiltrados, agregadoFiltrado), [itensFiltrados, agregadoFiltrado]);

  // Comparação com outro cenário (ou com os prazos padrão): só os indicadores.
  const kpisRef = useMemo(() => {
    if (!comparar) return null;
    let prem = premissas, slaP = ui.slaP, slaI = ui.slaI, nome = "Prazos padrão";
    if (comparar === "padrao") {
      prem = { ...premissas, slaPOver: {}, slaIOver: {} }; slaP = 10; slaI = 10;
    } else {
      const c = cenarios[Number(comparar)];
      if (!c) return null;
      prem = { ...PREMISSAS_PADRAO, ...c.premissas }; slaP = c.slaP; slaI = c.slaI; nome = c.nome;
    }
    const res = project(modelo, montarParams(prem, slaP, slaI), cal);
    const it = filtrar(res.items);
    return { nome, k: calcularKpis(it, aggregate(it, cal, res.base, res.hEnd)) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparar, cenarios, modelo, cal, premissas, ui.slaP, ui.slaI, params, filtros]);

  function delta(atual: number, ref: number | undefined, fmtv: (n: number) => string = (n) => String(Math.round(n))): React.ReactNode {
    if (!kpisRef || ref == null) return null;
    if (atual === ref) return <div className="cmp">igual em “{kpisRef.nome}”</div>;
    const melhor = atual < ref;
    return <div className="cmp" style={{ color: melhor ? "#1E8449" : "#D64541" }}>{melhor ? "▼" : "▲"} era {fmtv(ref)} em “{kpisRef.nome}”</div>;
  }

  function salvarCenario() {
    if (cenAtivo == null) { novoCenario(); return; }
    setCenarios((l) => l.map((c, i) => (i === cenAtivo ? { ...c, premissas, slaP: ui.slaP, slaI: ui.slaI } : c)));
    window.alert(`Cenário "${cenarios[cenAtivo].nome}" atualizado.`);
  }
  function novoCenario() {
    const nome = (window.prompt('Nome do novo cenário (ex.: "P267 com SLA de 8 dias"):') || "").trim();
    if (!nome) return;
    setCenarios((l) => [...l, { nome, premissas, slaP: ui.slaP, slaI: ui.slaI, criado: new Date().toISOString().slice(0, 10) }]);
    setCenAtivo(cenarios.length);
    window.alert(`Cenário "${nome}" salvo neste navegador.\nAltere as premissas em "Editar premissas" e salve outro cenário para comparar.`);
  }
  function excluirCenario() {
    if (cenAtivo == null) return;
    if (!window.confirm(`Excluir o cenário "${cenarios[cenAtivo].nome}"?`)) return;
    setCenarios((l) => l.filter((_, i) => i !== cenAtivo));
    setCenAtivo(null); setComparar("");
  }
  function aplicarCenario(v: string) {
    if (v === "") { setCenAtivo(null); return; }
    const c = cenarios[Number(v)];
    if (!c) return;
    setPremissas({ ...PREMISSAS_PADRAO, ...c.premissas });
    setUi((u) => ({ ...u, slaP: c.slaP, slaI: c.slaI }));
    setCenAtivo(Number(v));
  }

  function alternarSelecao(lista: string[], valor: string): string[] {
    return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
  }
  function adicionarFutura(entrada: Omit<EntregaFuturaEstado, "id">) {
    setFuturas((atual) => [...atual, { ...entrada, id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }]);
  }
  function removerFutura(id: string) {
    setFuturas((atual) => atual.filter((f) => f.id !== id));
  }
  const setF = (p: Partial<FiltrosGanttEstado>) => setFiltros((f) => ({ ...f, ...p }));
  const setU = (p: Partial<UiGanttEstado>) => setUi((u) => ({ ...u, ...p }));
  async function definirMarcador(tipo: "DOCUMENTO" | "PRESTADOR", chave: string, ativo: boolean): Promise<string | null> {
    try {
      const r = await fetch("/api/prioridades/marcador", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, tabela: modulo, chave, ativo, origem: "GESTAO" }) });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) return corpo.erro ?? "Não foi possível salvar a prioridade.";
      router.refresh();
      return null;
    } catch {
      return "Não foi possível conectar ao sistema.";
    }
  }
  function limparFiltros() { setFiltros({ ...FILTROS_PADRAO }); }
  function restaurarPadrao() { setFiltros({ ...FILTROS_PADRAO }); setUi({ ...UI_PADRAO }); setPremissas({ ...PREMISSAS_PADRAO }); setCenAtivo(null); setComparar(""); }

  const baseBr = fmt(resultado.base);
  const fimBr = fmt(resultado.hEnd);

  return (
    <div className="gref">
      <header className="top">
        <div className="logo"><img alt="Tecnoplano" src="/tecnoplano_logo.png" /></div>
        <div>
          <h1>{R.titulo}</h1>
          <div className="sub">Fonte: aba {R.aba} · {linhasBrutas.length} linhas{geradoEm ? ` · extraído em ${geradoEm}` : ""}</div>
        </div>
        <div className="right">
          Data-base: <b>{baseBr}</b> · Horizonte até <b>{fimBr}</b>
          <br />
          <span>Cenário: <span className="badge-sc">{simulado ? "SIMULADO — inclui estimativas" : "ATUAL — só dados reais"}</span></span>
        </div>
      </header>

      <div className="bar">
        <div className="fld"><label>Data-base</label>
          <input type="date" value={ui.base || baseISO} onChange={(e) => setU({ base: e.target.value })} />
        </div>
        <div className="fld"><label>Horizonte (dias)</label>
          <input type="number" min={7} max={730} value={ui.horizonte} onChange={(e) => setU({ horizonte: Math.max(7, Math.min(730, Number(e.target.value) || 90)) })} />
        </div>
        <div className="fld"><label>{R.sla}</label>
          <input type="number" min={1} max={120} value={ui.slaP} onChange={(e) => setU({ slaP: Math.max(1, Math.min(120, Number(e.target.value) || 10)) })} />
        </div>
        <div className="fld"><label>SLA análise padrão (du)</label>
          <input type="number" min={1} max={120} value={ui.slaI} onChange={(e) => setU({ slaI: Math.max(1, Math.min(120, Number(e.target.value) || 10)) })} />
        </div>
        <div className="fld"><label>Cenário</label>
          <Seg valor={ui.cenario} opcoes={[["atual", "Atual"], ["simulado", "Simulado"]]} onChange={(v) => setU({ cenario: v as UiGanttEstado["cenario"], mostrarEstimativas: v === "simulado" })} />
        </div>
        <div className="fld"><label>Projetos &gt; {params.oldMonths} meses</label>
          <Seg valor={ui.incluirAntigos ? "1" : "0"} opcoes={[["0", "Excluídos"], ["1", "Incluídos"]]} onChange={(v) => setU({ incluirAntigos: v === "1" })} />
        </div>
        <div className="fld"><label>Buscar (código, AT, {cess ? "tipo" : "obra"})</label>
          <input value={filtros.busca} onChange={(e) => setF({ busca: e.target.value })} placeholder="Ex.: P221 ou AT-0466" style={{ width: 170 }} />
        </div>
        <SelectFiltro rotulo="Código" valor={filtros.codigo} opcoes={todosCodigos} onChange={(v) => setF({ codigo: v })} />
        <SeletorMultiplo rotulo={R.ent} opcoes={todosPrestadores} selecionados={filtros.prestadores}
          onAlternar={(v) => setF({ prestadores: alternarSelecao(filtros.prestadores, v) })} onLimpar={() => setF({ prestadores: [] })} />
        <SelectFiltro rotulo={R.obra} valor={filtros.obra} opcoes={todasObras} onChange={(v) => setF({ obra: v })} />
        <SelectFiltro rotulo="AT" valor={filtros.at} opcoes={todasAts} onChange={(v) => setF({ at: v })} />
        <SelectFiltro rotulo="Disciplina" valor={filtros.disciplina} opcoes={todasDisciplinas} onChange={(v) => setF({ disciplina: v })} />
        <SeletorMultiplo rotulo="Analista" opcoes={todosAnalistas} selecionados={filtros.analistas}
          onAlternar={(v) => setF({ analistas: alternarSelecao(filtros.analistas, v) })} onLimpar={() => setF({ analistas: [] })} />
        <SelectFiltro rotulo="Status liberação" valor={filtros.statusLib} semTodos
          opcoes={[["pend", "Pendentes"], ["lib", "Liberadas"], ["todos", "Todos"]]} onChange={(v) => setF({ statusLib: v })} />
        <SelectFiltro rotulo="Criticidade" valor={filtros.criticidade} opcoes={[["crit", "Críticas"], ["norm", "Normais"]]} onChange={(v) => setF({ criticidade: v })} />
        <SelectFiltro rotulo="Situação do prazo" valor={filtros.prazo}
          opcoes={["Vencido", "Próximo do vencimento", "Em dia", "HOLD", "Sem dados"]} onChange={(v) => setF({ prazo: v })} />
        <SelectFiltro rotulo="Fase atual" valor={filtros.fase} opcoes={[["prest", R.com], ["analise", "Em análise"]]} onChange={(v) => setF({ fase: v })} />
        <SelectFiltro rotulo="Prioridade" valor={filtros.apenasPrioritarios ? "prio" : ""} opcoes={[["prio", "★ Só prioritários"]]} onChange={(v) => setF({ apenasPrioritarios: v === "prio" })} />
        <div className="fld"><label>&nbsp;</label>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn sm" type="button" onClick={() => setDatasAbertas((a) => !a)}>Datas ▾</button>
            <button className="btn sm" type="button" onClick={limparFiltros}>Limpar filtros</button>
            <button className="btn sm gold" type="button" onClick={restaurarPadrao}>Restaurar padrão</button>
          </div>
        </div>
        {datasAbertas && (
          <div id="dateFilters" style={{ display: "flex", width: "100%", gap: 10, flexWrap: "wrap" }}>
            <div className="fld"><label>Entrega prevista do {R.entMin}</label>
              <div><input type="date" value={filtros.pd1} onChange={(e) => setF({ pd1: e.target.value })} /> a <input type="date" value={filtros.pd2} onChange={(e) => setF({ pd2: e.target.value })} /></div></div>
            <div className="fld"><label>Retorno/recebimento previsto</label>
              <div><input type="date" value={filtros.rv1} onChange={(e) => setF({ rv1: e.target.value })} /> a <input type="date" value={filtros.rv2} onChange={(e) => setF({ rv2: e.target.value })} /></div></div>
            <div className="fld"><label>Conclusão prevista da análise</label>
              <div><input type="date" value={filtros.ad1} onChange={(e) => setF({ ad1: e.target.value })} /> a <input type="date" value={filtros.ad2} onChange={(e) => setF({ ad2: e.target.value })} /></div></div>
          </div>
        )}
      </div>

      <main>
        <div className="grid kpis" style={{ marginBottom: 12 }}>
          <Kpi ico="📤" lbl={R.com} val={String(kpis.comPrestador)} cls=""
            det={<>{kpis.comPrestadorAtrasados ? <b>{kpis.comPrestadorAtrasados} atrasados</b> : "nenhum atrasado"}{delta(kpis.comPrestadorAtrasados, kpisRef?.k.comPrestadorAtrasados)}</>} />
          <Kpi ico="🔎" lbl="Em análise na Tecnoplano" val={String(kpis.emAnalise)} cls=""
            det={<>{kpis.emAnaliseAtrasadas ? <b>{kpis.emAnaliseAtrasadas} atrasadas</b> : "nenhuma atrasada"}{delta(kpis.emAnaliseAtrasadas, kpisRef?.k.emAnaliseAtrasadas)}</>} />
          <Kpi ico="★" lbl="Prioritários" val={String(kpis.prioritarios)} cls="gold"
            det={<>{kpis.prioritarios} análises prioritárias abertas<br /><b>{kpis.prioritariosAtrasados} atrasadas</b>{delta(kpis.prioritariosAtrasados, kpisRef?.k.prioritariosAtrasados)}</>} />
          <Kpi ico="📈" lbl="Novas ATs previstas" val={kpis.simulados ? `≈${kpis.simulados}` : "—"} cls=""
            det={kpis.simulados ? "estimadas pelo ritmo e entregas futuras" : "previsão desligada"} />
          <Kpi ico="⚠" lbl="Atrasados ou críticos" val={<>{kpis.vencidos}<small> atrasados</small></>} cls={kpis.vencidos ? "red" : ""}
            det={<>{`${kpis.criticas} com muitas revisões (críticos) · próximos: ${kpis.proximos}`}{delta(kpis.vencidos, kpisRef?.k.vencidos)}</>} />
          <Kpi ico="📈" lbl="Semana mais cheia" val={kpis.picoSemanal.semana != null ? <>{kpis.picoSemanal.v.toFixed(0)}<small> pranchas</small></> : "—"} cls=""
            det={<>{kpis.picoSemanal.semana != null ? `semana de ${fmt(kpis.picoSemanal.semana)}` : ""}{delta(Math.round(kpis.picoSemanal.v), kpisRef ? Math.round(kpisRef.k.picoSemanal.v) : undefined)}</>} />
          <Kpi ico="✓" lbl="Tudo liberado por volta de" val={kpis.conclusaoSemNovasReprovacoes != null ? fmt(kpis.conclusaoSemNovasReprovacoes) : "—"} cls=""
            det={<>{`se aprovado na próxima análise · com revisões prováveis: ${kpis.conclusaoMediana != null ? fmt(kpis.conclusaoMediana) : "—"}`}{kpis.conclusaoSemNovasReprovacoes != null && delta(kpis.conclusaoSemNovasReprovacoes, kpisRef?.k.conclusaoSemNovasReprovacoes ?? undefined, (n) => fmt(n))}</>} />
        </div>

        <div className="card scenbar">
          <div className="sc-l"><span className="sc-t">Cenário</span>
            <select value={cenAtivo == null ? "" : String(cenAtivo)} onChange={(e) => aplicarCenario(e.target.value)}>
              <option value="">Atual (em edição)</option>
              {cenarios.map((c, i) => <option key={i} value={i}>{c.nome}</option>)}
            </select>
            <button type="button" className="btn" onClick={() => { setAbaPremissas(undefined); setEditandoPremissas(true); }}>✎ Editar premissas</button>
            <button type="button" className="btn" onClick={salvarCenario}>💾 Salvar</button>
            <button type="button" className="btn pri" onClick={novoCenario}>+ Novo cenário</button>
            <button type="button" className="btn" onClick={excluirCenario} disabled={cenAtivo == null}>Excluir</button>
          </div>
          <div className="sc-r"><span className="sc-t">Comparar com</span>
            <select value={comparar} onChange={(e) => setComparar(e.target.value)}>
              <option value="">— não comparar —</option>
              <option value="padrao">Prazos padrão (SLAs iniciais)</option>
              {cenarios.map((c, i) => <option key={i} value={i}>{c.nome}</option>)}
            </select>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 18px", alignItems: "flex-end" }}>
            <div className="fld"><label>Visão</label>
              <Seg grande valor={ui.visao} opcoes={[["gantt", "📅 Gantt"], ["an", "👥 Analistas"]]} onChange={(v) => setU({ visao: v as UiGanttEstado["visao"] })} />
            </div>
            <div className="fld"><label>Mostrar</label>
              <Seg grande valor={filtros.apenasPrioritarios ? "prio" : "all"} opcoes={[["all", "Todos"], ["prio", "★ Só prioritários"]]} onChange={(v) => setF({ apenasPrioritarios: v === "prio" })} />
            </div>
            <div className="fld"><label>Prioridades</label>
              <button type="button" className="btn gold" style={{ height: 36 }} onClick={() => { setAbaPremissas("prio"); setEditandoPremissas(true); }}>★ Definir prioridades</button>
            </div>
            <div className="fld"><label>Organizar por</label>
              <Seg grande valor={ui.agrupar} opcoes={[["code", "Projeto"], ["prest", R.ent], ["analyst", "Analista"], ["sla", "Prazo (SLA)"]]} onChange={(v) => setU({ agrupar: v as UiGanttEstado["agrupar"] })} />
            </div>
            <div className="fld"><label>Zoom</label>
              <Seg grande valor={String(ui.zoom)} opcoes={[["5", "Meses"], ["9", "Semanas"], ["16", "Dias"]]} onChange={(v) => setU({ zoom: Number(v) })} />
            </div>
            <div className="fld"><label>Revisões futuras</label>
              <Seg grande valor={ui.mostrarEstimativas ? "1" : "0"} opcoes={[["0", "Não mostrar"], ["1", "Mostrar prováveis"]]} onChange={(v) => setU({ mostrarEstimativas: v === "1" })} />
            </div>
            <div className="fld"><label>Grupos</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="btn" onClick={() => setGruposAbertos(new Set(gruposDisponiveis))}>Abrir todos</button>
                <button type="button" className="btn" onClick={() => setGruposAbertos(new Set())}>Fechar todos</button>
              </div>
            </div>
          </div>
          <div className="legend" style={{ marginTop: 12 }}>
            <span><i style={{ background: "#A3AEBF" }} />{R.com}</span>
            <span><i style={{ background: "#D5DBE5", border: "1px dashed #A3AEBF" }} />{R.com} (data estimada)</span>
            <span><i style={{ background: "#1F5BC4" }} />Em análise na Tecnoplano</span>
            <span><i style={{ background: "#8DB0EA" }} />Análise de documento que ainda vai chegar</span>
            <span><i style={{ background: "#D64541" }} />Atrasado</span>
            <span><b className="okc">✓</b>Liberação</span>
            <span><i style={{ background: "#C9B6E8" }} />Novas ATs previstas (ritmo)</span>
            <span><i style={{ background: "#C9A227", width: 4 }} />Hoje</span>
            <span><span className="star">★</span>Prioritário</span>
          </div>
          <div className="note" style={{ marginTop: 8 }}>
            Clique no nome de um projeto para abrir ou fechar. Clique numa linha para ver o histórico. Passe o mouse sobre as barras para ver as datas.
          </div>
        </div>

        {ui.visao === "an" ? (
          <PainelAnalistas
            itens={itensFiltrados} base={resultado.base} hEnd={resultado.hEnd} cal={cal} mostrarEstimativas={ui.mostrarEstimativas}
            gran={ui.anGran} onGran={(g) => setU({ anGran: g })}
            onVer={(an) => { setF({ analistas: [an] }); setU({ visao: "gantt" }); }}
          />
        ) : (
          <GanttSvg
            itens={itensFiltrados}
            agregado={agregadoFiltrado}
            base={resultado.base}
            hEnd={resultado.hEnd}
            cal={cal}
            agrupar={ui.agrupar}
            mostrarEstimativas={ui.mostrarEstimativas}
            zoom={ui.zoom}
            abertos={gruposAbertos}
            marcadores={marcadores}
            modulo={modulo}
            contratuais={contratuais}
            onAlternarGrupo={(g) => setGruposAbertos((a) => { const n = new Set(a); if (n.has(g)) n.delete(g); else n.add(g); return n; })}
            onGrupos={setGruposDisponiveis}
          />
        )}

        <PainelEntregasFuturas
          futuras={futuras}
          prestadores={todosPrestadores}
          analistas={todosAnalistas}
          onAdicionar={adicionarFutura}
          onRemover={removerFutura}
        />
      </main>
      <PremissasDialog
        aberto={editandoPremissas} onFechar={() => setEditandoPremissas(false)}
        nomeCenario={cenAtivo != null && cenarios[cenAtivo] ? ` · cenário: ${cenarios[cenAtivo].nome}` : " · cenário atual (não salvo)"}
        premissas={premissas} setPremissas={setPremissas} ui={ui} setUi={setUi} hist={hist} itens={modelo.items} marcadores={marcadores} tabela={modulo} podeDefinir={podeDefinirPrioridade} onDefinirMarcador={definirMarcador} abaInicial={abaPremissas}
      />
    </div>
  );
}

function Kpi({ ico, lbl, val, det, cls }: { ico: string; lbl: string; val: React.ReactNode; det: React.ReactNode; cls?: string }) {
  return (
    <div className={`card kpi ${cls || ""}`}>
      <div className="lbl">{ico} {lbl}</div>
      <div className="val">{val}</div>
      <div className="det">{det}</div>
    </div>
  );
}

function Seg({ valor, opcoes, onChange, grande }: { valor: string; opcoes: [string, string][]; onChange: (v: string) => void; grande?: boolean }) {
  return (
    <div className={`seg ${grande ? "big" : ""}`}>
      {opcoes.map(([v, t]) => (
        <button key={v} type="button" className={v === valor ? "on" : ""} onClick={() => onChange(v)}>{t}</button>
      ))}
    </div>
  );
}

function SelectFiltro({
  rotulo, valor, opcoes, onChange, semTodos,
}: { rotulo: string; valor: string; opcoes: (string | [string, string])[]; onChange: (v: string) => void; semTodos?: boolean }) {
  return (
    <div className="fld"><label>{rotulo}</label>
      <select value={valor} onChange={(e) => onChange(e.target.value)}>
        {!semTodos && <option value="">Todos</option>}
        {opcoes.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
      </select>
    </div>
  );
}

function SeletorMultiplo({
  rotulo, opcoes, selecionados, onAlternar, onLimpar,
}: { rotulo: string; opcoes: string[]; selecionados: string[]; onAlternar: (valor: string) => void; onLimpar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const filtradas = opcoes.filter((o) => o.toUpperCase().includes(busca.toUpperCase()));
  return (
    <div className="fld"><label>{rotulo}</label>
      <div className="ms">
        <button type="button" className={selecionados.length ? "act" : ""} onClick={() => setAberto((a) => !a)}>
          {selecionados.length ? `${selecionados.length} selecionado(s)` : "Todos"}
        </button>
        {aberto && (
          <div className="pop">
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" autoFocus />
            <div className="acts">
              <button type="button" className="btn sm" onClick={onLimpar}>Limpar</button>
              <button type="button" className="btn sm" onClick={() => setAberto(false)}>Fechar</button>
            </div>
            <div className="lst">
              {filtradas.map((o) => (
                <label key={o}><input type="checkbox" checked={selecionados.includes(o)} onChange={() => onAlternar(o)} />{o}</label>
              ))}
              {!filtradas.length && <p className="note">Nenhum resultado.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PainelEntregasFuturas({
  futuras,
  prestadores,
  analistas,
  onAdicionar,
  onRemover,
}: {
  futuras: EntregaFuturaEstado[];
  prestadores: string[];
  analistas: string[];
  onAdicionar: (e: Omit<EntregaFuturaEstado, "id">) => void;
  onRemover: (id: string) => void;
}) {
  const [code, setCode] = useState("");
  const [data, setData] = useState("");
  const [qtd, setQtd] = useState(1);
  const [pr, setPr] = useState(1);
  const [analista, setAnalista] = useState("");

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !data) return;
    onAdicionar({ code: code.trim().toUpperCase(), date: data, n: qtd, pr, analyst: analista || undefined });
    setCode(""); setData(""); setQtd(1); setPr(1); setAnalista("");
  }

  return (
    <div className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
      <h2 className="text-sm font-semibold text-(--color-navy)">Entregas futuras simuladas</h2>
      <p className="mt-1 text-xs text-(--color-text-weak)">
        Adicione uma entrada hipotética (prestador/código prioritário, data de entrada prevista e quantidade de documentos) para ver o
        impacto na carga projetada e no paralelismo — não grava nada no sistema, fica só nesta tela (salvo no seu navegador).
      </p>

      <form onSubmit={enviar} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-dim)">Código</span>
          <input
            value={code} onChange={(e) => setCode(e.target.value)} list="codigos-prestadores" placeholder="Ex.: P221"
            className="w-28 rounded-lg border border-(--color-border) bg-(--color-bg) px-2.5 py-1.5 text-sm text-(--color-text) outline-none focus:border-(--color-navy)"
          />
          <datalist id="codigos-prestadores">{prestadores.map((p) => <option key={p} value={p} />)}</datalist>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-dim)">Data de entrada</span>
          <input
            type="date" value={data} onChange={(e) => setData(e.target.value)}
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-2.5 py-1.5 text-sm text-(--color-text) outline-none focus:border-(--color-navy)"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-dim)">Qtd. de ATs</span>
          <input
            type="number" min={1} max={50} value={qtd} onChange={(e) => setQtd(Math.max(1, Number(e.target.value) || 1))}
            className="w-20 rounded-lg border border-(--color-border) bg-(--color-bg) px-2.5 py-1.5 text-sm text-(--color-text) outline-none focus:border-(--color-navy)"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-dim)">Pranchas por AT</span>
          <input
            type="number" min={1} max={999} value={pr} onChange={(e) => setPr(Math.max(1, Number(e.target.value) || 1))}
            className="w-24 rounded-lg border border-(--color-border) bg-(--color-bg) px-2.5 py-1.5 text-sm text-(--color-text) outline-none focus:border-(--color-navy)"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-dim)">Analista (opcional)</span>
          <input
            value={analista} onChange={(e) => setAnalista(e.target.value)} list="analistas-gantt" placeholder="Não atribuído"
            className="w-40 rounded-lg border border-(--color-border) bg-(--color-bg) px-2.5 py-1.5 text-sm text-(--color-text) outline-none focus:border-(--color-navy)"
          />
          <datalist id="analistas-gantt">{analistas.map((a) => <option key={a} value={a} />)}</datalist>
        </label>
        <button type="submit" className="rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90">
          + Adicionar
        </button>
      </form>

      {futuras.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl border border-(--color-border)">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-(--color-surface-2) text-(--color-text-dim)">
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Qtd.</th>
                <th className="px-3 py-2">Pranchas/AT</th>
                <th className="px-3 py-2">Analista</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {futuras.map((f) => (
                <tr key={f.id} className="border-t border-(--color-border)">
                  <td className="px-3 py-2 font-medium text-(--color-text)">{f.code}</td>
                  <td className="px-3 py-2 text-(--color-text-weak)">{new Date(f.date).toLocaleDateString("pt-BR")}</td>
                  <td className="px-3 py-2 text-(--color-text-weak)">{f.n}</td>
                  <td className="px-3 py-2 text-(--color-text-weak)">{f.pr}</td>
                  <td className="px-3 py-2 text-(--color-text-weak)">{f.analyst || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => onRemover(f.id)} className="text-(--color-red) hover:underline">Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
