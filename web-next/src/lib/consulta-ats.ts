import { obterPool } from "@/lib/db";

export type ResultadoAt = {
  origem: "prestadores" | "cessionarios";
  id: number;
  codigo: string;
  entidade: string;
  disciplina: string | null;
  revisao: number;
  status_analise: string;
  num_at: string | null;
  data_solicitacao: string | null;
  responsavel: string | null;
};

export type FiltrosAts = {
  termo?: string;
  /** null/ausente = busca nas duas tabelas. */
  origem?: "prestadores" | "cessionarios" | null;
  /** "YYYY-MM-DD" — filtra pela mesma Data de Solicitação (data de envio). */
  dataEnvio?: string | null;
};

async function buscarAtsNaTabela(tabela: "prestadores" | "cessionarios", filtros: FiltrosAts): Promise<ResultadoAt[]> {
  const pool = obterPool();
  const colunaEntidade = tabela === "prestadores" ? "prestador" : "cessionario";
  const condicoes = ["arquivado_em IS NULL"];
  const parametros: unknown[] = [];

  const termo = (filtros.termo || "").trim();
  if (termo) {
    parametros.push(`%${termo}%`);
    condicoes.push(
      `(UPPER(num_at) LIKE UPPER($${parametros.length}) OR UPPER(codigo) LIKE UPPER($${parametros.length}) OR UPPER(${colunaEntidade}) LIKE UPPER($${parametros.length}))`,
    );
  }
  if (filtros.dataEnvio) {
    parametros.push(filtros.dataEnvio);
    condicoes.push(`data_solicitacao = $${parametros.length}`);
  }

  const { rows } = await pool.query<ResultadoAt>(
    `SELECT '${tabela}' AS origem, id, codigo, ${colunaEntidade} AS entidade, disciplina, revisao, status_analise, num_at, data_solicitacao, responsavel
     FROM ${tabela}
     WHERE ${condicoes.join(" AND ")}
     ORDER BY num_at DESC NULLS LAST LIMIT 50`,
    parametros,
  );
  return rows;
}

/** Busca enxuta por AT — usada pelo GAT Mobile (busca de ATs): procura em
 * prestadores e/ou cessionários por número da AT, código ou nome da
 * entidade, com filtro opcional de origem e de data de envio (Data de
 * Solicitação), sem os cálculos de SLA/hold que a Localização de ATs
 * (tela de gestão) carrega. Resultado limitado a 50 linhas por tabela. */
export async function buscarAts(filtros: FiltrosAts): Promise<ResultadoAt[]> {
  const buscarPrestadores = filtros.origem !== "cessionarios";
  const buscarCessionarios = filtros.origem !== "prestadores";

  const [prestadores, cessionarios] = await Promise.all([
    buscarPrestadores ? buscarAtsNaTabela("prestadores", filtros) : Promise.resolve([]),
    buscarCessionarios ? buscarAtsNaTabela("cessionarios", filtros) : Promise.resolve([]),
  ]);

  return [...prestadores, ...cessionarios];
}
