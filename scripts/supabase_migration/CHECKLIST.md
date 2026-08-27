# Migração SQLite -> Supabase (Postgres) — checklist

## Status atual: dados migrados e validados em produção no Supabase do usuário

O schema (`schema_postgres.sql`) foi aplicado no projeto Supabase real
("GAT.APP") e a migração de dados foi executada de verdade (rodada pelo
usuário, a partir do seu computador — esta sessão de Claude Code não tem
permissão de rede para conexões diretas de banco de dados). Resultado
real, conferido linha por linha:

```
Total de linhas — SQLite: 13228 · Postgres: 13228
Todas as contagens bateram — migração validada.
```

O SQLite de produção (`data/seed_gat_tecnoplano.db`) não foi tocado em
nenhum momento — o app continua rodando nele normalmente. O Supabase é,
por enquanto, uma cópia paralela, ainda não usada pelo app.

## O que já está pronto e testado

| Arquivo | O que faz | Testado como |
|---|---|---|
| `1_radiografia_schema.py` | Lê o SQLite real e gera `schema_atual.json`/`.md`. | Rodado contra `data/seed_gat_tecnoplano.db` — 45 tabelas, 13.228 linhas. |
| `2_gerar_ddl_postgres.py` | Gera `schema_postgres.sql`. | Aplicado de verdade no Supabase do usuário (SQL Editor) — "Success", 45 tabelas criadas. |
| `3_migrar_dados.py` | Copia as linhas do SQLite pro Postgres, tabela por tabela, com validação de contagem. | **Rodado de verdade contra o Supabase do usuário — 13.228/13.228 linhas, todas as 45 tabelas bateram.** |
| `gat/db_backend.py` | Camada de conexão única (`GAT_DB_BACKEND=sqlite\|postgres`). | Testado: fluxo sqlite completo sem regressão (padrão, `GAT_DB_BACKEND` não definida); tradução `?`→`%s` e shim de `lastrowid` testados isoladamente. Conexão real ao Postgres só validada pelo script de migração rodado pelo usuário (não por esta sessão, que não tem acesso de rede a bancos). |
| Os 9 pontos de sintaxe SQLite-específica em `gat/database.py` | Ver abaixo — **já corrigidos**. | Reescritos para `INSERT ... ON CONFLICT ...` (SQL padrão, funciona igual em SQLite 3.24+ e Postgres) e testados contra dados reais em cópia isolada: `init_db()` rodado duas vezes seguidas sem gerar duplicata (idempotência confirmada), e o comportamento de upsert de `_semear_permissoes_perfil` testado explicitamente (altera uma permissão manualmente, re-semeia, confirma que volta ao valor do template — mesmo efeito do `INSERT OR REPLACE` antigo). A única exceção (`_garantir_coluna`, que usa `information_schema.columns` no backend Postgres) não pôde ser testada contra Postgres de verdade por esta sessão — só a branch SQLite foi exercida nos testes acima. |

## Os 9 pontos de sintaxe SQLite-específica — CORRIGIDOS

Reescritos para sintaxe padrão SQL (`INSERT ... ON CONFLICT ...`), que
funciona identicamente em SQLite 3.24+ (o ambiente atual roda 3.45.1) e em
Postgres — não foi necessário nenhum branch condicional por backend nesses
8 pontos:

- `_semear_configuracoes_padrao` — `ON CONFLICT (chave) DO NOTHING`
- `_semear_permissoes_perfil` (permissoes_modulo e permissoes_area) —
  `ON CONFLICT (usuario_id, modulo/area) DO UPDATE SET permitido = excluded.permitido`
- `_migracao_0004_cadastro_mestre` (cadastro_prestadores e
  cadastro_cessionarios) — `ON CONFLICT (codigo) DO NOTHING`
- `_migracao_0008_avaliacao_obrigatoria_isentos` —
  `ON CONFLICT (modulo, projeto_id) DO NOTHING`
- `_migracao_0030_central_codificacao` — `ON CONFLICT (disciplina) DO NOTHING`
- `confirmar_leitura_manual` — `ON CONFLICT (usuario, versao) DO NOTHING`

O único ponto que **precisou** de um branch condicional por backend (não
existe uma única sintaxe válida nos dois bancos):

- `_garantir_coluna` — `PRAGMA table_info` (SQLite) vs.
  `information_schema.columns` (Postgres), decidido por
  `gat.db_backend.backend_ativo()`.

## O que ainda falta antes de "virar a chave" pra produção

1. **Validar o app inteiro** rodando com `GAT_DB_BACKEND=postgres` contra
   o Supabase já populado — login, cadastro, edição, dashboards,
   importação por planilha. Como esta sessão não tem acesso de rede a
   bancos de dados, essa validação só pode ser feita rodando o app
   localmente (ou num ambiente com rede irrestrita) apontado pro Supabase.
2. Revisar especificamente a branch Postgres de `_garantir_coluna` contra
   o Supabase real (não testada nesta sessão, só a branch SQLite).
3. **Só então** definir `GAT_DB_BACKEND=postgres` no ambiente de produção
   (ex.: Streamlit Community Cloud → App settings → Secrets) e desligar a
   dependência do SQLite.
4. **Não apague nem desative a sincronização/backup do SQLite** até essa
   validação completa — o app continua gravando e sincronizando o
   arquivo `.db` local normalmente enquanto `GAT_DB_BACKEND` não estiver
   definido como `postgres`.

## Recomendação de segurança

A senha do banco Supabase passou por este chat durante a configuração —
considere trocá-la (botão "Reset database password" no Supabase, na tela
de conexão) depois de concluída a validação, e atualizar
`SUPABASE_DB_URL` onde estiver configurada.
