import { obterPool } from "@/lib/db";

export type Projeto = {
  id: number;
  codigo: string;
  entidade: string;
  disciplina: string;
  revisao: number;
  status_analise: string;
  num_at: string | null;
  data_limite: string | null;
  responsavel: string | null;
};

export type Tabela = "prestadores" | "cessionarios";

const COLUNA_ENTIDADE: Record<Tabela, string> = {
  prestadores: "prestador",
  cessionarios: "cessionario",
};

/** Busca projetos de `prestadores` ou `cessionarios`, com os mesmos filtros
 * em ambas: nome do responsável (padrão = só os do analista logado) e,
 * opcionalmente, uma lista de status (`EM ANÁLISE`, `EM HOLD` etc.). */
export async function buscarProjetos(
  tabela: Tabela,
  opcoes: { termoResponsavel: string; statusEntre?: string[] },
): Promise<Projeto[]> {
  const colunaEntidade = COLUNA_ENTIDADE[tabela];
  const pool = obterPool();
  const condicoes = [`($1 = '' OR UPPER(responsavel) LIKE UPPER('%' || $1 || '%'))`];
  const parametros: unknown[] = [opcoes.termoResponsavel];

  if (opcoes.statusEntre?.length) {
    parametros.push(opcoes.statusEntre);
    condicoes.push(`status_analise = ANY($${parametros.length})`);
  }

  const { rows } = await pool.query<Omit<Projeto, "entidade"> & Record<string, unknown>>(
    `SELECT id, codigo, "${colunaEntidade}" AS entidade, disciplina, revisao, status_analise, num_at, data_limite, responsavel
     FROM ${tabela}
     WHERE ${condicoes.join(" AND ")}
     ORDER BY data_limite ASC NULLS LAST
     LIMIT 200`,
    parametros,
  );
  return rows as unknown as Projeto[];
}
