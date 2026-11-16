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
import { calcularKpis, estaAberto } from "./kpis";
import { FILTROS_PADRAO, UI_PADRAO, type EntregaFuturaEstado, type FiltrosGanttEstado, type UiGanttEstado } from "./tipos-estado";

const CHAVE_LOCALSTORAGE = "gat_gantt_prestadores_v1";

function hojeISO(): string {
  const d = hojeBr();
  return d.toISOString().slice(0, 10);
}

function carregarEstadoSalvo(): { filtros?: FiltrosGanttEstado; ui?: UiGanttEstado; futuras?: EntregaFuturaEstado[] } {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCALSTORAGE);
    return bruto ? JSON.parse(bruto) : {};
  } catch {
    return {};
  }
}

function salvarEstado(dados: { filtros: FiltrosGanttEstado; ui: UiGanttEstado; futuras: EntregaFuturaEstado[] }): void {
  try {
    localStorage.setItem(CHAVE_LOCALSTORAGE, JSON.stringify(dados));
  } catch {
    // armazenamento indisponível — segue sem persistir
  }
}

export function PainelGanttPrestadores({ linhasBrutas, geradoEm }: { linhasBrutas: LinhaBrutaGantt[]; geradoEm?: string }) {
  const [filtros, setFiltros] = useState<FiltrosGanttEstado>(
    () => ({ ...FILTROS_PADRAO, ...carregarEstadoSalvo().filtros }),
  );
  const [ui, setUi] = useState<UiGanttEstado>(() => ({ ...UI_PADRAO, ...carregarEstadoSalvo().ui }));
  const [futuras, setFuturas] = useState<EntregaFuturaEstado[]>(() => carregarEstadoSalvo().futuras ?? []);
  const [datasAbertas, setDatasAbertas] = useState(false);

  useEffect(() => {
    salvarEstado({ filtros, ui, futuras });
  }, [filtros, ui, futuras]);

  const prep = useMemo(() => prepRows(linhasBrutas), [linhasBrutas]);
  const modelo = useMemo(() => buildItems(prep, { inferLinks: true }), [prep]);
  const hist = useMemo(() => histLib(modelo.items), [modelo]);
  const cal = useMemo(() => new Calendario(), []);

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

  const params = useMemo(
    () => ({
      ...defaultParams(baseISO, hist),
      slaPDefault: ui.slaP,
      slaIDefault: ui.slaI,
      includeOld: ui.incluirAntigos,
      horizon: ui.horizonte,
      futuras: simulado
        ? futuras.map((f): EntregaFutura => ({
            code: f.code, obra: f.obra, disc: f.disc, analyst: f.analyst, date: f.date, n: f.n, pr: f.pr, slaI: f.slaI,
          }))
        : [],
    }),
    [hist, baseISO, ui.slaP, ui.slaI, ui.incluirAntigos, ui.horizonte, futuras, simulado],
  );

  const resultado = useMemo(() => project(modelo, params, cal), [modelo, params, cal]);

  const itensFiltrados = useMemo(() => {
    let out: ItemGantt[] = resultado.items;
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
    return out;
  }, [resultado, filtros]);

  const agregadoFiltrado = useMemo(() => aggregate(itensFiltrados, cal, resultado.base, resultado.hEnd), [itensFiltrados, cal, resultado]);
  const kpis = useMemo(() => calcularKpis(itensFiltrados, agregadoFiltrado), [itensFiltrados, agregadoFiltrado]);

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
  function limparFiltros() { setFiltros({ ...FILTROS_PADRAO }); }
  function restaurarPadrao() { setFiltros({ ...FILTROS_PADRAO }); setUi({ ...UI_PADRAO }); }

  const baseBr = fmt(resultado.base);
  const fimBr = fmt(resultado.hEnd);

  return (
    <div className="gref">
      <header className="top">
        <div className="logo"><img alt="Tecnoplano" src="/tecnoplano_logo.png" /></div>
        <div>
          <h1>Gantt de ATs — Fluxo Prestador × Análise e Paralelismo</h1>
          <div className="sub">Fonte: aba PROJ_PREST · {linhasBrutas.length} linhas{geradoEm ? ` · extraído em ${geradoEm}` : ""}</div>
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
        <div className="fld"><label>SLA prestador padrão (du)</label>
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
        <div className="fld"><label>Buscar (código, AT, obra)</label>
          <input value={filtros.busca} onChange={(e) => setF({ busca: e.target.value })} placeholder="Ex.: P221 ou AT-0466" style={{ width: 170 }} />
        </div>
        <SelectFiltro rotulo="Código" valor={filtros.codigo} opcoes={todosCodigos} onChange={(v) => setF({ codigo: v })} />
        <SeletorMultiplo rotulo="Prestador" opcoes={todosPrestadores} selecionados={filtros.prestadores}
          onAlternar={(v) => setF({ prestadores: alternarSelecao(filtros.prestadores, v) })} onLimpar={() => setF({ prestadores: [] })} />
        <SelectFiltro rotulo="Projeto (obra)" valor={filtros.obra} opcoes={todasObras} onChange={(v) => setF({ obra: v })} />
        <SelectFiltro rotulo="AT" valor={filtros.at} opcoes={todasAts} onChange={(v) => setF({ at: v })} />
        <SelectFiltro rotulo="Disciplina" valor={filtros.disciplina} opcoes={todasDisciplinas} onChange={(v) => setF({ disciplina: v })} />
        <SeletorMultiplo rotulo="Analista" opcoes={todosAnalistas} selecionados={filtros.analistas}
          onAlternar={(v) => setF({ analistas: alternarSelecao(filtros.analistas, v) })} onLimpar={() => setF({ analistas: [] })} />
        <SelectFiltro rotulo="Status liberação" valor={filtros.statusLib} semTodos
          opcoes={[["pend", "Pendentes"], ["lib", "Liberadas"], ["todos", "Todos"]]} onChange={(v) => setF({ statusLib: v })} />
        <SelectFiltro rotulo="Criticidade" valor={filtros.criticidade} opcoes={[["crit", "Críticas"], ["norm", "Normais"]]} onChange={(v) => setF({ criticidade: v })} />
        <SelectFiltro rotulo="Situação do prazo" valor={filtros.prazo}
          opcoes={["Vencido", "Próximo do vencimento", "Em dia", "HOLD", "Sem dados"]} onChange={(v) => setF({ prazo: v })} />
        <SelectFiltro rotulo="Fase atual" valor={filtros.fase} opcoes={[["prest", "Com o prestador"], ["analise", "Em análise"]]} onChange={(v) => setF({ fase: v })} />
        <SelectFiltro rotulo="Prioridade" valor={filtros.apenasPrioritarios ? "prio" : ""} opcoes={[["prio", "★ Só prioritários"]]} onChange={(v) => setF({ apenasPrioritarios: v === "prio" })} />
        <div className="fld"><label>&nbsp;</label>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn sm" type="button" onClick={() => setDatasAbertas((a) => !a)}>Datas ▾</button>
            <button className="btn sm" type="button" onClick={limparFiltros}>Limpar filtros</button>
            <button className="btn sm gold" type="button" onClick={restaurarPadrao}>Restaurar padrão</button>
          </div>
        </div>
        {datasAbertas && (
          <div style={{ width: "100%" }} className="note">
            Filtros por intervalo de datas (entrega prevista, retorno e conclusão da análise) chegam na próxima etapa.
          </div>
        )}
      </div>

      <main>
        <div className="grid kpis" style={{ marginBottom: 12 }}>
          <Kpi ico="📤" lbl="Com o prestador" val={String(kpis.comPrestador)} cls={kpis.comPrestadorAtrasados ? "amber" : ""}
            det={kpis.comPrestadorAtrasados ? <b style={{ color: "#D64541" }}>{kpis.comPrestadorAtrasados} atrasados</b> : "nenhum atrasado"} />
          <Kpi ico="🔎" lbl="Em análise na Tecnoplano" val={String(kpis.emAnalise)} cls={kpis.emAnaliseAtrasadas ? "amber" : ""}
            det={kpis.emAnaliseAtrasadas ? <b style={{ color: "#D64541" }}>{kpis.emAnaliseAtrasadas} atrasadas</b> : "nenhuma atrasada"} />
          <Kpi ico="★" lbl="Prioritários" val={String(kpis.prioritarios)} cls="gold"
            det={<>{kpis.prioritarios} análises prioritárias abertas<br /><b style={{ color: kpis.prioritariosAtrasados ? "#D64541" : "inherit" }}>{kpis.prioritariosAtrasados} atrasadas</b></>} />
          <Kpi ico="📈" lbl="Novas ATs previstas" val={kpis.simulados ? `≈${kpis.simulados}` : "—"} cls=""
            det={kpis.simulados ? "estimadas pelo ritmo e entregas futuras" : "previsão desligada"} />
          <Kpi ico="⚠" lbl="Atrasados ou críticos" val={<>{kpis.vencidos}<small> atrasados</small></>} cls={kpis.vencidos ? "red" : ""}
            det={`${kpis.criticas} com muitas revisões (críticos) · próximos: ${kpis.proximos}`} />
          <Kpi ico="📈" lbl="Semana mais cheia" val={kpis.picoSemanal.semana != null ? <>{kpis.picoSemanal.v.toFixed(0)}<small> pranchas</small></> : "—"} cls=""
            det={kpis.picoSemanal.semana != null ? `semana de ${fmt(kpis.picoSemanal.semana)}` : ""} />
          <Kpi ico="✓" lbl="Tudo liberado por volta de" val={kpis.conclusaoSemNovasReprovacoes != null ? fmt(kpis.conclusaoSemNovasReprovacoes) : "—"} cls="gold"
            det={`se aprovado na próxima análise · com revisões prováveis: ${kpis.conclusaoMediana != null ? fmt(kpis.conclusaoMediana) : "—"}`} />
        </div>

        <div className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 18px", alignItems: "flex-end" }}>
            <div className="fld"><label>Mostrar</label>
              <Seg grande valor={filtros.apenasPrioritarios ? "prio" : "all"} opcoes={[["all", "Todos"], ["prio", "★ Só prioritários"]]} onChange={(v) => setF({ apenasPrioritarios: v === "prio" })} />
            </div>
            <div className="fld"><label>Organizar por</label>
              <Seg grande valor={ui.agrupar} opcoes={[["code", "Projeto"], ["prest", "Prestador"], ["analyst", "Analista"], ["sla", "Prazo (SLA)"]]} onChange={(v) => setU({ agrupar: v as UiGanttEstado["agrupar"] })} />
            </div>
            <div className="fld"><label>Zoom</label>
              <Seg grande valor={String(ui.zoom)} opcoes={[["5", "Meses"], ["9", "Semanas"], ["16", "Dias"]]} onChange={(v) => setU({ zoom: Number(v) })} />
            </div>
            <div className="fld"><label>Revisões futuras</label>
              <Seg grande valor={ui.mostrarEstimativas ? "1" : "0"} opcoes={[["0", "Não mostrar"], ["1", "Mostrar prováveis"]]} onChange={(v) => setU({ mostrarEstimativas: v === "1" })} />
            </div>
          </div>
          <div className="legend" style={{ marginTop: 12 }}>
            <span><i style={{ background: "#A3AEBF" }} />Com o prestador</span>
            <span><i style={{ background: "#D5DBE5", border: "1px dashed #A3AEBF" }} />Com o prestador (data estimada)</span>
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

        <GanttSvg
          itens={itensFiltrados}
          agregado={agregadoFiltrado}
          base={resultado.base}
          hEnd={resultado.hEnd}
          horizonteVisivelDias={ui.horizonte}
          agrupar={ui.agrupar}
          mostrarEstimativas={ui.mostrarEstimativas}
          zoom={ui.zoom}
        />

        <PainelEntregasFuturas
          futuras={futuras}
          prestadores={todosPrestadores}
          analistas={todosAnalistas}
          onAdicionar={adicionarFutura}
          onRemover={removerFutura}
        />
      </main>
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
