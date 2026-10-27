"use client";

import { BotaoDarBaixa } from "@/components/dar-baixa";
import type { ProjetoComOrigem } from "@/lib/projetos";

const CORES_STATUS: Record<string, string> = {
  "EM ANÁLISE": "bg-(--color-blue-3) text-(--color-blue-2)",
  "EM HOLD": "bg-(--color-orange-bg) text-(--color-orange)",
  LIBERADO: "bg-(--color-green-bg) text-(--color-green)",
  "LIBERADO C/ REST.": "bg-(--color-green-bg) text-(--color-green)",
  "NÃO LIBERADO": "bg-(--color-red-bg) text-(--color-red)",
};

function formatarData(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString("pt-BR");
}

export function PainelAnalisesMobile({
  titulo, subtitulo, projetos, mostrarBaixa,
}: {
  titulo: string; subtitulo: string; projetos: ProjetoComOrigem[]; mostrarBaixa: boolean;
}) {
  return (
    <div className="px-4 py-5">
      <h1 className="text-lg font-semibold text-(--color-text)">{titulo}</h1>
      <p className="mt-1 text-xs text-(--color-text-weak)">{subtitulo}</p>

      <div className="mt-4 flex flex-col gap-2">
        {projetos.length === 0 ? (
          <p className="text-sm text-(--color-text-weak)">Nenhuma análise encontrada.</p>
        ) : (
          projetos.map((p) => (
            <div key={`${p.origem}-${p.id}`} className="rounded-xl border border-(--color-border) bg-(--color-surface-1) px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-(--color-text)">{p.entidade}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${CORES_STATUS[p.status_analise] ?? "bg-(--color-surface-2) text-(--color-text-weak)"}`}>
                  {p.status_analise}
                </span>
              </div>
              <p className="mt-1 text-xs text-(--color-text-weak)">
                {p.codigo} · {p.disciplina} · Rev. {String(p.revisao).padStart(2, "0")} · {p.num_at || "Sem N° AT"}
              </p>
              <p className="mt-1 text-[0.7rem] text-(--color-text-dim)">
                {p.origem === "prestadores" ? "Prestador" : "Cessionário"} · Limite: {formatarData(p.data_limite)} · {p.responsavel || "—"}
              </p>
              {mostrarBaixa && (
                <div className="mt-2">
                  <BotaoDarBaixa tabela={p.origem} projetoId={p.id} statusAtual={p.status_analise} />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
