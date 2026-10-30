import Link from "next/link";
import { BuscaAnalista } from "@/components/busca-analista";
import { BotaoDarBaixa } from "@/components/dar-baixa";
import { BotaoTratativaHold } from "@/components/tratativa-hold";
import type { Projeto } from "@/lib/projetos";

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

function contagemPorStatus(projetos: Projeto[]): [string, number][] {
  const contagem = new Map<string, number>();
  for (const p of projetos) {
    contagem.set(p.status_analise, (contagem.get(p.status_analise) ?? 0) + 1);
  }
  return [...contagem.entries()].sort((a, b) => b[1] - a[1]);
}

export function TabelaProjetos({
  titulo,
  colunaEntidade,
  tabela,
  projetos,
  busca,
  analistaProprio,
  temAnalistaProprio,
  podeCadastrar,
  podeEditar,
}: {
  titulo: string;
  colunaEntidade: string;
  tabela: "prestadores" | "cessionarios";
  projetos: Projeto[];
  busca: string;
  analistaProprio: string | null | undefined;
  temAnalistaProprio: boolean;
  podeCadastrar?: boolean;
  podeEditar?: boolean;
}) {
  const porStatus = contagemPorStatus(projetos);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-(--color-text)">{titulo}</h1>
          <p className="mt-1 text-sm text-(--color-text-weak)">
            {busca
              ? `Responsáveis que contêm "${busca}"`
              : temAnalistaProprio
                ? `Todas as análises — as suas (${analistaProprio}) aparecem primeiro, por ordem de vencimento`
                : "Todas as análises"}
          </p>
        </div>
        <div className="flex items-end gap-3">
          <BuscaAnalista valorInicial={busca} />
          {podeCadastrar && (
            <Link
              href={`/${tabela}/analise/novo`}
              className="rounded-full bg-(--color-navy) px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Novo Cadastro
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-text)">{projetos.length}</p>
          <p className="text-xs text-(--color-text-weak)">no total</p>
        </div>
        {porStatus.map(([status, qtd]) => (
          <div key={status} className="flex items-center gap-2.5 rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${CORES_STATUS[status] ?? "bg-(--color-surface-2) text-(--color-text-weak)"}`}>
              {status}
            </span>
            <span className="text-lg font-semibold tabular-nums text-(--color-text)">{qtd}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-(--color-text-dim)">
              <th className="px-5 py-3">Item</th>
              <th className="px-5 py-3">Código</th>
              <th className="px-5 py-3">{colunaEntidade}</th>
              <th className="px-5 py-3">Disciplina</th>
              <th className="px-5 py-3">Rev.</th>
              <th className="px-5 py-3">N° AT</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Data Limite</th>
              <th className="px-5 py-3">Responsável</th>
              <th className="px-5 py-3">Ação</th>
            </tr>
          </thead>
          <tbody>
            {projetos.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-5 py-16 text-center text-(--color-text-weak)">
                  Nenhum projeto encontrado.
                </td>
              </tr>
            ) : (
              projetos.map((p) => (
                <tr key={p.id} className="border-t border-(--color-border) first:border-0 hover:bg-(--color-surface-2)/60">
                  <td className="px-5 py-3.5 tabular-nums text-(--color-text-weak)">{p.item ?? "—"}</td>
                  <td className="px-5 py-3.5 font-medium text-(--color-text)">{p.codigo}</td>
                  <td className="px-5 py-3.5 text-(--color-text)">{p.entidade}</td>
                  <td className="px-5 py-3.5 text-(--color-text-weak)">{p.disciplina}</td>
                  <td className="px-5 py-3.5 text-(--color-text-weak)">R{String(p.revisao).padStart(2, "0")}</td>
                  <td className="px-5 py-3.5 text-(--color-text-weak)">{p.num_at || "—"}</td>
                  <td className="px-5 py-3.5">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${CORES_STATUS[p.status_analise] ?? "bg-(--color-surface-2) text-(--color-text-weak)"}`}>
                      {p.status_analise}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-(--color-text-weak)">{formatarData(p.data_limite)}</td>
                  <td className="px-5 py-3.5 text-(--color-text-weak)">{p.responsavel || "—"}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {podeEditar && (
                        <Link
                          href={`/${tabela}/analise/${p.id}`}
                          className="rounded-full border border-(--color-border) px-3 py-1 text-xs font-medium text-(--color-text) hover:bg-(--color-surface-2)"
                        >
                          Editar
                        </Link>
                      )}
                      {p.status_analise === "EM HOLD" && (
                        <BotaoTratativaHold
                          tabela={tabela} projetoId={p.id} nomeEntidade={p.entidade} codigo={p.codigo}
                          disciplina={p.disciplina} numAt={p.num_at}
                        />
                      )}
                      <BotaoDarBaixa tabela={tabela} projetoId={p.id} statusAtual={p.status_analise} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {projetos.length >= 200 && (
        <p className="mt-3 text-xs text-(--color-text-dim)">Mostrando os 200 primeiros (paginação ainda não construída).</p>
      )}
    </div>
  );
}
