import { obterPool } from "@/lib/db";
import { type DadosObraPrestador } from "@/lib/obra-calculo";

const COLUNAS_OBRA = ["prestador_id", "nome_obra", "codigo_referencia", "status", "e_canteiro", "observacoes"] as const;

/** Mesmo padrão de registrarHistorico já usado em lib/analise.ts,
 * lib/pmo.ts etc. (porta de gat/database.py::_registrar_historico). */
async function registrarHistorico(
  tabela: string, registroId: number, antigo: Record<string, unknown>, novo: Record<string, unknown>, usuario: string,
): Promise<void> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  for (const [campo, valorNovo] of Object.entries(novo)) {
    const valorAntigo = antigo[campo] ?? null;
    if (String(valorAntigo) === String(valorNovo)) continue;
    await pool.query(
      "INSERT INTO historico_edicoes (tabela, registro_id, campo, valor_anterior, valor_novo, usuario, data_hora) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [tabela, registroId, campo, valorAntigo != null ? String(valorAntigo) : null, valorNovo != null ? String(valorNovo) : null, usuario, agora],
    );
  }
}

export type ObraPrestador = DadosObraPrestador & {
  id: number;
  criado_em: string;
  criado_por: string | null;
  atualizado_em: string | null;
  atualizado_por: string | null;
};

/** Mesma regra de gat/database.py::inserir_obra_prestador. */
export async function inserirObraPrestador(dados: DadosObraPrestador, usuario: string): Promise<number> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const campos = {
    prestador_id: dados.prestador_id, nome_obra: dados.nome_obra.trim(),
    codigo_referencia: dados.codigo_referencia || null, status: dados.status || "ATIVA",
    e_canteiro: !!dados.e_canteiro, observacoes: dados.observacoes || null,
  };
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO obras_prestador (${COLUNAS_OBRA.join(", ")}, criado_em, criado_por, atualizado_em, atualizado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$7,$8) RETURNING id`,
    [campos.prestador_id, campos.nome_obra, campos.codigo_referencia, campos.status, campos.e_canteiro, campos.observacoes, agora, usuario],
  );
  const id = rows[0].id;
  await registrarHistorico("obras_prestador", id, {}, campos, usuario);
  return id;
}

/** Mesma regra de gat/database.py::atualizar_obra_prestador. */
export async function atualizarObraPrestador(id: number, dados: DadosObraPrestador, usuario: string): Promise<void> {
  const pool = obterPool();
  const { rows: antigas } = await pool.query("SELECT * FROM obras_prestador WHERE id = $1", [id]);
  const antigo = antigas[0] ?? {};
  const agora = new Date().toISOString();
  const campos = {
    prestador_id: dados.prestador_id, nome_obra: dados.nome_obra.trim(),
    codigo_referencia: dados.codigo_referencia || null, status: dados.status || "ATIVA",
    e_canteiro: !!dados.e_canteiro, observacoes: dados.observacoes || null,
  };
  await pool.query(
    `UPDATE obras_prestador SET prestador_id=$1, nome_obra=$2, codigo_referencia=$3, status=$4, e_canteiro=$5, observacoes=$6,
       atualizado_em=$7, atualizado_por=$8 WHERE id=$9`,
    [campos.prestador_id, campos.nome_obra, campos.codigo_referencia, campos.status, campos.e_canteiro, campos.observacoes, agora, usuario, id],
  );
  await registrarHistorico("obras_prestador", id, antigo, campos, usuario);
}

export async function listarObrasPrestador(prestadorId: number): Promise<ObraPrestador[]> {
  const pool = obterPool();
  const { rows } = await pool.query<ObraPrestador>(
    "SELECT * FROM obras_prestador WHERE prestador_id = $1 ORDER BY nome_obra", [prestadorId],
  );
  return rows;
}

export async function obterObraPrestador(id: number): Promise<ObraPrestador | null> {
  const pool = obterPool();
  const { rows } = await pool.query<ObraPrestador>("SELECT * FROM obras_prestador WHERE id = $1", [id]);
  return rows[0] ?? null;
}

/** Obras do prestador cujo Cadastro tem este código (usado no formulário
 * de análise para vincular uma obra sem exigir um seletor de cadastro
 * próprio — reaproveita o código, já digitado em ambos os lados). */
export async function listarObrasPorCodigoPrestador(codigo: string): Promise<ObraPrestador[]> {
  const pool = obterPool();
  const { rows } = await pool.query<ObraPrestador>(
    `SELECT o.* FROM obras_prestador o
     JOIN cadastro_prestadores c ON c.id = o.prestador_id
     WHERE UPPER(c.codigo) = UPPER($1) AND c.arquivado_em IS NULL
     ORDER BY o.nome_obra`,
    [codigo],
  );
  return rows;
}
