"""
Passo 2 da migração SQLite -> Supabase (PostgreSQL): gera o DDL
equivalente em PostgreSQL a partir da radiografia produzida pelo passo 1
(`schema_atual.json`). NÃO se conecta a nenhum banco — só lê o JSON e
escreve um arquivo `.sql` local.

Uso:
    python scripts/supabase_migration/1_radiografia_schema.py   # gera schema_atual.json antes
    python scripts/supabase_migration/2_gerar_ddl_postgres.py \
        [--entrada scripts/supabase_migration/schema_atual.json] \
        [--saida scripts/supabase_migration/schema_postgres.sql]

Mantém EXATAMENTE os mesmos nomes de tabela e coluna do SQLite (para não
quebrar nenhuma consulta em gat/*.py, que referencia esses nomes
diretamente) — só o tipo de dado, a sintaxe de PK/FK/índice e o
autoincremento mudam para o equivalente em Postgres.

Mapeamento de tipos (conservador — preserva o comportamento atual em vez
de "melhorar" tipagem, para minimizar risco de regressão):
    INTEGER (é a PK)         -> BIGSERIAL / GENERATED ALWAYS AS IDENTITY (ver --identity)
    INTEGER (não é a PK)     -> BIGINT     (cobre os "booleanos" 0/1 já usados no código;
                                             não convertemos para BOOLEAN para não exigir
                                             mudança nas dezenas de sites que comparam com 0/1)
    REAL                     -> DOUBLE PRECISION
    TEXT / (sem tipo)        -> TEXT       (datas continuam TEXT ISO 8601, como hoje —
                                             o código formata a data na camada de exibição,
                                             não no banco; migrar para TIMESTAMP mudaria
                                             comportamento de parsing em todo o sistema)
    BLOB                     -> BYTEA
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

_MAPA_TIPOS = {
    "INTEGER": "BIGINT",
    "INT": "BIGINT",
    "REAL": "DOUBLE PRECISION",
    "FLOAT": "DOUBLE PRECISION",
    "NUMERIC": "NUMERIC",
    "BLOB": "BYTEA",
    "": "TEXT",
    "TEXT": "TEXT",
}


def _tipo_postgres(tipo_sqlite: str) -> str:
    return _MAPA_TIPOS.get((tipo_sqlite or "").upper(), "TEXT")


def _identificador(nome: str) -> str:
    """Todo nome vem em snake_case sem caracteres especiais neste projeto —
    ainda assim, entre aspas duplas por segurança (preserva caixa exata e
    evita colisão com palavras reservadas do Postgres, ex.: `usuarios` OK,
    mas nomes como `left`/`order` em bases de terceiros não seriam)."""
    return f'"{nome}"'


def gerar_ddl_tabela(tabela: dict, usar_identity: bool) -> str:
    nome = tabela["nome"]
    pk = tabela["chave_primaria"]
    pk_unica_inteira = (
        len(pk) == 1
        and next((c for c in tabela["colunas"] if c["nome"] == pk[0]), {}).get("tipo_sqlite", "").upper() in ("INTEGER", "INT")
    )

    linhas_colunas = []
    for c in tabela["colunas"]:
        nome_col = _identificador(c["nome"])
        if pk_unica_inteira and c["nome"] == pk[0]:
            tipo = "GENERATED ALWAYS AS IDENTITY" if usar_identity else "BIGSERIAL"
            linhas_colunas.append(f"    {nome_col} BIGINT {tipo} PRIMARY KEY" if usar_identity else f"    {nome_col} {tipo} PRIMARY KEY")
            continue
        tipo = _tipo_postgres(c["tipo_sqlite"])
        partes = [f"    {nome_col} {tipo}"]
        if c["obrigatoria"]:
            partes.append("NOT NULL")
        if c["valor_padrao"] is not None:
            partes.append(f"DEFAULT {c['valor_padrao']}")
        linhas_colunas.append(" ".join(partes))

    if not pk_unica_inteira and pk:
        colunas_pk = ", ".join(_identificador(c) for c in pk)
        linhas_colunas.append(f"    PRIMARY KEY ({colunas_pk})")

    for fk in tabela["chaves_estrangeiras"]:
        acao_delete = f" ON DELETE {fk['on_delete']}" if fk["on_delete"] and fk["on_delete"] != "NO ACTION" else ""
        acao_update = f" ON UPDATE {fk['on_update']}" if fk["on_update"] and fk["on_update"] != "NO ACTION" else ""
        linhas_colunas.append(
            f"    FOREIGN KEY ({_identificador(fk['coluna'])}) "
            f"REFERENCES {_identificador(fk['tabela_referenciada'])} ({_identificador(fk['coluna_referenciada'])})"
            f"{acao_delete}{acao_update}"
        )

    corpo = ",\n".join(linhas_colunas)
    ddl = f"CREATE TABLE {_identificador(nome)} (\n{corpo}\n);"

    for idx in tabela["indices"]:
        unico = "UNIQUE " if idx["unico"] else ""
        colunas_idx = ", ".join(_identificador(c) for c in idx["colunas"])
        ddl += f'\nCREATE {unico}INDEX {_identificador(idx["nome"])} ON {_identificador(nome)} ({colunas_idx});'

    return ddl


def gerar_ddl_completo(tabelas: list[dict], usar_identity: bool) -> str:
    """
    Ordena as tabelas para que uma tabela só seja criada depois de todas as
    que ela referencia via FK (evita erro "relation does not exist" ao
    aplicar o script em ordem, do topo para baixo, num banco vazio).
    Ciclos (não deveriam existir neste schema) caem no fallback: ordem
    alfabética simples ao final.
    """
    por_nome = {t["nome"]: t for t in tabelas}
    resolvidas: list[str] = []
    pendentes = set(por_nome.keys())

    while pendentes:
        avancou = False
        for nome in sorted(pendentes):
            deps = {fk["tabela_referenciada"] for fk in por_nome[nome]["chaves_estrangeiras"]}
            if deps <= set(resolvidas) or nome in deps:  # auto-referência não bloqueia
                resolvidas.append(nome)
                pendentes.discard(nome)
                avancou = True
        if not avancou:  # ciclo ou dependência externa desconhecida — não deveria ocorrer aqui
            resolvidas.extend(sorted(pendentes))
            break

    blocos = [
        "-- DDL PostgreSQL gerado automaticamente a partir do schema SQLite do GAT 2026.",
        "-- Gerado por scripts/supabase_migration/2_gerar_ddl_postgres.py — revisar antes de aplicar.",
        "-- Nomes de tabela/coluna preservados EXATAMENTE como no SQLite.",
        "",
    ]
    for nome in resolvidas:
        blocos.append(gerar_ddl_tabela(por_nome[nome], usar_identity))
        blocos.append("")
    return "\n".join(blocos)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--entrada", default="scripts/supabase_migration/schema_atual.json")
    parser.add_argument("--saida", default="scripts/supabase_migration/schema_postgres.sql")
    parser.add_argument(
        "--identity", action="store_true",
        help="Usa 'GENERATED ALWAYS AS IDENTITY' (padrão SQL moderno) em vez de BIGSERIAL para as PKs autoincrementais.",
    )
    args = parser.parse_args()

    caminho_entrada = Path(args.entrada)
    if not caminho_entrada.exists():
        raise SystemExit(f"{caminho_entrada} não encontrado — rode antes o passo 1 (radiografia).")

    tabelas = json.loads(caminho_entrada.read_text(encoding="utf-8"))
    ddl = gerar_ddl_completo(tabelas, usar_identity=args.identity)
    Path(args.saida).write_text(ddl, encoding="utf-8")
    print(f"DDL gerado para {len(tabelas)} tabelas -> {args.saida}")


if __name__ == "__main__":
    main()
