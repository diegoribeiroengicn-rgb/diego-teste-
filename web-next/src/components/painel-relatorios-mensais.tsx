"use client";

import { METODOLOGIA_BACKLOG } from "@/lib/produtividade";
import { useMemo, useState } from "react";
import { SeletorCompetencia } from "@/components/seletor-competencia";
import { BotaoRelatorio } from "@/components/baixar-relatorio";
import { SecaoOprInstitucional } from "@/components/secao-opr-institucional";
import {
  acumuladoAno,
  comparativoMensal,
  indicadoresMensaisModulo,
  mesAnterior,
  type LinhaProdutividade,
  type ModuloProdutividade,
} from "@/lib/produtividade";
import { MESES_PT, rotuloCompetencia } from "@/lib/meses";

function CartaoKpi({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-4 py-3.5">
      <p className="text-xl font-semibold tabular-nums" style={cor ? { color: cor } : undefined}>{valor}</p>
      <p className="mt-0.5 text-xs text-(--color-text-weak)">{titulo}</p>
    </div>
  );
}

function Metrica({ titulo, valor, delta }: { titulo: string; valor: number; delta: string | null }) {
  return (
    <div>
      <p className="text-xs text-(--color-text-weak)">{titulo}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-(--color-text)">{valor}</p>
      {delta && <p className="text-xs text-(--color-text-dim)">{delta}</p>}
    </div>
  );
}

/** "One Page Report — Resumo Executivo Mensal": observações gerenciais
 * (persistidas por competência) + geração do PDF consolidado — mesma
 * regra de views/relatorios_mensais.py (bloco "One Page Report — Resumo
 * Executivo Mensal"). */
function SecaoOprExecutivo({ mes, ano, observacaoInicial }: { mes: number; ano: number; observacaoInicial: string }) {
  const [texto, setTexto] = useState(observacaoInicial);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setSalvo(false);
    try {
      const resposta = await fetch("/api/relatorios/observacao-mensal", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mes, ano, texto }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        setErro(corpo?.erro || "Erro ao salvar observações.");
      } else {
        setSalvo(true);
      }
    } catch {
      setErro("Não foi possível conectar ao sistema.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-(--color-navy)">One Page Report — Resumo Executivo Mensal</h2>
      <p className="mt-1 text-xs text-(--color-text-weak)">
        Consolida Prestadores + Cessionários do mês selecionado, independentemente do módulo escolhido acima.
      </p>

      <div className="mt-3 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
        <label className="text-xs font-semibold text-(--color-text-dim)">Observações gerenciais desta competência</label>
        <textarea
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setSalvo(false); }}
          rows={4}
          className="mt-2 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={salvar} disabled={salvando}
            className="rounded-full border border-(--color-border) px-4 py-1.5 text-xs font-medium text-(--color-text) hover:bg-(--color-surface-2) disabled:opacity-60"
          >
            {salvando ? "Salvando…" : "Salvar observações"}
          </button>
          {salvo && <span className="text-xs text-(--color-green)">Observações salvas.</span>}
          {erro && <span className="text-xs text-(--color-red)">{erro}</span>}
        </div>
      </div>

      <div className="mt-3 max-w-xs">
        <BotaoRelatorio rotulo="Gerar One Page Report (PDF)" url="/api/relatorios/opr-executivo/pdf" corpo={{ mes, ano }} />
      </div>
    </div>
  );
}

/** Painel on-screen de "Relatórios Mensais" — indicadores por competência
 * (Mês/Ano) e comparativos, para Prestadores/Cessionários/Consolidado —
 * mesma regra de views/relatorios_mensais.py (ramo não-Analistas; a
 * produtividade por analista já tem painel dedicado em /analistas). */
