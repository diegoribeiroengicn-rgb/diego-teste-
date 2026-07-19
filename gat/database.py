"""
Camada de acesso ao banco de dados SQLite do Sistema GAT 2026.

Responsável por:
* Criar e manter o esquema do banco `gat_tecnoplano.db`;
* Persistir cadastros e edições das abas de Prestadores e Cessionários;
* Registrar o histórico de todas as edições (governança/auditoria);
* Gerenciar usuários e credenciais (senhas com hash `bcrypt`).
"""

from __future__ import annotations

import shutil
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Iterator

import bcrypt
import pandas as pd

from gat.config import DB_PATH, PERFIL_ADMIN, SEED_DB_PATH

# ---------------------------------------------------------------------------
# Conexão
# ---------------------------------------------------------------------------


@contextmanager
def _conectar() -> Iterator[sqlite3.Connection]:
    """Abre uma conexão SQLite com row_factory configurado, fechando ao final."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# Colunas editáveis de cada tabela de projeto (usadas no cadastro/edição e
# no cálculo de diffs para o histórico de auditoria).
COLUNAS_PRESTADORES = [
    "item", "codigo", "prestador", "disciplina", "disciplina_sla", "peps",
    "obra_referencia", "revisao", "num_documentos", "data_solicitacao",
    "data_limite", "data_analise", "hold_inicio", "hold_fim", "num_at",
    "revisao_at", "responsavel", "status_analise", "observacoes",
    "natureza_revisao", "num_erros", "etg",
]

COLUNAS_CESSIONARIOS = [
    "item", "codigo", "cessionario", "disciplina", "disciplina_sla",
    "revisao", "num_documentos", "data_solicitacao", "tipo", "sla_dias",
    "data_limite", "data_analise", "hold_inicio", "hold_fim", "num_at",
    "revisao_at", "responsavel", "status_analise", "observacoes",
    "natureza_revisao", "num_erros", "etg", "pep",
]

COLUNAS_AVALIACOES = [
    "codigo_prestador", "nome_prestador", "data_avaliacao", "nome_projeto",
    "at_referencia", "nota", "analista_responsavel", "observacoes",
]


# ---------------------------------------------------------------------------
# Inicialização do esquema
# ---------------------------------------------------------------------------


# Limiares padrão (em dias) de criticidade para projetos sem PEP.
# Ficam armazenados na tabela `configuracoes` (parametrizável via
# Administração), não fixos no código — estes valores são apenas a
# semente inicial usada na primeira execução do sistema.
CONFIGURACOES_PADRAO = {
    "pep_dias_atencao": "3",
    "pep_dias_critico": "6",
}


def _garantir_coluna(conn: sqlite3.Connection, tabela: str, coluna: str, definicao_tipo: str) -> None:
    """Adiciona `coluna` à `tabela` caso ainda não exista (migração idempotente)."""
    colunas_existentes = {linha[1] for linha in conn.execute(f"PRAGMA table_info({tabela})").fetchall()}
    if coluna not in colunas_existentes:
        conn.execute(f"ALTER TABLE {tabela} ADD COLUMN {coluna} {definicao_tipo}")


def _semear_configuracoes_padrao(conn: sqlite3.Connection) -> None:
    for chave, valor in CONFIGURACOES_PADRAO.items():
        conn.execute("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES (?, ?)", (chave, valor))


def _restaurar_semente_se_necessario() -> None:
    """
    Em uma implantação nova (banco de dados ainda inexistente), restaura o
    banco de sementes versionado no repositório — contendo todo o histórico
    real importado da planilha Controle_GAT_Projetos_2026.xlsm — para que a
    aplicação já nasça povoada. Não sobrescreve um banco já existente.
    """
    if not DB_PATH.exists() and SEED_DB_PATH.exists():
        shutil.copy(SEED_DB_PATH, DB_PATH)


def init_db() -> None:
    """Cria as tabelas do sistema (caso não existam) e semeia o usuário admin padrão."""
    _restaurar_semente_se_necessario()
    with _conectar() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                senha_hash TEXT NOT NULL,
                nome_completo TEXT,
                perfil TEXT NOT NULL DEFAULT 'ANALISTA',
                ativo INTEGER NOT NULL DEFAULT 1,
                criado_em TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS prestadores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item INTEGER,
                codigo TEXT,
                prestador TEXT NOT NULL,
                disciplina TEXT,
                disciplina_sla TEXT,
                peps TEXT,
                obra_referencia TEXT,
                revisao INTEGER NOT NULL DEFAULT 0,
                num_documentos INTEGER NOT NULL DEFAULT 0,
                data_solicitacao TEXT NOT NULL,
                data_limite TEXT,
                data_analise TEXT,
                hold_inicio TEXT,
                hold_fim TEXT,
                num_at TEXT,
                revisao_at INTEGER,
                responsavel TEXT,
                status_analise TEXT NOT NULL DEFAULT 'EM ANÁLISE',
                observacoes TEXT,
                natureza_revisao TEXT,
                num_erros INTEGER,
                etg TEXT NOT NULL DEFAULT 'NÃO',
                criado_em TEXT NOT NULL,
                criado_por TEXT,
                atualizado_em TEXT,
                atualizado_por TEXT
            );

            CREATE TABLE IF NOT EXISTS cessionarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item INTEGER,
                codigo TEXT,
                cessionario TEXT NOT NULL,
                disciplina TEXT,
                disciplina_sla TEXT,
                revisao INTEGER NOT NULL DEFAULT 0,
                num_documentos INTEGER NOT NULL DEFAULT 0,
                data_solicitacao TEXT NOT NULL,
                tipo TEXT,
                sla_dias INTEGER,
                data_limite TEXT,
                data_analise TEXT,
                hold_inicio TEXT,
                hold_fim TEXT,
                num_at TEXT,
                revisao_at INTEGER,
                responsavel TEXT,
                status_analise TEXT NOT NULL DEFAULT 'EM ANÁLISE',
                observacoes TEXT,
                natureza_revisao TEXT,
                num_erros INTEGER,
                etg TEXT NOT NULL DEFAULT 'NÃO',
                pep TEXT,
                criado_em TEXT NOT NULL,
                criado_por TEXT,
                atualizado_em TEXT,
                atualizado_por TEXT
            );

            CREATE TABLE IF NOT EXISTS configuracoes (
                chave TEXT PRIMARY KEY,
                valor TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS avaliacoes_prestadores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo_prestador TEXT,
                nome_prestador TEXT NOT NULL,
                data_avaliacao TEXT NOT NULL,
                nome_projeto TEXT,
                at_referencia TEXT,
                nota INTEGER NOT NULL,
                analista_responsavel TEXT,
                observacoes TEXT,
                criado_em TEXT NOT NULL,
                criado_por TEXT
            );

            CREATE TABLE IF NOT EXISTS historico_edicoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tabela TEXT NOT NULL,
                registro_id INTEGER NOT NULL,
                campo TEXT NOT NULL,
                valor_anterior TEXT,
                valor_novo TEXT,
                usuario TEXT,
                data_hora TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reunioes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo TEXT NOT NULL,
                pauta TEXT,
                data_prevista TEXT,
                data_realizada TEXT,
                ata TEXT,
                decisoes TEXT,
                criado_em TEXT NOT NULL,
                criado_por TEXT,
                atualizado_em TEXT,
                atualizado_por TEXT
            );

            CREATE TABLE IF NOT EXISTS reuniao_projetos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reuniao_id INTEGER NOT NULL REFERENCES reunioes(id) ON DELETE CASCADE,
                modulo TEXT NOT NULL,
                projeto_id INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reuniao_participantes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reuniao_id INTEGER NOT NULL REFERENCES reunioes(id) ON DELETE CASCADE,
                nome TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS planos_acao (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reuniao_id INTEGER REFERENCES reunioes(id) ON DELETE SET NULL,
                descricao TEXT NOT NULL,
                responsavel TEXT,
                prazo TEXT,
                status TEXT NOT NULL DEFAULT 'PENDENTE',
                criado_em TEXT NOT NULL,
                criado_por TEXT,
                concluido_em TEXT,
                concluido_por TEXT
            );
            """
        )

        # Migração idempotente: adiciona colunas novas a bancos criados por
        # versões anteriores do esquema, sem afetar os dados já existentes.
        _garantir_coluna(conn, "prestadores", "natureza_revisao", "TEXT")
        _garantir_coluna(conn, "prestadores", "num_erros", "INTEGER")
        _garantir_coluna(conn, "prestadores", "etg", "TEXT NOT NULL DEFAULT 'NÃO'")
        _garantir_coluna(conn, "cessionarios", "natureza_revisao", "TEXT")
        _garantir_coluna(conn, "cessionarios", "num_erros", "INTEGER")
        _garantir_coluna(conn, "cessionarios", "etg", "TEXT NOT NULL DEFAULT 'NÃO'")
        _garantir_coluna(conn, "cessionarios", "pep", "TEXT")

        total_usuarios = conn.execute("SELECT COUNT(*) AS n FROM usuarios").fetchone()["n"]
        if total_usuarios == 0:
            senha_hash = bcrypt.hashpw("Tecnoplano@2026".encode(), bcrypt.gensalt()).decode()
            conn.execute(
                "INSERT INTO usuarios (username, senha_hash, nome_completo, perfil, ativo, criado_em) "
                "VALUES (?, ?, ?, ?, 1, ?)",
                ("admin", senha_hash, "Administrador GAT", PERFIL_ADMIN, datetime.now().isoformat()),
            )

        _semear_configuracoes_padrao(conn)


