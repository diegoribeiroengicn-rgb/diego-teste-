-- Campos da baixa da AT: quantidade de documentos analisados e referência
-- da obra. O sistema (web-next/src/lib/esquema-baixa.ts) já cria estas
-- colunas sozinho na primeira baixa; este script existe só para aplicar
-- manualmente pelo SQL Editor do Supabase, se preferir. É idempotente.
ALTER TABLE prestadores ADD COLUMN IF NOT EXISTS num_documentos_analisados BIGINT;
ALTER TABLE cessionarios ADD COLUMN IF NOT EXISTS num_documentos_analisados BIGINT;
ALTER TABLE cessionarios ADD COLUMN IF NOT EXISTS obra_referencia TEXT;
ALTER TABLE resumo_conclusao_historico ADD COLUMN IF NOT EXISTS num_documentos_analisados BIGINT;
ALTER TABLE resumo_conclusao_historico ADD COLUMN IF NOT EXISTS obra_referencia TEXT;
