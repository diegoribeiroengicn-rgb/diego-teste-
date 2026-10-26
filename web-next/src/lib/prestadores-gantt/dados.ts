import { obterPool } from "@/lib/db";
import type { LinhaBrutaGantt } from "./motor";

type LinhaPrestadorBanco = {
  id: number;
  item: number | null;
  codigo: string | null;
  prestador: string | null;
  disciplina: string | null;
  disciplina_sla: string | null;
  obra_referencia: string | null;
  revisao: number | null;
  num_documentos: number | null;
  data_solicitacao: string | null;
  data_limite: string | null;
  data_limite_ajustada_manualmente: number | null;
  data_analise: string | null;
  hold_inicio: string | null;
  hold_fim: string | null;
  num_at: string | null;
  revisao_at: number | null;
  responsavel: string | null;
  status_analise: string | null;
};

/** Todas as linhas de `prestadores` (sem filtro por responsável nem por
 * status) — o Gantt mostra o horizonte da equipe inteira por padrão; é o
 * próprio motor (gat/.../motor.ts) quem decide o que fazer com cada
 * status (fechado, ativo, cancelado etc.), igual ao sistema atual. */
export async function buscarLinhasGantt(): Promise<LinhaBrutaGantt[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaPrestadorBanco>(
    `SELECT id, item, codigo, prestador, disciplina, disciplina_sla, obra_referencia,
            revisao, num_documentos, data_solicitacao, data_limite, data_limite_ajustada_manualmente,
            data_analise, hold_inicio, hold_fim, num_at, revisao_at, responsavel, status_analise
     FROM prestadores`,
  );
  return rows.map((r) => ({
    row: r.id,
    item: r.item,
    code: r.codigo,
    prest: r.prestador,
    discE: r.disciplina,
    disc: r.disciplina_sla,
    obra: r.obra_referencia,
    rev: r.revisao,
    pr: r.num_documentos ?? 0,
    K: r.data_solicitacao,
    L: r.data_limite,
    Lmanual: !!r.data_limite_ajustada_manualmente,
    M: r.data_analise,
    N: r.hold_inicio,
    O: r.hold_fim,
    at: r.num_at,
    revAT: r.revisao_at,
    resp: r.responsavel,
    status: r.status_analise,
  }));
}