# ---------------------------------------------------------------------------
# Usuários
# ---------------------------------------------------------------------------


def buscar_usuario(username: str) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute(
            "SELECT * FROM usuarios WHERE username = ? AND ativo = 1", (username,)
        ).fetchone()
        return dict(linha) if linha else None


def criar_usuario(username: str, senha: str, nome_completo: str, perfil: str) -> None:
    senha_hash = bcrypt.hashpw(senha.encode(), bcrypt.gensalt()).decode()
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO usuarios (username, senha_hash, nome_completo, perfil, ativo, criado_em) "
            "VALUES (?, ?, ?, ?, 1, ?)",
            (username, senha_hash, nome_completo, perfil, datetime.now().isoformat()),
        )


def listar_usuarios() -> pd.DataFrame:
    with _conectar() as conn:
        return pd.read_sql_query(
            "SELECT id, username, nome_completo, perfil, ativo, criado_em FROM usuarios ORDER BY username", conn
        )


def alterar_senha(username: str, nova_senha: str) -> None:
    senha_hash = bcrypt.hashpw(nova_senha.encode(), bcrypt.gensalt()).decode()
    with _conectar() as conn:
        conn.execute("UPDATE usuarios SET senha_hash = ? WHERE username = ?", (senha_hash, username))


def desativar_usuario(username: str) -> None:
    with _conectar() as conn:
        conn.execute("UPDATE usuarios SET ativo = 0 WHERE username = ?", (username,))


