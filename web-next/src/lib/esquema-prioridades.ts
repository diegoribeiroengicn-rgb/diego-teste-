import { obterPool } from "@/lib/db";

/** Estrutura única de prioridades (Prestador, Documento/Projeto e Análise),
 * criada de forma segura e idempotente na primeira utilização. Nada do que
 * já existe é alterado ou removido; só se acrescentam tabela, índices e a
 * coluna `nivel_prioridade` em cessionários (nula = sem prioridade). */
const SQL = [
  `CREATE TABLE IF NOT EXISTS prioridades_operacionais (
     id BIGSERIAL PRIMARY KEY,
     tipo TEXT NOT NULL,
     tabela TEXT NOT NULL,
     registro_id BIGINT,
     codigo TEXT,
     disciplina TEXT,
     revisao BIGINT,
     origem TEXT NOT NULL,
     sla_operacional_dias BIGINT,
     data_entrega_operacional TEXT,
     vencimento_operacional TEXT,
     vencimento_contratual TEXT,
     data_planilha_original TEXT,
     justificativa TEXT,
     ativo BIGINT NOT NULL DEFAULT 1,
     criado_em TEXT NOT NULL,
     criado_por TEXT NOT NULL,
     atualizado_em TEXT,
     atualizado_por TEXT,
     removido_em TEXT,
     removido_por TEXT
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_prioridade_analise_ativa ON prioridades_operacionais (tabela, registro_id) WHERE tipo = 'ANALISE' AND ativo = 1`,
  `CREATE INDEX IF NOT EXISTS ix_prioridade_codigo ON prioridades_operacionais (tabela, codigo, tipo) WHERE ativo = 1`,
  `ALTER TABLE cessionarios ADD COLUMN IF NOT EXISTS nivel_prioridade BIGINT`,
];

let pronto: Promise<void> | null = null;

export function garantirEsquemaPrioridades(): Promise<void> {
  pronto ??= (async () => {
    const pool = obterPool();
    for (const comando of SQL) await pool.query(comando);
  })().catch((exc) => {
    pronto = null;
    throw new Error(`Não foi possível preparar o banco para as prioridades: ${exc instanceof Error ? exc.message : exc}`);
  });
  return pronto;
}
