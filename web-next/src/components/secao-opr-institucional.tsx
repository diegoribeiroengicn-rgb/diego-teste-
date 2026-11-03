"use client";

import { useState } from "react";
import { baixarRelatorio } from "@/components/baixar-relatorio";
import { DISCIPLINAS, RESPONSAVEIS, STATUS_ANALISE_OPCOES } from "@/lib/administracao-calculo";
import { rotuloCompetencia } from "@/lib/meses";

type TipoOpr = "Prestadores" | "Cessionários" | "Consolidado";
type NivelOpr = "Resumido" | "Executivo";
type PeriodoTipo = "mensal" | "anual" | "personalizado";

const SITUACOES_SLA_EXTERNO = ["DENTRO DO SLA", "PRÓXIMO DO LIMITE", "NO LIMITE", "FORA DO SLA", "AGUARDANDO NOVA REVISÃO", "DATA INCONSISTENTE"];

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-dim)">{rotulo}</span>
      {children}
    </label>
  );
}

const classeInput = "rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm text-(--color-text) outline-none focus:border-(--color-navy)";

/** "OPR — Relatório Institucional (Word)": gerador configurável com
 * filtros avançados — mesma regra de views/relatorios_mensais.py (bloco
 * "OPR — Relatório Institucional (Word)"). Sempre em .docx totalmente
 * editável; sem os gráficos do original nesta versão (ver nota em
 * lib/opr-institucional-word.ts). */
export function SecaoOprInstitucional({ mes, ano, observacaoAtual }: { mes: number; ano: number; observacaoAtual: string }) {
  const [tipo, setTipo] = useState<TipoOpr>("Consolidado");
  const [nivel, setNivel] = useState<NivelOpr>("Resumido");
  const [periodoTipo, setPeriodoTipo] = useState<PeriodoTipo>("mensal");
  const [anoOpr, setAnoOpr] = useState(ano);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [numAt, setNumAt] = useState("");
  const [disciplina, setDisciplina] = useState("");
  const [analista, setAnalista] = useState("");
  const [revisao, setRevisao] = useState("");
  const [status, setStatus] = useState("");
  const [situacaoSla, setSituacaoSla] = useState("");

  const [observacoes, setObservacoes] = useState(observacaoAtual);

  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function periodoCorpo() {
    if (periodoTipo === "mensal") return { tipo: "mensal", mes, ano };
    if (periodoTipo === "anual") return { tipo: "anual", ano: anoOpr };
    return { tipo: "personalizado", dataInicio, dataFim };
  }

  async function gerar() {
    if (periodoTipo === "personalizado" && (!dataInicio || !dataFim)) {
      setErro("Selecione a Data início e a Data fim para um OPR de período personalizado.");
      return;
    }
    setGerando(true);
    setErro(null);
    try {
      const resultado = await baixarRelatorio("/api/relatorios/opr-institucional/word", {
        tipo, nivel, periodo: periodoCorpo(),
        filtros: { codigo, nome, numAt, disciplina, analista, revisao, status, situacaoSla },
        observacoes,
      });
      if (resultado) setErro(resultado);
    } catch {
      setErro("Não foi possível conectar ao sistema.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-(--color-navy)">OPR — Relatório Institucional (Word)</h2>
      <p className="mt-1 text-xs text-(--color-text-weak)">
        Gerado sempre em Microsoft Word (.docx) totalmente editável. Disponível para Prestadores, Cessionários ou
        Consolidado, nos níveis Resumido e Executivo, com período mensal, anual ou personalizado.
      </p>

      <div className="mt-3 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Campo rotulo="Tipo de OPR">
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoOpr)} className={classeInput}>
              <option value="Prestadores">Prestadores</option>
              <option value="Cessionários">Cessionários</option>
              <option value="Consolidado">Consolidado</option>
            </select>
          </Campo>
          <Campo rotulo="Nível do OPR">
            <select value={nivel} onChange={(e) => setNivel(e.target.value as NivelOpr)} className={classeInput}>
              <option value="Resumido">Resumido</option>
              <option value="Executivo">Executivo</option>
            </select>
          </Campo>
          <Campo rotulo="Período do OPR">
            <select value={periodoTipo} onChange={(e) => setPeriodoTipo(e.target.value as PeriodoTipo)} className={classeInput}>
              <option value="mensal">Mensal ({rotuloCompetencia(mes, ano)})</option>
              <option value="anual">Anual</option>
              <option value="personalizado">Personalizado</option>
            </select>
          </Campo>
        </div>

        {periodoTipo === "anual" && (
          <div className="mt-3 max-w-[140px]">
            <Campo rotulo="Ano">
              <select value={anoOpr} onChange={(e) => setAnoOpr(Number(e.target.value))} className={classeInput}>
                {[ano - 1, ano, ano + 1].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Campo>
          </div>
        )}
        {periodoTipo === "personalizado" && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-sm">
            <Campo rotulo="Data início">
              <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className={classeInput} />
            </Campo>
            <Campo rotulo="Data fim">
              <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className={classeInput} />
            </Campo>
          </div>
        )}

        <p className="mt-4 text-xs font-semibold text-(--color-text-dim)">Filtros avançados do OPR</p>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Campo rotulo="Código"><input value={codigo} onChange={(e) => setCodigo(e.target.value)} className={classeInput} /></Campo>
          <Campo rotulo="Nome (busca parcial)"><input value={nome} onChange={(e) => setNome(e.target.value)} className={classeInput} /></Campo>
          <Campo rotulo="N° AT"><input value={numAt} onChange={(e) => setNumAt(e.target.value)} className={classeInput} /></Campo>
          <Campo rotulo="Disciplina">
            <select value={disciplina} onChange={(e) => setDisciplina(e.target.value)} className={classeInput}>
              <option value="">Todas</option>
              {DISCIPLINAS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Analista">
            <select value={analista} onChange={(e) => setAnalista(e.target.value)} className={classeInput}>
              <option value="">Todos</option>
              {RESPONSAVEIS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Revisão"><input value={revisao} onChange={(e) => setRevisao(e.target.value)} className={classeInput} /></Campo>
          <Campo rotulo="Status da análise">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={classeInput}>
              <option value="">Todos</option>
              {STATUS_ANALISE_OPCOES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Situação SLA (retorno externo)">
            <select value={situacaoSla} onChange={(e) => setSituacaoSla(e.target.value)} className={classeInput}>
              <option value="">Todas</option>
              {SITUACOES_SLA_EXTERNO.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Campo>
        </div>

        <div className="mt-4">
          <Campo rotulo="Observações gerenciais deste OPR">
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} className={classeInput} />
          </Campo>
        </div>

        <div className="mt-4 max-w-xs">
          <button
            onClick={gerar} disabled={gerando}
            className="w-full rounded-full bg-(--color-navy) px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {gerando ? "Gerando…" : "Gerar OPR (Word)"}
          </button>
          {erro && <p className="mt-1 text-xs text-(--color-red)">{erro}</p>}
        </div>
      </div>
    </div>
  );
}
