import { obterPool } from "@/lib/db";

export type Projeto = {
  id: number;
  item: number | null;
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

/** Busca projetos de `prestadores` ou `cessionarios`, opcionalmente
 * filtrados por responsável (busca explícita) e por uma lista de status
 * (`EM ANÁLISE`, `EM HOLD` etc.). Sem busca explícita, todas as análises
 * aparecem (não só as do analista logado) — `analistaProprio` só decide a
 * ordem: as dele aparecem primeiro, por data limite, seguidas das demais
 * também por data limite. */
export async function buscarProjetos(
  tabela: Tabela,
  opcoes: { termoResponsavel: string; analistaProprio?: string | null; statusEntre?: string[] },
): Promise<Projeto[]> {
  const colunaEntidade = COLUNA_ENTIDADE[tabela];
  const pool = obterPool();
  const condicoes = [`arquivado_em IS NULL`];
  const parametros: unknown[] = [];

  if (opcoes.termoResponsavel) {
    parametros.push(opcoes.termoResponsavel);
    condicoes.push(`UPPER(responsavel) LIKE UPPER('%' || $${parametros.length} || '%')`);
  }

  if (opcoes.statusEntre?.length) {
    parametros.push(opcoes.statusEntre);
    condicoes.push(`status_analise = ANY($${parametros.length})`);
  }

  let ordem = "data_limite ASC NULLS LAST";
  if (opcoes.analistaProprio) {
    parametros.push(opcoes.analistaProprio);
    ordem = `(UPPER(responsavel) = UPPER($${parametros.length})) DESC, data_limite ASC NULLS LAST`;
  }

  const { rows } = await pool.query<Omit<Projeto, "entidade"> & Record<string, unknown>>(
    `SELECT id, item, codigo, "${colunaEntidade}" AS entidade, disciplina, revisao, status_analise, num_at, data_limite, responsavel
     FROM ${tabela}
     WHERE ${condicoes.join(" AND ")}
     ORDER BY ${ordem}
     LIMIT 200`,
    parametros,
  );
  return rows as unknown as Projeto[];
}

export type ProjetoComOrigem = Projeto & { origem: Tabela };

/** Mesma busca de `buscarProjetos`, mas junta prestadores e cessionários
 * em uma única lista (usado pelo GAT Mobile, que não separa as telas por
 * módulo) — reordenada no mesmo critério (analista logado primeiro, por
 * data limite) depois de unir os dois resultados. */
export async function buscarProjetosCombinados(
  opcoes: { termoResponsavel: string; analistaProprio?: string | null; statusEntre?: string[] },
): Promise<ProjetoComOrigem[]> {
  const [prestadores, cessionarios] = await Promise.all([
    buscarProjetos("prestadores", opcoes),
    buscarProjetos("cessionarios", opcoes),
  ]);
  const combinados: ProjetoComOrigem[] = [
    ...prestadores.map((p) => ({ ...p, origem: "prestadores" as const })),
    ...cessionarios.map((p) => ({ ...p, origem: "cessionarios" as const })),
  ];
  const proprio = (opcoes.analistaProprio || "").toUpperCase();
  combinados.sort((a, b) => {
    if (proprio) {
      const aProprio = (a.responsavel || "").toUpperCase() === proprio;
      const bProprio = (b.responsavel || "").toUpperCase() === proprio;
      if (aProprio !== bProprio) return aProprio ? -1 : 1;
    }
    if (!a.data_limite) return 1;
    if (!b.data_limite) return -1;
    return a.data_limite.localeCompare(b.data_limite);
  });
  return combinados;
}