# ---------------------------------------------------------------------------
# Histórico / auditoria
# ---------------------------------------------------------------------------


def _registrar_historico(conn: sqlite3.Connection, tabela: str, registro_id: int, antigo: dict, novo: dict, usuario: str) -> None:
    """Compara os dicionários antigo/novo e grava uma linha de histórico por campo alterado."""
    agora = datetime.now().isoformat()
    for campo, valor_novo in novo.items():
        valor_antigo = antigo.get(campo) if antigo else None
        if str(valor_antigo) != str(valor_novo):
            conn.execute(
                "INSERT INTO historico_edicoes (tabela, registro_id, campo, valor_anterior, valor_novo, usuario, data_hora) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (tabela, registro_id, campo, str(valor_antigo) if valor_antigo is not None else None, str(valor_novo) if valor_novo is not None else None, usuario, agora),
            )


def listar_historico(tabela: str | None = None, registro_id: int | None = None) -> pd.DataFrame:
    query = "SELECT * FROM historico_edicoes WHERE 1=1"
    params: list[Any] = []
    if tabela:
        query += " AND tabela = ?"
        params.append(tabela)
    if registro_id is not None:
        query += " AND registro_id = ?"
        params.append(registro_id)
    query += " ORDER BY data_hora DESC"
    with _conectar() as conn:
        return pd.read_sql_query(query, conn, params=params)


# ---------------------------------------------------------------------------
# Prestadores (Aba A)
# ---------------------------------------------------------------------------


def inserir_prestador(dados: dict[str, Any], usuario: str) -> int:
    agora = datetime.now().isoformat()
    campos = {c: dados.get(c) for c in COLUNAS_PRESTADORES}
    with _conectar() as conn:
        if not campos.get("item"):
            maior = conn.execute("SELECT COALESCE(MAX(item), 0) AS m FROM prestadores").fetchone()["m"]
            campos["item"] = maior + 1
        cursor = conn.execute(
            f"INSERT INTO prestadores ({', '.join(campos.keys())}, criado_em, criado_por, atualizado_em, atualizado_por) "
            f"VALUES ({', '.join(['?'] * len(campos))}, ?, ?, ?, ?)",
            (*campos.values(), agora, usuario, agora, usuario),
        )
        novo_id = cursor.lastrowid
        _registrar_historico(conn, "prestadores", novo_id, {}, campos, usuario)
        return novo_id


