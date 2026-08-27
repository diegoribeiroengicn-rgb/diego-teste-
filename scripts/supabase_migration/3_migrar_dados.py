"""
Passo 3 da migração SQLite -> Supabase (PostgreSQL): copia todas as linhas
do SQLite para o Postgres/Supabase, tabela por tabela, e valida ao final
que a contagem de linhas bate em cada tabela. NUNCA apaga nem sobrescreve
o SQLite de origem — é uma leitura só.

Pré-requisitos antes de rodar:
  1. Rodar antes o passo 1 (radiografia) e o passo 2 (gerar DDL).
  2. Aplicar `schema_postgres.sql` no projeto Supabase (SQL Editor do
     painel do Supabase, ou `psql`) — este script SÓ insere dados, não
     cria tabelas.
  3. Instalar a dependência exclusiva deste script:
         pip install -r scripts/supabase_migration/requirements.txt
  4. Definir a variável de ambiente SUPABASE_DB_URL com a connection
     string do Postgres (formato `postgresql://usuario:senha@host:porta/banco`
     — no painel do Supabase: Project Settings > Database > Connection
     string > URI). NUNCA coloque essa string no código-fonte.

Uso:
    export SUPABASE_DB_URL="postgresql://...."
    python scripts/supabase_migration/3_migrar_dados.py \
        [--sqlite data/seed_gat_tecnoplano.db] [--somente-tabela prestadores] [--dry-run]

`--dry-run` faz tudo (conecta, lê o SQLite, monta os INSERTs) menos
efetivamente gravar no Postgres — útil para validar a conexão e a
contagem esperada antes de tocar em dados de verdade.
`--somente-tabela` migra uma única tabela por vez, para conferir passo a
passo em vez de tudo de uma vez.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    psycopg2 = None


def _ordem_tabelas(schema: list[dict]) -> list[str]:
    """Mesma ordenação por dependência de FK do gerador de DDL — insere
    primeiro quem não depende de ninguém, para nunca violar uma FK."""
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


def migrar_tabela(
    con_sqlite: sqlite3.Connection, con_pg, nome_tabela: str, colunas: list[str], dry_run: bool,
) -> tuple[int, int]:
    """Retorna (linhas_lidas_sqlite, linhas_inseridas_postgres)."""
    linhas = con_sqlite.execute(f'SELECT {", ".join(colunas)} FROM "{nome_tabela}"').fetchall()
    if not linhas:
        return 0, 0
    if dry_run:
        return len(linhas), 0

    marcadores = ", ".join(["%s"] * len(colunas))
    colunas_sql = ", ".join(f'"{c}"' for c in colunas)
    with con_pg.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            f'INSERT INTO "{nome_tabela}" ({colunas_sql}) VALUES ({marcadores})',
            [tuple(linha) for linha in linhas],
            page_size=500,
        )
    con_pg.commit()
    return len(linhas), len(linhas)


def contar_linhas_postgres(con_pg, nome_tabela: str) -> int:
    with con_pg.cursor() as cur:
        cur.execute(f'SELECT COUNT(*) FROM "{nome_tabela}"')
        return cur.fetchone()[0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sqlite", default="data/seed_gat_tecnoplano.db")
    parser.add_argument("--schema-json", default="scripts/supabase_migration/schema_atual.json")
    parser.add_argument("--somente-tabela", default=None, help="Migra só esta tabela, para conferir aos poucos.")
    parser.add_argument("--dry-run", action="store_true", help="Não grava nada no Postgres, só simula e reporta.")
    args = parser.parse_args()

    if psycopg2 is None:
        raise SystemExit(
            "psycopg2 não instalado. Rode: pip install -r scripts/supabase_migration/requirements.txt"
        )

    url_postgres = os.environ.get("SUPABASE_DB_URL")
    if not url_postgres and not args.dry_run:
        raise SystemExit(
            "Defina a variável de ambiente SUPABASE_DB_URL com a connection string do Supabase "
            "(Project Settings > Database > Connection string > URI) antes de rodar sem --dry-run."
        )

    caminho_schema = Path(args.schema_json)
    if not caminho_schema.exists():
        raise SystemExit(f"{caminho_schema} não encontrado — rode antes o passo 1 (radiografia).")
    schema = json.loads(caminho_schema.read_text(encoding="utf-8"))

    con_sqlite = sqlite3.connect(args.sqlite)
    con_pg = None if (args.dry_run or not url_postgres) else psycopg2.connect(url_postgres)

    try:
        ordem = _ordem_tabelas(schema)
        if args.somente_tabela:
            if args.somente_tabela not in ordem:
                raise SystemExit(f"Tabela desconhecida: {args.somente_tabela}")
            ordem = [args.somente_tabela]

        por_nome = {t["nome"]: t for t in schema}
        resultado: list[dict] = []
        print(f"{'[DRY-RUN] ' if args.dry_run else ''}Migrando {len(ordem)} tabela(s)...\n")

        for nome in ordem:
            colunas = [c["nome"] for c in por_nome[nome]["colunas"]]
            lidas, inseridas = migrar_tabela(con_sqlite, con_pg, nome, colunas, args.dry_run)
            contagem_pg = contar_linhas_postgres(con_pg, nome) if con_pg else inseridas
            bateu = args.dry_run or (contagem_pg == lidas)
            resultado.append({
                "tabela": nome, "linhas_sqlite": lidas, "linhas_postgres": contagem_pg, "bateu": bateu,
            })
            marca = "OK" if bateu else "DIVERGIU"
            print(f"  [{marca}] {nome}: sqlite={lidas} postgres={contagem_pg}")

        print("\nResumo:")
        total_sqlite = sum(r["linhas_sqlite"] for r in resultado)
        total_pg = sum(r["linhas_postgres"] for r in resultado)
        divergentes = [r["tabela"] for r in resultado if not r["bateu"]]
        print(f"  Total de linhas — SQLite: {total_sqlite} · Postgres: {total_pg}")
        if divergentes:
            print(f"  ATENÇÃO — tabelas com contagem divergente: {', '.join(divergentes)}")
            sys.exit(1)
        elif not args.dry_run:
            print("  Todas as contagens bateram — migração validada.")
    finally:
        con_sqlite.close()
        if con_pg:
            con_pg.close()


if __name__ == "__main__":
    main()
