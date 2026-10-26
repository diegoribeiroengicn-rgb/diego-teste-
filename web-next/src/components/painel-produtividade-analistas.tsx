"use client";

import { useMemo, useState } from "react";
import { SeletorCompetencia } from "@/components/seletor-competencia";
import { calcularProdutividadeAnalistas, type LinhaProdutividade, type ModuloProdutividade } from "@/lib/produtividade";

function formatarData(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString("pt-BR");
}

function CartaoKpi({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-4 py-3.5">
      <p className="text-xl font-semibold tabular-nums" style={cor ? { color: cor } : undefined}>{valor}</p>
      <p className="mt-0.5 text-xs text-(--color-text-weak)">{titulo}</p>
    </div>
  );
}

export function PainelProdutividadeAnalistas({
  linhas,
  mes,
  ano,
}: {
  linhas: LinhaProdutividade[];
  mes: number;
  ano: number;
}) {
  const [modulo, setModulo] = useState<ModuloProdutividade | "consolidado">("consolidado");
  const [disciplina, setDisciplina] = useState("");
  const [drillDown, setDrillDown] = useState("");

  const disciplinas = useMemo(() => [...new Set(linhas.map((l) => l.disciplina))].sort(), [linhas]);

  const base = useMemo(() => {
    if (modulo === "consolidado") return linhas;
    return linhas.filter((l) => l.origem === modulo);
  }, [linhas, modulo]);

  const tabela = useMemo(
    () => calcularProdutividadeAnalistas(base, mes, ano, { disciplina: disciplina || undefined }).sort((a, b) => b.projetosAnalisados - a.projetosAnalisados),
    [base, mes, ano, disciplina],
  );

  const totais = useMemo(
    () => ({
      analisados: tabela.reduce((s, t) => s + t.projetosAnalisados, 0),
      documentos: tabela.reduce((s, t) => s + t.documentos, 0),
      ats: tabela.reduce((s, t) => s + t.atsEmitidas, 0),
      tempoMedio: tabela.length
        ? Math.round((10 * tabela.filter((t) => t.projetosAnalisados > 0).reduce((s, t) => s + t.tempoMedioAnalise, 0)) /
            Math.max(1, tabela.filter((t) => t.projetosAnalisados > 0).length)) / 10
        : 0,
      slaMedio: tabela.length
        ? Math.round((10 * tabela.filter((t) => t.projetosAnalisados > 0).reduce((s, t) => s + t.slaAtendidoPct, 0)) /
            Math.max(1, tabela.filter((t) => t.projetosAnalisados > 0).length)) / 10
        : 0,
      backlog: tabela.reduce((s, t) => s + t.backlog, 0),
      andamento: tabela.reduce((s, t) => s + t.emAndamento, 0),
    }),
    [tabela],
  );

  const registrosDrill = useMemo(() => {
    if (!drillDown) return [];
    return base
      .filter((l) => l.responsavel === drillDown)
      .filter((l) => !disciplina || l.disciplina === disciplina)
      .slice()
      .sort((a, b) => (b.dataAnalise || b.dataSolicitacao || "").localeCompare(a.dataAnalise || a.dataSolicitacao || ""));
  }, [base, drillDown, disciplina]);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-(--color-text)">Painel de Analistas</h1>
          <p className="mt-1 max-w-2xl text-sm text-(--color-text-weak)">
            Produtividade mensal: projetos, documentos, ATs, tempo médio, SLA e backlog.
          </p>
        </div>
        <SeletorCompetencia mes={mes} ano={ano} />
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-dim)">Módulo</span>
          <div className="flex gap-1 rounded-full border border-(--color-border) bg-(--color-bg) p-1 text-xs font-medium">
            {(["consolidado", "prestadores", "cessionarios"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setModulo(m)}
                className={`rounded-full px-3 py-1.5 transition-colors ${modulo === m ? "bg-(--color-navy) text-white" : "text-(--color-text-weak) hover:text-(--color-text)"}`}
              >
                {m === "consolidado" ? "Consolidado" : m === "prestadores" ? "Prestadores" : "Cessionários"}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-dim)">Disciplina</span>
          <select
            value={disciplina}
            onChange={(e) => setDisciplina(e.target.value)}
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm text-(--color-text) outline-none focus:border-(--color-navy)"
          >
            <option value="">Todas</option>
            {disciplinas.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <CartaoKpi titulo="Projetos Analisados" valor={String(totais.analisados)} cor="var(--color-navy)" />
        <CartaoKpi titulo="Documentos" valor={String(totais.documentos)} cor="var(--color-blue-2)" />
        <CartaoKpi titulo="ATs Emitidas" valor={String(totais.ats)} cor="var(--color-sky)" />
        <CartaoKpi titulo="Tempo Médio (dias)" valor={String(totais.tempoMedio)} cor="var(--color-purple)" />
        <CartaoKpi titulo="% SLA Atendido (média)" valor={`${totais.slaMedio}%`} cor="var(--color-green)" />
        <CartaoKpi titulo="Backlog do Período" valor={String(totais.backlog)} cor="var(--color-orange)" />
        <CartaoKpi titulo="Em Andamento (hoje)" valor={String(totais.andamento)} cor="var(--color-gold)" />
      </div>

      <h2 className="mt-6 text-sm font-semibold text-(--color-navy)">Produtividade por analista</h2>
      <div className="mt-2 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-(--color-text-dim)">
              <th className="px-4 py-3">Analista</th>
              <th className="px-4 py-3">Projetos Analisados</th>
              <th className="px-4 py-3">Documentos</th>
              <th className="px-4 py-3">ATs Emitidas</th>
              <th className="px-4 py-3">Tempo Médio (dias)</th>
              <th className="px-4 py-3">% SLA Atendido</th>
              <th className="px-4 py-3">Backlog</th>
              <th className="px-4 py-3">Em Andamento</th>
            </tr>
          </thead>
          <tbody>
            {tabela.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-16 text-center text-(--color-text-weak)">Nenhum resultado para os filtros selecionados.</td></tr>
            ) : (
              tabela.map((t) => (
                <tr key={t.responsavel} className="border-t border-(--color-border) first:border-0 hover:bg-(--color-surface-2)/60">
                  <td className="px-4 py-3.5 font-medium text-(--color-text)">{t.responsavel}</td>
                  <td className="px-4 py-3.5 tabular-nums text-(--color-text-weak)">{t.projetosAnalisados}</td>
                  <td className="px-4 py-3.5 tabular-nums text-(--color-text-weak)">{t.documentos}</td>
                  <td className="px-4 py-3.5 tabular-nums text-(--color-text-weak)">{t.atsEmitidas}</td>
                  <td className="px-4 py-3.5 tabular-nums text-(--color-text-weak)">{t.tempoMedioAnalise}</td>
                  <td className="px-4 py-3.5 tabular-nums text-(--color-text-weak)">{t.slaAtendidoPct}%</td>
                  <td className="px-4 py-3.5 tabular-nums text-(--color-text-weak)">{t.backlog}</td>
                  <td className="px-4 py-3.5 tabular-nums text-(--color-text-weak)">{t.emAndamento}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-6 text-sm font-semibold text-(--color-navy)">Ver registros de um analista</h2>
      <p className="mt-1 text-xs text-(--color-text-weak)">Abre os projetos que originaram os indicadores acima, respeitando os filtros aplicados.</p>
      <select
        value={drillDown}
        onChange={(e) => setDrillDown(e.target.value)}
        className="mt-2 rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)"
      >
        <option value="">Selecione…</option>
        {tabela.map((t) => <option key={t.responsavel} value={t.responsavel}>{t.responsavel}</option>)}
      </select>

      {drillDown && (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="text-xs font-medium text-(--color-text-dim)">
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Entidade</th>
                <th className="px-4 py-3">Disciplina</th>
                <th className="px-4 py-3">N° AT</th>
                <th className="px-4 py-3">Rev.</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Solicitação</th>
                <th className="px-4 py-3">Análise</th>
              </tr>
            </thead>
            <tbody>
              {registrosDrill.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-(--color-text-weak)">Nenhum registro.</td></tr>
              ) : (
                registrosDrill.map((r) => (
                  <tr key={`${r.origem}-${r.id}`} className="border-t border-(--color-border) first:border-0">
                    <td className="px-4 py-3 text-(--color-text)">{r.codigo}</td>
                    <td className="px-4 py-3 text-(--color-text-weak)">{r.nomeEntidade}</td>
                    <td className="px-4 py-3 text-(--color-text-weak)">{r.disciplina}</td>
                    <td className="px-4 py-3 text-(--color-text-weak)">{r.numAt || "—"}</td>
                    <td className="px-4 py-3 text-(--color-text-weak)">R{String(r.revisao ?? 0).padStart(2, "0")}</td>
                    <td className="px-4 py-3 text-(--color-text-weak)">{r.statusAnalise}</td>
                    <td className="px-4 py-3 text-(--color-text-weak)">{formatarData(r.dataSolicitacao)}</td>
                    <td className="px-4 py-3 text-(--color-text-weak)">{formatarData(r.dataAnalise)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-(--color-text-dim)">
        Exportação (Excel) ainda não disponível nesta versão — use o sistema atual enquanto esse recurso não chega por aqui.
      </p>
    </div>
  );
}
