"use client";

import { useEffect, useMemo, useState } from "react";
import {
  aggregate,
  buildItems,
  defaultParams,
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
import { calcularKpis } from "./kpis";
import { FILTROS_PADRAO, UI_PADRAO, type EntregaFuturaEstado, type FiltrosGanttEstado, type UiGanttEstado } from "./tipos-estado";

const CHAVE_LOCALSTORAGE = "gat_gantt_prestadores_v1";

function hojeISO(): string {
  const d = hojeBr();
  return d.toISOString().slice(0, 10);
}

function CartaoKpi({ titulo, valor, destaque, cor }: { titulo: string; valor: string; destaque?: string; cor?: string }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-4 py-3.5">
      <p className="text-xl font-semibold tabular-nums" style={cor ? { color: cor } : undefined}>{valor}</p>
      <p className="mt-0.5 text-xs text-(--color-text-weak)">{titulo}</p>
      {destaque && <p className="text-[11px] text-(--color-text-dim)">{destaque}</p>}
    </div>
  );
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

export function PainelGanttPrestadores({ linhasBrutas }: { linhasBrutas: LinhaBrutaGantt[] }) {
  const [filtros, setFiltros] = useState<FiltrosGanttEstado>(
    () => ({ ...FILTROS_PADRAO, ...carregarEstadoSalvo().filtros }),
  );
  const [ui, setUi] = useState<UiGanttEstado>(() => ({ ...UI_PADRAO, ...carregarEstadoSalvo().ui }));
  const [futuras, setFuturas] = useState<EntregaFuturaEstado[]>(() => carregarEstadoSalvo().futuras ?? []);

  useEffect(() => {
    salvarEstado({ filtros, ui, futuras });
  }, [filtros, ui, futuras]);

  const prep = useMemo(() => prepRows(linhasBrutas), [linhasBrutas]);
  const modelo = useMemo(() => buildItems(prep, { inferLinks: true }), [prep]);
  const hist = useMemo(() => histLib(modelo.items), [modelo]);
  const cal = useMemo(() => new Calendario(), []);

  const todosPrestadores = useMemo(() => [...new Set(modelo.items.map((it) => it.prest))].filter(Boolean).sort(), [modelo]);
  const todosAnalistas = useMemo(
    () => [...new Set(linhasBrutas.map((r) => (r.resp || "").trim().toUpperCase()))].filter((a) => a && a !== "SEM RESPONSÁVEL").sort(),
    [linhasBrutas],
  );

  const params = useMemo(
    () => ({
      ...defaultParams(hojeISO(), hist),
      horizon: ui.horizonte,
      futuras: futuras.map((f): EntregaFutura => ({
        code: f.code, obra: f.obra, disc: f.disc, analyst: f.analyst, date: f.date, n: f.n, pr: f.pr, slaI: f.slaI,
      })),
    }),
    [hist, ui.horizonte, futuras],
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
    if (filtros.prestadores.length) out = out.filter((it) => filtros.prestadores.includes(it.prest));
    if (filtros.analistas.length) out = out.filter((it) => filtros.analistas.includes(it.analyst));
    if (filtros.apenasCriticas) out = out.filter((it) => it.crit);
    if (filtros.apenasVencidas) out = out.filter((it) => it.prazo === "Vencido");
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

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-(--color-text)">Gantt de Prestadores — Fluxo de ATs e Paralelismo</h1>
        <p className="mt-1 max-w-3xl text-sm text-(--color-text-weak)">
          Horizonte de análises em andamento, sobrecarga por analista e projeção de documentos nos próximos meses —
          considera o prazo real das ATs (SLA/hold) e projeta ciclos futuros pela taxa histórica de liberação por revisão.
        </p>
      </div>

      {/* filtros */}
      <div className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-dim)">Buscar (código, AT, obra)</span>
          <input
            value={filtros.busca}
            onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
            placeholder="Ex.: P221 ou AT-0466"
            className="w-56 rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm text-(--color-text) outline-none focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/15"
          />
        </label>

        <SeletorMultiplo
          rotulo="Prestadores prioritários"
          opcoes={todosPrestadores}
          selecionados={filtros.prestadores}
          onAlternar={(v) => setFiltros((f) => ({ ...f, prestadores: alternarSelecao(f.prestadores, v) }))}
          onLimpar={() => setFiltros((f) => ({ ...f, prestadores: [] }))}
        />

        <SeletorMultiplo
          rotulo="Analistas"
          opcoes={todosAnalistas}
          selecionados={filtros.analistas}
          onAlternar={(v) => setFiltros((f) => ({ ...f, analistas: alternarSelecao(f.analistas, v) }))}
          onLimpar={() => setFiltros((f) => ({ ...f, analistas: [] }))}
        />

        <label className="flex items-center gap-1.5 pb-1.5 text-sm text-(--color-text)">
          <input type="checkbox" checked={filtros.apenasCriticas} onChange={(e) => setFiltros((f) => ({ ...f, apenasCriticas: e.target.checked }))} />
          Só críticas
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-sm text-(--color-text)">
          <input type="checkbox" checked={filtros.apenasVencidas} onChange={(e) => setFiltros((f) => ({ ...f, apenasVencidas: e.target.checked }))} />
          Só vencidas
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-dim)">Horizonte (dias)</span>
          <input
            type="number" min={14} max={240} value={ui.horizonte}
            onChange={(e) => setUi((u) => ({ ...u, horizonte: Math.max(14, Math.min(240, Number(e.target.value) || 90)) }))}
            className="w-20 rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm text-(--color-text) outline-none focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/15"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-dim)">Agrupar por</span>
          <select
            value={ui.agrupar}
            onChange={(e) => setUi((u) => ({ ...u, agrupar: e.target.value as UiGanttEstado["agrupar"] }))}
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm text-(--color-text) outline-none focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/15"
          >
            <option value="prest">Prestador</option>
            <option value="code">Código · prestador</option>
            <option value="analyst">Analista</option>
            <option value="none">Sem agrupamento</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5 pb-1.5 text-sm text-(--color-text)">
          <input type="checkbox" checked={ui.mostrarEstimativas} onChange={(e) => setUi((u) => ({ ...u, mostrarEstimativas: e.target.checked }))} />
          Mostrar ciclos estimados
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-dim)">Zoom</span>
          <input
            type="range" min={2} max={14} value={ui.zoom}
            onChange={(e) => setUi((u) => ({ ...u, zoom: Number(e.target.value) }))}
            className="w-24"
          />
        </label>
      </div>

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <CartaoKpi titulo="ATs/itens no Gantt" valor={String(kpis.abertos)} destaque={kpis.simulados ? `+ ${kpis.simulados} simulados` : "pendentes conforme filtros"} />
        <CartaoKpi titulo="ATs críticas" valor={String(kpis.criticas)} destaque={`REV. AT > ${params.critRev}`} cor={kpis.criticas ? "var(--color-red)" : undefined} />
        <CartaoKpi
          titulo="Vencidos / próximos"
          valor={`${kpis.vencidos} / ${kpis.proximos}`}
          destaque={`próximo = até ${params.prox} du`}
          cor={kpis.vencidos ? "var(--color-red)" : undefined}
        />
        <CartaoKpi titulo="Projetos simultâneos" valor={String(kpis.projSimultaneosHoje)} destaque={kpis.picoProjetos.d != null ? `pico ${kpis.picoProjetos.v} em ${fmt(kpis.picoProjetos.d)}` : undefined} />
        <CartaoKpi titulo="Pico semanal de carga" valor={`${kpis.picoSemanal.v.toFixed(0)} pr.`} destaque={kpis.picoSemanal.semana != null ? `semana de ${fmt(kpis.picoSemanal.semana)}` : undefined} />
        <CartaoKpi
          titulo="Conclusão estimada"
          valor={kpis.conclusaoMediana != null ? fmt(kpis.conclusaoMediana) : "—"}
          destaque={`sem novas reprovações: ${kpis.conclusaoSemNovasReprovacoes != null ? fmt(kpis.conclusaoSemNovasReprovacoes) : "—"}`}
          cor="var(--color-gold)"
        />
      </div>

      {/* Gantt */}
      <div className="mt-4">
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
      </div>

      {/* entregas futuras simuladas */}
      <PainelEntregasFuturas
        futuras={futuras}
        prestadores={todosPrestadores}
        analistas={todosAnalistas}
        onAdicionar={adicionarFutura}
        onRemover={removerFutura}
      />
    </div>
  );
}

