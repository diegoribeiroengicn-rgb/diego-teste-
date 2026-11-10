"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

/** Controle de paginação da listagem de Projetos — "Exibir 30/50/100"
 * troca o tamanho de página (reiniciando do início), "Carregar mais"
 * soma mais um tamanho de página ao total já carregado. Sempre busca no
 * banco (ver `buscarProjetosPaginado`), nunca corta uma lista já
 * carregada em memória. */
export function PaginacaoProjetos({
  total,
  carregados,
  tamanho,
  tamanhosPagina,
}: {
  total: number;
  carregados: number;
  tamanho: number;
  tamanhosPagina: number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function irPara(novoTamanho: number, novoLimite: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tamanho", String(novoTamanho));
    params.set("limite", String(novoLimite));
    router.push(`${pathname}?${params.toString()}`);
  }

  const temMais = carregados < total;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-(--color-text-weak)">
        Mostrando <span className="font-semibold tabular-nums text-(--color-text)">{carregados}</span> de{" "}
        <span className="font-semibold tabular-nums text-(--color-text)">{total}</span> projeto(s)
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-(--color-text-dim)">Exibir:</span>
        {tamanhosPagina.map((t) => (
          <button
            key={t}
            onClick={() => irPara(t, t)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              t === tamanho ? "bg-(--color-navy) text-white" : "border border-(--color-border) text-(--color-text-weak) hover:bg-(--color-surface-2)"
            }`}
          >
            {t}
          </button>
        ))}
        {temMais && (
          <button
            onClick={() => irPara(tamanho, carregados + tamanho)}
            className="ml-2 rounded-full border border-(--color-navy) px-4 py-1.5 text-xs font-medium text-(--color-navy) hover:bg-(--color-blue-3)"
          >
            Carregar mais
          </button>
        )}
      </div>
    </div>
  );
}
