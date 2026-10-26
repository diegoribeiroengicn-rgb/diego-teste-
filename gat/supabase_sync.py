"""
Ressincronização do Supabase (cópia do banco usada pela versão em
migração, `web-next`) a partir do SQLite de produção — TRUNCATE + INSERT
tabela por tabela, nunca grava no SQLite (só leitura).

Acionado por um botão em Administração > Backup porque o Streamlit Cloud
tem acesso de rede ao Supabase que outros ambientes (ex.: sessões do
Claude Code usadas para desenvolver o sistema) não têm — essa é a razão
de existir como função do app, e não só como script de linha de comando
(`scripts/supabase_migration/3_migrar_dados.py`, mesma lógica de origem).

Reaproveita o `schema_atual.json` já gerado por
`scripts/supabase_migration/1_radiografia_schema.py` — não gera o schema
de novo, só lê a lista de tabelas/colunas já conhecida.
"""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any

from gat.config import DB_PATH

_SCHEMA_JSON = Path(__file__).resolve().parent.parent / "scripts" / "supabase_migration" / "schema_atual.json"

# Patch de schema idempotente — cobre o período em que `schema_atual.json`
# (gerado em 02/10) ficou defasado das migrações 40-42 do SQLite (tabela
# `preferencias_conflito_planilha`, campos "Teve substituição?" em
# Prestadores/Cessionários, tabela `cessionarios_ativos`, + outras colunas
# aditivas que já existiam no SQLite mas nunca chegaram ao Supabase).
# `schema_atual.json` já foi regenerado para refletir essas migrações, mas
# o Supabase em si só é corrigido na próxima vez que este patch rodar —
# daí ele ficar aqui, sempre executado antes do TRUNCATE+INSERT, em vez de
# só uma correção manual avulsa: qualquer migração aditiva futura que
# fique temporariamente fora do `schema_atual.json` se autocorrige da
# mesma forma, sem precisar de outro patch específico.
_SCHEMA_PATCH_SQL = """
CREATE TABLE IF NOT EXISTS "alertas_pessoais_vistos" (
    "id" BIGSERIAL PRIMARY KEY,
    "usuario" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "visto_em" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_alertas_pessoais_vistos_usuario" ON "alertas_pessoais_vistos" ("usuario", "tipo");
CREATE UNIQUE INDEX IF NOT EXISTS "sqlite_autoindex_alertas_pessoais_vistos_1" ON "alertas_pessoais_vistos" ("usuario", "tipo", "chave");

CREATE TABLE IF NOT EXISTS "avaliacao_checklist_perguntas" (
    "id" BIGSERIAL PRIMARY KEY,
    "categoria" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "ordem_categoria" BIGINT NOT NULL,
    "ordem_pergunta" BIGINT NOT NULL,
    "ativo" BIGINT NOT NULL DEFAULT 1,
    "criado_em" TEXT NOT NULL,
    "criado_por" TEXT,
    "atualizado_em" TEXT,
    "atualizado_por" TEXT
);
CREATE INDEX IF NOT EXISTS "idx_avaliacao_checklist_perguntas_ordem" ON "avaliacao_checklist_perguntas" ("ativo", "ordem_categoria", "ordem_pergunta");

CREATE TABLE IF NOT EXISTS "cessionarios_ativos" (
    "id" BIGSERIAL PRIMARY KEY,
    "categoria" TEXT NOT NULL,
    "quantidade" BIGINT NOT NULL DEFAULT 0,
    "ordem" BIGINT NOT NULL DEFAULT 0,
    "criado_em" TEXT NOT NULL,
    "criado_por" TEXT,
    "atualizado_em" TEXT,
    "atualizado_por" TEXT
);

CREATE TABLE IF NOT EXISTS "preferencias_conflito_planilha" (
    "id" BIGSERIAL PRIMARY KEY,
    "tabela" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "identificacao" TEXT,
    "criado_em" TEXT NOT NULL,
    "criado_por" TEXT
);
CREATE INDEX IF NOT EXISTS "idx_preferencias_conflito_planilha_tabela" ON "preferencias_conflito_planilha" ("tabela");
CREATE UNIQUE INDEX IF NOT EXISTS "sqlite_autoindex_preferencias_conflito_planilha_1" ON "preferencias_conflito_planilha" ("tabela", "chave", "campo");

ALTER TABLE "prestadores" ADD COLUMN IF NOT EXISTS "teve_substituicao" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "prestadores" ADD COLUMN IF NOT EXISTS "qtd_arquivos_substituidos" BIGINT;
ALTER TABLE "cessionarios" ADD COLUMN IF NOT EXISTS "teve_substituicao" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "cessionarios" ADD COLUMN IF NOT EXISTS "qtd_arquivos_substituidos" BIGINT;
ALTER TABLE "avaliacoes_checklist" ADD COLUMN IF NOT EXISTS "nome_projetista" TEXT;
"""


