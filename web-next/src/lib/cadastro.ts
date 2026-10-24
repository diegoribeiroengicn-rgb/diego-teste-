import { obterPool } from "@/lib/db";

export type TabelaCadastro = "prestadores" | "cessionarios";

const NOME_TABELA: Record<TabelaCadastro, string> = {
  prestadores: "cadastro_prestadores",
  cessionarios: "cadastro_cessionarios",
};

export type Cadastro = {
  id: number;
  codigo: string;
  nome_empresa: string;
  possui_pep: string | null;
  numero_pep: string | null;
  luc: string | null;
  rvp: string | null;
  rci: string | null;
  responsavel: string | null;
  telefone: string | null;
  email: string | null;
  observacoes: string | null;
  status: string;
};

export type DadosCadastro = {
  codigo: string;
  nome_empresa: string;
  possui_pep?: string | null;
  numero_pep?: string | null;
  luc?: string | null;
  rvp?: string | null;
  rci?: string | null;
  responsavel?: string | null;
  telefone?: string | null;
  email?: string | null;
  observacoes?: string | null;
};

function colunasSelect(tabela: TabelaCadastro): string {
  return tabela === "prestadores"
    ? `id, codigo, nome_empresa, possui_pep, numero_pep, NULL::text AS luc, NULL::text AS rvp, NULL::text AS rci, responsavel, telefone, email, observacoes, status`
    : `id, codigo, nome_empresa, NULL::text AS possui_pep, NULL::text AS numero_pep, luc, rvp, rci, responsavel, telefone, email, observacoes, status`;
}

export async function listarCadastro(tabela: TabelaCadastro): Promise<Cadastro[]> {
  const pool = obterPool();
  const { rows } = await pool.query(
    `SELECT ${colunasSelect(tabela)} FROM ${NOME_TABELA[tabela]} WHERE arquivado_em IS NULL ORDER BY codigo`,
  );
  return rows;
}

export async function obterCadastro(tabela: TabelaCadastro, id: number): Promise<Cadastro | null> {
  const pool = obterPool();
  const { rows } = await pool.query(`SELECT ${colunasSelect(tabela)} FROM ${NOME_TABELA[tabela]} WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function criarCadastro(tabela: TabelaCadastro, dados: DadosCadastro, usuario: string): Promise<number> {
  const pool = obterPool();
  const nomeTabela = NOME_TABELA[tabela];
  const existente = await pool.query(`SELECT id FROM ${nomeTabela} WHERE codigo = $1`, [dados.codigo]);
  if (existente.rows.length) {
    throw new Error(`Já existe um cadastro com o código "${dados.codigo}".`);
  }
  const agora = new Date().toISOString();

  if (tabela === "prestadores") {
    await pool.query(
      `INSERT INTO cadastro_prestadores
         (codigo, nome_empresa, possui_pep, numero_pep, responsavel, telefone, email, observacoes, status, criado_em, criado_por, atualizado_em, atualizado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ATIVO',$9,$10,$9,$10)`,
      [
        dados.codigo, dados.nome_empresa, dados.possui_pep || "NAO", dados.numero_pep || null,
        dados.responsavel || null, dados.telefone || null, dados.email || null, dados.observacoes || null,
        agora, usuario,
      ],
    );
  } else {
    await pool.query(
      `INSERT INTO cadastro_cessionarios
         (codigo, nome_empresa, luc, rvp, rci, responsavel, telefone, email, observacoes, status, criado_em, criado_por, atualizado_em, atualizado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ATIVO',$10,$11,$10,$11)`,
      [
        dados.codigo, dados.nome_empresa, dados.luc || null, dados.rvp || null, dados.rci || null,
        dados.responsavel || null, dados.telefone || null, dados.email || null, dados.observacoes || null,
        agora, usuario,
      ],
    );
  }

  const { rows } = await pool.query<{ id: number }>(`SELECT id FROM ${nomeTabela} WHERE codigo = $1`, [dados.codigo]);
  return rows[0].id;
}

export async function atualizarCadastro(
  tabela: TabelaCadastro,
  id: number,
  dados: DadosCadastro,
  usuario: string,
): Promise<void> {
  const pool = obterPool();
  const nomeTabela = NOME_TABELA[tabela];
  const existente = await pool.query(`SELECT id FROM ${nomeTabela} WHERE codigo = $1 AND id != $2`, [dados.codigo, id]);
  if (existente.rows.length) {
    throw new Error(`Já existe outro cadastro com o código "${dados.codigo}".`);
  }
  const agora = new Date().toISOString();

  if (tabela === "prestadores") {
    await pool.query(
      `UPDATE cadastro_prestadores
       SET codigo=$1, nome_empresa=$2, possui_pep=$3, numero_pep=$4, responsavel=$5, telefone=$6, email=$7, observacoes=$8, atualizado_em=$9, atualizado_por=$10
       WHERE id=$11`,
      [
        dados.codigo, dados.nome_empresa, dados.possui_pep || "NAO", dados.numero_pep || null,
        dados.responsavel || null, dados.telefone || null, dados.email || null, dados.observacoes || null,
        agora, usuario, id,
      ],
    );
  } else {
    await pool.query(
      `UPDATE cadastro_cessionarios
       SET codigo=$1, nome_empresa=$2, luc=$3, rvp=$4, rci=$5, responsavel=$6, telefone=$7, email=$8, observacoes=$9, atualizado_em=$10, atualizado_por=$11
       WHERE id=$12`,
      [
        dados.codigo, dados.nome_empresa, dados.luc || null, dados.rvp || null, dados.rci || null,
        dados.responsavel || null, dados.telefone || null, dados.email || null, dados.observacoes || null,
        agora, usuario, id,
      ],
    );
  }
}

export async function alternarStatusCadastro(tabela: TabelaCadastro, id: number, usuario: string): Promise<string> {
  const pool = obterPool();
  const nomeTabela = NOME_TABELA[tabela];
  const atual = await pool.query<{ status: string }>(`SELECT status FROM ${nomeTabela} WHERE id = $1`, [id]);
  if (!atual.rows[0]) {
    throw new Error("Cadastro não encontrado.");
  }
  const novoStatus = atual.rows[0].status === "ATIVO" ? "INATIVO" : "ATIVO";
  const agora = new Date().toISOString();
  await pool.query(`UPDATE ${nomeTabela} SET status=$1, atualizado_em=$2, atualizado_por=$3 WHERE id=$4`, [
    novoStatus, agora, usuario, id,
  ]);
  return novoStatus;
}