function SeletorMultiplo({
  rotulo,
  opcoes,
  selecionados,
  onAlternar,
  onLimpar,
}: {
  rotulo: string;
  opcoes: string[];
  selecionados: string[];
  onAlternar: (valor: string) => void;
  onLimpar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const filtradas = opcoes.filter((o) => o.toUpperCase().includes(busca.toUpperCase()));

  return (
    <div className="relative flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-dim)">{rotulo}</span>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className={`w-48 truncate rounded-lg border px-3 py-1.5 text-left text-sm ${
          selecionados.length ? "border-(--color-gold) bg-(--color-surface-2)" : "border-(--color-border) bg-(--color-bg)"
        } text-(--color-text)`}
      >
        {selecionados.length ? `${selecionados.length} selecionado(s)` : "Todos"}
      </button>
      {aberto && (
        <div className="absolute top-[52px] z-20 flex max-h-72 w-72 flex-col rounded-lg border border-(--color-border) bg-(--color-surface-1) shadow-lg">
          <div className="flex items-center gap-2 border-b border-(--color-border) p-2">
            <input
              value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" autoFocus
              className="flex-1 rounded border border-(--color-border) bg-(--color-bg) px-2 py-1 text-xs text-(--color-text) outline-none"
            />
            <button type="button" onClick={onLimpar} className="text-xs font-medium text-(--color-navy) hover:underline">Limpar</button>
            <button type="button" onClick={() => setAberto(false)} className="text-xs font-medium text-(--color-text-weak) hover:underline">Fechar</button>
          </div>
          <div className="overflow-auto p-1">
            {filtradas.map((o) => (
              <label key={o} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1 text-xs text-(--color-text) hover:bg-(--color-surface-2)">
                <input type="checkbox" checked={selecionados.includes(o)} onChange={() => onAlternar(o)} className="mt-0.5" />
                {o}
              </label>
            ))}
            {!filtradas.length && <p className="px-2 py-2 text-xs text-(--color-text-dim)">Nenhum resultado.</p>}
          </div>
        </div>
      )}
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
