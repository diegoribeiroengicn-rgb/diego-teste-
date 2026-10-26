"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CRITICIDADE_ATENCAO, CRITICIDADE_CRITICO, CRITICIDADE_INFORMATIVO, type Criticidade, type LembretePep } from "@/lib/lembretes-pep-calculo";

const COR_CRITICIDADE: Record<Criticidade, string> = {
  [CRITICIDADE_CRITICO]: "var(--color-red)",
  [CRITICIDADE_ATENCAO]: "var(--color-gold)",
  [CRITICIDADE_INFORMATIVO]: "var(--color-sky)",
};

const ORDEM_CRITICIDADE: Record<Criticidade, number> = {
  [CRITICIDADE_CRITICO]: 0,
  [CRITICIDADE_ATENCAO]: 1,
  [CRITICIDADE_INFORMATIVO]: 2,
};

function formatarData(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString("pt-BR");
}

function BadgeCriticidade({ valor }: { valor: Criticidade }) {
  return (
    <span
      className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold text-white"
      style={{ background: COR_CRITICIDADE[valor] }}
    >
      {valor}
    </span>
  );
}

export function TabelaLembretesPep({ lembretes }: { lembretes: LembretePep[] }) {
  const [busca, setBusca] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [criticidade, setCriticidade] = useState<"TODAS" | Criticidade>("TODAS");
  const [diasMin, setDiasMin] = useState(0);

  const responsaveis = useMemo(
    () => [...new Set(lembretes.map((l) => l.responsavel).filter((r): r is string => !!r))].sort(),
    [lembretes],
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    return lembretes
      .filter((l) => {
        if (responsavel && l.responsavel !== responsavel) return false;
        if (criticidade !== "TODAS" && l.criticidade !== criticidade) return false;
        if (l.diasSemPep < diasMin) return false;
        if (!termo) return true;
        return (
          (l.nome || "").toUpperCase().includes(termo) ||
          (l.codigo || "").toUpperCase().includes(termo) ||
          (l.numAt || "").toUpperCase().includes(termo)
        );
      })
      .sort((a, b) => ORDEM_CRITICIDADE[a.criticidade] - ORDEM_CRITICIDADE[b.criticidade] || b.diasSemPep - a.diasSemPep);
  }, [lembretes, busca, responsavel, criticidade, diasMin]);

  const criticos = lembretes.filter((l) => l.criticidade === CRITICIDADE_CRITICO).length;
  const atencao = lembretes.filter((l) => l.criticidade === CRITICIDADE_ATENCAO).length;
  const informativos = lembretes.filter((l) => l.criticidade === CRITICIDADE_INFORMATIVO).length;

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Lembretes — Projetos sem PEP</h1>
      <p className="mt-1 max-w-2xl text-sm text-(--color-text-weak)">
        Reúne, do módulo de Prestadores, todo projeto ativo cadastrado sem PEP. O lembrete some automaticamente assim
        que o PEP é informado no cadastro.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-gold)">{lembretes.length}</p>
          <p className="text-xs text-(--color-text-weak)">total sem PEP</p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-red)">{criticos}</p>
          <p className="text-xs text-(--color-text-weak)">críticos</p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-gold)">{atencao}</p>
          <p className="text-xs text-(--color-text-weak)">atenção</p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-sky)">{informativos}</p>
          <p className="text-xs text-(--color-text-weak)">informativos</p>
        </div>
      </div>

      {lembretes.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-6 text-center text-sm text-(--color-text-weak)">
          Nenhum projeto ativo está sem PEP no momento.
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por prestador, código ou N° AT…"
              className="w-72 rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/15"
            />
            <select
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium text-(--color-text) outline-none focus:border-(--color-navy)"
            >
              <option value="">Todos os responsáveis</option>
              {responsaveis.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select
              value={criticidade}
              onChange={(e) => setCriticidade(e.target.value as typeof criticidade)}
              className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium text-(--color-text) outline-none focus:border-(--color-navy)"
            >
              <option value="TODAS">Todas as criticidades</option>
              <option value={CRITICIDADE_CRITICO}>{CRITICIDADE_CRITICO}</option>
              <option value={CRITICIDADE_ATENCAO}>{CRITICIDADE_ATENCAO}</option>
              <option value={CRITICIDADE_INFORMATIVO}>{CRITICIDADE_INFORMATIVO}</option>
            </select>
            <label className="flex items-center gap-2 text-xs font-medium text-(--color-text-weak)">
              Dias sem PEP (mín.)
              <input
                type="number"
                min={0}
                value={diasMin}
                onChange={(e) => setDiasMin(Math.max(0, Number(e.target.value) || 0))}
                className="w-16 rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-1.5 text-sm text-(--color-text) outline-none focus:border-(--color-navy)"
              />
            </label>
            <span className="text-xs text-(--color-text-dim)">{filtrados.length} de {lembretes.length}</span>
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="text-xs font-medium text-(--color-text-dim)">
                  <th className="px-4 py-3">Criticidade</th>
                  <th className="px-4 py-3">Prestador</th>
                  <th className="px-4 py-3">N° AT</th>
                  <th className="px-4 py-3">Disciplina</th>
                  <th className="px-4 py-3">Responsável</th>
                  <th className="px-4 py-3">Entrada</th>
                  <th className="px-4 py-3">Dias sem PEP</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-16 text-center text-(--color-text-weak)">Nenhum lembrete encontrado com os filtros atuais.</td></tr>
                ) : (
                  filtrados.map((l) => (
                    <tr key={l.id} className="border-t border-(--color-border) first:border-0 hover:bg-(--color-surface-2)/60">
                      <td className="px-4 py-3.5"><BadgeCriticidade valor={l.criticidade} /></td>
                      <td className="px-4 py-3.5 font-medium text-(--color-text)">
                        Item {l.item ?? "—"} — {l.nome || "—"} <span className="font-normal text-(--color-text-dim)">· {l.codigo}</span>
                      </td>
                      <td className="px-4 py-3.5 text-(--color-text-weak)">{l.numAt || "—"}</td>
                      <td className="px-4 py-3.5 text-(--color-text-weak)">{l.disciplina || "—"}</td>
                      <td className="px-4 py-3.5 text-(--color-text-weak)">{l.responsavel || "—"}</td>
                      <td className="px-4 py-3.5 text-(--color-text-weak)">{formatarData(l.dataSolicitacao)}</td>
                      <td className="px-4 py-3.5 tabular-nums text-(--color-text-weak)">{l.diasSemPep}</td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/prestadores/cadastro/${l.id}`}
                          className="rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-navy) hover:bg-(--color-surface-2)"
                        >
                          Abrir projeto
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
