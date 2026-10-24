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