def _aplicar_patch_schema(con_pg) -> None:
    """Executa `_SCHEMA_PATCH_SQL` instrução por instrução — todas com
    IF NOT EXISTS, portanto seguras para rodar em toda ressincronização,
    mesmo depois que o Supabase já estiver em dia."""
    with con_pg.cursor() as cur:
        for instrucao in _SCHEMA_PATCH_SQL.split(";"):
            instrucao = instrucao.strip()
            if instrucao:
                cur.execute(instrucao)
    con_pg.commit()


def configurado() -> bool:
    return bool(os.environ.get("SUPABASE_DB_URL"))


def _ordem_tabelas(schema: list[dict]) -> list[str]:
    """Mesma ordenação por dependência de FK do script original — insere
    (e, na ressincronização, teria que truncar na ordem inversa) primeiro
    quem não depende de ninguém, para nunca violar uma FK."""
    por_nome = {t["nome"]: t for t in schema}
    resolvidas: list[str] = []
    pendentes = set(por_nome.keys())
    while pendentes:
        avancou = False
        for nome in sorted(pendentes):
            deps = {fk["tabela_referenciada"] for fk in por_nome[nome]["chaves_estrangeiras"]}
            if deps <= set(resolvidas) or nome in deps:
                resolvidas.append(nome)
                pendentes.discard(nome)
                avancou = True
        if not avancou:
            resolvidas.extend(sorted(pendentes))
            break
    return resolvidas


def ressincronizar() -> list[dict[str, Any]]:
    """Limpa e recarrega todas as tabelas do Supabase a partir do SQLite de
    produção atual (`gat.config.DB_PATH`). Retorna um relatório por tabela
    (`tabela`, `sqlite`, `postgres`, `bateu`). Lança `RuntimeError` se
    `SUPABASE_DB_URL` não estiver configurada, se o `schema_atual.json`
    não existir, ou se alguma contagem final não bater."""
    import psycopg2
    import psycopg2.extras

    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        raise RuntimeError("Variável de ambiente SUPABASE_DB_URL não configurada.")
    if not _SCHEMA_JSON.exists():
        raise RuntimeError(f"{_SCHEMA_JSON} não encontrado — gere-o antes com o passo 1 da migração.")

    schema = json.loads(_SCHEMA_JSON.read_text(encoding="utf-8"))
    ordem = _ordem_tabelas(schema)
    por_nome = {t["nome"]: t for t in schema}

    con_sqlite = sqlite3.connect(str(DB_PATH))
    con_pg = psycopg2.connect(url)
    resultado: list[dict[str, Any]] = []
    try:
        _aplicar_patch_schema(con_pg)

        with con_pg.cursor() as cur:
            for nome in reversed(ordem):
                cur.execute(f'TRUNCATE TABLE "{nome}" RESTART IDENTITY CASCADE')
        con_pg.commit()

        for nome in ordem:
            colunas = [c["nome"] for c in por_nome[nome]["colunas"]]
            linhas = con_sqlite.execute(f'SELECT {", ".join(colunas)} FROM "{nome}"').fetchall()
            if linhas:
                marcadores = ", ".join(["%s"] * len(colunas))
                colunas_sql = ", ".join(f'"{c}"' for c in colunas)
                with con_pg.cursor() as cur:
                    psycopg2.extras.execute_batch(
                        cur, f'INSERT INTO "{nome}" ({colunas_sql}) VALUES ({marcadores})',
                        [tuple(linha) for linha in linhas], page_size=500,
                    )
                con_pg.commit()
            with con_pg.cursor() as cur:
                cur.execute(f'SELECT COUNT(*) FROM "{nome}"')
                contagem_pg = cur.fetchone()[0]
            resultado.append({
                "tabela": nome, "sqlite": len(linhas), "postgres": contagem_pg, "bateu": contagem_pg == len(linhas),
            })

        divergentes = [r["tabela"] for r in resultado if not r["bateu"]]
        if divergentes:
            raise RuntimeError(f"Contagem divergente após ressincronizar: {', '.join(divergentes)}")
        return resultado
    finally:
        con_sqlite.close()
        con_pg.close()
