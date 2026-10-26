"use client";

import { useMemo, useState } from "react";
import type { AvaliacaoChecklist } from "@/lib/avaliacao-checklist";
import type { PerguntaChecklist } from "@/lib/avaliacao-checklist-calculo";
import { GraficoClassificacaoAvaliacoes } from "@/components/avaliacao-checklist-chart";
import { FormularioAvaliacaoChecklist } from "@/components/formulario-avaliacao-checklist";
import { MESES_PT } from "@/lib/meses";

const COR_CLASSIFICACAO: Record<string, string> = {
  EXCELENTE: "var(--color-green)",
  BOM: "var(--color-sky)",
  REGULAR: "var(--color-gold)",
  BAIXO: "var(--color-orange)",
  "CRÍTICO": "var(--color-red)",
};

function formatarData(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString("pt-BR");
}

export function TabelaAvaliacoesChecklist({
  avaliacoes,
  perguntas,
  responsaveis,
}: {
  avaliacoes: AvaliacaoChecklist[];
  perguntas: PerguntaChecklist[];
  responsaveis: string[];
}) {
  const [tipo, setTipo] = useState<"TODOS" | "PRESTADOR" | "CESSIONARIO">("TODOS");
  const [busca, setBusca] = useState("");
  const [disciplina, setDisciplina] = useState("");
  const [classificacao, setClassificacao] = useState("");
  const [analista, setAnalista] = useState("");
  const [mes, setMes] = useState("");
  const [ano, setAno] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);

  const disciplinas = useMemo(() => [...new Set(avaliacoes.map((a) => a.disciplina).filter((d): d is string => !!d))].sort(), [avaliacoes]);
  const classificacoes = useMemo(() => [...new Set(avaliacoes.map((a) => a.classificacao))].sort(), [avaliacoes]);
  const anoAtual = new Date().getFullYear();
  const anosDisponiveis = [anoAtual - 1, anoAtual, anoAtual + 1];

  const filtradas = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    const mesNum = mes ? Number(mes) : null;
    const anoNum = ano ? Number(ano) : null;
    return avaliacoes.filter((a) => {
      if (tipo !== "TODOS" && a.tipoEntidade !== tipo) return false;
      if (disciplina && a.disciplina !== disciplina) return false;
      if (classificacao && a.classificacao !== classificacao) return false;
      if (analista && a.analistaResponsavel !== analista) return false;
      if (mesNum || anoNum) {
        const d = new Date(a.dataAvaliacao);
        if (Number.isNaN(d.getTime())) return false;
        if (mesNum && d.getUTCMonth() + 1 !== mesNum) return false;
        if (anoNum && d.getUTCFullYear() !== anoNum) return false;
      }
      if (!termo) return true;
      return (
        a.nomeEntidade.toUpperCase().includes(termo) ||
        (a.codigoEntidade || "").toUpperCase().includes(termo) ||
        (a.atReferencia || "").toUpperCase().includes(termo)
      );
    });
  }, [avaliacoes, tipo, busca, disciplina, classificacao, analista, mes, ano]);

  const totalPerguntasAtivas = perguntas.length;
  const media = filtradas.length ? Math.round((filtradas.reduce((s, a) => s + a.pontuacao, 0) / filtradas.length) * 10) / 10 : 0;
  const demandamAcompanhamento = filtradas.filter((a) => a.classificacao === "CRÍTICO" || a.classificacao === "BAIXO").length;

  const dadosDonut = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const a of filtradas) mapa.set(a.classificacao, (mapa.get(a.classificacao) ?? 0) + 1);
    return [...mapa.entries()].map(([classificacao, quantidade]) => ({ classificacao, quantidade }));
  }, [filtradas]);

  const editando = editandoId != null ? avaliacoes.find((a) => a.id === editandoId) : undefined;

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Histórico de Avaliações</h1>
      <p className="mt-1 max-w-2xl text-sm text-(--color-text-weak)">
        Avaliações por checklist de Prestadores e Cessionários já registradas — clique em uma linha para editar.
      </p>

      {editando && (
        <div className="mt-6 rounded-2xl border-2 border-(--color-navy) bg-(--color-surface-1) p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-(--color-text)">Editar avaliação — {editando.nomeEntidade}</p>
            <button onClick={() => setEditandoId(null)} className="text-sm text-(--color-text-weak) hover:text-(--color-text)">Fechar</button>
          </div>
          <FormularioAvaliacaoChecklist
            perguntas={perguntas}
            responsaveis={responsaveis}
            avaliacaoExistente={editando}
            onSalvo={() => setEditandoId(null)}
          />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-(--color-border) bg-(--color-surface-1) p-1 text-xs font-medium">
          {(["TODOS", "PRESTADOR", "CESSIONARIO"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`rounded-full px-3 py-1.5 transition-colors ${tipo === t ? "bg-(--color-navy) text-white" : "text-(--color-text-weak) hover:text-(--color-text)"}`}
            >
              {t === "TODOS" ? "Todos" : t === "PRESTADOR" ? "Prestador" : "Cessionário"}
            </button>
          ))}
        </div>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, código ou N° AT…"
          className="w-64 rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/15"
        />
        <select value={disciplina} onChange={(e) => setDisciplina(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium text-(--color-text) outline-none focus:border-(--color-navy)">
          <option value="">Todas as disciplinas</option>
          {disciplinas.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={classificacao} onChange={(e) => setClassificacao(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium text-(--color-text) outline-none focus:border-(--color-navy)">
          <option value="">Todas as classificações</option>
          {classificacoes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={analista} onChange={(e) => setAnalista(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium text-(--color-text) outline-none focus:border-(--color-navy)">
          <option value="">Todos os analistas</option>
          {responsaveis.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={mes} onChange={(e) => setMes(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium text-(--color-text) outline-none focus:border-(--color-navy)">
          <option value="">Todos os meses</option>
          {MESES_PT.map((nome, i) => <option key={nome} value={i + 1}>{nome.charAt(0) + nome.slice(1).toLowerCase()}</option>)}
        </select>
        <select value={ano} onChange={(e) => setAno(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium text-(--color-text) outline-none focus:border-(--color-navy)">
          <option value="">Todos os anos</option>
          {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-navy)">{filtradas.length}</p>
          <p className="text-xs text-(--color-text-weak)">avaliações</p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-text)">{media} / {totalPerguntasAtivas || "—"}</p>
          <p className="text-xs text-(--color-text-weak)">pontuação média</p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-red)">{demandamAcompanhamento}</p>
          <p className="text-xs text-(--color-text-weak)">demandam acompanhamento</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
        <p style={{ color: "var(--color-navy)" }} className="mb-2 text-sm font-semibold">Distribuição por Classificação</p>
        <GraficoClassificacaoAvaliacoes dados={dadosDonut} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-(--color-text-dim)">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Disciplina</th>
              <th className="px-4 py-3">N° AT</th>
              <th className="px-4 py-3">Rev.</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Analista</th>
              <th className="px-4 py-3 text-right">Pontuação</th>
              <th className="px-4 py-3">Classificação</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-16 text-center text-(--color-text-weak)">Nenhuma avaliação encontrada com os filtros atuais.</td></tr>
            ) : (
              filtradas.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setEditandoId(a.id)}
                  className="cursor-pointer border-t border-(--color-border) first:border-0 hover:bg-(--color-surface-2)/60"
                >
                  <td className="px-4 py-3 font-medium text-(--color-text)">{a.nomeEntidade}</td>
                  <td className="px-4 py-3 text-(--color-text-weak)">{a.codigoEntidade || "—"}</td>
                  <td className="px-4 py-3 text-(--color-text-weak)">{a.disciplina || "—"}</td>
                  <td className="px-4 py-3 text-(--color-text-weak)">{a.atReferencia || "—"}</td>
                  <td className="px-4 py-3 text-(--color-text-weak)">{a.revisao}</td>
                  <td className="px-4 py-3 text-(--color-text-weak)">{formatarData(a.dataAvaliacao)}</td>
                  <td className="px-4 py-3 text-(--color-text-weak)">{a.analistaResponsavel || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-(--color-text-weak)">{a.pontuacao}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: COR_CLASSIFICACAO[a.classificacao] ?? "#64748B" }}>
                      {a.classificacao}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-(--color-text-dim)">
        Exportação (Excel/CSV/JSON) ainda não disponível nesta versão — use o sistema atual enquanto esse recurso
        não chega por aqui.
      </p>
    </div>
  );
}
