"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

export function BuscaAnalista({ valorInicial, temAnalistaProprio }: { valorInicial: string; temAnalistaProprio: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [valor, setValor] = useState(valorInicial);

  function aplicar(novoValor: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (novoValor) {
      params.set("q", novoValor);
    } else {
      params.delete("q");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-text-dim)"
          viewBox="0 0 24 24" fill="none" aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && aplicar(valor)}
          placeholder="Buscar por analista..."
          className="w-72 rounded-full border border-(--color-border) bg-(--color-surface-1) py-2 pl-9 pr-4 text-sm text-(--color-text) outline-none transition-colors focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/15"
        />
      </div>
      {(valor || !temAnalistaProprio) && (
        <button
          onClick={() => {
            setValor("");
            aplicar("");
          }}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-(--color-text-weak) hover:bg-(--color-surface-2) hover:text-(--color-text)"
        >
          {temAnalistaProprio ? "Voltar pras minhas análises" : "Limpar"}
        </button>
      )}
    </div>
  );
}
