"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { STATUS_ANALISE_OPCOES } from "@/lib/administracao-calculo";

export type ValoresFiltrosProjetos = {
  q: string;
  codigo: string;
  entidade: string;
  status: string;
  disciplina: string;
  de: string;
  ate: string;
};

const classeInput = "w-full rounded-full border border-(--color-border) bg-(--color-surface-1) px-3.5 py-2 text-sm text-(--color-text) outline-none transition-colors focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/15";
const classeInputData = "rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-1.5 text-xs text-(--color-text) outline-none focus:border-(--color-navy)";

/** Filtros combináveis da listagem de Projetos — sempre consultam a base
 * completa no banco (ver `buscarProjetosPaginado`), nunca só os
 * registros já carregados na tela. Trocar qualquer filtro reinicia a
 * paginação (volta para o tamanho de página atual). */
export function FiltrosProjetos({
  colunaEntidade,
  valores,
  disciplinas,
  tamanho,
}: {
  colunaEntidade: string;
  valores: ValoresFiltrosProjetos;
  disciplinas: string[];
  tamanho: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [codigo, setCodigo] = useState(valores.codigo);
  const [entidade, setEntidade] = useState(valores.entidade);
  const [q, setQ] = useState(valores.q);

  function navegar(proximos: Partial<ValoresFiltrosProjetos>) {
    const params = new URLSearchParams(searchParams.toString());
    const combinados = { ...valores, ...proximos };
    for (const [chave, valor] of Object.entries(combinados)) {
      if (valor) params.set(chave, valor);
      else params.delete(chave);
    }
    // Qualquer mudança de filtro reinicia a paginação.
    params.set("tamanho", String(tamanho));
    params.set("limite", String(tamanho));
    router.push(`${pathname}?${params.toString()}`);
  }

  const temFiltroAtivo = !!(valores.q || valores.codigo || valores.entidade || valores.status || valores.disciplina || valores.de || valores.ate);

  function limparFiltros() {
    setCodigo(""); setEntidade(""); setQ("");
    router.push(pathname);
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && navegar({ codigo })}
          onBlur={() => codigo !== valores.codigo && navegar({ codigo })}
          placeholder="Código do projeto"
          className={`w-44 ${classeInput}`}
        />
        <input
          value={entidade}
          onChange={(e) => setEntidade(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && navegar({ entidade })}
          onBlur={() => entidade !== valores.entidade && navegar({ entidade })}
          placeholder={`Nome do ${colunaEntidade.toLowerCase()}`}
          className={`w-52 ${classeInput}`}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && navegar({ q })}
          onBlur={() => q !== valores.q && navegar({ q })}
          placeholder="Analista responsável"
          className={`w-52 ${classeInput}`}
        />
        <select value={valores.status} onChange={(e) => navegar({ status: e.target.value })} className={classeInputData}>
          <option value="">Todas as situações</option>
          {STATUS_ANALISE_OPCOES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={valores.disciplina} onChange={(e) => navegar({ disciplina: e.target.value })} className={classeInputData}>
          <option value="">Todas as disciplinas</option>
          {disciplinas.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-xs text-(--color-text-weak)">
          <span className="font-medium text-(--color-text-dim)">Data limite:</span>
          <label className="flex items-center gap-1.5">
            de
            <input type="date" value={valores.de} onChange={(e) => navegar({ de: e.target.value })} className={classeInputData} />
          </label>
          <label className="flex items-center gap-1.5">
            até
            <input type="date" value={valores.ate} onChange={(e) => navegar({ ate: e.target.value })} className={classeInputData} />
          </label>
        </div>
        {temFiltroAtivo && (
          <button onClick={limparFiltros} className="rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-navy) hover:bg-(--color-surface-2)">
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
