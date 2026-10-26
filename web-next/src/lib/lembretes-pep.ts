import { obterPool } from "@/lib/db";
import { diasCorridosEntre, hojeBr } from "@/lib/dias-uteis";
import { criticidadePep, type LembretePep } from "@/lib/lembretes-pep-calculo";

const STATUS_CANCELADO = "CANCELADO";
const PEP_DIAS_ATENCAO_PADRAO = 3;
const PEP_DIAS_CRITICO_PADRAO = 6;

type LinhaBanco = {
  id: number;
  item: number | null;
  codigo: string | null;
  prestador: string | null;
  disciplina: string | null;
  num_at: string | null;
  responsavel: string | null;
  data_solicitacao: string | null;
  peps: string | null;
};

async function buscarLimiaresCriticidadePep(pool: ReturnType<typeof obterPool>): Promise<[number, number]> {
  const { rows } = await pool.query<{ chave: string; valor: string }>(
    `SELECT chave, valor FROM configuracoes WHERE chave IN ('pep_dias_atencao', 'pep_dias_critico')`,
  );
  const mapa = new Map(rows.map((r) => [r.chave, r.valor]));
  const atencao = Number(mapa.get("pep_dias_atencao"));
  const critico = Number(mapa.get("pep_dias_critico"));
  return [
    Number.isFinite(atencao) ? atencao : PEP_DIAS_ATENCAO_PADRAO,
    Number.isFinite(critico) ? critico : PEP_DIAS_CRITICO_PADRAO,
  ];
}

/** Lembretes — projetos de Prestadores ativos (CANCELADO excluído) sem
 * PEP informado. Some automaticamente assim que o PEP é preenchido no
 * cadastro — mesma regra de views/lembretes_pep.py. */
export async function buscarLembretesPep(): Promise<LembretePep[]> {
  const pool = obterPool();
  const [[diasAtencao, diasCritico], { rows }] = await Promise.all([
    buscarLimiaresCriticidadePep(pool),
    pool.query<LinhaBanco>(
      `SELECT id, item, codigo, prestador, disciplina, num_at, responsavel, data_solicitacao, peps
       FROM prestadores WHERE status_analise != $1`,
      [STATUS_CANCELADO],
    ),
  ]);

  const hojeIso = hojeBr().toISOString().slice(0, 10);
  const lembretes: LembretePep[] = [];
  for (const row of rows) {
    const temPep = !!(row.peps && row.peps.trim());
    if (temPep) continue;
    const dias = Math.max(diasCorridosEntre(row.data_solicitacao, hojeIso) ?? 0, 0);
    lembretes.push({
      id: row.id,
      item: row.item,
      codigo: row.codigo,
      nome: row.prestador,
      disciplina: row.disciplina,
      numAt: row.num_at,
      responsavel: row.responsavel,
      dataSolicitacao: row.data_solicitacao,
      diasSemPep: dias,
      criticidade: criticidadePep(dias, diasAtencao, diasCritico),
    });
  }
  return lembretes;
}
