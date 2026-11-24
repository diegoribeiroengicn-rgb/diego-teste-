-- ============================================================
-- DIAGNÓSTICO (SOMENTE LEITURA) — Prestadores 2026 × planilha
-- Nenhum INSERT/UPDATE/DELETE. Pode rodar no SQL Editor do Supabase.
-- Rode bloco a bloco e me envie o resultado (ou prints).
-- ============================================================

-- BLOCO 1 — Reproduz os KPIs do PDF (mesmos critérios do sistema:
-- arquivado_em IS NULL, exclui CANCELADO, ART fora de "análises", ano pela Data de Solicitação)
SELECT
  COUNT(*) FILTER (WHERE UPPER(TRIM(COALESCE(disciplina,''))) <> 'ART/RRT')                       AS analises_emitidas_sistema,
  COALESCE(SUM(num_documentos),0)                                                                  AS docs_sistema_com_art,
  COUNT(*)                                                                                         AS linhas_total_incl_art
FROM prestadores
WHERE arquivado_em IS NULL
  AND UPPER(TRIM(COALESCE(status_analise,''))) <> 'CANCELADO'
  AND LEFT(data_solicitacao,4) = '2026';

-- BLOCO 2 — Mesmos números pelo critério da PLANILHA (com Data Análise em 2026)
SELECT
  COUNT(*)                         AS linhas_com_data_analise,
  COALESCE(SUM(num_documentos),0)  AS docs_com_data_analise
FROM prestadores
WHERE arquivado_em IS NULL
  AND LEFT(data_analise,4) = '2026';

-- BLOCO 3 — Distribuição por status (onde estão as 890 × 750)
SELECT COALESCE(status_analise,'(vazio)') AS status,
       COUNT(*) AS linhas,
       COUNT(*) FILTER (WHERE data_analise IS NOT NULL AND data_analise <> '') AS com_data_analise,
       COALESCE(SUM(num_documentos),0) AS docs
FROM prestadores
WHERE arquivado_em IS NULL AND LEFT(data_solicitacao,4) = '2026'
GROUP BY 1 ORDER BY 2 DESC;

-- BLOCO 4 — Total de linhas no banco por ano de solicitação e arquivamento
-- (a planilha tem 837 linhas no total)
SELECT LEFT(data_solicitacao,4) AS ano,
       COUNT(*) FILTER (WHERE arquivado_em IS NULL) AS ativos,
       COUNT(*) FILTER (WHERE arquivado_em IS NOT NULL) AS arquivados,
       COALESCE(SUM(num_documentos) FILTER (WHERE arquivado_em IS NULL),0) AS docs_ativos
FROM prestadores GROUP BY 1 ORDER BY 1;

-- BLOCO 5 — DUPLICADOS pela chave da planilha
-- (Código + Disciplina + Revisão + N° AT + Data Solicitação + Obra)
SELECT UPPER(TRIM(COALESCE(codigo,prestador))) AS cod_ou_prestador,
       UPPER(TRIM(disciplina)) AS disciplina, revisao,
       TRIM(COALESCE(num_at,'')) AS num_at, data_solicitacao,
       UPPER(TRIM(COALESCE(obra_referencia,''))) AS obra,
       COUNT(*) AS qtd, ARRAY_AGG(id ORDER BY id) AS ids, ARRAY_AGG(item ORDER BY id) AS itens
FROM prestadores
WHERE arquivado_em IS NULL AND LEFT(data_solicitacao,4) = '2026'
GROUP BY 1,2,3,4,5,6
HAVING COUNT(*) > 1
ORDER BY qtd DESC, 1;

-- BLOCO 6 — Duplicados "por acento": mesma análise com disciplina escrita diferente
-- (ELÉTRICA × ELETRICA etc.)
SELECT TRANSLATE(UPPER(TRIM(disciplina)),'ÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ','AAAAEEEIIIOOOOUUUC') AS disc_sem_acento,
       ARRAY_AGG(DISTINCT disciplina) AS grafias, COUNT(*) AS linhas,
       COALESCE(SUM(num_documentos),0) AS docs
FROM prestadores
WHERE arquivado_em IS NULL AND LEFT(data_solicitacao,4) = '2026'
GROUP BY 1 HAVING COUNT(DISTINCT disciplina) > 1 ORDER BY linhas DESC;

-- BLOCO 7 — Mesma análise em grafias diferentes (candidatas a órfãs de reimportação)
SELECT UPPER(TRIM(COALESCE(codigo,''))) AS codigo,
       TRANSLATE(UPPER(TRIM(disciplina)),'ÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ','AAAAEEEIIIOOOOUUUC') AS disc,
       revisao, TRIM(COALESCE(num_at,'')) AS num_at,
       COUNT(*) AS qtd, ARRAY_AGG(id ORDER BY id) AS ids,
       ARRAY_AGG(DISTINCT disciplina) AS grafias, ARRAY_AGG(DISTINCT data_solicitacao) AS datas_solic
FROM prestadores
WHERE arquivado_em IS NULL AND LEFT(data_solicitacao,4) = '2026'
GROUP BY 1,2,3,4 HAVING COUNT(*) > 1 ORDER BY qtd DESC LIMIT 200;

-- BLOCO 8 — Nomes de prestador com variações (GENESIS / "GENESIS " / RG QUATRO / RGQUATRO...)
SELECT UPPER(TRIM(prestador)) AS prestador_norm,
       ARRAY_AGG(DISTINCT prestador) AS grafias, COUNT(*) AS linhas
FROM prestadores WHERE arquivado_em IS NULL
GROUP BY 1 ORDER BY 1;

-- BLOCO 9 — Importações feitas (quando/quantas vezes a planilha foi carregada)
SELECT * FROM importacoes_planilha_historico ORDER BY 1 DESC LIMIT 30;

-- BLOCO 10 — Comparativo 2025: distribuição por mês da solicitação
SELECT SUBSTRING(data_solicitacao,1,7) AS mes, COUNT(*) AS linhas,
       COALESCE(SUM(num_documentos),0) AS docs
FROM prestadores WHERE arquivado_em IS NULL AND LEFT(data_solicitacao,4) IN ('2025','2026')
GROUP BY 1 ORDER BY 1;

-- BLOCO 11 — Linhas "fantasma": sem data de solicitação / sem prestador ou disciplina
SELECT COUNT(*) FILTER (WHERE data_solicitacao IS NULL OR data_solicitacao = '') AS sem_solicitacao,
       COUNT(*) FILTER (WHERE prestador IS NULL OR TRIM(prestador) = '') AS sem_prestador,
       COUNT(*) FILTER (WHERE disciplina IS NULL OR TRIM(disciplina) = '') AS sem_disciplina
FROM prestadores WHERE arquivado_em IS NULL;

-- BLOCO 12 — Para a comparação linha a linha: exporte esta lista (CSV) e me envie junto com a planilha
SELECT id, item, codigo, prestador, disciplina, revisao, num_documentos,
       data_solicitacao, data_analise, num_at, status_analise, obra_referencia, criado_em
FROM prestadores
WHERE arquivado_em IS NULL AND LEFT(data_solicitacao,4) = '2026'
ORDER BY item NULLS LAST, id;
