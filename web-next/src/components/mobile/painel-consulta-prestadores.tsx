"use client";

import { useMemo, useState } from "react";
import type { Cadastro } from "@/lib/cadastro";

export function PainelConsultaPrestadores({ prestadores }: { prestadores: Cadastro[] }) {
  const [termo, setTermo] = useState("");

  const filtrados = useMemo(() => {
    const t = termo.trim().toLowerCase();
    if (!t) return prestadores;
    return prestadores.filter((p) => p.codigo.toLowerCase().includes(t) || p.nome_empresa.toLowerCase().includes(t));
  }, [prestadores, termo]);

  return (
    <div className="px-4 py-5">
      <h1 className="text-lg font-semibold text-(--color-text)">Consulta de Prestadores</h1>
      <p className="mt-1 text-xs text-(--color-text-weak)">{prestadores.length} prestadores cadastrados.</p>

      <input
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="Buscar por código ou nome..."
        className="mt-4 w-full rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)"
      />

      <div className="mt-4 flex flex-col gap-2">
        {filtrados.length === 0 ? (
          <p className="text-sm text-(--color-text-weak)">Nenhum prestador encontrado.</p>
        ) : (
          filtrados.map((p) => (
            <div key={p.id} className="rounded-xl border border-(--color-border) bg-(--color-surface-1) px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-(--color-text)">{p.nome_empresa}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${p.status === "ATIVO" ? "bg-(--color-green-bg) text-(--color-green)" : "bg-(--color-surface-2) text-(--color-text-weak)"}`}>
                  {p.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-(--color-text-weak)">Código: {p.codigo}{p.responsavel ? ` · ${p.responsavel}` : ""}</p>
              {(p.telefone || p.email) && (
                <p className="mt-1 text-[0.7rem] text-(--color-text-dim)">{[p.telefone, p.email].filter(Boolean).join(" · ")}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
