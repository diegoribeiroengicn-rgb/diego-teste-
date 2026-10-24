"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Cadastro, TabelaCadastro as TipoTabela } from "@/lib/cadastro";

const ROTULO_EXTRA: Record<TipoTabela, string> = {
  prestadores: "PEP",
  cessionarios: "LUC / RVP / RCI",
};

export function TabelaCadastro({
  tabela,
  titulo,
  subtitulo,
  registros,
  podeEditar,
}: {
  tabela: TipoTabela;
  titulo: string;
  subtitulo: string;
  registros: Cadastro[];
  podeEditar: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"TODOS" | "ATIVO" | "INATIVO">("TODOS");

  const filtrados = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    return registros.filter((r) => {
      if (filtroStatus !== "TODOS" && r.status !== filtroStatus) return false;
      if (!termo) return true;
      return r.codigo.toUpperCase().includes(termo) || r.nome_empresa.toUpperCase().includes(termo);
    });
  }, [registros, busca, filtroStatus]);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-(--color-text)">{titulo}</h1>
          <p className="mt-1 max-w-2xl text-sm text-(--color-text-weak)">{subtitulo}</p>
        </div>
        {podeEditar && (
          <Link
            href={`/${tabela}/cadastro/novo`}
            className="shrink-0 rounded-full bg-(--color-navy) px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            + Novo cadastro
          </Link>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-text-dim)"
            viewBox="0 0 24 24" fill="none" aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por código ou empresa..."
            className="w-72 rounded-full border border-(--color-border) bg-(--color-surface-1) py-2 pl-9 pr-4 text-sm text-(--color-text) outline-none transition-colors focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/15"
          />
        </div>
        <div className="flex gap-1 rounded-full border border-(--color-border) bg-(--color-surface-1) p-1 text-xs font-medium">
          {(["TODOS", "ATIVO", "INATIVO"] as const).map((opcao) => (
            <button
              key={opcao}
              onClick={() => setFiltroStatus(opcao)}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                filtroStatus === opcao ? "bg-(--color-navy) text-white" : "text-(--color-text-weak) hover:text-(--color-text)"
              }`}
            >
              {opcao === "TODOS" ? "Todos" : opcao === "ATIVO" ? "Ativos" : "Inativos"}
            </button>
          ))}
        </div>
        <span className="text-xs text-(--color-text-dim)">
          {filtrados.length} de {registros.length}
        </span>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-(--color-text-dim)">
              <th className="px-5 py-3">Código</th>
              <th className="px-5 py-3">Empresa</th>
              <th className="px-5 py-3">{ROTULO_EXTRA[tabela]}</th>
              <th className="px-5 py-3">Responsável</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center text-(--color-text-weak)">
                  Nenhum cadastro encontrado.
                </td>
              </tr>
            ) : (
              filtrados.map((r) => (
                <tr key={r.id} className="border-t border-(--color-border) first:border-0 hover:bg-(--color-surface-2)/60">
                  <td className="px-5 py-3.5 font-medium text-(--color-text)">{r.codigo}</td>
                  <td className="px-5 py-3.5 text-(--color-text)">{r.nome_empresa}</td>
                  <td className="px-5 py-3.5 text-(--color-text-weak)">
                    {tabela === "prestadores"
                      ? r.possui_pep === "SIM"
                        ? r.numero_pep || "Sim"
                        : "Não"
                      : [r.luc, r.rvp, r.rci].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td className="px-5 py-3.5 text-(--color-text-weak)">{r.responsavel || "—"}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        r.status === "ATIVO"
                          ? "bg-(--color-green-bg) text-(--color-green)"
                          : "bg-(--color-surface-2) text-(--color-text-dim)"
                      }`}
                    >
                      {r.status === "ATIVO" ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {podeEditar && (
                      <Link href={`/${tabela}/cadastro/${r.id}`} className="text-xs font-medium text-(--color-navy) hover:underline">
                        Editar
                      </Link>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