def atualizar_prestador(registro_id: int, dados: dict[str, Any], usuario: str) -> None:
    with _conectar() as conn:
        antigo = conn.execute("SELECT * FROM prestadores WHERE id = ?", (registro_id,)).fetchone()
        antigo_dict = dict(antigo) if antigo else {}
        campos = {c: dados.get(c) for c in COLUNAS_PRESTADORES}
        agora = datetime.now().isoformat()
        set_clause = ", ".join(f"{c} = ?" for c in campos)
        conn.execute(
            f"UPDATE prestadores SET {set_clause}, atualizado_em = ?, atualizado_por = ? WHERE id = ?",
            (*campos.values(), agora, usuario, registro_id),
        )
        _registrar_historico(conn, "prestadores", registro_id, antigo_dict, campos, usuario)


def excluir_prestador(registro_id: int) -> None:
    with _conectar() as conn:
        conn.execute("DELETE FROM prestadores WHERE id = ?", (registro_id,))


def listar_prestadores() -> pd.DataFrame:
    with _conectar() as conn:
        return pd.read_sql_query("SELECT * FROM prestadores ORDER BY item, id", conn)


def obter_prestador(registro_id: int) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM prestadores WHERE id = ?", (registro_id,)).fetchone()
        return dict(linha) if linha else None


# ---------------------------------------------------------------------------
# Cessionários (Aba B)
# ---------------------------------------------------------------------------


def inserir_cessionario(dados: dict[str, Any], usuario: str) -> int:
    agora = datetime.now().isoformat()
    campos = {c: dados.get(c) for c in COLUNAS_CESSIONARIOS}
    with _conectar() as conn:
        if not campos.get("item"):
            maior = conn.execute("SELECT COALESCE(MAX(item), 0) AS m FROM cessionarios").fetchone()["m"]
            campos["item"] = maior + 1
        cursor = conn.execute(
            f"INSERT INTO cessionarios ({', '.join(campos.keys())}, criado_em, criado_por, atualizado_em, atualizado_por) "
            f"VALUES ({', '.join(['?'] * len(campos))}, ?, ?, ?, ?)",
            (*campos.values(), agora, usuario, agora, usuario),
        )
        novo_id = cursor.lastrowid
        _registrar_historico(conn, "cessionarios", novo_id, {}, campos, usuario)
        return novo_id


def atualizar_cessionario(registro_id: int, dados: dict[str, Any], usuario: str) -> None:
    with _conectar() as conn:
        antigo = conn.execute("SELECT * FROM cessionarios WHERE id = ?", (registro_id,)).fetchone()
        antigo_dict = dict(antigo) if antigo else {}
        campos = {c: dados.get(c) for c in COLUNAS_CESSIONARIOS}
        agora = datetime.now().isoformat()
        set_clause = ", ".join(f"{c} = ?" for c in campos)
        conn.execute(
            f"UPDATE cessionarios SET {set_clause}, atualizado_em = ?, atualizado_por = ? WHERE id = ?",
            (*campos.values(), agora, usuario, registro_id),
        )
        _registrar_historico(conn, "cessionarios", registro_id, antigo_dict, campos, usuario)


def excluir_cessionario(registro_id: int) -> None:
    with _conectar() as conn:
        conn.execute("DELETE FROM cessionarios WHERE id = ?", (registro_id,))


def listar_cessionarios() -> pd.DataFrame:
    with _conectar() as conn:
        return pd.read_sql_query("SELECT * FROM cessionarios ORDER BY item, id", conn)


def obter_cessionario(registro_id: int) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM cessionarios WHERE id = ?", (registro_id,)).fetchone()
        return dict(linha) if linha else None


# ---------------------------------------------------------------------------
# Avaliação de Prestadores
# ---------------------------------------------------------------------------


def inserir_avaliacao(dados: dict[str, Any], usuario: str) -> int:
    agora = datetime.now().isoformat()
    campos = {c: dados.get(c) for c in COLUNAS_AVALIACOES}
    with _conectar() as conn:
        cursor = conn.execute(
            f"INSERT INTO avaliacoes_prestadores ({', '.join(campos.keys())}, criado_em, criado_por) "
            f"VALUES ({', '.join(['?'] * len(campos))}, ?, ?)",
            (*campos.values(), agora, usuario),
        )
        return cursor.lastrowid


