import { BuscaAnalista } from "@/components/busca-analista";
import type { Projeto } from "@/lib/projetos";

const CORES_STATUS: Record<string, string> = {
  "EM ANÁLISE": "bg-(--color-blue-2)",
  "EM HOLD": "bg-(--color-orange)",
  LIBERADO: "bg-(--color-green)",
  "LIBERADO C/ REST.": "bg-(--color-green)",
  "NÃO LIBERADO": "bg-(--color-red)",
};

function contarPor(projetos: Projeto[], campo: "status_analise" | "disciplina"): [string, number][] {
  const contagem = new Map<string, number>();
  for (const p of projetos) {
    const chave = p[campo] || "—";
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  return [...contagem.entries()].sort((a, b) => b[1] - a[1]);
}

function BarraLista({ titulo, dados, total }: { titulo: string; dados: [string, number][]; total: number }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-6">
      <h2 className="text-sm font-semibold text-(--color-text)">{titulo}</h2>
      <div className="mt-4 space-y-3">
        {dados.length === 0 ? (
          <p className="text-sm text-(--color-text-weak)">Nenhum dado.</p>
        ) : (
          dados.map(([nome, qtd]) => (
            <div key={nome}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-(--color-text)">{nome}</span>
                <span className="tabular-nums text-(--color-text-weak)">{qtd}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-(--color-surface-2)">
                <div
                  className={`h-full rounded-full ${CORES_STATUS[nome] ?? "bg-(--color-text-dim)"}`}
                  style={{ width: `${total ? (qtd / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function PainelResumo({
  titulo,
  projetos,
  busca,
}: {
  titulo: string;
  projetos: Projeto[];
  busca: string;
}) {
  const porStatus = contarPor(projetos, "status_analise");
  const porDisciplina = contarPor(projetos, "disciplina");
  const emAndamento = projetos.filter((p) => p.status_analise === "EM ANÁLISE" || p.status_analise === "EM HOLD").length;

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-(--color-text)">{titulo}</h1>
          <p className="mt-1 text-sm text-(--color-text-weak)">
            {busca ? `Responsáveis que contêm "${busca}"` : "Todas as análises"}
          </p>
        </div>
        <BuscaAnalista valorInicial={busca} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-6 py-5">
          <p className="text-3xl font-semibold tabular-nums text-(--color-text)">{projetos.length}</p>
          <p className="mt-1 text-xs text-(--color-text-weak)">total de análises</p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-6 py-5">
          <p className="text-3xl font-semibold tabular-nums text-(--color-navy)">{emAndamento}</p>
          <p className="mt-1 text-xs text-(--color-text-weak)">em andamento (análise + hold)</p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-6 py-5">
          <p className="text-3xl font-semibold tabular-nums text-(--color-green)">{projetos.length - emAndamento}</p>
          <p className="mt-1 text-xs text-(--color-text-weak)">concluídas</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarraLista titulo="Por status" dados={porStatus} total={projetos.length} />
        <BarraLista titulo="Por disciplina" dados={porDisciplina} total={projetos.length} />
      </div>
    </div>
  );
}
