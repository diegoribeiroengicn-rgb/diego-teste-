import { obterPool } from "@/lib/db";
import type { PerguntaChecklist, RespostasChecklist, TipoEntidadeAvaliacao } from "@/lib/avaliacao-checklist-calculo";

/** Lista de analistas responsáveis para o seletor do formulário —
 * derivada dos dados reais (Prestadores + Cessionários), não de uma
 * lista fixa que poderia ficar desatualizada. */
export async function buscarResponsaveisDistintos(): Promise<string[]> {
  const pool = obterPool();
  const { rows } = await pool.query<{ responsavel: string }>(
    `SELECT DISTINCT responsavel FROM (
       SELECT responsavel FROM prestadores WHERE responsavel IS NOT NULL AND TRIM(responsavel) != ''
       UNION
       SELECT responsavel FROM cessionarios WHERE responsavel IS NOT NULL AND TRIM(responsavel) != ''
     ) t ORDER BY responsavel`,
  );
  return rows.map((r) => r.responsavel);
}

export async function buscarPerguntasChecklist(apenasAtivas = true): Promise<PerguntaChecklist[]> {
  const pool = obterPool();
  const { rows } = await pool.query<{ id: number; categoria: string; texto: string; ordem_categoria: number; ordem_pergunta: number }>(
    `SELECT id, categoria, texto, ordem_categoria, ordem_pergunta FROM avaliacao_checklist_perguntas
     ${apenasAtivas ? "WHERE ativo = 1" : ""}
     ORDER BY ordem_categoria, ordem_pergunta`,
  );
  return rows.map((r) => ({ id: r.id, categoria: r.categoria, texto: r.texto, ordemCategoria: r.ordem_categoria, ordemPergunta: r.ordem_pergunta }));
}

export type DadosAvaliacaoChecklist = {
  tipoEntidade: TipoEntidadeAvaliacao;
  codigoEntidade: string | null;
  nomeEntidade: string;
  disciplina: string | null;
  atReferencia: string | null;
  revisao: number;
  dataAvaliacao: string;
  analistaResponsavel: string | null;
  respostas: RespostasChecklist;
  pontuacao: number;
  classificacao: string;
  acompanhamento: string;
  observacoesGerais: string | null;
  nomeProjetista: string | null;
};

/** Localiza uma avaliação já existente para a mesma AT + disciplina +
 * revisão + analista responsável — cada revisão tem sua própria
 * avaliação, mas duas avaliações para a MESMA revisão da MESMA AT são o
 * mesmo registro (atualiza em vez de duplicar). Mesma regra de
 * gat/database.py::obter_avaliacao_checklist_por_revisao. */
export async function buscarAvaliacaoExistentePorRevisao(
  tipoEntidade: TipoEntidadeAvaliacao,
  atReferencia: string | null,
  disciplina: string | null,
  revisao: number,
  analistaResponsavel: string | null,
): Promise<{ id: number } | null> {
  if (!atReferencia?.trim()) return null;
  const pool = obterPool();
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM avaliacoes_checklist
     WHERE tipo_entidade = $1 AND at_referencia = $2 AND revisao = $3
       AND COALESCE(disciplina, '') = COALESCE($4, '') AND COALESCE(analista_responsavel, '') = COALESCE($5, '')
     LIMIT 1`,
    [tipoEntidade, atReferencia.trim(), revisao, disciplina, analistaResponsavel],
  );
  return rows[0] ?? null;
}

export async function inserirAvaliacaoChecklist(dados: DadosAvaliacaoChecklist, usuario: string): Promise<number> {
  const pool = obterPool();
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO avaliacoes_checklist (
       tipo_entidade, codigo_entidade, nome_entidade, disciplina, at_referencia, revisao,
       data_avaliacao, analista_responsavel, respostas_json, pontuacao, classificacao,
       acompanhamento, observacoes_gerais, nome_projetista, criado_em, criado_por
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
    [
      dados.tipoEntidade, dados.codigoEntidade, dados.nomeEntidade, dados.disciplina, dados.atReferencia, dados.revisao,
      dados.dataAvaliacao, dados.analistaResponsavel, JSON.stringify(dados.respostas), dados.pontuacao, dados.classificacao,
      dados.acompanhamento, dados.observacoesGerais, dados.nomeProjetista, new Date().toISOString(), usuario,
    ],
  );
  return rows[0].id;
}

export async function atualizarAvaliacaoChecklist(id: number, dados: DadosAvaliacaoChecklist): Promise<void> {
  const pool = obterPool();
  await pool.query(
    `UPDATE avaliacoes_checklist SET
       tipo_entidade = $1, codigo_entidade = $2, nome_entidade = $3, disciplina = $4, at_referencia = $5, revisao = $6,
       data_avaliacao = $7, analista_responsavel = $8, respostas_json = $9, pontuacao = $10, classificacao = $11,
       acompanhamento = $12, observacoes_gerais = $13, nome_projetista = $14
     WHERE id = $15`,
    [
      dados.tipoEntidade, dados.codigoEntidade, dados.nomeEntidade, dados.disciplina, dados.atReferencia, dados.revisao,
      dados.dataAvaliacao, dados.analistaResponsavel, JSON.stringify(dados.respostas), dados.pontuacao, dados.classificacao,
      dados.acompanhamento, dados.observacoesGerais, dados.nomeProjetista, id,
    ],
  );
}
