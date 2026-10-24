import { obterPool } from "@/lib/db";

export type TipoEntidadeAvaliacao = "PRESTADOR" | "CESSIONARIO";

export type ItemRanking = {
  posicao: number;
  chave: string;
  nome: string;
  codigo: string | null;
  media: number;
  qtd_avaliacoes: number;
  melhor_nota: number;
  pior_nota: number;
  ultima_data: string;
  ultima_nota: number;
};

export type DetalheAvaliacao = {
  at_referencia: string | null;
  nome_entidade: string;
  disciplina: string | null;
  revisao: number | null;
  data_avaliacao: string;
  pontuacao: number;
  classificacao: string;
  media_acumulada: number;
};

/** Marco oficial das avaliações — avaliações de checklist anteriores a
 * essa data não entram no ranking (ver gat/alertas_engine.py). */
const MARCO_AVALIACOES_OFICIAL = "2026-07-01";

/** Ranking de Prestadores ou de Projetistas de Cessionários: média das
 * notas de avaliações de checklist concluídas a partir do marco oficial,
 * nunca contando avaliação pendente como nota zero. Critério de
 * desempate: mais avaliações válidas, depois maior nota mais recente,
 * depois ordem alfabética — mesma regra de `gat/ranking_avaliacoes.py`. */
export async function buscarRanking(tipo: TipoEntidadeAvaliacao): Promise<ItemRanking[]> {
  const pool = obterPool();
  const { rows } = await pool.query(
    `WITH base AS (
       SELECT
         COALESCE(NULLIF(codigo_entidade, ''), nome_entidade) AS chave,
         nome_entidade, codigo_entidade, pontuacao, data_avaliacao
       FROM avaliacoes_checklist
       WHERE tipo_entidade = $1
         AND data_avaliacao IS NOT NULL
         AND pontuacao IS NOT NULL
         AND data_avaliacao::date >= $2::date
     )
     SELECT
       chave,
       (ARRAY_AGG(nome_entidade ORDER BY data_avaliacao DESC))[1] AS nome,
       (ARRAY_AGG(codigo_entidade ORDER BY data_avaliacao DESC))[1] AS codigo,
       ROUND(AVG(pontuacao)::numeric, 2) AS media,
       COUNT(*)::int AS qtd_avaliacoes,
       MAX(pontuacao)::int AS melhor_nota,
       MIN(pontuacao)::int AS pior_nota,
       MAX(data_avaliacao) AS ultima_data,
       (ARRAY_AGG(pontuacao ORDER BY data_avaliacao DESC))[1]::int AS ultima_nota
     FROM base
     GROUP BY chave
     ORDER BY media DESC, qtd_avaliacoes DESC, ultima_nota DESC, nome ASC`,
    [tipo, MARCO_AVALIACOES_OFICIAL],
  );
  return rows.map((r, i) => ({ ...r, posicao: i + 1, media: Number(r.media) }) as ItemRanking);
}

/** Avaliações individuais que formaram a média de um registro do
 * ranking, com a média acumulada na ordem cronológica — para conferir
 * de onde veio a posição. */
export async function buscarDetalhamento(tipo: TipoEntidadeAvaliacao, chave: string): Promise<DetalheAvaliacao[]> {
  const pool = obterPool();
  const { rows } = await pool.query(
    `SELECT at_referencia, nome_entidade, disciplina, revisao, data_avaliacao, pontuacao, classificacao
     FROM avaliacoes_checklist
     WHERE tipo_entidade = $1
       AND COALESCE(NULLIF(codigo_entidade, ''), nome_entidade) = $2
       AND data_avaliacao IS NOT NULL AND pontuacao IS NOT NULL
       AND data_avaliacao::date >= $3::date
     ORDER BY data_avaliacao ASC`,
    [tipo, chave, MARCO_AVALIACOES_OFICIAL],
  );

  let soma = 0;
  return rows.map((r, i) => {
    soma += Number(r.pontuacao);
    return { ...r, media_acumulada: Math.round((soma / (i + 1)) * 100) / 100 } as DetalheAvaliacao;
  });
}
