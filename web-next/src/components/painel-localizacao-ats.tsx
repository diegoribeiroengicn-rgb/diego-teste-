"use client";

import { useMemo, useState } from "react";
import {
  marcarMaisRecente,
  rotulosCanaisSelecionados,
  type LinhaLocalizacaoMarcada,
} from "@/lib/localizacao-ats-calculo";
import type { LinhaLocalizacao } from "@/lib/localizacao-ats-calculo";
import { textoSemAcentos } from "@/lib/revisoes-calculo";
import { SequenciaProjeto } from "@/components/painel-linha-tempo";
import { MESES_PT } from "@/lib/meses";

const COR_BADGE_STATUS: Record<string, string> = {
  "EM ANÁLISE": "var(--color-orange)",
  "EM HOLD": "var(--color-sky)",
  LIBERADO: "var(--color-green)",
  "LIBERADO C/ REST.": "var(--color-green)",
  "NÃO LIBERADO": "var(--color-red)",
  OBSOLETO: "var(--color-text-dim)",
  CANCELADO: "var(--color-text-dim)",
};

function BadgeStatus({ status }: { status: string | null }) {
  const texto = status?.trim() || "—";
  return (
    <span className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: COR_BADGE_STATUS[texto.toUpperCase()] ?? "#64748B" }}>
      {texto}
    </span>
  );
}

function formatarData(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString("pt-BR");
}

function formatarDataHora(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleString("pt-BR");
}

function anoDoAt(numAt: string | null): string {
  if (!numAt || !numAt.includes("/")) return "—";
  const partes = numAt.split("/");
  return partes[partes.length - 1] || "—";
}

function PainelDetalhe({ linha, grupo }: { linha: LinhaLocalizacaoMarcada; grupo: LinhaLocalizacao[] }) {
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const canais = rotulosCanaisSelecionados(linha.resumoMfiles, linha.resumoDrive, linha.resumoEmail);

  return (
    <div className="mt-6 rounded-2xl border-2 border-(--color-navy) bg-(--color-surface-1) p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-(--color-text-dim)">Detalhes</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-(--color-text)">AT {linha.numAt || "—"} · {linha.disciplina || "—"} · REV{String(linha.revisao).padStart(2, "0")}</p>
          <p className="mt-1 text-sm text-(--color-text-weak)">
            {linha.modulo === "prestadores" ? "Prestador" : "Cessionário"}: {linha.codigo || "—"} — {linha.nome || "—"}
          </p>
          {linha.obra && <p className="mt-0.5 text-sm text-(--color-text-weak)">Obra: {linha.obra}</p>}
        </div>
        <BadgeStatus status={linha.statusAnalise} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-3">
          <p className="text-sm font-semibold tabular-nums text-(--color-text)">{anoDoAt(linha.numAt)}</p>
          <p className="text-xs text-(--color-text-weak)">Ano</p>
        </div>
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-3">
          <p className="text-sm font-semibold text-(--color-text)">{linha.responsavel || "—"}</p>
          <p className="text-xs text-(--color-text-weak)">Analista responsável</p>
        </div>
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-3">
          <p className="text-sm font-semibold text-(--color-text)">{formatarDataHora(linha.atualizadoEm)}</p>
          <p className="text-xs text-(--color-text-weak)">Última atualização</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-(--color-text-weak)">
        <p>Data de solicitação: {formatarData(linha.dataSolicitacao)}</p>
        <p>Data de entrega prevista/acordada: {formatarData(linha.dataLimite)}</p>
      </div>
      <p className="mt-2 text-xs text-(--color-text-weak)">Localização da AT (Resumo de Conclusão): {canais.length ? canais.join(", ") : "—"}</p>
      {linha.observacoes?.trim() && <p className="mt-1 text-xs text-(--color-text-dim)">Observações: {linha.observacoes}</p>}

      <button onClick={() => setHistoricoAberto((v) => !v)} className="mt-4 rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-navy) hover:bg-(--color-surface-2)">
        {historicoAberto ? "Fechar histórico" : "Ver histórico completo (Linha do Tempo)"}
      </button>
      {historicoAberto && (
        <div className="mt-4">
          <SequenciaProjeto linhasProjeto={grupo} />
        </div>
      )}
    </div>
  );
}

