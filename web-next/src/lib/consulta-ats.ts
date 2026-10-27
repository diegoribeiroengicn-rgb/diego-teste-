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
  responsavel: string | null;
};

/** Busca enxuta por AT — usada pelo GAT Mobile (Consulta de ATs): procura
 * em prestadores e cessionários por número da AT, código ou nome da
 * entidade, sem os cálculos de SLA/hold que a Localização de ATs (tela
 * de gestão) carrega. Resultado limitado a 50 linhas por tabela. */
export async function buscarAts(termo: string): Promise<ResultadoAt[]> {
  const pool = obterPool();
  const padrao = `%${termo.trim()}%`;

  const [prestadores, cessionarios] = await Promise.all([
    pool.query<ResultadoAt>(
      `SELECT 'prestadores' AS origem, id, codigo, prestador AS entidade, disciplina, revisao, status_analise, num_at, responsavel
       FROM prestadores
       WHERE arquivado_em IS NULL AND (
         UPPER(num_at) LIKE UPPER($1) OR UPPER(codigo) LIKE UPPER($1) OR UPPER(prestador) LIKE UPPER($1)
       )
       ORDER BY num_at DESC NULLS LAST LIMIT 50`,
      [padrao],
    ),
    pool.query<ResultadoAt>(
      `SELECT 'cessionarios' AS origem, id, codigo, cessionario AS entidade, disciplina, revisao, status_analise, num_at, responsavel
       FROM cessionarios
       WHERE arquivado_em IS NULL AND (
         UPPER(num_at) LIKE UPPER($1) OR UPPER(codigo) LIKE UPPER($1) OR UPPER(cessionario) LIKE UPPER($1)
       )
       ORDER BY num_at DESC NULLS LAST LIMIT 50`,
      [padrao],
    ),
  ]);

  return [...prestadores.rows, ...cessionarios.rows];
}
