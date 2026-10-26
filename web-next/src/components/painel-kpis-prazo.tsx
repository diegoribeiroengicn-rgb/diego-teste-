"use client";

import { useMemo, useState } from "react";
import {
  calcularKpisPrazoAnalista,
  tabelaConsolidadaPorAnalista,
  type LinhaPrazo,
} from "@/lib/kpis-prazo-calculo";
import { GraficoAtrasadosPorAnalista, GraficoClassificacaoPrazo, GraficoRankingCumprimento } from "@/components/kpis-prazo-charts";
import { MESES_PT } from "@/lib/meses";

const CONSOLIDADO = "__CONSOLIDADO__";

function corPct(pct: number): string {
  if (pct >= 80) return "var(--color-green)";
  if (pct >= 60) return "var(--color-gold)";
  return "var(--color-red)";
}

function CartaoKpi({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-4 py-4">
      <p className="text-xl font-semibold tabular-nums" style={cor ? { color: cor } : undefined}>{valor}</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">{titulo}</p>
    </div>
  );
}

function CartaoDestaque({ titulo, valor, destaque }: { titulo: string; valor: number; destaque: boolean }) {
  return (
    <div
      className="rounded-2xl border-2 px-4 py-4"
      style={{
        borderColor: destaque ? "var(--color-red)" : "var(--color-border)",
        background: destaque ? "var(--color-red-bg)" : "transparent",
      }}
    >
      <p className="text-xl font-semibold tabular-nums" style={{ color: destaque ? "var(--color-red)" : undefined }}>{valor}</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">{titulo}</p>
    </div>
  );
}