def atualizar_avaliacao(registro_id: int, dados: dict[str, Any], usuario: str) -> None:
    campos = {c: dados.get(c) for c in COLUNAS_AVALIACOES}
    with _conectar() as conn:
        set_clause = ", ".join(f"{c} = ?" for c in campos)
        conn.execute(
            f"UPDATE avaliacoes_prestadores SET {set_clause} WHERE id = ?",
            (*campos.values(), registro_id),
        )


def listar_avaliacoes() -> pd.DataFrame:
    with _conectar() as conn:
        return pd.read_sql_query("SELECT * FROM avaliacoes_prestadores ORDER BY data_avaliacao DESC, id DESC", conn)


def obter_avaliacao(registro_id: int) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM avaliacoes_prestadores WHERE id = ?", (registro_id,)).fetchone()
        return dict(linha) if linha else None


# ---------------------------------------------------------------------------
# Configurações (limiares parametrizáveis, ex.: criticidade de PEP)
# ---------------------------------------------------------------------------


def obter_configuracao(chave: str, padrao: str | None = None) -> str | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT valor FROM configuracoes WHERE chave = ?", (chave,)).fetchone()
        return linha["valor"] if linha else padrao


def definir_configuracao(chave: str, valor: str) -> None:
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO configuracoes (chave, valor) VALUES (?, ?) "
            "ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
            (chave, valor),
        )


def listar_configuracoes() -> dict[str, str]:
    with _conectar() as conn:
        return {linha["chave"]: linha["valor"] for linha in conn.execute("SELECT chave, valor FROM configuracoes")}


# ---------------------------------------------------------------------------
# Reuniões (Central de Gestão) — relação N:N com projetos de Prestadores/Cessionários
# ---------------------------------------------------------------------------

COLUNAS_REUNIAO = ["titulo", "pauta", "data_prevista", "data_realizada", "ata", "decisoes"]


def _nome_projeto(conn: sqlite3.Connection, modulo: str, projeto_id: int) -> str | None:
    if modulo == "prestadores":
        linha = conn.execute("SELECT prestador AS nome, item FROM prestadores WHERE id = ?", (projeto_id,)).fetchone()
    else:
        linha = conn.execute("SELECT cessionario AS nome, item FROM cessionarios WHERE id = ?", (projeto_id,)).fetchone()
    if not linha:
        return None
    return f"Item {linha['item']} — {linha['nome']}"


def inserir_reuniao(dados: dict[str, Any], projetos: list[tuple[str, int]], participantes: list[str], usuario: str) -> int:
    agora = datetime.now().isoformat()
    campos = {c: dados.get(c) for c in COLUNAS_REUNIAO}
    with _conectar() as conn:
        cursor = conn.execute(
            f"INSERT INTO reunioes ({', '.join(campos.keys())}, criado_em, criado_por, atualizado_em, atualizado_por) "
            f"VALUES ({', '.join(['?'] * len(campos))}, ?, ?, ?, ?)",
            (*campos.values(), agora, usuario, agora, usuario),
        )
        reuniao_id = cursor.lastrowid
        for modulo, projeto_id in projetos:
            conn.execute(
                "INSERT INTO reuniao_projetos (reuniao_id, modulo, projeto_id) VALUES (?, ?, ?)",
                (reuniao_id, modulo, projeto_id),
            )
        for nome in participantes:
            if nome.strip():
                conn.execute(
                    "INSERT INTO reuniao_participantes (reuniao_id, nome) VALUES (?, ?)",
                    (reuniao_id, nome.strip()),
                )
        _registrar_historico(conn, "reunioes", reuniao_id, {}, campos, usuario)
        return reuniao_id


def atualizar_reuniao(reuniao_id: int, dados: dict[str, Any], projetos: list[tuple[str, int]], participantes: list[str], usuario: str) -> None:
    with _conectar() as conn:
        antigo = conn.execute("SELECT * FROM reunioes WHERE id = ?", (reuniao_id,)).fetchone()
        antigo_dict = dict(antigo) if antigo else {}
        campos = {c: dados.get(c) for c in COLUNAS_REUNIAO}
        agora = datetime.now().isoformat()
        set_clause = ", ".join(f"{c} = ?" for c in campos)
        conn.execute(
            f"UPDATE reunioes SET {set_clause}, atualizado_em = ?, atualizado_por = ? WHERE id = ?",
            (*campos.values(), agora, usuario, reuniao_id),
        )
        conn.execute("DELETE FROM reuniao_projetos WHERE reuniao_id = ?", (reuniao_id,))
        for modulo, projeto_id in projetos:
            conn.execute(
                "INSERT INTO reuniao_projetos (reuniao_id, modulo, projeto_id) VALUES (?, ?, ?)",
                (reuniao_id, modulo, projeto_id),
            )
        conn.execute("DELETE FROM reuniao_participantes WHERE reuniao_id = ?", (reuniao_id,))
        for nome in participantes:
            if nome.strip():
                conn.execute(
                    "INSERT INTO reuniao_participantes (reuniao_id, nome) VALUES (?, ?)",
                    (reuniao_id, nome.strip()),
                )
        _registrar_historico(conn, "reunioes", reuniao_id, antigo_dict, campos, usuario)


