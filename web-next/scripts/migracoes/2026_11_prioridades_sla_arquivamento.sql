-- GAT — migração das evoluções de 11/2026. Tudo é IDEMPOTENTE (pode rodar mais de uma vez)
-- e ADITIVO (nada é apagado ou alterado). O próprio sistema também aplica estes comandos
-- sozinho na primeira utilização; este arquivo serve para aplicar de antemão ou conferir.

-- ===== BLOCO 1 — Alinhar sequências de ID (evita "duplicate key ... _pkey" no banco migrado do SQLite)
DO $$
DECLARE r record; seq text; m bigint; lv bigint;
BEGIN
  FOR r IN SELECT table_name AS t, column_name AS c FROM information_schema.columns
           WHERE table_schema = current_schema() AND column_default LIKE 'nextval(%' LOOP
    seq := pg_get_serial_sequence(format('%I', r.t), r.c);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I', r.c, r.t) INTO m;
      EXECUTE format('SELECT last_value FROM %s', seq) INTO lv;
      IF m > lv THEN PERFORM setval(seq, m); END IF;   -- só avança, nunca recua
    END IF;
  END LOOP;
END $$;

-- ===== BLOCO 2 — Baixa da AT: quantidade de documentos analisados e referência da obra
ALTER TABLE prestadores               ADD COLUMN IF NOT EXISTS num_documentos_analisados BIGINT;
ALTER TABLE cessionarios              ADD COLUMN IF NOT EXISTS num_documentos_analisados BIGINT;
ALTER TABLE cessionarios              ADD COLUMN IF NOT EXISTS obra_referencia TEXT;
ALTER TABLE resumo_conclusao_historico ADD COLUMN IF NOT EXISTS num_documentos_analisados BIGINT;
ALTER TABLE resumo_conclusao_historico ADD COLUMN IF NOT EXISTS obra_referencia TEXT;

-- ===== BLOCO 3 — Prioridade por análise também em Cessionários
ALTER TABLE cessionarios ADD COLUMN IF NOT EXISTS nivel_prioridade BIGINT;

-- ===== BLOCO 4 — Estrutura única de prioridades (análise, projeto/documento e prestador)
CREATE TABLE IF NOT EXISTS prioridades_operacionais (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,                 -- ANALISE | DOCUMENTO | PRESTADOR
  tabela TEXT NOT NULL,               -- prestadores | cessionarios
  registro_id BIGINT,                 -- id da análise (só tipo ANALISE)
  codigo TEXT,                        -- projeto (DOCUMENTO) ou nome do prestador/cessionário (PRESTADOR)
  disciplina TEXT,
  revisao BIGINT,
  origem TEXT NOT NULL,               -- IMPORTACAO | LISTAGEM | GESTAO
  sla_operacional_dias BIGINT,
  data_entrega_operacional TEXT,
  vencimento_operacional TEXT,
  vencimento_contratual TEXT,         -- só gestão
  data_planilha_original TEXT,        -- auditoria
  justificativa TEXT,
  ativo BIGINT NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL,
  criado_por TEXT NOT NULL,
  atualizado_em TEXT,
  atualizado_por TEXT,
  removido_em TEXT,
  removido_por TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_prioridade_analise_ativa
  ON prioridades_operacionais (tabela, registro_id) WHERE tipo = 'ANALISE' AND ativo = 1;
CREATE INDEX IF NOT EXISTS ix_prioridade_codigo
  ON prioridades_operacionais (tabela, codigo, tipo) WHERE ativo = 1;

-- ===== BLOCO 5 — Decisões da importação (para não perguntar de novo sobre a mesma data)
CREATE TABLE IF NOT EXISTS divergencias_data_decididas (
  id BIGSERIAL PRIMARY KEY,
  tabela TEXT NOT NULL,
  registro_id BIGINT NOT NULL,
  data_planilha TEXT NOT NULL,
  decisao TEXT NOT NULL,              -- SIM | NAO
  decidido_em TEXT NOT NULL,
  decidido_por TEXT NOT NULL,
  UNIQUE (tabela, registro_id, data_planilha)
);

-- (Arquivamento de projeto NÃO precisa de SQL novo: usa as colunas arquivado_em/arquivado_por/
--  motivo_arquivamento que já existiam em prestadores e cessionarios.)
