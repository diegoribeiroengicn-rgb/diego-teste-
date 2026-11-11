import { SEM_RESPONSAVEL, type PranchasAnalista } from "@/lib/analistas-pranchas";

/** Pranchas em análise por analista, separadas em Cessionário e
 * Prestador (mesmas cores dos dois módulos no resto do sistema), com o
 * total geral da equipe. A barra de cada linha é proporcional ao maior
 * total, para a diferença de carga entre analistas aparecer de relance. */
export function PainelPranchasAnalistas({ linhas }: { linhas: PranchasAnalista[] }) {
  const totalCessionarios = linhas.reduce((s, l) => s + l.cessionarios, 0);
  const totalPrestadores = linhas.reduce((s, l) => s + l.prestadores, 0);
  const maior = Math.max(1, ...linhas.map((l) => l.total));

  return (
    <div>
      <h2 className="text-lg font-semibold text-(--color-text)">Pranchas em análise por analista</h2>
      <p className="mt-1 text-sm text-(--color-text-weak)">
        Soma das pranchas das ATs com status EM ANÁLISE neste momento. ATs em HOLD, concluídas, canceladas ou arquivadas não entram.
      </p>

      {linhas.length === 0 ? (
        <p className="mt-4 text-sm text-(--color-text-weak)">Nenhuma AT em análise no momento.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-xs font-medium text-(--color-text-dim)">
                <th className="px-5 py-3">Analista</th>
                <th className="px-5 py-3 text-right">Cessionário</th>
                <th className="px-5 py-3 text-right">Prestador</th>
                <th className="px-5 py-3 text-right">Total de pranchas em análise</th>
                <th className="w-[32%] px-5 py-3" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.analista} className="border-t border-(--color-border)">
                  <td className={`px-5 py-3 font-medium ${l.analista === SEM_RESPONSAVEL ? "text-(--color-text-weak)" : "text-(--color-text)"}`}>{l.analista}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-(--color-text-weak)">{l.cessionarios}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-(--color-text-weak)">{l.prestadores}</td>
                  <td className="px-5 py-3 text-right text-base font-semibold tabular-nums text-(--color-text)">{l.total}</td>
                  <td className="px-5 py-3" aria-hidden="true">
                    <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" style={{ width: `${(l.total / maior) * 100}%` }}>
                      {l.cessionarios > 0 && <div className="bg-(--color-purple)" style={{ flexGrow: l.cessionarios }} />}
                      {l.prestadores > 0 && <div className="bg-(--color-blue-2)" style={{ flexGrow: l.prestadores }} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-(--color-border) bg-(--color-surface-2)/60">
                <td className="px-5 py-3 font-semibold text-(--color-text)">Total geral da equipe</td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums text-(--color-text)">{totalCessionarios}</td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums text-(--color-text)">{totalPrestadores}</td>
                <td className="px-5 py-3 text-right text-base font-semibold tabular-nums text-(--color-navy)">{totalCessionarios + totalPrestadores}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-4 text-xs text-(--color-text-weak)">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-(--color-purple)" />Cessionário</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-(--color-blue-2)" />Prestador</span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