export function PainelKpisPrazo({
  linhas,
  perfil,
  analistaVinculado,
}: {
  linhas: LinhaPrazo[];
  perfil: string;
  analistaVinculado: string | null;
}) {
  const podeVerOutros = perfil === "ADMIN" || perfil === "GESTOR";

  const responsaveis = useMemo(() => [...new Set(linhas.map((l) => l.responsavel))].sort(), [linhas]);
  const disciplinas = useMemo(() => [...new Set(linhas.map((l) => l.disciplina))].sort(), [linhas]);
  const statusOpcoes = useMemo(() => [...new Set(linhas.map((l) => l.statusAnalise))].sort(), [linhas]);

  const [disciplina, setDisciplina] = useState("");
  const [status, setStatus] = useState("");
  const [mes, setMes] = useState("");
  const [ano, setAno] = useState("");
  const [analistaEscolhido, setAnalistaEscolhido] = useState(podeVerOutros ? CONSOLIDADO : (analistaVinculado ?? ""));

  const filtradas = useMemo(() => {
    const mesNum = mes ? Number(mes) : null;
    const anoNum = ano ? Number(ano) : null;
    return linhas.filter((l) => {
      if (disciplina && l.disciplina !== disciplina) return false;
      if (status && l.statusAnalise !== status) return false;
      if (mesNum || anoNum) {
        if (!l.dataSolicitacao) return false;
        const d = new Date(l.dataSolicitacao);
        if (Number.isNaN(d.getTime())) return false;
        if (mesNum && d.getUTCMonth() + 1 !== mesNum) return false;
        if (anoNum && d.getUTCFullYear() !== anoNum) return false;
      }
      return true;
    });
  }, [linhas, disciplina, status, mes, ano]);

  const anoAtual = new Date().getFullYear();
  const anosDisponiveis = [anoAtual - 1, anoAtual, anoAtual + 1];

  if (linhas.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-10">
        <h1 className="text-2xl font-semibold text-(--color-text)">KPIs de Prazo dos Analistas</h1>
        <p className="mt-6 text-sm text-(--color-text-weak)">Nenhum projeto cadastrado ainda.</p>
      </div>
    );
  }

  if (!podeVerOutros && !analistaVinculado) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-10">
        <h1 className="text-2xl font-semibold text-(--color-text)">KPIs de Prazo dos Analistas</h1>
        <p className="mt-6 max-w-xl rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4 text-sm text-(--color-text-weak)">
          Seu usuário não está vinculado a um analista da lista de Responsáveis. Solicite ao administrador a
          vinculação em Administração &gt; Usuários para visualizar seus indicadores de prazo.
        </p>
      </div>
    );
  }

  const analistaAlvo = podeVerOutros ? (analistaEscolhido === CONSOLIDADO ? null : analistaEscolhido) : analistaVinculado;

  const filtros = (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      {podeVerOutros && (
        <select
          value={analistaEscolhido}
          onChange={(e) => setAnalistaEscolhido(e.target.value)}
          className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium text-(--color-text) outline-none focus:border-(--color-navy)"
        >
          <option value={CONSOLIDADO}>Consolidado (equipe)</option>
          {responsaveis.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      <select
        value={disciplina}
        onChange={(e) => setDisciplina(e.target.value)}
        className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium text-(--color-text) outline-none focus:border-(--color-navy)"
      >
        <option value="">Todas as disciplinas</option>
        {disciplinas.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium text-(--color-text) outline-none focus:border-(--color-navy)"
      >
        <option value="">Todos os status</option>
        {statusOpcoes.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select
        value={mes}
        onChange={(e) => setMes(e.target.value)}
        className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium text-(--color-text) outline-none focus:border-(--color-navy)"
      >
        <option value="">Todos os meses</option>
        {MESES_PT.map((nome, i) => <option key={nome} value={i + 1}>{nome.charAt(0) + nome.slice(1).toLowerCase()}</option>)}
      </select>
      <select
        value={ano}
        onChange={(e) => setAno(e.target.value)}
        className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium text-(--color-text) outline-none focus:border-(--color-navy)"
      >
        <option value="">Todos os anos</option>
        {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <span className="text-xs text-(--color-text-dim)">Competência: Data de Solicitação</span>
    </div>
  );

  if (analistaAlvo === null) {
    const tabela = tabelaConsolidadaPorAnalista(filtradas, responsaveis);
    const totalEntregue = tabela.reduce((s, t) => s + t.totalEntregue, 0);
    const totalAtrasados = tabela.reduce((s, t) => s + t.atrasadosEmAnalise, 0);
    const totalVence2d = tabela.reduce((s, t) => s + t.vencem2DiasUteis, 0);
    const totalHold = tabela.reduce((s, t) => s + t.emHold, 0);
    const antesSum = tabela.reduce((s, t) => s + t.antesPrazo, 0);
    const noDiaSum = tabela.reduce((s, t) => s + t.noDia, 0);
    const pctGeral = totalEntregue ? Math.round((1000 * (antesSum + noDiaSum)) / totalEntregue) / 10 : 0;
    const comAtrasoAnalistas = tabela.filter((t) => t.comAtraso > 0);
    const antesAnalistas = tabela.filter((t) => t.antesPrazo > 0);
    const mediaAtrasoGeral = comAtrasoAnalistas.length
      ? Math.round((comAtrasoAnalistas.reduce((s, t) => s + t.mediaDiasAtraso, 0) / comAtrasoAnalistas.length) * 10) / 10
      : 0;
    const mediaAntecipGeral = antesAnalistas.length
      ? Math.round((antesAnalistas.reduce((s, t) => s + t.mediaDiasAntecipacao, 0) / antesAnalistas.length) * 10) / 10
      : 0;

    const porDisciplina = new Map<string, number>();
    for (const l of filtradas) porDisciplina.set(l.disciplina, (porDisciplina.get(l.disciplina) ?? 0) + 1);

    return (
      <div className="mx-auto max-w-6xl px-8 py-10">
        <h1 className="text-2xl font-semibold text-(--color-text)">KPIs de Prazo dos Analistas</h1>
        <p className="mt-1 max-w-2xl text-sm text-(--color-text-weak)">
          Desempenho frente à data prevista de entrega: antes do prazo, no dia, com atraso, análises atualmente
          atrasadas e próximas do vencimento.
        </p>
        {filtros}

        <p className="mt-6 text-sm font-semibold text-(--color-text)">Indicadores consolidados da equipe</p>
        <p className="mt-1 text-xs text-(--color-text-weak)">Visão restrita a Gestor/Administrador.</p>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <CartaoKpi titulo="Total entregue (equipe)" valor={String(totalEntregue)} cor="var(--color-navy)" />
          <CartaoKpi titulo="Atrasados em análise (equipe)" valor={String(totalAtrasados)} cor="var(--color-red)" />
          <CartaoKpi titulo="Vencem em até 2 dias úteis" valor={String(totalVence2d)} cor="var(--color-gold)" />
          <CartaoKpi titulo="Em HOLD (equipe)" valor={String(totalHold)} cor="var(--color-sky)" />
          <CartaoKpi titulo="% Cumprimento geral" valor={`${pctGeral}%`} cor={corPct(pctGeral)} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-2">
          <CartaoKpi titulo="Média dias úteis de atraso (equipe)" valor={String(mediaAtrasoGeral)} />
          <CartaoKpi titulo="Média dias úteis de antecipação (equipe)" valor={String(mediaAntecipGeral)} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
            <GraficoClassificacaoPrazo linhas={filtradas} titulo="Classificação das Entregas — Equipe" />
          </div>
          <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
            <GraficoRankingCumprimento tabela={tabela} />
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
          <GraficoAtrasadosPorAnalista tabela={tabela} />
        </div>

        <p className="mt-6 text-sm font-semibold text-(--color-text)">Por disciplina</p>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
          <table className="w-full min-w-[280px] text-left text-sm">
            <thead>
              <tr className="text-xs font-medium text-(--color-text-dim)">
                <th className="px-4 py-3">Disciplina</th>
                <th className="px-4 py-3 text-right">Projetos</th>
              </tr>
            </thead>
            <tbody>
              {[...porDisciplina.entries()].sort((a, b) => b[1] - a[1]).map(([d, n]) => (
                <tr key={d} className="border-t border-(--color-border)">
                  <td className="px-4 py-2.5 text-(--color-text)">{d}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-(--color-text)">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-sm font-semibold text-(--color-text)">Por analista</p>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="text-xs font-medium text-(--color-text-dim)">
                <th className="px-4 py-3">Analista</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Antes</th>
                <th className="px-4 py-3 text-right">No dia</th>
                <th className="px-4 py-3 text-right">Atraso</th>
                <th className="px-4 py-3 text-right">% Cumprim.</th>
                <th className="px-4 py-3 text-right">Atrasados</th>
                <th className="px-4 py-3 text-right">Vence 2d</th>
                <th className="px-4 py-3 text-right">HOLD</th>
              </tr>
            </thead>
            <tbody>
              {tabela.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-(--color-text-weak)">Nenhum dado encontrado com os filtros aplicados.</td></tr>
              ) : (
                tabela.map((t) => (
                  <tr key={t.analista} className="border-t border-(--color-border) hover:bg-(--color-surface-2)/60">
                    <td className="px-4 py-2.5 font-medium text-(--color-text)">{t.analista}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-(--color-text)">{t.totalEntregue}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-(--color-text)">{t.antesPrazo}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-(--color-text)">{t.noDia}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-(--color-text)">{t.comAtraso}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium" style={{ color: corPct(t.pctCumprimentoPrazo) }}>{t.pctCumprimentoPrazo}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: t.atrasadosEmAnalise ? "var(--color-red)" : undefined }}>{t.atrasadosEmAnalise}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-(--color-text)">{t.vencem2DiasUteis}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-(--color-text)">{t.emHold}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-xs text-(--color-text-dim)">
          Relatório individual (Word) ainda não disponível nesta versão — use o sistema atual enquanto esse
          recurso não chega por aqui.
        </p>
      </div>
    );
  }

  const kpis = calcularKpisPrazoAnalista(filtradas, analistaAlvo);
  const linhasAnalista = filtradas.filter((l) => l.responsavel === analistaAlvo);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">KPIs de Prazo dos Analistas</h1>
      <p className="mt-1 max-w-2xl text-sm text-(--color-text-weak)">
        Desempenho frente à data prevista de entrega: antes do prazo, no dia, com atraso, análises atualmente
        atrasadas e próximas do vencimento.
      </p>
      {!podeVerOutros && (
        <p className="mt-2 text-xs text-(--color-text-weak)">
          Exibindo apenas os indicadores de <strong>{analistaAlvo}</strong> — você só pode ver os seus próprios
          indicadores de prazo.
        </p>
      )}
      {filtros}

      <p className="mt-6 text-sm font-semibold text-(--color-text)">Cards do analista</p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CartaoKpi titulo="Total entregue" valor={String(kpis.totalEntregue)} cor="var(--color-navy)" />
        <CartaoKpi titulo="Entregues antes do prazo" valor={String(kpis.antesPrazo)} cor="var(--color-green)" />
        <CartaoKpi titulo="Entregues no dia" valor={String(kpis.noDia)} cor="var(--color-gold)" />
        <CartaoKpi titulo="Entregues com atraso" valor={String(kpis.comAtraso)} cor="var(--color-red)" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <CartaoDestaque titulo="Atrasados em Análise" valor={kpis.atrasadosEmAnalise} destaque={kpis.atrasadosEmAnalise > 0} />
        <CartaoKpi titulo="Vencem em até 2 dias úteis" valor={String(kpis.vencem2DiasUteis)} />
        <CartaoKpi titulo="Em HOLD" valor={String(kpis.emHold)} />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CartaoKpi titulo="% Cumprimento do prazo" valor={`${kpis.pctCumprimentoPrazo}%`} cor={corPct(kpis.pctCumprimentoPrazo)} />
        <CartaoKpi titulo="Média dias úteis de antecipação" valor={String(kpis.mediaDiasAntecipacao)} />
        <CartaoKpi titulo="Média dias úteis de atraso" valor={String(kpis.mediaDiasAtraso)} />
      </div>

      <p className="mt-6 text-sm font-semibold text-(--color-text)">Gráficos</p>
      <div className="mt-2 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
        <GraficoClassificacaoPrazo linhas={linhasAnalista} titulo="Classificação das Entregas" />
      </div>

      <p className="mt-6 text-sm font-semibold text-(--color-text)">Relação de análises</p>
      <div className="mt-2 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-(--color-text-dim)">
              <th className="px-4 py-3">Módulo</th>
              <th className="px-4 py-3">Disciplina</th>
              <th className="px-4 py-3">Rev.</th>
              <th className="px-4 py-3">N° AT</th>
              <th className="px-4 py-3">Data Prevista</th>
              <th className="px-4 py-3">Data Efetiva</th>
              <th className="px-4 py-3 text-right">Dias Úteis</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {linhasAnalista.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-(--color-text-weak)">Nenhuma análise encontrada com os filtros aplicados.</td></tr>
            ) : (
              linhasAnalista.map((l) => (
                <tr key={`${l.origem}-${l.id}`} className="border-t border-(--color-border) hover:bg-(--color-surface-2)/60">
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.origem === "prestadores" ? "Prestadores" : "Cessionários"}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.disciplina}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.revisao ?? "—"}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.numAt || "—"}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.dataLimite ? new Date(l.dataLimite).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.dataAnalise ? new Date(l.dataAnalise).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-(--color-text-weak)">{l.diasUteisDiferenca ?? "—"}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.statusAnalise}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs text-(--color-text-dim)">
        Relatório individual (Word) ainda não disponível nesta versão — use o sistema atual enquanto esse
        recurso não chega por aqui.
      </p>
    </div>
  );
}
