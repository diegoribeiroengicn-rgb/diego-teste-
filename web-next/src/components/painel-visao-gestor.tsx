"use client";

import { useMemo, useState } from "react";
import { calcularKpisPrazoAnalista } from "@/lib/kpis-prazo-calculo";
import type { ItemPrioridade } from "@/lib/lista-prioridades";
import type { AlertaItem } from "@/lib/alertas-engine";
import {
  STATUS_ATIVO_ANALISE,
  comparativoAtualVsPrioridade,
  montarPainelPorAnalista,
  statusOperacional,
  type LinhaBaseGestor,
  type PainelAnalista,
  type StatusOperacional,
} from "@/lib/visao-gestor-calculo";

const STATUS_EM_ANALISE = "EM ANÁLISE";

const LABEL_STATUS_OPERACIONAL: Record<StatusOperacional, string> = {
  ATRASADO: "Atrasado",
  ATENCAO: "Atenção — vencendo em breve",
  EM_DIA: "Em dia",
  SEM_PENDENCIAS: "Sem pendências",
};
const COR_STATUS_OPERACIONAL: Record<StatusOperacional, string> = {
  ATRASADO: "var(--color-red)",
  ATENCAO: "var(--color-gold)",
  EM_DIA: "var(--color-green)",
  SEM_PENDENCIAS: "var(--color-text-dim)",
};
const NIVEL_LABEL: Record<number, string> = { 1: "Nível 1", 2: "Nível 2", 3: "Nível 3" };

function CartaoKpi({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-4 py-4">
      <p className="text-xl font-semibold tabular-nums" style={cor ? { color: cor } : undefined}>{valor}</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">{titulo}</p>
    </div>
  );
}

function formatarData(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString("pt-BR");
}

