"""
Passo 1 da migração SQLite -> Supabase (PostgreSQL): radiografia do schema
atual. NÃO grava nada, NÃO se conecta a nenhum banco além do SQLite local
de leitura — só introspecta e gera um relatório.

Uso:
    python scripts/supabase_migration/1_radiografia_schema.py \
        [--db data/seed_gat_tecnoplano.db] [--saida scripts/supabase_migration/schema_atual.json]

Gera dois arquivos (por padrão dentro de scripts/supabase_migration/):
    schema_atual.json   -- estrutura completa (tabelas, colunas, tipos,
                            PK, FK, índices, contagem de linhas) para uso
                            programático pelos próximos passos.
    schema_atual.md      -- o mesmo conteúdo, em formato legível, para
                            revisão humana antes de prosseguir.

A introspecção usa `sqlite_master`/`PRAGMA` sobre o banco de dados REAL
(não o código-fonte) — reflete fielmente o schema em produção, incluindo
qualquer coluna adicionada via ALTER TABLE ao longo das migrações
(gat/database.py aplica migrações aditivas e idempotentes desde a v1).
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from dataclasses import asdict, dataclass, field
from pathlib import Path


@dataclass
class ColunaInfo:
    nome: str
    tipo_sqlite: str
    obrigatoria: bool
    valor_padrao: str | None
    parte_da_pk: bool


@dataclass
class FkInfo:
    coluna: str
    tabela_referenciada: str
    coluna_referenciada: str
    on_delete: str
    on_update: str


@dataclass
class IndiceInfo:
    nome: str
    colunas: list[str]
    unico: bool


@dataclass
class TabelaInfo:
    nome: str
    ddl_original: str
    colunas: list[ColunaInfo] = field(default_factory=list)
    chave_primaria: list[str] = field(default_factory=list)
    chaves_estrangeiras: list[FkInfo] = field(default_factory=list)
    indices: list[IndiceInfo] = field(default_factory=list)
    total_linhas: int = 0


def radiografar(caminho_db: Path) -> list[TabelaInfo]:
    con = sqlite3.connect(str(caminho_db))
    con.row_factory = sqlite3.Row
    try:
        nomes_tabelas = [
            r["name"] for r in con.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            ).fetchall()
        ]

        tabelas: list[TabelaInfo] = []
        for nome in nomes_tabelas:
            ddl_original = con.execute(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name = ?", (nome,)
            ).fetchone()["sql"]

            colunas: list[ColunaInfo] = []
            pk: list[str] = []
            for c in con.execute(f'PRAGMA table_info("{nome}")').fetchall():
                colunas.append(ColunaInfo(
                    nome=c["name"], tipo_sqlite=(c["type"] or "").upper(),
                    obrigatoria=bool(c["notnull"]), valor_padrao=c["dflt_value"],
                    parte_da_pk=bool(c["pk"]),
                ))
                if c["pk"]:
                    pk.append(c["name"])

            fks: list[FkInfo] = []
            for f in con.execute(f'PRAGMA foreign_key_list("{nome}")').fetchall():
                fks.append(FkInfo(
                    coluna=f["from"], tabela_referenciada=f["table"], coluna_referenciada=f["to"] or "id",
                    on_delete=f["on_delete"], on_update=f["on_update"],
                ))

            indices: list[IndiceInfo] = []
            for idx in con.execute(f'PRAGMA index_list("{nome}")').fetchall():
                if idx["origin"] == "pk":
                    continue  # já coberto pela chave primária
                colunas_idx = [
                    r["name"] for r in con.execute(f'PRAGMA index_info("{idx["name"]}")').fetchall()
                ]
                indices.append(IndiceInfo(nome=idx["name"], colunas=colunas_idx, unico=bool(idx["unique"])))

            total_linhas = con.execute(f'SELECT COUNT(*) AS n FROM "{nome}"').fetchone()["n"]

            tabelas.append(TabelaInfo(
                nome=nome, ddl_original=ddl_original, colunas=colunas,
                chave_primaria=pk, chaves_estrangeiras=fks, indices=indices, total_linhas=total_linhas,
            ))
        return tabelas
    finally:
        con.close()


def escrever_json(tabelas: list[TabelaInfo], caminho: Path) -> None:
    dados = [asdict(t) for t in tabelas]
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")


def escrever_markdown(tabelas: list[TabelaInfo], caminho: Path) -> None:
    linhas = [
        "# Radiografia do schema — GAT 2026 (SQLite)",
        "",
        f"Total de tabelas: **{len(tabelas)}** · Total de linhas: **{sum(t.total_linhas for t in tabelas)}**",
        "",
    ]
    for t in sorted(tabelas, key=lambda x: -x.total_linhas):
        linhas.append(f"## `{t.nome}` ({t.total_linhas} linha(s))")
        linhas.append("")
        linhas.append("| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |")
        linhas.append("|---|---|---|---|---|")
        for c in t.colunas:
            linhas.append(
                f"| `{c.nome}` | {c.tipo_sqlite or '(sem tipo)'} | {'sim' if c.obrigatoria else 'não'} "
                f"| {c.valor_padrao or '—'} | {'sim' if c.parte_da_pk else ''} |"
            )
        if t.chaves_estrangeiras:
            linhas.append("")
            linhas.append("**Chaves estrangeiras:**")
            for fk in t.chaves_estrangeiras:
                linhas.append(f"- `{fk.coluna}` → `{fk.tabela_referenciada}.{fk.coluna_referenciada}`")
        if t.indices:
            linhas.append("")
            linhas.append("**Índices:**")
            for idx in t.indices:
                linhas.append(f"- `{idx.nome}` {'(único) ' if idx.unico else ''}em ({', '.join(idx.colunas)})")
        linhas.append("")
    caminho.write_text("\n".join(linhas), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="data/seed_gat_tecnoplano.db")
    parser.add_argument("--saida", default="scripts/supabase_migration/schema_atual")
    args = parser.parse_args()

    caminho_db = Path(args.db)
    if not caminho_db.exists():
        raise SystemExit(f"Banco não encontrado: {caminho_db}")

    tabelas = radiografar(caminho_db)
    escrever_json(tabelas, Path(f"{args.saida}.json"))
    escrever_markdown(tabelas, Path(f"{args.saida}.md"))
    print(f"Radiografia concluída: {len(tabelas)} tabelas, {sum(t.total_linhas for t in tabelas)} linhas.")
    print(f"  -> {args.saida}.json")
    print(f"  -> {args.saida}.md")


if __name__ == "__main__":
    main()
