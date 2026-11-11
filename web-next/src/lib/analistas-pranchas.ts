import { obterPool } from "@/lib/db";

export type PranchasAnalista = { analista: string; cessionarios: number; prestadores: number; total: number };

export const SEM_RESPONSAVEL = "SEM RESPONSÁVEL";

/** Pranchas em análise neste momento, por analista e por módulo.
 *
 * Critério: soma de `num_documentos` (a coluna "N° de Doc." da planilha
 * de controle — a única quantidade por AT que o sistema guarda, e a
 * mesma que o Gantt de Prestadores já trata como "pranchas") das linhas
 * com status EM ANÁLISE e não arquivadas. EM HOLD, RIOGALEÃO, concluídas,
 * obsoletas e canceladas ficam de fora. Cada linha das tabelas é uma AT
 * de uma revisão/disciplina e entra uma única vez, então não há prancha
 * contada em dobro. Linhas de ART contam: pela regra do sistema elas não
 * são AT, mas são pranchas a analisar. */
export async function buscarPranchasEmAnalise(): Promise<PranchasAnalista[]> {
  const pool = obterPool();
  const { rows } = await pool.query<{ analista: string; prestadores: number; cessionarios: number }>(
    `SELECT analista, SUM(prestadores) AS prestadores, SUM(cessionarios) AS cessionarios FROM (
       SELECT UPPER(TRIM(COALESCE(responsavel, ''))) AS analista, COALESCE(num_documentos, 0) AS prestadores, 0 AS cessionarios
       FROM prestadores WHERE UPPER(TRIM(status_analise)) = 'EM ANÁLISE' AND arquivado_em IS NULL
       UNION ALL
       SELECT UPPER(TRIM(COALESCE(responsavel, ''))), 0, COALESCE(num_documentos, 0)
       FROM cessionarios WHERE UPPER(TRIM(status_analise)) = 'EM ANÁLISE' AND arquivado_em IS NULL
     ) em_analise
     GROUP BY analista`,
  );
  return rows
    .map((r) => ({
      analista: r.analista || SEM_RESPONSAVEL,
      prestadores: Number(r.prestadores), cessionarios: Number(r.cessionarios),
      total: Number(r.prestadores) + Number(r.cessionarios),
    }))
    .sort((a, b) =>
      Number(a.analista === SEM_RESPONSAVEL) - Number(b.analista === SEM_RESPONSAVEL) || b.total - a.total || a.analista.localeCompare(b.analista));
}
