# Migração SQLite -> Supabase (Postgres) — checklist

Este diretório contém as ferramentas preparadas para a migração. Nada
aqui foi executado contra um Supabase real — não tenho nenhum projeto/
credencial configurado neste ambiente. O SQLite de produção
(`data/seed_gat_tecnoplano.db`) não foi tocado em nenhum momento.

## O que já está pronto e testado (contra os dados reais)

| Arquivo | O que faz | Testado como |
|---|---|---|
| `1_radiografia_schema.py` | Lê o SQLite real e gera `schema_atual.json`/`.md` — 45 tabelas, 13.228 linhas, colunas, tipos, PKs, FKs, índices. | Rodado contra `data/seed_gat_tecnoplano.db` — saída conferida. |
| `2_gerar_ddl_postgres.py` | Gera `schema_postgres.sql` a partir da radiografia — mesmos nomes de tabela/coluna, tipos mapeados, PK/FK/índices recriados, tabelas ordenadas por dependência de FK. | Gerado e validado (parsing SQL com `sqlparse`, parênteses balanceados, sem colisão com palavras reservadas do Postgres). Não testado contra um Postgres real. |
| `3_migrar_dados.py` | Copia todas as linhas do SQLite pro Postgres, tabela por tabela, e confere a contagem ao final. | Rodado em `--dry-run` contra os dados reais — leu as 45 tabelas, 13.228 linhas, sem gravar nada. Não testado gravando de verdade (precisa de um Supabase real). |
| `gat/db_backend.py` | Camada de conexão única — troca sqlite3/Postgres via `GAT_DB_BACKEND`. Traduz `?`→`%s` e devolve linhas com acesso por nome de coluna nos dois backends; shim de `lastrowid` via `RETURNING id`. | Testado: (1) com `GAT_DB_BACKEND` não definida, todo o app roda idêntico a antes — leitura, inserção, edição, histórico, tudo conferido contra dados reais; (2) tradução de `?`→`%s` e o shim de `RETURNING id` testados isoladamente com um cursor simulado. **Não testado com um Postgres de verdade.** |

## O que AINDA falta antes de virar a chave pra produção

Nove trechos em `gat/database.py` usam sintaxe exclusiva do SQLite sem
equivalente automático no adaptador — precisam ser revistos um a um,
testados contra um Supabase real, antes de rodar com `GAT_DB_BACKEND=postgres`:

- **`INSERT OR IGNORE`** (6 pontos) — `_semear_configuracoes_padrao`,
  `_migracao_0004_cadastro_mestre` (cadastro_prestadores e
  cadastro_cessionarios), `_migracao_0008_avaliacao_obrigatoria_isentos`,
  `_migracao_0030_central_codificacao`, `confirmar_leitura_manual`.
  Equivalente Postgres: `INSERT ... ON CONFLICT (coluna_unica) DO NOTHING`.
- **`INSERT OR REPLACE`** (2 pontos) — `_semear_permissoes_perfil`
  (permissoes_modulo e permissoes_area). Equivalente Postgres:
  `INSERT ... ON CONFLICT (usuario_id, modulo) DO UPDATE SET permitido = EXCLUDED.permitido`.
- **`PRAGMA table_info`** (1 ponto) — `_garantir_coluna`, usada pelas
  rotinas de migração de schema para checar se uma coluna já existe antes
  de um `ALTER TABLE ADD COLUMN`. Equivalente Postgres: consultar
  `information_schema.columns`.

Todos os nove são rotinas de **migração/seed**, não fluxo de uso diário —
o app continuaria funcionando normalmente mesmo sem essa correção, mas
uma implantação NOVA contra Postgres do zero pararia nelas.

## Passo a passo do que você precisa fazer (lado Supabase)

1. **Criar o projeto no Supabase** (supabase.com → New Project). Anote a
   região e a senha do banco que você definir na criação — não me envie
   nem cole em nenhum arquivo do repositório.
2. **Pegar a connection string**: no painel do projeto, vá em
   *Project Settings → Database → Connection string → URI*. Copie o
   valor (formato `postgresql://postgres:[SUA-SENHA]@...:5432/postgres`).
3. **Aplicar o schema**: cole o conteúdo de `schema_postgres.sql` no
   *SQL Editor* do Supabase e rode — cria as 45 tabelas vazias,
   com os mesmos nomes/colunas/PKs/FKs/índices de hoje.
4. **Configurar a variável de ambiente** onde o app for rodar (nunca no
   código): `SUPABASE_DB_URL` = a connection string do passo 2. Em
   Streamlit Community Cloud isso é feito em *App settings → Secrets*.
5. **Rodar a migração de dados** (do seu computador ou de um ambiente com
   acesso ao SQLite de produção):
   ```
   pip install -r scripts/supabase_migration/requirements.txt
   export SUPABASE_DB_URL="postgresql://...."
   python scripts/supabase_migration/3_migrar_dados.py --somente-tabela usuarios
   ```
   Comece por 1-2 tabelas pequenas (`usuarios`, `configuracoes`) pra
   validar a conexão, depois rode sem `--somente-tabela` para migrar
   tudo. O script imprime, tabela por tabela, `sqlite=N postgres=N` e
   avisa se alguma contagem divergir — só considere concluído se todas
   baterem.
6. **Revisar os 9 pontos listados acima** em `gat/database.py`,
   testando cada um contra o Supabase recém-populado.
7. **Só então** definir `GAT_DB_BACKEND=postgres` no ambiente e validar o
   app inteiro (login, cadastro, edição, dashboards, importação por
   planilha) contra o Supabase antes de desligar o SQLite de vez.
8. **Não apague nem desative a sincronização/backup do SQLite** (já
   pedido explicitamente) até validar tudo em produção — o app continua
   gravando e sincronizando o arquivo `.db` local normalmente enquanto
   `GAT_DB_BACKEND` não estiver definido como `postgres`.

## Resultado da validação de contagem de linhas

Ainda não executada de verdade — depende do passo 1-5 acima (projeto
Supabase criado + `SUPABASE_DB_URL` configurada). O `--dry-run` já
confirmou que o script lê corretamente as 13.228 linhas em 45 tabelas do
SQLite atual; falta só apontar para um Postgres real e rodar sem
`--dry-run`.