export function PainelLocalizacaoAts({ linhas }: { linhas: LinhaLocalizacao[] }) {
  const [at, setAt] = useState("");
  const [obra, setObra] = useState("");
  const [disciplina, setDisciplina] = useState("");
  const [prestador, setPrestador] = useState("");
  const [cessionario, setCessionario] = useState("");
  const [codigo, setCodigo] = useState("");
  const [revisaoFiltro, setRevisaoFiltro] = useState("");
  const [status, setStatus] = useState("");
  const [analista, setAnalista] = useState("");
  const [mes, setMes] = useState("");
  const [ano, setAno] = useState("");
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const disciplinas = useMemo(() => [...new Set(linhas.map((l) => l.disciplina).filter((d): d is string => !!d))].sort(), [linhas]);
  const statusOpcoes = useMemo(() => [...new Set(linhas.map((l) => l.statusAnalise))].sort(), [linhas]);
  const analistas = useMemo(() => [...new Set(linhas.map((l) => l.responsavel).filter((r): r is string => !!r))].sort(), [linhas]);
  const anoAtual = new Date().getFullYear();
  const anosDisponiveis = [anoAtual - 1, anoAtual, anoAtual + 1];

  const filtradas = useMemo(() => {
    const mesNum = mes ? Number(mes) : null;
    const anoNum = ano ? Number(ano) : null;
    return linhas.filter((l) => {
      if (at.trim() && !(l.numAt || "").toUpperCase().includes(at.trim().toUpperCase())) return false;
      if (obra.trim() && !(l.obra || "").toUpperCase().includes(obra.trim().toUpperCase())) return false;
      if (disciplina && textoSemAcentos(l.disciplina) !== textoSemAcentos(disciplina)) return false;
      if (prestador.trim() && !(l.modulo === "prestadores" && (l.nome || "").toUpperCase().includes(prestador.trim().toUpperCase()))) return false;
      if (cessionario.trim() && !(l.modulo === "cessionarios" && (l.nome || "").toUpperCase().includes(cessionario.trim().toUpperCase()))) return false;
      if (codigo.trim() && !(l.codigo || "").toUpperCase().includes(codigo.trim().toUpperCase())) return false;
      if (revisaoFiltro.trim() && String(l.revisao) !== revisaoFiltro.trim()) return false;
      if (status && l.statusAnalise !== status) return false;
      if (analista && l.responsavel !== analista) return false;
      if (mesNum || anoNum) {
        if (!l.dataSolicitacao) return false;
        const d = new Date(l.dataSolicitacao);
        if (Number.isNaN(d.getTime())) return false;
        if (mesNum && d.getUTCMonth() + 1 !== mesNum) return false;
        if (anoNum && d.getUTCFullYear() !== anoNum) return false;
      }
      return true;
    });
  }, [linhas, at, obra, disciplina, prestador, cessionario, codigo, revisaoFiltro, status, analista, mes, ano]);

  const marcadas = useMemo(() => marcarMaisRecente(filtradas), [filtradas]);
  const ordenadas = useMemo(
    () => [...marcadas].sort((a, b) => a.chaveProjeto.localeCompare(b.chaveProjeto) || b.revisao - a.revisao),
    [marcadas],
  );

  const chaveLinha = (l: LinhaLocalizacaoMarcada) => `${l.modulo}:${l.id}`;
  const linhaSelecionada = selecionada ? ordenadas.find((l) => chaveLinha(l) === selecionada) : null;
  const grupoSelecionado = linhaSelecionada ? marcadas.filter((l) => l.chaveProjeto === linhaSelecionada.chaveProjeto) : [];

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Localização de ATs</h1>
      <p className="mt-1 max-w-3xl text-sm text-(--color-text-weak)">
        Consulta rápida, somente leitura — localize uma AT por número, obra, disciplina, prestador, cessionário,
        código ou revisão, e veja o último status e o histórico completo. Não altera, arquiva nem duplica nenhum
        dado do sistema.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input value={at} onChange={(e) => setAt(e.target.value)} placeholder="Número da AT" className="w-40 rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm outline-none focus:border-(--color-navy)" />
        <input value={obra} onChange={(e) => setObra(e.target.value)} placeholder="Obra" className="w-32 rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm outline-none focus:border-(--color-navy)" />
        <select value={disciplina} onChange={(e) => setDisciplina(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
          <option value="">Todas as disciplinas</option>
          {disciplinas.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <input value={prestador} onChange={(e) => setPrestador(e.target.value)} placeholder="Prestador" className="w-36 rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm outline-none focus:border-(--color-navy)" />
        <input value={cessionario} onChange={(e) => setCessionario(e.target.value)} placeholder="Cessionário" className="w-36 rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm outline-none focus:border-(--color-navy)" />
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código" className="w-28 rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm outline-none focus:border-(--color-navy)" />
        <input value={revisaoFiltro} onChange={(e) => setRevisaoFiltro(e.target.value)} placeholder="Revisão" className="w-24 rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm outline-none focus:border-(--color-navy)" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
          <option value="">Todos os status</option>
          {statusOpcoes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={analista} onChange={(e) => setAnalista(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
          <option value="">Todos os analistas</option>
          {analistas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={mes} onChange={(e) => setMes(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
          <option value="">Todos os meses</option>
          {MESES_PT.map((m, i) => <option key={m} value={i + 1}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
        </select>
        <select value={ano} onChange={(e) => setAno(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
          <option value="">Todos os anos</option>
          {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <p className="mt-4 text-sm text-(--color-text-weak)">
        <span className="text-xl font-semibold tabular-nums text-(--color-navy)">{ordenadas.length}</span> AT(s) encontrada(s)
      </p>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-(--color-text-dim)">
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3">Módulo</th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Prestador/Cessionário</th>
              <th className="px-4 py-3">Obra</th>
              <th className="px-4 py-3">Disciplina</th>
              <th className="px-4 py-3">Rev.</th>
              <th className="px-4 py-3">N° AT</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Analista</th>
              <th className="px-4 py-3">Solicitação</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-16 text-center text-(--color-text-weak)">Nenhuma AT encontrada para os filtros informados.</td></tr>
            ) : (
              ordenadas.map((l) => (
                <tr
                  key={chaveLinha(l)}
                  onClick={() => setSelecionada(chaveLinha(l))}
                  className={`cursor-pointer border-t border-(--color-border) first:border-0 hover:bg-(--color-surface-2)/60 ${selecionada === chaveLinha(l) ? "bg-(--color-blue-3)" : ""}`}
                >
                  <td className="px-4 py-2.5">{l.maisRecente && <span className="inline-block rounded-full bg-(--color-navy) px-2 py-0.5 text-[10px] font-semibold text-white">Mais recente</span>}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.modulo === "prestadores" ? "Prestador" : "Cessionário"}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.codigo || "—"}</td>
                  <td className="px-4 py-2.5 font-medium text-(--color-text)">{l.nome || "—"}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.obra || "—"}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.disciplina || "—"}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.revisao}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.numAt || "—"}</td>
                  <td className="px-4 py-2.5"><BadgeStatus status={l.statusAnalise} /></td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.responsavel || "—"}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{formatarData(l.dataSolicitacao)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!linhaSelecionada && ordenadas.length > 0 && (
        <p className="mt-3 text-xs text-(--color-text-dim)">Selecione uma linha na tabela para ver os detalhes completos e o histórico.</p>
      )}
      {linhaSelecionada && <PainelDetalhe linha={linhaSelecionada} grupo={grupoSelecionado} />}
    </div>
  );
}
