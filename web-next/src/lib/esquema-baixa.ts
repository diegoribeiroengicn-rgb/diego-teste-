import { obterPool } from "@/lib/db";

/** Colunas criadas para a baixa da AT guardar a quantidade de documentos
 * analisados e a referência da obra. Todas anuláveis e sem valor padrão:
 * registros e baixas antigas continuam válidos, só ficam sem o dado. */
const COLUNAS_BAIXA: { tabela: string; coluna: string; tipo: string }[] = [
  { tabela: "prestadores", coluna: "num_documentos_analisados", tipo: "BIGINT" },
  { tabela: "cessionarios", coluna: "num_documentos_analisados", tipo: "BIGINT" },
  { tabela: "cessionarios", coluna: "obra_referencia", tipo: "TEXT" },
  { tabela: "resumo_conclusao_historico", coluna: "num_documentos_analisados", tipo: "BIGINT" },
  { tabela: "resumo_conclusao_historico", coluna: "obra_referencia", tipo: "TEXT" },
];

let pronto: Promise<void> | null = null;

async function aplicar(): Promise<void> {
  const pool = obterPool();
  const { rows } = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = ANY($1) AND column_name = ANY($2)`,
    [[...new Set(COLUNAS_BAIXA.map((c) => c.tabela))], [...new Set(COLUNAS_BAIXA.map((c) => c.coluna))]],
  );
  const existentes = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  for (const c of COLUNAS_BAIXA) {
    // Só emite ALTER quando a coluna falta: mesmo com IF NOT EXISTS o
    // ALTER TABLE pede um bloqueio exclusivo da tabela.
    if (existentes.has(`${c.tabela}.${c.coluna}`)) continue;
    await pool.query(`ALTER TABLE ${c.tabela} ADD COLUMN IF NOT EXISTS ${c.coluna} ${c.tipo}`);
  }
}

/** Garante, uma vez por processo, que as colunas da baixa existem antes
 * de qualquer consulta que as leia ou grave. */
export function garantirColunasBaixa(): Promise<void> {
  pronto ??= aplicar().catch((exc) => {
    pronto = null;
    throw new Error(`Não foi possível preparar o banco para os campos da baixa: ${exc instanceof Error ? exc.message : exc}`);
  });
  return pronto;
}