def excluir_reuniao(reuniao_id: int) -> None:
    with _conectar() as conn:
        conn.execute("DELETE FROM reunioes WHERE id = ?", (reuniao_id,))


def listar_reunioes() -> pd.DataFrame:
    with _conectar() as conn:
        return pd.read_sql_query("SELECT * FROM reunioes ORDER BY COALESCE(data_prevista, criado_em) DESC", conn)


def obter_reuniao(reuniao_id: int) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM reunioes WHERE id = ?", (reuniao_id,)).fetchone()
        if not linha:
            return None
        reuniao = dict(linha)
        vinculos = conn.execute(
            "SELECT modulo, projeto_id FROM reuniao_projetos WHERE reuniao_id = ?", (reuniao_id,)
        ).fetchall()
        reuniao["projetos"] = [
            {"modulo": v["modulo"], "projeto_id": v["projeto_id"], "nome": _nome_projeto(conn, v["modulo"], v["projeto_id"])}
            for v in vinculos
        ]
        participantes = conn.execute(
            "SELECT nome FROM reuniao_participantes WHERE reuniao_id = ?", (reuniao_id,)
        ).fetchall()
        reuniao["participantes"] = [p["nome"] for p in participantes]
        return reuniao


def listar_planos_da_reuniao(reuniao_id: int) -> pd.DataFrame:
    with _conectar() as conn:
        return pd.read_sql_query("SELECT * FROM planos_acao WHERE reuniao_id = ? ORDER BY id", conn, params=(reuniao_id,))


# ---------------------------------------------------------------------------
# Planos de Ação (Central de Gestão)
# ---------------------------------------------------------------------------

COLUNAS_PLANO_ACAO = ["reuniao_id", "descricao", "responsavel", "prazo", "status"]


def inserir_plano_acao(dados: dict[str, Any], usuario: str) -> int:
    agora = datetime.now().isoformat()
    campos = {c: dados.get(c) for c in COLUNAS_PLANO_ACAO}
    with _conectar() as conn:
        cursor = conn.execute(
            f"INSERT INTO planos_acao ({', '.join(campos.keys())}, criado_em, criado_por) "
            f"VALUES ({', '.join(['?'] * len(campos))}, ?, ?)",
            (*campos.values(), agora, usuario),
        )
        novo_id = cursor.lastrowid
        _registrar_historico(conn, "planos_acao", novo_id, {}, campos, usuario)
        return novo_id


def atualizar_plano_acao(plano_id: int, dados: dict[str, Any], usuario: str) -> None:
    with _conectar() as conn:
        antigo = conn.execute("SELECT * FROM planos_acao WHERE id = ?", (plano_id,)).fetchone()
        antigo_dict = dict(antigo) if antigo else {}
        campos = {c: dados.get(c) for c in COLUNAS_PLANO_ACAO}
        set_clause = ", ".join(f"{c} = ?" for c in campos)
        conclusao = {}
        if campos.get("status") == "CONCLUÍDO" and antigo_dict.get("status") != "CONCLUÍDO":
            conclusao = {"concluido_em": datetime.now().isoformat(), "concluido_por": usuario}
            set_clause += ", concluido_em = ?, concluido_por = ?"
        conn.execute(
            f"UPDATE planos_acao SET {set_clause} WHERE id = ?",
            (*campos.values(), *conclusao.values(), plano_id),
        )
        _registrar_historico(conn, "planos_acao", plano_id, antigo_dict, {**campos, **conclusao}, usuario)


def listar_planos_acao() -> pd.DataFrame:
    with _conectar() as conn:
        return pd.read_sql_query("SELECT * FROM planos_acao ORDER BY COALESCE(prazo, criado_em) ASC", conn)


def obter_plano_acao(plano_id: int) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM planos_acao WHERE id = ?", (plano_id,)).fetchone()
        return dict(linha) if linha else None
