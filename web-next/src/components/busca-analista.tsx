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
    <div className="flex flex-wrap items-center gap-3">
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && aplicar(valor)}
        placeholder="Buscar por analista (Responsável)..."
        className="w-72 rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3.5 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/20"
      />
      <button
        onClick={() => aplicar(valor)}
        className="rounded-lg bg-(--color-navy) px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Buscar
      </button>
      {(valor || !temAnalistaProprio) && (
        <button
          onClick={() => {
            setValor("");
            aplicar("");
          }}
          className="text-sm text-(--color-text-weak) hover:text-(--color-text)"
        >
          {temAnalistaProprio ? "Voltar pras minhas análises" : "Limpar busca"}
        </button>
      )}
    </div>
  );
}
