import { obterPool } from "@/lib/db";

const PREFIXO_CHAVE = "observacao_mensal_";

function chaveCompetencia(mes: number, ano: number): string {
  return `${PREFIXO_CHAVE}${ano}-${String(mes).padStart(2, "0")}`;
}

/** Observações gerenciais de uma competência (Mês/Ano) — reaproveita a
 * tabela genérica `configuracoes` (chave/valor) já usada por outras
 * configurações do sistema, em vez de uma tabela dedicada só para isso
 * (mesmo papel de gat/database.py::obter_observacao_mensal, mas sem
 * depender de uma tabela `observacoes_mensais` que não existe no schema
 * Postgres compartilhado). */
export async function obterObservacaoMensal(mes: number, ano: number): Promise<string> {
  const pool = obterPool();
  const { rows } = await pool.query<{ valor: string }>(
    `SELECT valor FROM configuracoes WHERE chave = $1`, [chaveCompetencia(mes, ano)],
  );
  return rows[0]?.valor ?? "";
}

export async function salvarObservacaoMensal(mes: number, ano: number, texto: string): Promise<void> {
  const pool = obterPool();
  await pool.query(
    `INSERT INTO configuracoes (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`,
    [chaveCompetencia(mes, ano), texto],
  );
}
