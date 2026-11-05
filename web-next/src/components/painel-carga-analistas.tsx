"use client";

import type { CargaAnalista, ClassificacaoCarga } from "@/lib/analistas-sobrecarga-calculo";

const ESTILO_CLASSIFICACAO: Record<ClassificacaoCarga, { rotulo: string; cor: string }> = {
  NORMAL: { rotulo: "Carga normal", cor: "bg-(--color-green-bg) text-(--color-green)" },
  ELEVADA: { rotulo: "Carga elevada", cor: "bg-(--color-orange-bg) text-(--color-orange)" },
  SOBRECARREGADA: { rotulo: "Sobrecarregado", cor: "bg-(--color-red-bg) text-(--color-red)" },
};

function CartaoCarga({ carga }: { carga: CargaAnalista }) {
  const estilo = ESTILO_CLASSIFICACAO[carga.classificacao];
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-(--color-text)">{carga.responsavel}</p>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${estilo.cor}`}>{estilo.rotulo}</span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs text-(--color-text-weak)">
        <p>Atribuídas: <span className="tabular-nums text-(--color-text)">{carga.totalAtribuidas}</span></p>
        <p>Pendentes: <span className="tabular-nums text-(--color-text)">{carga.pendentes}</span></p>
        <p>Em análise: <span className="tabular-nums text-(--color-text)">{carga.emAnalise}</span></p>
        <p>Em HOLD: <span className="tabular-nums text-(--color-text)">{carga.emHold}</span></p>
        <p>Próx. vencimento: <span className="tabular-nums text-(--color-orange)">{carga.proximasVencimento}</span></p>
        <p>Vencidas: <span className="tabular-nums text-(--color-red)">{carga.vencidas}</span></p>
        <p>Concluídas: <span className="tabular-nums text-(--color-text)">{carga.concluidas}</span></p>
        <p>Prioritárias: <span className="tabular-nums text-(--color-text)">{carga.prioritarias}</span></p>
        <p>Pontuação: <span className="tabular-nums text-(--color-text)">{carga.pontuacao}</span></p>
      </div>
    </div>
  );
}

/** Painel "quem está sobrecarregado" — pedido do usuário: identificar
 * rapidamente a distribuição de trabalho para redistribuir demandas.
 * Ordenado por pontuação de carga (maior primeiro), para que os
 * profissionais mais sobrecarregados apareçam no topo. */
export function PainelCargaAnalistas({ cargas }: { cargas: CargaAnalista[] }) {
  const ordenadas = [...cargas].sort((a, b) => b.pontuacao - a.pontuacao);
  const sobrecarregados = cargas.filter((c) => c.classificacao === "SOBRECARREGADA").length;
  const elevados = cargas.filter((c) => c.classificacao === "ELEVADA").length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-(--color-text)">Carga de trabalho por analista</h2>
          <p className="mt-1 text-sm text-(--color-text-weak)">
            Quantidade de demandas pendentes, ponderada por atraso e prioridade — não é só a contagem absoluta de ATs.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          {sobrecarregados > 0 && (
            <span className="rounded-full bg-(--color-red-bg) px-3 py-1 font-medium text-(--color-red)">
              {sobrecarregados} sobrecarregado(s)
            </span>
          )}
          {elevados > 0 && (
            <span className="rounded-full bg-(--color-orange-bg) px-3 py-1 font-medium text-(--color-orange)">
              {elevados} com carga elevada
            </span>
          )}
        </div>
      </div>

      {ordenadas.length === 0 ? (
        <p className="mt-4 text-sm text-(--color-text-weak)">Nenhum analista com demandas no momento.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ordenadas.map((c) => <CartaoCarga key={c.responsavel} carga={c} />)}
        </div>
      )}
    </div>
  );
}
