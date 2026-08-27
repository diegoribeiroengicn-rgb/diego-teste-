"""
Camada de conexão com o banco de dados — ponto único para trocar o driver
(SQLite hoje, Postgres/Supabase futuramente) sem precisar caçar cada
`sqlite3.connect(DB_PATH)` espalhado pelos módulos `*_database.py`.

Controlado pela variável de ambiente `GAT_DB_BACKEND`:
    (não definida) ou "sqlite"  -> comportamento IDÊNTICO ao de sempre,
                                    sqlite3 puro, sem nenhuma mudança de
                                    risco para quem não mexeu em nada.
    "postgres"                  -> abre uma conexão psycopg2 usando
                                    `SUPABASE_DB_URL` (ou `GAT_DB_URL`) e
                                    devolve um adaptador (`_ConexaoPostgres`)
                                    que aceita as MESMAS chamadas que o
                                    código já faz contra sqlite3 hoje:
                                    `conn.execute(sql_com_?, params)` e
                                    `linha["campo"]` no resultado.

IMPORTANTE — o que esta camada resolve e o que NÃO resolve:
    Resolve: o PONTO de conexão fica único (este arquivo), e o `?` dos
    placeholders + o acesso por nome de coluna (`row["campo"]`) — os dois
    padrões usados em praticamente toda consulta de `gat/*.py` — funcionam
    sem alteração nos dois backends.

    NÃO resolve sozinho: um punhado de comandos SQLite-específicos usados
    pontualmente em `gat/database.py` (`INSERT OR REPLACE`, `PRAGMA
    table_info`/`foreign_key_list` nas rotinas de migração de schema,
    `cursor.lastrowid` logo após um INSERT) não têm equivalente idêntico
    em Postgres e ainda precisam ser revistos um a um, com um Supabase de
    teste real na mão, antes de virar a chave para "postgres" em produção.
    `lastrowid` já tem um shim abaixo (via `RETURNING id`, assumindo que a
    tabela tem uma PK chamada `id` — verdade para todas as 45 tabelas do
    schema atual); os outros dois pontos (`INSERT OR REPLACE` e as
    `PRAGMA`) aparecem em poucas funções, listadas no checklist da
    migração (`scripts/supabase_migration/CHECKLIST.md`).
"""

from __future__ import annotations

import os
import re
import sqlite3
from typing import Any, Iterator

_RE_INSERT_TABELA = re.compile(r"INSERT\s+INTO\s+\"?(\w+)\"?", re.IGNORECASE)


def backend_ativo() -> str:
    """'sqlite' (padrão) ou 'postgres', conforme GAT_DB_BACKEND."""
    return (os.environ.get("GAT_DB_BACKEND") or "sqlite").strip().lower()


class _CursorPostgres:
    """Encapsula um cursor psycopg2 para aceitar `?` como placeholder
    (padrão sqlite3, usado em toda consulta existente) e devolver linhas
    com acesso por nome de coluna — dict-like, como `sqlite3.Row`."""

    def __init__(self, cursor: Any) -> None:
        self._cursor = cursor
        self.lastrowid: int | None = None

    def execute(self, sql: str, params: tuple | list = ()) -> "_CursorPostgres":
        sql_pg = sql.replace("?", "%s")
        tabela_insert = _RE_INSERT_TABELA.match(sql.strip())
        if tabela_insert and "returning" not in sql_pg.lower():
            sql_pg = sql_pg.rstrip().rstrip(";") + " RETURNING id"
            self._cursor.execute(sql_pg, tuple(params))
            linha = self._cursor.fetchone()
            self.lastrowid = linha["id"] if linha else None
        else:
            self._cursor.execute(sql_pg, tuple(params))
        return self

    def fetchone(self):
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()

    def __getattr__(self, nome: str) -> Any:
        return getattr(self._cursor, nome)


class _ConexaoPostgres:
    """Encapsula uma conexão psycopg2 para expor a mesma API mínima que o
    código já usa contra sqlite3.Connection: `.execute()`, `.commit()`,
    `.close()`, `.cursor()`, e a propriedade `.total_changes` (aqui sempre
    1 após qualquer execute — psycopg2 não conta linhas alteradas
    acumuladas como sqlite3; o valor exato não importa para o único uso
    real, que é só `> 0` para decidir se roda a sincronização de
    persistência local — irrelevante em Postgres, ver `gat.db_backend.conectar`)."""

    def __init__(self, conexao_psycopg2: Any) -> None:
        self._conn = conexao_psycopg2
        self.total_changes = 0

    def execute(self, sql: str, params: tuple | list = ()) -> _CursorPostgres:
        cursor = _CursorPostgres(self._conn.cursor())
        cursor.execute(sql, params)
        self.total_changes += 1
        return cursor

    def cursor(self) -> _CursorPostgres:
        return _CursorPostgres(self._conn.cursor())

    def commit(self) -> None:
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()


def _conectar_postgres() -> _ConexaoPostgres:
    import psycopg2
    import psycopg2.extras

    url = os.environ.get("SUPABASE_DB_URL") or os.environ.get("GAT_DB_URL")
    if not url:
        raise RuntimeError(
            "GAT_DB_BACKEND=postgres exige a variável de ambiente SUPABASE_DB_URL "
            "(ou GAT_DB_URL) com a connection string do Supabase."
        )
    conn = psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)
    return _ConexaoPostgres(conn)


def conectar_bruto(db_path) -> sqlite3.Connection | _ConexaoPostgres:
    """Abre a conexão crua (sem os hooks de pós-gravação de
    `gat.database._conectar`) no backend ativo — usada pelos módulos que
    só precisam de uma conexão simples."""
    if backend_ativo() == "postgres":
        return _conectar_postgres()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn
