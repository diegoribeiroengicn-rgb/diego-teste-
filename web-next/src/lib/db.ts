import { Pool, types } from "pg";

// Conexão com o mesmo Supabase (Postgres) já migrado do GAT — não um banco
// novo. A connection string vem de DATABASE_URL (Vercel > Settings >
// Environment Variables), nunca hardcoded aqui.

// `node-postgres` devolve BIGINT/NUMERIC como string por padrão (para não
// perder precisão em números gigantes, ex.: IDs tipo snowflake) — mas
// nenhuma coluna numérica deste sistema (num_documentos, revisão, SLA,
// dias de hold etc.) chega perto da faixa onde isso importaria, e o custo
// é alto: qualquer soma (`+=`) ou comparação estrita (`===`) feita em
// TypeScript assumindo `number` vira concatenação de texto ou comparação
// sempre falsa quando o valor voltar como string ("037747261841341" em
// vez de uma soma de verdade — exatamente o que apareceu nos indicadores
// "Docs Analisados"/"Atrasados" do OPR). Força as duas a sempre virar
// number, igual o driver já faz com INT4/INT2 — sem isso, cada arquivo
// teria que lembrar de converter manualmente em cada leitura.
types.setTypeParser(types.builtins.INT8, (valor) => parseInt(valor, 10));
types.setTypeParser(types.builtins.NUMERIC, (valor) => parseFloat(valor));

let pool: Pool | undefined;

export function obterPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL não configurada — defina a connection string do Supabase nas variáveis de ambiente.",
      );
    }
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}
