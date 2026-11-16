import { obterPool } from "@/lib/db";
import { garantirEsquemaPrioridades } from "@/lib/esquema-prioridades";
import { slaContratual, vencimentoContratual, STATUS_ABERTOS_PRAZO } from "@/lib/prazos-calculo";
import type { LinhaBrutaGantt } from "./motor";

export type ModuloGantt = "prestadores" | "cessionarios";

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
  nivel_prioridade: number | null;
};

/** Todas as linhas de `prestadores` ou `cessionarios` (sem filtro por
 * responsável nem por status; arquivadas ficam de fora) — o Gantt mostra o
 * horizonte da equipe inteira por padrão; é o próprio motor quem decide o
 * que fazer com cada status. As duas tabelas entram no MESMO formato: em
 * Cessionários, `prest` é o cessionário e `obra` é o tipo (Loja, Externo,
 * Quiosque...). O prazo usado pelo Gantt é o operacional (`data_limite`). */
export async function buscarLinhasGantt(modulo: ModuloGantt = "prestadores"): Promise<LinhaBrutaGantt[]> {
  await garantirEsquemaPrioridades();
  const pool = obterPool();
  const sql = modulo === "prestadores"
    ? `SELECT id, item, codigo, prestador AS entidade, disciplina, disciplina_sla, obra_referencia AS obra,
              revisao, num_documentos, data_solicitacao, data_limite, data_limite_ajustada_manualmente,
              data_analise, hold_inicio, hold_fim, num_at, revisao_at, responsavel, status_analise, nivel_prioridade
       FROM prestadores WHERE arquivado_em IS NULL`
    : `SELECT id, item, codigo, cessionario AS entidade, disciplina, disciplina_sla, tipo AS obra,
              revisao, num_documentos, data_solicitacao, data_limite, data_limite_ajustada_manualmente,
              data_analise, hold_inicio, hold_fim, num_at, revisao_at, responsavel, status_analise, nivel_prioridade
       FROM cessionarios WHERE arquivado_em IS NULL`;
  const { rows } = await pool.query<LinhaPrestadorBanco & { entidade: string | null; obra: string | null }>(sql);
  return rows.map((r) => ({
    row: r.id,
    item: r.item,
    code: r.codigo,
    prest: r.entidade,
    discE: r.disciplina,
    disc: r.disciplina_sla,
    obra: r.obra,
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
    // Prioridade da ANÁLISE (linha) — a mesma coluna lida pela Lista de
    // Prioridades, Visão do Gestor e indicadores.
    nivelPrioridade: r.nivel_prioridade,
  }));
}

/** Vencimento CONTRATUAL de cada análise em aberto (id → ISO). Só deve ser
 * chamado para Gestor/Admin — o analista nunca recebe esse mapa. */
export async function buscarVencimentosContratuais(modulo: ModuloGantt): Promise<Record<number, { vencimento: string; sla: number }>> {
  const colunaTipo = modulo === "cessionarios" ? "tipo" : "NULL::text AS tipo";
  const { rows } = await obterPool().query(
    `SELECT id, revisao, data_solicitacao, ${colunaTipo} FROM ${modulo} WHERE arquivado_em IS NULL AND status_analise = ANY($1)`,
    [STATUS_ABERTOS_PRAZO],
  );
  const out: Record<number, { vencimento: string; sla: number }> = {};
  for (const r of rows) {
    const sla = slaContratual(modulo, r.tipo ?? null, r.revisao ?? 0);
    const v = vencimentoContratual(r.data_solicitacao, sla);
    if (v) out[Number(r.id)] = { vencimento: v, sla };
  }
  return out;
}