function SecaoQuemFazOQue({
  base, painel, listaPrioridades,
}: { base: LinhaBaseGestor[]; painel: PainelAnalista[]; listaPrioridades: ItemPrioridade[] }) {
  const [expandido, setExpandido] = useState<string | null>(null);

  if (!painel.length) {
    return <p className="mt-4 text-sm text-(--color-text-weak)">Nenhum analista com análises, prioridades ou alertas nos filtros aplicados.</p>;
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {[...painel].sort((a, b) => b.emAndamento - a.emAndamento).map((linha) => {
        const situacao = statusOperacional(linha.atrasados, linha.vence2Dias, linha.emAndamento);
        const aberto = expandido === linha.analista;
        const sub = base.filter((l) => l.responsavel === linha.analista);
        const prioridadesAnalista = listaPrioridades.filter((p) => p.responsavel === linha.analista);
        const motivosPorAt = new Map(prioridadesAnalista.map((p) => [p.num_at, p.motivos_entrada.join(", ")]));

        return (
          <div key={linha.analista} className="rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
            <button onClick={() => setExpandido(aberto ? null : linha.analista)} className="flex w-full flex-wrap items-center gap-2 px-5 py-4 text-left">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_STATUS_OPERACIONAL[situacao] }} />
              <span className="font-semibold text-(--color-text)">{linha.analista}</span>
              <span className="text-sm text-(--color-text-weak)">— {LABEL_STATUS_OPERACIONAL[situacao]} · {linha.emAndamento} em andamento · {linha.prioridades} prioridade(s) · {linha.atrasados} atrasada(s) · {linha.emHold} em HOLD · {linha.alertasAtivos} alerta(s)</span>
            </button>
            {aberto && (
              <div className="border-t border-(--color-border) px-5 py-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <CartaoKpi titulo="Em andamento" valor={String(linha.emAndamento)} />
                  <CartaoKpi titulo="Concluídos" valor={String(linha.concluidos)} />
                  <CartaoKpi titulo="Atrasados" valor={String(linha.atrasados)} cor={linha.atrasados ? "var(--color-red)" : undefined} />
                  <CartaoKpi titulo="Prioridades" valor={String(linha.prioridades)} />
                  <CartaoKpi titulo="Alertas ativos" valor={String(linha.alertasAtivos)} />
                  <CartaoKpi titulo="Em HOLD" valor={String(linha.emHold)} />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <CartaoKpi titulo="Tempo médio de análise (dias úteis)" valor={String(linha.tempoMedioDias)} />
                  <CartaoKpi titulo="% no prazo" valor={`${linha.pctNoPrazo}%`} />
                  <CartaoKpi titulo="SLA reduzido em vigor" valor={String(linha.slaReduzidoQtd)} />
                </div>

                {sub.length === 0 ? (
                  <p className="mt-4 text-xs text-(--color-text-dim)">Nenhuma análise ativa no momento.</p>
                ) : (
                  <div className="mt-4 overflow-x-auto rounded-xl border border-(--color-border)">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead>
                        <tr className="text-xs font-medium text-(--color-text-dim)">
                          <th className="px-3 py-2">N° AT</th>
                          <th className="px-3 py-2">Projeto</th>
                          <th className="px-3 py-2">Disciplina</th>
                          <th className="px-3 py-2">Rev.</th>
                          <th className="px-3 py-2">Solicitação</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Prioridade</th>
                          <th className="px-3 py-2">Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sub.map((l) => (
                          <tr key={`${l.origem}-${l.id}`} className="border-t border-(--color-border)">
                            <td className="px-3 py-2 text-(--color-text-weak)">{l.numAt || "—"}</td>
                            <td className="px-3 py-2 font-medium text-(--color-text)">{l.codigo || l.nomeEntidade || "—"}</td>
                            <td className="px-3 py-2 text-(--color-text-weak)">{l.disciplina}</td>
                            <td className="px-3 py-2 text-(--color-text-weak)">{l.revisao}</td>
                            <td className="px-3 py-2 text-(--color-text-weak)">{formatarData(l.dataSolicitacao)}</td>
                            <td className="px-3 py-2 text-(--color-text-weak)">{l.statusAnalise}</td>
                            <td className="px-3 py-2 text-(--color-text-weak)">{l.nivelPrioridade ? NIVEL_LABEL[l.nivelPrioridade] : "—"}</td>
                            <td className="px-3 py-2 text-(--color-text-weak)">{motivosPorAt.get(l.numAt) || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SecaoODeveriaAnalisar({ listaPrioridades, analistas }: { listaPrioridades: ItemPrioridade[]; analistas: string[] }) {
  const grupos = analistas
    .map((analista) => ({ analista, itens: listaPrioridades.filter((p) => p.responsavel === analista) }))
    .filter((g) => g.itens.length > 0);

  if (!grupos.length) {
    return <p className="mt-4 rounded-xl border border-(--color-green)/30 bg-(--color-green)/10 px-4 py-3 text-sm text-(--color-text)">Nenhuma análise prioritária no momento.</p>;
  }

  const situacaoLabel = (p: ItemPrioridade) => {
    if (p.situacao_prazo === "EM HOLD") return "em HOLD";
    if (p.situacao_prazo === "ATRASADO") return `vencida há ${Math.abs(p.dias_restantes ?? 0)} dia(s) útil(eis)`;
    if (p.situacao_prazo === "VENCE HOJE") return "vence hoje";
    if (p.situacao_prazo === "VENCE EM BREVE") return "vence em breve";
    return "dentro do prazo";
  };

  return (
    <div className="mt-4 flex flex-col gap-6">
      {grupos.map(({ analista, itens }) => (
        <div key={analista}>
          <p className="text-sm font-semibold text-(--color-text)">{analista}</p>
          <ol className="mt-2 flex flex-col gap-1.5">
            {itens.map((p, i) => (
              <li key={`${p.modulo}-${p.id}`} className="text-sm text-(--color-text-weak)">
                <span className="font-medium text-(--color-text)">{i + 1}º {p.codigo || "—"} — {p.nome_entidade || "—"}</span>
                {" "}| {p.disciplina || "—"} — {p.nivel_prioridade ? NIVEL_LABEL[p.nivel_prioridade] : "Prioridade normal"} — {situacaoLabel(p)}
                {" "}({p.motivos_entrada.join(", ") || "—"}) · <span className="italic">AT {p.num_at || "—"}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function SecaoComparativo({ base, listaPrioridades, analistas }: { base: LinhaBaseGestor[]; listaPrioridades: ItemPrioridade[]; analistas: string[] }) {
  const divergencias = analistas.map((a) => comparativoAtualVsPrioridade(base, listaPrioridades, a)).filter((d) => d != null);

  if (!divergencias.length) {
    return <p className="mt-4 rounded-xl border border-(--color-green)/30 bg-(--color-green)/10 px-4 py-3 text-sm text-(--color-text)">Nenhuma divergência: todos os analistas estão alinhados com a Lista de Prioridades.</p>;
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      {divergencias.map((d) => {
        const dias = d.diasRestantesRecomendado;
        const situacao = dias != null && dias < 0 ? `vencida há ${Math.abs(dias)} dia(s) útil(eis)` : dias != null ? `vence em ${dias} dia(s) útil(eis)` : "—";
        return (
          <p key={d.analista} className="rounded-xl border border-(--color-gold)/40 bg-(--color-gold)/10 px-4 py-3 text-sm text-(--color-text)">
            <strong>{d.analista}</strong> — Analisando atualmente <strong>AT {d.atAtual}</strong> ({d.prioridadeAtual}) → Deveria estar analisando{" "}
            <strong>AT {d.atRecomendado}</strong> ({d.motivoRecomendado}, {situacao})
          </p>
        );
      })}
    </div>
  );
}

function SecaoDistribuicaoCarga({ painel }: { painel: PainelAnalista[] }) {
  if (!painel.length) return <p className="mt-4 text-sm text-(--color-text-weak)">Nenhum dado disponível com os filtros aplicados.</p>;

  const totalEmAndamento = painel.reduce((s, p) => s + p.emAndamento, 0);
  const totalConcluidos = painel.reduce((s, p) => s + p.concluidos, 0);
  const totalAtrasados = painel.reduce((s, p) => s + p.atrasados, 0);
  const totalEmHold = painel.reduce((s, p) => s + p.emHold, 0);

  return (
    <div className="mt-4">
      <div className="overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-(--color-text-dim)">
              <th className="px-4 py-3">Analista</th>
              <th className="px-4 py-3">Em Andamento</th>
              <th className="px-4 py-3">Concluídos</th>
              <th className="px-4 py-3">Atrasados</th>
              <th className="px-4 py-3">Em HOLD</th>
              <th className="px-4 py-3">Prioritárias</th>
              <th className="px-4 py-3">Alertas Ativos</th>
              <th className="px-4 py-3">Aguard. Avaliação</th>
              <th className="px-4 py-3">Tempo Médio (dias úteis)</th>
              <th className="px-4 py-3">% No Prazo</th>
              <th className="px-4 py-3">% Com Atraso</th>
              <th className="px-4 py-3">SLA Reduzido</th>
            </tr>
          </thead>
          <tbody>
            {painel.map((p) => (
              <tr key={p.analista} className="border-t border-(--color-border) first:border-0">
                <td className="px-4 py-2.5 font-medium text-(--color-text)">{p.analista}</td>
                <td className="px-4 py-2.5 text-(--color-text-weak)">{p.emAndamento}</td>
                <td className="px-4 py-2.5 text-(--color-text-weak)">{p.concluidos}</td>
                <td className="px-4 py-2.5 text-(--color-text-weak)">{p.atrasados}</td>
                <td className="px-4 py-2.5 text-(--color-text-weak)">{p.emHold}</td>
                <td className="px-4 py-2.5 text-(--color-text-weak)">{p.prioridades}</td>
                <td className="px-4 py-2.5 text-(--color-text-weak)">{p.alertasAtivos}</td>
                <td className="px-4 py-2.5 text-(--color-text-weak)">{p.aguardandoAvaliacao}</td>
                <td className="px-4 py-2.5 text-(--color-text-weak)">{p.tempoMedioDias}</td>
                <td className="px-4 py-2.5 text-(--color-text-weak)">{p.pctNoPrazo}%</td>
                <td className="px-4 py-2.5 text-(--color-text-weak)">{p.pctAtraso}%</td>
                <td className="px-4 py-2.5 text-(--color-text-weak)">{p.slaReduzidoQtd}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-(--color-text-dim)">Indicadores consolidados da equipe</p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CartaoKpi titulo="Total em andamento (equipe)" valor={String(totalEmAndamento)} />
        <CartaoKpi titulo="Total concluído (equipe)" valor={String(totalConcluidos)} />
        <CartaoKpi titulo="Total atrasado (equipe)" valor={String(totalAtrasados)} cor={totalAtrasados ? "var(--color-red)" : undefined} />
        <CartaoKpi titulo="Total em HOLD (equipe)" valor={String(totalEmHold)} />
      </div>
    </div>
  );
}

export function PainelVisaoGestor({
  base, listaPrioridades, alertasAtivos, pendenciasAvaliacao,
}: {
  base: LinhaBaseGestor[];
  listaPrioridades: ItemPrioridade[];
  alertasAtivos: AlertaItem[];
  pendenciasAvaliacao: AlertaItem[];
}) {
  const [aba, setAba] = useState<"quem" | "deveria" | "comparativo" | "carga">("quem");
  const [fAnalista, setFAnalista] = useState("");
  const [fDisciplina, setFDisciplina] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fSlaReduzido, setFSlaReduzido] = useState("");

  const analistasTodos = useMemo(() => [...new Set(base.map((l) => l.responsavel))].sort(), [base]);
  const disciplinas = useMemo(() => [...new Set(base.map((l) => l.disciplina))].sort(), [base]);
  const statusOpcoes = useMemo(() => [...new Set(base.map((l) => l.statusAnalise))].sort(), [base]);

  const baseFiltrada = useMemo(
    () =>
      base.filter((l) => {
        if (fAnalista && l.responsavel !== fAnalista) return false;
        if (fDisciplina && l.disciplina !== fDisciplina) return false;
        if (fStatus && l.statusAnalise !== fStatus) return false;
        if (fSlaReduzido === "sim" && !l.slaReduzido) return false;
        if (fSlaReduzido === "nao" && l.slaReduzido) return false;
        return true;
      }),
    [base, fAnalista, fDisciplina, fStatus, fSlaReduzido],
  );

  const analistasPresentes = useMemo(() => [...new Set(baseFiltrada.map((l) => l.responsavel))].sort(), [baseFiltrada]);
  const listaPrioridadesFiltrada = useMemo(() => listaPrioridades.filter((p) => p.responsavel && analistasPresentes.includes(p.responsavel)), [listaPrioridades, analistasPresentes]);
  const alertasFiltrados = useMemo(() => alertasAtivos.filter((a) => a.responsavel && analistasPresentes.includes(a.responsavel)), [alertasAtivos, analistasPresentes]);
  const pendenciasFiltradas = useMemo(() => pendenciasAvaliacao.filter((p) => p.responsavel && analistasPresentes.includes(p.responsavel)), [pendenciasAvaliacao, analistasPresentes]);

  const painel = useMemo(
    () => montarPainelPorAnalista(baseFiltrada, listaPrioridadesFiltrada, alertasFiltrados, pendenciasFiltradas, analistasPresentes),
    [baseFiltrada, listaPrioridadesFiltrada, alertasFiltrados, pendenciasFiltradas, analistasPresentes],
  );

  const kpisEquipe = useMemo(() => calcularKpisPrazoAnalista(baseFiltrada), [baseFiltrada]);
  const emAndamentoTotal = useMemo(() => baseFiltrada.filter((l) => STATUS_ATIVO_ANALISE.has(l.statusAnalise)).length, [baseFiltrada]);
  const emAnaliseTotal = useMemo(() => baseFiltrada.filter((l) => l.statusAnalise === STATUS_EM_ANALISE), [baseFiltrada]);
  const slaReduzidoAtivos = useMemo(
    () => baseFiltrada.filter((l) => STATUS_ATIVO_ANALISE.has(l.statusAnalise) && l.slaReduzido).length,
    [baseFiltrada],
  );

  if (base.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-10">
        <h1 className="text-2xl font-semibold text-(--color-text)">Visão do Gestor</h1>
        <p className="mt-4 text-sm text-(--color-text-weak)">Nenhum projeto cadastrado ainda.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Visão do Gestor</h1>
      <p className="mt-1 max-w-3xl text-sm text-(--color-text-weak)">
        Painel executivo diário da equipe: quem está fazendo o quê, o que cada analista deveria estar analisando
        conforme a Lista de Prioridades, divergências entre atividade atual e prioridade recomendada, e distribuição
        da carga de trabalho. Consome apenas informações já existentes — não altera nenhum módulo, regra ou permissão.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select value={fAnalista} onChange={(e) => setFAnalista(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
          <option value="">Todos os analistas</option>
          {analistasTodos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={fDisciplina} onChange={(e) => setFDisciplina(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
          <option value="">Todas as disciplinas</option>
          {disciplinas.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
          <option value="">Todos os status</option>
          {statusOpcoes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fSlaReduzido} onChange={(e) => setFSlaReduzido(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
          <option value="">SLA reduzido: todos</option>
          <option value="sim">SLA reduzido: sim</option>
          <option value="nao">SLA reduzido: não</option>
        </select>
      </div>

      {baseFiltrada.length === 0 ? (
        <p className="mt-6 rounded-xl border border-(--color-border) bg-(--color-surface-1) px-4 py-6 text-center text-sm text-(--color-text-weak)">
          Nenhum registro encontrado com os filtros aplicados.
        </p>
      ) : (
        <>
          <h2 className="mt-8 text-sm font-semibold text-(--color-text)">Indicadores executivos</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <CartaoKpi titulo="Total ativo (Análise + Hold)" valor={String(emAndamentoTotal)} />
            <CartaoKpi titulo="Total prioritárias" valor={String(listaPrioridadesFiltrada.length)} />
            <CartaoKpi titulo="Total atrasadas" valor={String(kpisEquipe.atrasadosEmAnalise)} cor={kpisEquipe.atrasadosEmAnalise ? "var(--color-red)" : undefined} />
            <CartaoKpi titulo="Vencendo em ≤2 dias úteis" valor={String(kpisEquipe.vencem2DiasUteis)} cor="var(--color-gold)" />
            <CartaoKpi titulo="Em HOLD" valor={String(kpisEquipe.emHold)} />
          </div>
          <p className="mt-3 text-xs text-(--color-text-weak)">
            &quot;Total ativo (Análise + Hold)&quot; soma Em Análise + Em HOLD. &quot;Em Análise&quot; abaixo usa o
            mesmo critério dos dashboards de Prestadores/Cessionários (só status_analise = EM ANÁLISE, sem Hold).
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <CartaoKpi titulo="Em Análise" valor={String(emAnaliseTotal.length)} />
            <CartaoKpi titulo="Em Análise — Prestadores" valor={String(emAnaliseTotal.filter((l) => l.tipoModulo === "Prestador").length)} />
            <CartaoKpi titulo="Em Análise — Cessionários" valor={String(emAnaliseTotal.filter((l) => l.tipoModulo === "Cessionário").length)} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <CartaoKpi titulo="Com SLA reduzido" valor={String(slaReduzidoAtivos)} />
            <CartaoKpi titulo="Alertas ativos" valor={String(alertasFiltrados.length)} />
            <CartaoKpi titulo="% geral entregue no prazo" valor={`${kpisEquipe.pctCumprimentoPrazo}%`} cor="var(--color-navy)" />
          </div>

          {painel.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CartaoKpi
                titulo="Maior carga"
                valor={(() => { const m = painel.reduce((a, b) => (b.emAndamento > a.emAndamento ? b : a)); return `${m.analista} (${m.emAndamento})`; })()}
              />
              <CartaoKpi
                titulo="Maior qtd. prioridades"
                valor={(() => { const m = painel.reduce((a, b) => (b.prioridades > a.prioridades ? b : a)); return `${m.analista} (${m.prioridades})`; })()}
              />
              <CartaoKpi
                titulo="Maior qtd. atrasos"
                valor={(() => { const m = painel.reduce((a, b) => (b.atrasados > a.atrasados ? b : a)); return m.atrasados > 0 ? `${m.analista} (${m.atrasados})` : "Nenhum atraso"; })()}
              />
              <CartaoKpi
                titulo="Média geral de prazo da equipe (dias úteis)"
                valor={String(Math.round((painel.reduce((s, p) => s + p.tempoMedioDias, 0) / painel.length) * 10) / 10)}
              />
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-1 rounded-full border border-(--color-border) bg-(--color-surface-1) p-1 text-sm font-medium w-fit">
            {([
              ["quem", "Quem está fazendo o quê"],
              ["deveria", "O que deveria estar analisando"],
              ["comparativo", "Comparativo"],
              ["carga", "Distribuição de carga"],
            ] as const).map(([valor, rotulo]) => (
              <button
                key={valor}
                onClick={() => setAba(valor)}
                className={`rounded-full px-4 py-1.5 transition-colors ${aba === valor ? "bg-(--color-navy) text-white" : "text-(--color-text-weak) hover:text-(--color-text)"}`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {aba === "quem" && <SecaoQuemFazOQue base={baseFiltrada} painel={painel} listaPrioridades={listaPrioridadesFiltrada} />}
          {aba === "deveria" && <SecaoODeveriaAnalisar listaPrioridades={listaPrioridadesFiltrada} analistas={analistasPresentes} />}
          {aba === "comparativo" && (
            <>
              <p className="mt-4 text-xs text-(--color-text-dim)">Painel informativo: não redistribui trabalho automaticamente, apenas destaca divergências para o gestor decidir.</p>
              <SecaoComparativo base={baseFiltrada} listaPrioridades={listaPrioridadesFiltrada} analistas={analistasPresentes} />
            </>
          )}
          {aba === "carga" && <SecaoDistribuicaoCarga painel={painel} />}
        </>
      )}
    </div>
  );
}