export function PainelRelatoriosMensais({
  linhas,
  mes,
  ano,
  observacaoInicial,
}: {
  linhas: LinhaProdutividade[];
  mes: number;
  ano: number;
  observacaoInicial: string;
}) {
  const [modulo, setModulo] = useState<ModuloProdutividade | "consolidado">("consolidado");

  const base = useMemo(() => (modulo === "consolidado" ? linhas : linhas.filter((l) => l.origem === modulo)), [linhas, modulo]);

  const indicadoresAtual = useMemo(() => indicadoresMensaisModulo(base, mes, ano), [base, mes, ano]);
  const [mesAnt, anoAnt] = mesAnterior(mes, ano);
  const indicadoresMesAnt = useMemo(() => indicadoresMensaisModulo(base, mesAnt, anoAnt), [base, mesAnt, anoAnt]);
  const indicadoresAnoPassado = useMemo(() => indicadoresMensaisModulo(base, mes, ano - 1), [base, mes, ano]);
  const acumulado = useMemo(() => acumuladoAno(base, ano), [base, ano]);

  const competenciaLabel = rotuloCompetencia(mes, ano);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-(--color-text)">Relatórios Mensais</h1>
          <p className="mt-1 max-w-2xl text-sm text-(--color-text-weak)">
            Indicadores por competência (Mês/Ano) e comparativos — competência selecionada: <strong>{competenciaLabel}</strong>.
          </p>
        </div>
        <SeletorCompetencia mes={mes} ano={ano} />
      </div>

      <div className="mt-5 flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-dim)">Módulo</span>
        <div className="flex w-fit gap-1 rounded-full border border-(--color-border) bg-(--color-surface-1) p-1 text-xs font-medium">
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

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <CartaoKpi titulo="Projetos Recebidos" valor={String(indicadoresAtual.recebidos)} cor="var(--color-navy)" />
        <CartaoKpi titulo="Projetos Concluídos" valor={String(indicadoresAtual.concluidos)} cor="var(--color-green)" />
        <CartaoKpi titulo="Projetos em Análise" valor={String(indicadoresAtual.emAnalise)} cor="var(--color-gold)" />
        <CartaoKpi titulo="Documentos" valor={String(indicadoresAtual.documentos)} cor="var(--color-blue-2)" />
        <CartaoKpi titulo="% SLA Cumprido" valor={`${indicadoresAtual.slaPercentual}%`} cor="var(--color-sky)" />
        <CartaoKpi titulo="Backlog do Período" valor={String(indicadoresAtual.backlog)} cor="var(--color-orange)" />
      </div>

      <details className="mt-3 rounded-xl border border-(--color-border) bg-(--color-surface-1) px-4 py-3 text-xs text-(--color-text-weak)">
        <summary className="cursor-pointer font-medium text-(--color-text)">{METODOLOGIA_BACKLOG.titulo}</summary>
        {METODOLOGIA_BACKLOG.paragrafos.map((par) => <p key={par} className="mt-2">{par}</p>)}
      </details>

      <h2 className="mt-6 text-sm font-semibold text-(--color-navy)">Comparativos</h2>
      <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
          <p className="text-xs text-(--color-text-dim)">
            {competenciaLabel} × {MESES_PT[mesAnt - 1].charAt(0)}{MESES_PT[mesAnt - 1].slice(1).toLowerCase()} de {anoAnt}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Metrica titulo="Recebidos" valor={comparativoMensal(indicadoresAtual, indicadoresMesAnt, "recebidos")[0]} delta={comparativoMensal(indicadoresAtual, indicadoresMesAnt, "recebidos")[1]} />
            <Metrica titulo="Concluídos" valor={comparativoMensal(indicadoresAtual, indicadoresMesAnt, "concluidos")[0]} delta={comparativoMensal(indicadoresAtual, indicadoresMesAnt, "concluidos")[1]} />
          </div>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
          <p className="text-xs text-(--color-text-dim)">{competenciaLabel} × mesmo mês de {ano - 1}</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Metrica titulo="Recebidos (ano anterior)" valor={comparativoMensal(indicadoresAtual, indicadoresAnoPassado, "recebidos")[0]} delta={comparativoMensal(indicadoresAtual, indicadoresAnoPassado, "recebidos")[1]} />
            <Metrica titulo="Concluídos (ano anterior)" valor={comparativoMensal(indicadoresAtual, indicadoresAnoPassado, "concluidos")[0]} delta={comparativoMensal(indicadoresAtual, indicadoresAnoPassado, "concluidos")[1]} />
          </div>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
          <p className="text-xs text-(--color-text-dim)">Acumulado {ano}</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Metrica titulo="Recebidos no ano" valor={acumulado.recebidos} delta={null} />
            <Metrica titulo="Concluídos no ano" valor={acumulado.concluidos} delta={null} />
          </div>
        </div>
      </div>

      <h2 className="mt-6 text-sm font-semibold text-(--color-navy)">Exportação</h2>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-md">
        <BotaoRelatorio rotulo="Exportar Excel" url="/api/relatorios/mensal/excel" corpo={{ modulo, mes, ano }} />
        <BotaoRelatorio rotulo="Exportar PDF" url="/api/relatorios/mensal/pdf" corpo={{ modulo, mes, ano }} />
      </div>

      <p className="mt-4 text-xs text-(--color-text-dim)">
        Produtividade por analista em detalhe: veja o Painel de Analistas.
      </p>

      <div className="mt-8 border-t border-(--color-border) pt-6">
        <SecaoOprExecutivo key={`${mes}-${ano}`} mes={mes} ano={ano} observacaoInicial={observacaoInicial} />
      </div>

      <div className="mt-8 border-t border-(--color-border) pt-6">
        <SecaoOprInstitucional key={`${mes}-${ano}-institucional`} mes={mes} ano={ano} observacaoAtual={observacaoInicial} />
      </div>
    </div>
  );
}
