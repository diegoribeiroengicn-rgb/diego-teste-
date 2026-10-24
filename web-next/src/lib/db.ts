import { Pool } from "pg";

// Conexão com o mesmo Supabase (Postgres) já migrado do GAT — não um banco
// novo. A connection string vem de DATABASE_URL (Vercel > Settings >
// Environment Variables), nunca hardcoded aqui.
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
