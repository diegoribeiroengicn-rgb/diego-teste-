"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MESES_PT } from "@/lib/meses";

export function SeletorCompetencia({ mes, ano }: { mes: number; ano: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function aplicar(novoMes: number, novoAno: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mes", String(novoMes));
    params.set("ano", String(novoAno));
    router.push(`${pathname}?${params.toString()}`);
  }

  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1];

  return (
    <div className="flex items-center gap-2">
      <select
        value={mes}
        onChange={(e) => aplicar(Number(e.target.value), ano)}
        className="rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-sm text-(--color-text) outline-none transition-colors focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/15"
      >
        {MESES_PT.map((nome, indice) => (
          <option key={nome} value={indice + 1}>
            {nome.charAt(0) + nome.slice(1).toLowerCase()}
          </option>
        ))}
      </select>
      <select
        value={ano}
        onChange={(e) => aplicar(mes, Number(e.target.value))}
        className="rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-sm text-(--color-text) outline-none transition-colors focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/15"
      >
        {anos.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </div>
  );
}
