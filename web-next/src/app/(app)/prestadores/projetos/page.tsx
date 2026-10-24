import { obterPool } from "@/lib/db";
import { obterSessao } from "@/lib/session";
import { BuscaAnalista } from "@/components/busca-analista";

type Projeto = {
  id: number;
  codigo: string;
  prestador: string;
  disciplina: string;
  revisao: number;
  status_analise: string;
  num_at: string | null;
  data_limite: string | null;
  responsavel: string | null;
};

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

export default async function PaginaProjetosPrestadores({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sessao = await obterSessao();
  const { q } = await searchParams;
  const busca = (q || "").trim();

  // Sem busca explícita e com analista vinculado ao próprio login: mostra
  // só as análises do próprio analista (filtro padrão, não só ordenação) —
  // quem não tem analista vinculado (ex.: ADMIN/GESTOR) vê tudo por padrão.
  const filtrandoPorMim = !busca && !!sessao?.analistaVinculado;
  const termoResponsavel = busca || sessao?.analistaVinculado || "";

  const pool = obterPool();
  const { rows } = await pool.query<Projeto>(
    `SELECT id, codigo, prestador, disciplina, revisao, status_analise, num_at, data_limite, responsavel
     FROM prestadores
     WHERE ($1 = '' OR UPPER(responsavel) LIKE UPPER('%' || $1 || '%'))
     ORDER BY data_limite ASC NULLS LAST
     LIMIT 200`,
    [termoResponsavel],
  );

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-(--color-text)">Prestadores — Projetos</h1>
      <p className="mt-1 text-sm text-(--color-text-weak)">
        {filtrandoPorMim
          ? `Mostrando só as análises de ${sessao?.analistaVinculado} (você).`
          : busca
            ? `Mostrando análises de responsáveis que contêm "${busca}".`
            : "Mostrando todas as análises."}
      </p>

      <div className="mt-5">
        <BuscaAnalista valorInicial={busca} temAnalistaProprio={!!sessao?.analistaVinculado} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-(--color-border) bg-(--color-surface-1)">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-(--color-border) text-xs uppercase tracking-wide text-(--color-text-dim)">
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Prestador</th>
              <th className="px-4 py-3 font-medium">Disciplina</th>
              <th className="px-4 py-3 font-medium">Rev.</th>
              <th className="px-4 py-3 font-medium">N° AT</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Data Limite</th>
              <th className="px-4 py-3 font-medium">Responsável</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-(--color-text-weak)">
                  Nenhum projeto encontrado.
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id} className="border-b border-(--color-border) last:border-0 hover:bg-(--color-surface-2)">
                  <td className="px-4 py-3 font-medium text-(--color-text)">{p.codigo}</td>
                  <td className="px-4 py-3 text-(--color-text)">{p.prestador}</td>
                  <td className="px-4 py-3 text-(--color-text-weak)">{p.disciplina}</td>
                  <td className="px-4 py-3 text-(--color-text-weak)">R{String(p.revisao).padStart(2, "0")}</td>
                  <td className="px-4 py-3 text-(--color-text-weak)">{p.num_at || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${CORES_STATUS[p.status_analise] ?? "bg-(--color-surface-2) text-(--color-text-weak)"}`}>
                      {p.status_analise}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-(--color-text-weak)">{formatarData(p.data_limite)}</td>
                  <td className="px-4 py-3 text-(--color-text-weak)">{p.responsavel || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-(--color-text-dim)">
        {rows.length} projeto(s) — limitado a 200 por vez nesta primeira versão (paginação ainda não construída).
      </p>
    </div>
  );
}
