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
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable, Iterator

import bcrypt
import pandas as pd

from gat import backup_externo
from gat.config import (
    APP_VERSION,
    AREAS_PERMISSAO,
    AREAS_RESTRITAS_PADRAO_BLOQUEADO,
    BACKUP_DIR,
    DB_PATH,
    MAX_BACKUPS,
    MODULOS_CONTROLADOS,
    PERFIL_ADMIN,
    PERFIL_CONSULTA,
    PERFIS_PADRAO,
    SEED_DB_PATH,
)

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
        if conn.total_changes > 0:
            # Ambientes com disco efêmero (ex.: Streamlit Community Cloud)
            # recriam o disco do zero a cada reinício — sem isto, qualquer
            # gravação feita pela interface se perderia no próximo reinício.
            sincronizar_para_persistencia()
            backup_externo.agendar_backup_apos_gravacao()
    finally:
        conn.close()


def conectar() -> Iterator[sqlite3.Connection]:
    """
    Conexão pública ao mesmo arquivo de banco de dados e com a mesma
    persistência automática pós-gravação usada pelo GAT — para uso por
    módulos independentes que compartilham a mesma plataforma/banco de
    dados sem compartilhar regras de negócio (ex.: `gat/pmo_database.py`).
    Não altera nenhum comportamento existente: é apenas a versão pública
    de `_conectar`, para não haver necessidade de outro módulo importar um
    nome privado.
    """
    return _conectar()


# Colunas editáveis de cada tabela de projeto (usadas no cadastro/edição e
# no cálculo de diffs para o histórico de auditoria).
COLUNAS_PRESTADORES = [
    "item", "codigo", "prestador", "disciplina", "disciplina_sla", "peps",
    "obra_referencia", "revisao", "num_documentos", "data_solicitacao",
    "data_limite", "data_analise", "hold_inicio", "hold_fim", "num_at",
    "revisao_at", "responsavel", "status_analise", "observacoes",
    "natureza_revisao", "num_erros", "etg", "prestador_cadastro_id", "obra_id",
    "sla_dias", "sla_original", "sla_reduzido", "nivel_prioridade",
    "justificativa_sla", "data_limite_original", "sla_alterado_por", "sla_alterado_em",
    "data_limite_ajustada_manualmente",
]

COLUNAS_CESSIONARIOS = [
    "item", "codigo", "cessionario", "disciplina", "disciplina_sla",
    "revisao", "num_documentos", "data_solicitacao", "tipo", "sla_dias",
    "data_limite", "data_analise", "hold_inicio", "hold_fim", "num_at",
    "revisao_at", "responsavel", "status_analise", "observacoes",
    "natureza_revisao", "num_erros", "etg", "luc", "numero_rci", "numero_rvp",
    "data_atualizacao_rci", "data_atualizacao_rvp", "cessionario_cadastro_id",
    "sla_original", "sla_reduzido", "justificativa_sla", "data_limite_original",
    "sla_alterado_por", "sla_alterado_em", "data_limite_ajustada_manualmente",
]

COLUNAS_CADASTRO_PRESTADORES = [
    "codigo", "nome_empresa", "possui_pep", "numero_pep", "responsavel",
    "telefone", "email", "contatos", "status", "observacoes",
]

COLUNAS_OBRAS_PRESTADOR = [
    "prestador_id", "nome_obra", "codigo_referencia", "status", "e_canteiro", "observacoes",
]

COLUNAS_CADASTRO_CESSIONARIOS = [
    "codigo", "nome_empresa", "luc", "rvp", "rci", "responsavel",
    "telefone", "email", "contatos", "status", "observacoes",
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
    "meta_aprovacao_rev2": "80",
}


def _garantir_coluna(conn: sqlite3.Connection, tabela: str, coluna: str, definicao_tipo: str) -> None:
    """Adiciona `coluna` à `tabela` caso ainda não exista (migração idempotente)."""
    colunas_existentes = {linha[1] for linha in conn.execute(f"PRAGMA table_info({tabela})").fetchall()}
    if coluna not in colunas_existentes:
        conn.execute(f"ALTER TABLE {tabela} ADD COLUMN {coluna} {definicao_tipo}")


def _semear_configuracoes_padrao(conn: sqlite3.Connection) -> None:
    for chave, valor in CONFIGURACOES_PADRAO.items():
        conn.execute("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES (?, ?)", (chave, valor))


def _semear_permissoes_perfil(conn: sqlite3.Connection, usuario_id: int, perfil: str) -> None:
    """Materializa, para `usuario_id`, as permissões padrão de `perfil` como
    linhas individuais em permissoes_modulo/permissoes_area — a partir daí
    são permissões do usuário (editáveis livremente), não mais do perfil."""
    template = PERFIS_PADRAO.get(perfil, PERFIS_PADRAO[PERFIL_ADMIN])
    for modulo in MODULOS_CONTROLADOS:
        permitido = template["modulos"].get(modulo, True)
        conn.execute(
            "INSERT OR REPLACE INTO permissoes_modulo (usuario_id, modulo, permitido) VALUES (?, ?, ?)",
            (usuario_id, modulo, 1 if permitido else 0),
        )
    for area in AREAS_PERMISSAO:
        permitido = template["areas"].get(area, True)
        conn.execute(
            "INSERT OR REPLACE INTO permissoes_area (usuario_id, area, permitido) VALUES (?, ?, ?)",
            (usuario_id, area, 1 if permitido else 0),
        )


def _restaurar_semente_se_necessario() -> None:
    """
    Em uma implantação nova (banco de dados ainda inexistente), restaura o
    banco de sementes versionado no repositório — contendo todo o histórico
    real importado da planilha Controle_GAT_Projetos_2026.xlsm — para que a
    aplicação já nasça povoada. Não sobrescreve um banco já existente.
    """
    if not DB_PATH.exists() and SEED_DB_PATH.exists():
        shutil.copy(SEED_DB_PATH, DB_PATH)


# ---------------------------------------------------------------------------
# Backup automático (antes de qualquer migração estrutural)
# ---------------------------------------------------------------------------


def criar_backup() -> Path | None:
    """
    Cria uma cópia de segurança do banco de produção, com data/hora e versão
    da aplicação no nome do arquivo
    (ex.: `backup_gat_2026_2026-07-20_143000_v1.5.db`). Mantém apenas as
    `MAX_BACKUPS` cópias mais recentes (nunca apaga o backup mais recente
    válido). Retorna o caminho do backup criado, ou `None` se o banco de
    origem ainda não existir (nada a copiar) ou se a cópia falhar.
    """
    if not DB_PATH.exists():
        return None
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    destino = BACKUP_DIR / f"backup_gat_2026_{timestamp}_v{APP_VERSION}.db"
    try:
        shutil.copy2(DB_PATH, destino)
    except OSError:
        return None
    if not destino.exists() or destino.stat().st_size == 0:
        return None
    _limpar_backups_antigos()
    return destino


def _limpar_backups_antigos() -> None:
    backups = sorted(BACKUP_DIR.glob("backup_gat_2026_*.db"), key=lambda p: p.stat().st_mtime)
    excedente = len(backups) - MAX_BACKUPS
    for antigo in backups[: max(0, excedente)]:
        antigo.unlink(missing_ok=True)


def listar_backups() -> list[dict[str, Any]]:
    """Lista os backups existentes (mais recente primeiro) — usado em Administração."""
    backups = sorted(BACKUP_DIR.glob("backup_gat_2026_*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
    return [
        {"arquivo": p.name, "tamanho_bytes": p.stat().st_size, "criado_em": datetime.fromtimestamp(p.stat().st_mtime).isoformat(timespec="seconds")}
        for p in backups
    ]


def _backup_diario_e_por_atualizacao() -> None:
    """
    Reforço do backup automático (além do já existente antes de qualquer
    migração de banco): garante pelo menos um backup por dia de uso, e um
    backup assim que a versão da aplicação em execução mudar em relação
    à última registrada — a aproximação mais próxima possível de "antes
    de qualquer atualização do sistema" que um processo sem acesso ao
    pipeline de deploy consegue oferecer (o backup pré-migração, esse
    sim, sempre acontece genuinamente antes da alteração de schema — ver
    `_aplicar_migracoes`). Nunca interrompe a inicialização caso o
    backup falhe — apenas não atualiza os marcadores, para tentar de
    novo na próxima subida.
    """
    if not DB_PATH.exists():
        return
    versao_anterior = obter_configuracao("app_versao_ultimo_backup", "")
    ultimo_backup_dia = obter_configuracao("data_ultimo_backup_diario", "")
    hoje = date.today().isoformat()
    if versao_anterior == APP_VERSION and ultimo_backup_dia == hoje:
        return
    if criar_backup() is not None:
        definir_configuracao("app_versao_ultimo_backup", APP_VERSION)
        definir_configuracao("data_ultimo_backup_diario", hoje)


# ---------------------------------------------------------------------------
# Persistência manual — download/upload de backup e sincronização com a
# semente versionada no repositório (o disco local do ambiente de execução
# é temporário; sem um destes dois mecanismos, dados criados pela interface
# não sobrevivem a um reinício do ambiente).
# ---------------------------------------------------------------------------

_SQLITE_MAGIC = b"SQLite format 3\x00"


def exportar_banco_bytes() -> bytes | None:
    """Bytes do arquivo de banco de dados atual, para download manual como
    cópia de segurança pessoal (ex.: salva no computador do usuário)."""
    if not DB_PATH.exists():
        return None
    return DB_PATH.read_bytes()


def restaurar_banco_de_bytes(conteudo: bytes) -> None:
    """
    Restaura o banco de dados a partir dos bytes de um arquivo `.db`
    previamente baixado como backup. Cria um backup do estado atual antes
    de sobrescrever (nunca substitui sem guardar o estado anterior) e
    reaplica as migrações pendentes, para que o schema restaurado fique
    compatível com a versão atual do sistema mesmo que o backup seja de
    uma versão mais antiga.
    """
    if not conteudo.startswith(_SQLITE_MAGIC):
        raise ValueError("O arquivo enviado não é um banco de dados SQLite válido.")
    if DB_PATH.exists():
        caminho_backup = criar_backup()
        if caminho_backup is None:
            raise RuntimeError(
                "Não foi possível criar um backup de segurança do banco atual antes de restaurar — "
                "restauração cancelada para evitar perda de dados."
            )
    DB_PATH.write_bytes(conteudo)
    init_db()


def sincronizar_para_persistencia() -> bool:
    """
    Copia o banco de dados atual por cima do banco de sementes versionado
    no repositório (`SEED_DB_PATH`) — o estado atual passa a ser o ponto de
    partida em uma nova implantação, em vez do estado original da
    importação. Sozinho isso não basta: o arquivo de sementes atualizado
    ainda precisa ser publicado (commit/push) no repositório para que a
    persistência realmente aconteça em um reinício futuro do ambiente.
    """
    if not DB_PATH.exists():
        return False
    try:
        shutil.copy2(DB_PATH, SEED_DB_PATH)
    except OSError:
        return False
    return SEED_DB_PATH.exists() and SEED_DB_PATH.stat().st_size > 0


# ---------------------------------------------------------------------------
# Migrações incrementais do schema
# ---------------------------------------------------------------------------
#
# Cada migração é (versão, descrição, função). A função recebe a conexão
# aberta e só pode fazer alterações ADITIVAS e IDEMPOTENTES (CREATE TABLE/
# INDEX IF NOT EXISTS, ADD COLUMN via `_garantir_coluna`) — nunca DROP TABLE,
# DELETE sem condição, nem qualquer operação que apague ou substitua dados
# já existentes. As migrações já publicadas NUNCA são removidas ou
# reordenadas: novas alterações de schema entram como uma nova entrada, com
# a próxima versão, ao final da lista.


def _migracao_0001_indices_busca(conn: sqlite3.Connection) -> None:
    """Índices para acelerar a busca por N° AT e por nome em Prestadores/Cessionários."""
    conn.execute("CREATE INDEX IF NOT EXISTS idx_prestadores_num_at ON prestadores(num_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_prestadores_nome ON prestadores(prestador)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_cessionarios_num_at ON cessionarios(num_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_cessionarios_nome ON cessionarios(cessionario)")


def _migracao_0002_indices_avaliacoes_alertas(conn: sqlite3.Connection) -> None:
    """Índices para o ajuste consolidado: avaliações (checklist e analistas),
    alertas com radar e histórico de atividades por login."""
    conn.execute("CREATE INDEX IF NOT EXISTS idx_avaliacoes_checklist_entidade ON avaliacoes_checklist(tipo_entidade, codigo_entidade, disciplina)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_avaliacoes_checklist_projeto ON avaliacoes_checklist(projeto_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_avaliacoes_analistas_periodo ON avaliacoes_analistas(analista, ano, mes)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_alertas_radar_projeto ON alertas_radar(modulo, projeto_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_atividades_usuario_periodo ON atividades_usuario(usuario, data_hora)")


def _migracao_0003_ciclo_vida_alertas(conn: sqlite3.Connection) -> None:
    """Amplia alertas_radar com o ciclo de vida completo (Pendente/Em
    tratamento/Tratado/Adiado/Retirado do radar/Reaberto) — colunas novas,
    aditivas, sem apagar nenhum dado. Registros antigos com status 'ATIVO'
    passam a 'PENDENTE' (mesmo significado, nomenclatura nova); 'RETIRADO'
    é preservado como está."""
    _garantir_coluna(conn, "alertas_radar", "providencia", "TEXT")
    _garantir_coluna(conn, "alertas_radar", "responsavel_tratamento", "TEXT")
    _garantir_coluna(conn, "alertas_radar", "data_tratamento", "TEXT")
    _garantir_coluna(conn, "alertas_radar", "observacao", "TEXT")
    _garantir_coluna(conn, "alertas_radar", "adiado_para", "TEXT")
    conn.execute("UPDATE alertas_radar SET status = 'PENDENTE' WHERE status = 'ATIVO'")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_alertas_radar_status ON alertas_radar(status)")


def _migracao_0004_cadastro_mestre(conn: sqlite3.Connection) -> None:
    """Cadastro mestre de Prestadores e Cessionários — tabelas de cadastro
    centralizadas (empresa, PEP, RVP/RCI/LUC, contatos) e Obras/Canteiros
    vinculados a um prestador, complementando (sem substituir) as tabelas
    de projeto/análise `prestadores`/`cessionarios`, que continuam com sua
    função original intacta. Faz backfill automático: cria um cadastro
    para cada código já usado nos projetos existentes (nunca duplica —
    `INSERT OR IGNORE` respeita a UNIQUE(codigo) — e nunca inventa dados,
    herda nome/PEP do registro mais recente daquele código) e vincula os
    projetos existentes ao cadastro correspondente pelo código."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cadastro_prestadores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT NOT NULL UNIQUE,
            nome_empresa TEXT NOT NULL,
            possui_pep TEXT NOT NULL DEFAULT 'NAO',
            numero_pep TEXT,
            responsavel TEXT,
            telefone TEXT,
            email TEXT,
            contatos TEXT,
            status TEXT NOT NULL DEFAULT 'ATIVO',
            observacoes TEXT,
            criado_em TEXT NOT NULL,
            criado_por TEXT,
            atualizado_em TEXT,
            atualizado_por TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS obras_prestador (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prestador_id INTEGER NOT NULL REFERENCES cadastro_prestadores(id) ON DELETE CASCADE,
            nome_obra TEXT NOT NULL,
            codigo_referencia TEXT,
            status TEXT NOT NULL DEFAULT 'ATIVA',
            e_canteiro INTEGER NOT NULL DEFAULT 0,
            observacoes TEXT,
            criado_em TEXT NOT NULL,
            criado_por TEXT,
            atualizado_em TEXT,
            atualizado_por TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cadastro_cessionarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT NOT NULL UNIQUE,
            nome_empresa TEXT NOT NULL,
            luc TEXT,
            rvp TEXT,
            rci TEXT,
            responsavel TEXT,
            telefone TEXT,
            email TEXT,
            contatos TEXT,
            status TEXT NOT NULL DEFAULT 'ATIVO',
            observacoes TEXT,
            criado_em TEXT NOT NULL,
            criado_por TEXT,
            atualizado_em TEXT,
            atualizado_por TEXT
        )
        """
    )

    _garantir_coluna(conn, "prestadores", "prestador_cadastro_id", "INTEGER")
    _garantir_coluna(conn, "prestadores", "obra_id", "INTEGER")
    _garantir_coluna(conn, "cessionarios", "cessionario_cadastro_id", "INTEGER")

    conn.execute("CREATE INDEX IF NOT EXISTS idx_cadastro_prestadores_codigo ON cadastro_prestadores(codigo)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_cadastro_cessionarios_codigo ON cadastro_cessionarios(codigo)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_obras_prestador_prestador_id ON obras_prestador(prestador_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_prestadores_cadastro_id ON prestadores(prestador_cadastro_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_prestadores_obra_id ON prestadores(obra_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_cessionarios_cadastro_id ON cessionarios(cessionario_cadastro_id)")

    agora = datetime.now().isoformat()

    conn.execute(
        """
        INSERT OR IGNORE INTO cadastro_prestadores
            (codigo, nome_empresa, possui_pep, numero_pep, status, criado_em, criado_por, atualizado_em, atualizado_por)
        SELECT
            p1.codigo,
            (SELECT p2.prestador FROM prestadores p2 WHERE p2.codigo = p1.codigo AND p2.prestador IS NOT NULL AND TRIM(p2.prestador) <> '' ORDER BY p2.criado_em DESC, p2.id DESC LIMIT 1),
            CASE WHEN (SELECT MAX(NULLIF(TRIM(p3.peps), '')) FROM prestadores p3 WHERE p3.codigo = p1.codigo) IS NOT NULL THEN 'SIM' ELSE 'NAO' END,
            (SELECT p4.peps FROM prestadores p4 WHERE p4.codigo = p1.codigo AND p4.peps IS NOT NULL AND TRIM(p4.peps) <> '' ORDER BY p4.criado_em DESC, p4.id DESC LIMIT 1),
            'ATIVO', ?, 'MIGRACAO_0004', ?, 'MIGRACAO_0004'
        FROM prestadores p1
        WHERE p1.codigo IS NOT NULL AND TRIM(p1.codigo) <> ''
        GROUP BY p1.codigo
        """,
        (agora, agora),
    )
    conn.execute(
        """
        UPDATE prestadores
        SET prestador_cadastro_id = (SELECT id FROM cadastro_prestadores WHERE cadastro_prestadores.codigo = prestadores.codigo)
        WHERE codigo IS NOT NULL AND TRIM(codigo) <> '' AND prestador_cadastro_id IS NULL
        """
    )

    conn.execute(
        """
        INSERT OR IGNORE INTO cadastro_cessionarios
            (codigo, nome_empresa, status, criado_em, criado_por, atualizado_em, atualizado_por)
        SELECT
            c1.codigo,
            (SELECT c2.cessionario FROM cessionarios c2 WHERE c2.codigo = c1.codigo AND c2.cessionario IS NOT NULL AND TRIM(c2.cessionario) <> '' ORDER BY c2.criado_em DESC, c2.id DESC LIMIT 1),
            'ATIVO', ?, 'MIGRACAO_0004', ?, 'MIGRACAO_0004'
        FROM cessionarios c1
        WHERE c1.codigo IS NOT NULL AND TRIM(c1.codigo) <> ''
        GROUP BY c1.codigo
        """,
        (agora, agora),
    )
    conn.execute(
        """
        UPDATE cessionarios
        SET cessionario_cadastro_id = (SELECT id FROM cadastro_cessionarios WHERE cadastro_cessionarios.codigo = cessionarios.codigo)
        WHERE codigo IS NOT NULL AND TRIM(codigo) <> '' AND cessionario_cadastro_id IS NULL
        """
    )


def _migracao_0005_repactuacoes_prazo(conn: sqlite3.Connection) -> None:
    """Histórico estruturado de repactuações de prazo (Data de Entrega
    Acordada/Prevista alterada em um projeto já existente), com o motivo
    informado pelo usuário — complementa (sem substituir) o histórico
    genérico de edições já existente em `historico_edicoes`."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS repactuacoes_prazo (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tabela TEXT NOT NULL,
            registro_id INTEGER NOT NULL,
            data_anterior TEXT,
            data_nova TEXT,
            motivo TEXT NOT NULL,
            usuario TEXT,
            data_hora TEXT NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_repactuacoes_prazo_registro ON repactuacoes_prazo(tabela, registro_id)")


def _migracao_0006_avaliacao_checklist_obra(conn: sqlite3.Connection) -> None:
    """Vincula (opcionalmente) uma avaliação de checklist de Prestador à
    obra/canteiro avaliada — coluna aditiva, sem afetar avaliações já
    registradas (permanecem sem obra vinculada, exatamente como estão)."""
    _garantir_coluna(conn, "avaliacoes_checklist", "obra_id", "INTEGER")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_avaliacoes_checklist_obra ON avaliacoes_checklist(obra_id)")


def _migracao_0007_luc_rci_rvp_cessionarios(conn: sqlite3.Connection) -> None:
    """Projetos de Cessionários não utilizam PEP — acrescenta os campos
    próprios do módulo (LUC, N° RCI, N° RVP e suas datas de atualização),
    aditivos e sem afetar a coluna `pep` já existente (mantida intacta, mas
    não mais lida/gravada pela aplicação para este módulo)."""
    _garantir_coluna(conn, "cessionarios", "luc", "TEXT")
    _garantir_coluna(conn, "cessionarios", "numero_rci", "TEXT")
    _garantir_coluna(conn, "cessionarios", "numero_rvp", "TEXT")
    _garantir_coluna(conn, "cessionarios", "data_atualizacao_rci", "TEXT")
    _garantir_coluna(conn, "cessionarios", "data_atualizacao_rvp", "TEXT")


def _migracao_0008_avaliacao_obrigatoria_isentos(conn: sqlite3.Connection) -> None:
    """
    Nova pendência automática de avaliação obrigatória (nasce quando um
    projeto atinge a Rev.01 sem avaliação de checklist registrada, e
    permanece ativa em revisões seguintes até a avaliação ser feita — ver
    `gat/alertas_engine.py`). Para não gerar, de uma só vez, um alerta
    retroativo em todo projeto que já estivesse em revisão >= 1 sem
    avaliação no momento em que esta regra entrou em vigor, esta migração
    congela (uma única vez, aqui) a lista desses projetos como isentos —
    dali em diante, só passam a gerar alerta os projetos (novos ou já
    existentes) que ainda vierem a atingir a Rev.01 depois desta migração.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS avaliacao_obrigatoria_isentos (
            modulo TEXT NOT NULL,
            projeto_id INTEGER NOT NULL,
            motivo TEXT NOT NULL DEFAULT 'PRE_EXISTENTE_NA_ATIVACAO',
            criado_em TEXT NOT NULL,
            PRIMARY KEY (modulo, projeto_id)
        )
        """
    )

    agora = datetime.now().isoformat()
    for modulo, tabela, tipo_entidade, coluna_nome in (
        ("prestadores", "prestadores", "PRESTADOR", "prestador"),
        ("cessionarios", "cessionarios", "CESSIONARIO", "cessionario"),
    ):
        avaliados = {
            ((linha["codigo_entidade"] or linha["nome_entidade"]), (linha["disciplina"] or ""))
            for linha in conn.execute(
                "SELECT codigo_entidade, nome_entidade, disciplina FROM avaliacoes_checklist WHERE tipo_entidade = ?",
                (tipo_entidade,),
            ).fetchall()
        }
        for linha in conn.execute(
            f"SELECT id, codigo, {coluna_nome} AS nome, disciplina, revisao FROM {tabela} WHERE status_analise != 'CANCELADO'"
        ).fetchall():
            try:
                if int(linha["revisao"] or 0) < 1:
                    continue
            except (TypeError, ValueError):
                continue
            codigo_projeto = linha["codigo"] or linha["nome"]
            if (codigo_projeto, linha["disciplina"] or "") in avaliados:
                continue
            conn.execute(
                "INSERT OR IGNORE INTO avaliacao_obrigatoria_isentos (modulo, projeto_id, criado_em) VALUES (?, ?, ?)",
                (modulo, linha["id"], agora),
            )


def _migracao_0009_fechamento_avaliacao_analista(conn: sqlite3.Connection) -> None:
    """
    Fechamento mensal da nota do analista (persistente e auditável): uma
    vez fechada uma competência, a nota final fica congelada — deixa de
    ser recalculada automaticamente mesmo que dados usados no cálculo
    mudem depois (ex.: uma avaliação obrigatória feita fora de prazo).
    Qualquer recálculo de um mês já fechado é uma ação explícita,
    restrita ao Administrador, e sobrescreve o mesmo registro (mantendo
    o histórico da mudança em `historico_edicoes`, nunca duplicando).
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS fechamentos_avaliacao_analista (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            avaliacao_analista_id INTEGER REFERENCES avaliacoes_analistas(id) ON DELETE SET NULL,
            analista TEXT NOT NULL,
            mes INTEGER NOT NULL,
            ano INTEGER NOT NULL,
            nota_original REAL NOT NULL,
            avaliacoes_obrigatorias INTEGER NOT NULL DEFAULT 0,
            avaliacoes_pendentes INTEGER NOT NULL DEFAULT 0,
            ats_pendentes TEXT,
            penalizacao_fracao REAL NOT NULL DEFAULT 0,
            bonificacao REAL NOT NULL DEFAULT 0,
            nota_final REAL NOT NULL,
            justificativa_automatica TEXT NOT NULL,
            recomendacao_gerencial TEXT,
            data_fechamento TEXT NOT NULL,
            usuario_fechamento TEXT NOT NULL,
            UNIQUE(analista, mes, ano)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_fechamentos_avaliacao_analista_competencia "
        "ON fechamentos_avaliacao_analista(mes, ano)"
    )


def _migracao_0010_sla_prioridades(conn: sqlite3.Connection) -> None:
    """
    SLA/prioridades (alteração pontual): colunas aditivas para registrar o
    SLA padrão calculado (`sla_original`), o SLA efetivo em vigor
    (`sla_atual`/`sla_dias`), se houve redução manual, o nível de
    prioridade (apenas Prestadores — 1/2/3), a justificativa e a data
    limite original — nunca sobrescritas quando um SLA reduzido/prioridade
    é aplicado depois, preservando o histórico completo (ver item 4 da
    alteração de alertas/SLA/prioridades).
    """
    _garantir_coluna(conn, "prestadores", "sla_dias", "INTEGER")
    _garantir_coluna(conn, "prestadores", "sla_original", "INTEGER")
    _garantir_coluna(conn, "prestadores", "sla_reduzido", "INTEGER NOT NULL DEFAULT 0")
    _garantir_coluna(conn, "prestadores", "nivel_prioridade", "INTEGER")
    _garantir_coluna(conn, "prestadores", "justificativa_sla", "TEXT")
    _garantir_coluna(conn, "prestadores", "data_limite_original", "TEXT")
    _garantir_coluna(conn, "prestadores", "sla_alterado_por", "TEXT")
    _garantir_coluna(conn, "prestadores", "sla_alterado_em", "TEXT")

    _garantir_coluna(conn, "cessionarios", "sla_original", "INTEGER")
    _garantir_coluna(conn, "cessionarios", "sla_reduzido", "INTEGER NOT NULL DEFAULT 0")
    _garantir_coluna(conn, "cessionarios", "justificativa_sla", "TEXT")
    _garantir_coluna(conn, "cessionarios", "data_limite_original", "TEXT")
    _garantir_coluna(conn, "cessionarios", "sla_alterado_por", "TEXT")
    _garantir_coluna(conn, "cessionarios", "sla_alterado_em", "TEXT")

    # Backfill: para registros já existentes, o SLA "original" é o SLA
    # padrão vigente (nenhum ainda tinha redução/prioridade) — preenche
    # sla_dias/sla_original a partir do que já está calculado/gravado,
    # sem alterar data_limite nem qualquer outro dado já existente.
    conn.execute("UPDATE prestadores SET sla_dias = 10, sla_original = 10 WHERE sla_dias IS NULL")
    conn.execute("UPDATE cessionarios SET sla_original = sla_dias WHERE sla_original IS NULL")


def _migracao_0011_remover_isencao_retroativa(conn: sqlite3.Connection) -> None:
    """
    Remove a isenção retroativa congelada pela migração 8: a partir daqui,
    todo projeto em revisão >= 1 sem avaliação de checklist volta a gerar
    a pendência de avaliação obrigatória, inclusive os que já estavam
    congelados como isentos desde a ativação da regra.
    """
    conn.execute("DELETE FROM avaliacao_obrigatoria_isentos")


def _migracao_0014_data_prevista_automatica(conn: sqlite3.Connection) -> None:
    """
    Cálculo automático da data prevista (alteração pontual): coluna aditiva
    que sinaliza quando `data_limite` foi ajustada manualmente pelo usuário
    (em vez de refletir o último cálculo automático do SLA em vigor) — usada
    para decidir, em edições futuras, se a data pode ser recalculada
    automaticamente ou se deve ser pedida confirmação antes de sobrescrevê-la
    (item 5 da modificação de cálculo automático de data prevista). Todos os
    registros já existentes começam como não-manuais (0); a própria tela
    também se auto-corrige na primeira edição de cada registro, comparando a
    data gravada com o cálculo atual.
    """
    _garantir_coluna(conn, "prestadores", "data_limite_ajustada_manualmente", "INTEGER NOT NULL DEFAULT 0")
    _garantir_coluna(conn, "cessionarios", "data_limite_ajustada_manualmente", "INTEGER NOT NULL DEFAULT 0")


def _migracao_0015_vinculo_analista_usuario(conn: sqlite3.Connection) -> None:
    """
    KPIs de prazo dos analistas (itens 13-20): coluna aditiva que vincula um
    usuário (tipicamente de perfil ANALISTA) a um nome da lista RESPONSAVEIS
    — é assim que o sistema identifica, de forma confiável e no backend
    (nunca por seleção do próprio usuário), quais indicadores de prazo são
    "os seus" ao aplicar a regra de privacidade do item 16.1. Fica em branco
    até o administrador vincular explicitamente cada usuário analista.
    """
    _garantir_coluna(conn, "usuarios", "analista_vinculado", "TEXT")


def _migracao_0016_pmo_schema(conn: sqlite3.Connection) -> None:
    """
    Módulo PMO (Project Management Office): schema inicial, totalmente
    independente do GAT — nenhuma tabela do GAT é alterada estruturalmente
    por esta migração, além de duas colunas aditivas (com DEFAULT que
    preserva o comportamento atual) nos três módulos que passam a ser
    compartilhados entre PMO e GAT: Reuniões, Planos de Ação e Alertas.

    Compartilhamento com identificação de origem:
    * `reuniao_projetos.modulo` já era um campo livre (usado hoje com
      'prestadores'/'cessionarios') — projetos PMO usam modulo='pmo' com o
      mesmo mecanismo de vínculo M:N, sem exigir nenhuma mudança nele;
    * `alertas_manuais.modulo`/`projeto_id` idem — alertas do PMO usam
      modulo='pmo', aparecendo pela mesma tabela/funções já existentes;
    * `reunioes` e `planos_acao` ganham a coluna aditiva `origem` (GAT por
      padrão, preservando 100% do comportamento e das telas atuais do GAT,
      que nunca informam esse campo) para que também um registro sem
      vínculo a um projeto específico carregue sua origem de forma
      explícita, como exigido pela especificação do PMO.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pmo_projetos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            cliente TEXT,
            contratada TEXT,
            gerente TEXT,
            data_inicio TEXT,
            data_prevista_termino TEXT,
            valor_contratual REAL,
            tipo_contrato TEXT,
            observacoes TEXT,
            status TEXT NOT NULL DEFAULT 'EM ANDAMENTO',
            saude TEXT NOT NULL DEFAULT 'VERDE',
            percentual_execucao REAL NOT NULL DEFAULT 0,
            proximo_marco TEXT,
            proximo_marco_data TEXT,
            criado_em TEXT NOT NULL,
            criado_por TEXT NOT NULL,
            atualizado_em TEXT,
            atualizado_por TEXT
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pmo_projeto_kpis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projeto_id INTEGER NOT NULL REFERENCES pmo_projetos(id) ON DELETE CASCADE,
            kpi_chave TEXT NOT NULL,
            habilitado INTEGER NOT NULL DEFAULT 1,
            habilitado_em TEXT,
            desabilitado_em TEXT,
            UNIQUE(projeto_id, kpi_chave)
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pmo_cronograma_arquivos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projeto_id INTEGER NOT NULL REFERENCES pmo_projetos(id) ON DELETE CASCADE,
            nome_arquivo TEXT NOT NULL,
            formato TEXT NOT NULL,
            conteudo BLOB NOT NULL,
            interpretado INTEGER NOT NULL DEFAULT 0,
            ativo INTEGER NOT NULL DEFAULT 1,
            enviado_por TEXT NOT NULL,
            enviado_em TEXT NOT NULL,
            removido_por TEXT,
            removido_em TEXT
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pmo_cronograma_arquivos_projeto ON pmo_cronograma_arquivos(projeto_id)")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pmo_cronograma_atividades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            arquivo_id INTEGER NOT NULL REFERENCES pmo_cronograma_arquivos(id) ON DELETE CASCADE,
            projeto_id INTEGER NOT NULL REFERENCES pmo_projetos(id) ON DELETE CASCADE,
            identificador_origem TEXT,
            nome TEXT NOT NULL,
            data_inicio TEXT,
            data_fim TEXT,
            duracao_dias REAL,
            percentual_concluido REAL NOT NULL DEFAULT 0,
            e_marco INTEGER NOT NULL DEFAULT 0,
            predecessoras TEXT,
            caminho_critico INTEGER NOT NULL DEFAULT 0,
            folga_dias REAL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pmo_cronograma_atividades_arquivo ON pmo_cronograma_atividades(arquivo_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pmo_cronograma_atividades_projeto ON pmo_cronograma_atividades(projeto_id)")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pmo_medicoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projeto_id INTEGER NOT NULL REFERENCES pmo_projetos(id) ON DELETE CASCADE,
            competencia_mes INTEGER NOT NULL,
            competencia_ano INTEGER NOT NULL,
            percentual REAL,
            valor_medido REAL,
            situacao TEXT NOT NULL DEFAULT 'EM ANÁLISE',
            valor_aprovado REAL,
            data_aprovacao TEXT,
            valor_pago REAL,
            data_pagamento TEXT,
            valor_glosado REAL NOT NULL DEFAULT 0,
            criado_por TEXT NOT NULL,
            criado_em TEXT NOT NULL,
            atualizado_em TEXT,
            atualizado_por TEXT
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pmo_medicoes_projeto ON pmo_medicoes(projeto_id)")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pmo_entregaveis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projeto_id INTEGER NOT NULL REFERENCES pmo_projetos(id) ON DELETE CASCADE,
            nome TEXT NOT NULL,
            previsto INTEGER NOT NULL DEFAULT 1,
            entregue INTEGER NOT NULL DEFAULT 0,
            data_prevista TEXT,
            data_entrega TEXT,
            percentual_documental REAL NOT NULL DEFAULT 0,
            observacoes TEXT,
            criado_em TEXT NOT NULL,
            criado_por TEXT NOT NULL,
            atualizado_em TEXT,
            atualizado_por TEXT
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pmo_entregaveis_projeto ON pmo_entregaveis(projeto_id)")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pmo_riscos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projeto_id INTEGER NOT NULL REFERENCES pmo_projetos(id) ON DELETE CASCADE,
            descricao TEXT NOT NULL,
            probabilidade INTEGER NOT NULL,
            impacto INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'ABERTO',
            responsavel TEXT,
            plano_mitigacao TEXT,
            criado_em TEXT NOT NULL,
            criado_por TEXT NOT NULL,
            atualizado_em TEXT,
            atualizado_por TEXT
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pmo_riscos_projeto ON pmo_riscos(projeto_id)")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pmo_comunicacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projeto_id INTEGER NOT NULL REFERENCES pmo_projetos(id) ON DELETE CASCADE,
            data TEXT NOT NULL,
            tipo TEXT,
            descricao TEXT NOT NULL,
            responsavel TEXT,
            criado_em TEXT NOT NULL,
            criado_por TEXT NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pmo_comunicacoes_projeto ON pmo_comunicacoes(projeto_id)")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pmo_alertas_cronograma (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projeto_id INTEGER NOT NULL UNIQUE REFERENCES pmo_projetos(id) ON DELETE CASCADE,
            alerta_manual_id INTEGER REFERENCES alertas_manuais(id),
            status TEXT NOT NULL DEFAULT 'ATIVO',
            criado_em TEXT NOT NULL,
            qtd_lembretes INTEGER NOT NULL DEFAULT 0,
            ultimo_lembrete_em TEXT,
            proximo_lembrete_em TEXT,
            encerrado_em TEXT,
            anexado_por TEXT,
            anexado_em TEXT
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pmo_cronograma_lembretes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projeto_id INTEGER NOT NULL REFERENCES pmo_projetos(id) ON DELETE CASCADE,
            enviado_em TEXT NOT NULL,
            mensagem TEXT NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pmo_cronograma_lembretes_projeto ON pmo_cronograma_lembretes(projeto_id)")

    _garantir_coluna(conn, "reunioes", "origem", "TEXT NOT NULL DEFAULT 'GAT'")
    _garantir_coluna(conn, "planos_acao", "origem", "TEXT NOT NULL DEFAULT 'GAT'")
    _garantir_coluna(conn, "planos_acao", "pmo_projeto_id", "INTEGER REFERENCES pmo_projetos(id)")


def _migracao_0017_manual_pmo(conn: sqlite3.Connection) -> None:
    """
    Atualiza automaticamente o Manual do Sistema com os dois capítulos do
    módulo PMO — acrescentados ao final da lista já existente, sem alterar
    nenhum capítulo do GAT.
    """
    from gat.pmo_manual_conteudo import CAPITULOS_PMO

    agora = datetime.now().isoformat()
    maior_ordem = conn.execute("SELECT COALESCE(MAX(ordem), 0) FROM manual_capitulos").fetchone()[0]
    for indice, (titulo, conteudo) in enumerate(CAPITULOS_PMO, start=1):
        existe = conn.execute("SELECT id FROM manual_capitulos WHERE titulo = ?", (titulo,)).fetchone()
        if existe:
            continue
        conn.execute(
            "INSERT INTO manual_capitulos (ordem, titulo, conteudo, perfis_visiveis, criado_em) VALUES (?, ?, ?, NULL, ?)",
            (maior_ordem + indice, titulo, conteudo, agora),
        )


def _migracao_0013_manual_sistema(conn: sqlite3.Connection) -> None:
    """
    Novo módulo Manual do Sistema: capítulos organizados por versão
    publicada, com filtro por perfil, anexos e confirmação de leitura. Uma
    única vez, semeia os 28 capítulos iniciais (ver `gat/manual_conteudo.py`)
    como a versão 1, já publicada e ativa — depois disso, o conteúdo passa a
    ser gerido inteiramente pela Administração do Manual (editar, reordenar,
    publicar novas versões), sem depender mais deste arquivo.
    """
    from gat.manual_conteudo import CAPITULOS_INICIAIS

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS manual_capitulos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ordem INTEGER NOT NULL,
            titulo TEXT NOT NULL,
            conteudo TEXT,
            perfis_visiveis TEXT,
            criado_em TEXT NOT NULL,
            atualizado_em TEXT,
            atualizado_por TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS manual_versoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero_versao INTEGER NOT NULL,
            notas TEXT,
            publicado_em TEXT NOT NULL,
            publicado_por TEXT NOT NULL,
            ativa INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS manual_confirmacoes_leitura (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario TEXT NOT NULL,
            versao INTEGER NOT NULL,
            confirmado_em TEXT NOT NULL,
            UNIQUE(usuario, versao)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS manual_anexos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            capitulo_id INTEGER NOT NULL REFERENCES manual_capitulos(id) ON DELETE CASCADE,
            tipo TEXT NOT NULL,
            nome_arquivo TEXT NOT NULL,
            conteudo BLOB NOT NULL,
            criado_em TEXT NOT NULL,
            criado_por TEXT NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_manual_anexos_capitulo ON manual_anexos(capitulo_id)")

    agora = datetime.now().isoformat()
    for ordem, (titulo, conteudo) in enumerate(CAPITULOS_INICIAIS, start=1):
        conn.execute(
            "INSERT INTO manual_capitulos (ordem, titulo, conteudo, perfis_visiveis, criado_em) VALUES (?, ?, ?, NULL, ?)",
            (ordem, titulo, conteudo, agora),
        )
    conn.execute(
        "INSERT INTO manual_versoes (numero_versao, notas, publicado_em, publicado_por, ativa) VALUES (1, ?, ?, 'sistema', 1)",
        ("Versão inicial do Manual do Sistema.", agora),
    )


def _migracao_0012_alertas_manuais(conn: sqlite3.Connection) -> None:
    """
    Alertas manuais (item 1 do módulo de SLA/Prioridades): alertas criados
    livremente por um usuário para um projeto de Prestador ou Cessionário,
    independentes dos alertas automáticos do motor de gargalo/atraso. O
    histórico completo de criação/edição/encerramento/reabertura é gravado
    em `historico_edicoes` (tabela já existente e auditável), reaproveitando
    o mesmo mecanismo usado pelo resto do sistema.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS alertas_manuais (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            modulo TEXT NOT NULL,
            projeto_id INTEGER,
            titulo TEXT NOT NULL,
            descricao TEXT,
            num_at TEXT,
            codigo_projeto TEXT,
            nome_entidade TEXT,
            disciplina TEXT,
            revisao INTEGER,
            especialista TEXT,
            prioridade TEXT NOT NULL DEFAULT 'Média',
            vencimento TEXT,
            observacoes TEXT,
            destinatarios TEXT,
            status TEXT NOT NULL DEFAULT 'ABERTO',
            criado_por TEXT NOT NULL,
            criado_em TEXT NOT NULL,
            atualizado_por TEXT,
            atualizado_em TEXT,
            encerrado_por TEXT,
            encerrado_em TEXT,
            motivo_encerramento TEXT
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_alertas_manuais_modulo ON alertas_manuais(modulo)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_alertas_manuais_status ON alertas_manuais(status)")


def _migracao_0018_arquivo_schema(conn: sqlite3.Connection) -> None:
    """
    Módulo Arquivo: arquivamento lógico (nunca exclusão) para os registros
    operacionais do GAT e do PMO, mais a exclusão definitiva controlada.

    Cada tabela participante ganha 4 colunas aditivas — nenhuma linha
    existente é tocada, apenas os novos campos ficam NULL/0 (equivalente a
    "ativo"):
    * `arquivado_em` / `arquivado_por` / `motivo_arquivamento`: preenchidos
      apenas quando o registro é arquivado; voltam a NULL ao ser restaurado.
    * `arquivado_teste`: marca registros de teste (área "Testes" do módulo
      Arquivo), independente das demais categorias.

    `arquivo_auditoria` registra toda operação de arquivamento, restauração
    e exclusão definitiva (quem, quando, o quê, justificativa) — é o
    registro que alimenta os relatórios de Arquivamentos/Exclusões/
    Restaurações e nunca é apagado, nem quando o próprio registro de
    origem é excluído definitivamente.
    """
    tabelas_arquivaveis = [
        "pmo_projetos", "prestadores", "cessionarios", "cadastro_prestadores",
        "cadastro_cessionarios", "usuarios", "reunioes", "planos_acao",
        "alertas_manuais", "pmo_cronograma_arquivos",
    ]
    for tabela in tabelas_arquivaveis:
        _garantir_coluna(conn, tabela, "arquivado_em", "TEXT")
        _garantir_coluna(conn, tabela, "arquivado_por", "TEXT")
        _garantir_coluna(conn, tabela, "motivo_arquivamento", "TEXT")
        _garantir_coluna(conn, tabela, "arquivado_teste", "INTEGER NOT NULL DEFAULT 0")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS arquivo_auditoria (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tabela TEXT NOT NULL,
            registro_id INTEGER NOT NULL,
            tipo_operacao TEXT NOT NULL,
            usuario TEXT NOT NULL,
            data_hora TEXT NOT NULL,
            justificativa TEXT,
            descricao_registro TEXT,
            origem TEXT
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_arquivo_auditoria_tabela ON arquivo_auditoria(tabela, registro_id)")


def _migracao_0019_arquivo_permissao_consulta(conn: sqlite3.Connection) -> None:
    """
    Ajuste pontual de permissões do módulo Arquivo: todos os perfis podem
    arquivar/restaurar, exceto o perfil Consulta. Como "arquivo" é uma área
    nova, o fallback padrão (`.get(area, True)`) liberaria acesso a todo
    mundo por omissão — para usuários Consulta já existentes, bloqueia
    explicitamente, do mesmo jeito que o Administrador poderia autorizar
    manualmente depois. Usuários novos já nascem corretos via
    `PERFIS_PADRAO`; isto é só o backfill dos que já existiam.
    """
    for linha in conn.execute("SELECT id FROM usuarios WHERE perfil = ?", (PERFIL_CONSULTA,)).fetchall():
        ja_definida = conn.execute(
            "SELECT 1 FROM permissoes_area WHERE usuario_id = ? AND area = 'arquivo'", (linha["id"],)
        ).fetchone()
        if not ja_definida:
            conn.execute(
                "INSERT INTO permissoes_area (usuario_id, area, permitido) VALUES (?, 'arquivo', 0)", (linha["id"],)
            )


def _migracao_0020_manual_arquivo(conn: sqlite3.Connection) -> None:
    """
    Atualiza automaticamente o Manual do Sistema com o capítulo do módulo
    Arquivo — acrescentado ao final da lista já existente, sem alterar
    nenhum capítulo do GAT ou do PMO.
    """
    from gat.arquivo_manual_conteudo import CAPITULOS_ARQUIVO

    agora = datetime.now().isoformat()
    maior_ordem = conn.execute("SELECT COALESCE(MAX(ordem), 0) FROM manual_capitulos").fetchone()[0]
    for indice, (titulo, conteudo) in enumerate(CAPITULOS_ARQUIVO, start=1):
        existe = conn.execute("SELECT id FROM manual_capitulos WHERE titulo = ?", (titulo,)).fetchone()
        if existe:
            continue
        conn.execute(
            "INSERT INTO manual_capitulos (ordem, titulo, conteudo, perfis_visiveis, criado_em) VALUES (?, ?, ?, NULL, ?)",
            (maior_ordem + indice, titulo, conteudo, agora),
        )


def _migracao_0021_tema_usuario(conn: sqlite3.Connection) -> None:
    """
    Preferência de tema (Claro/Escuro) por usuário — persistida no banco
    (não em sessão) para sobreviver a logout, novo login e reinicialização
    do servidor. Aditiva: usuários existentes recebem 'claro' por padrão,
    preservando a aparência atual.
    """
    _garantir_coluna(conn, "usuarios", "tema_preferido", "TEXT NOT NULL DEFAULT 'claro'")


def _migracao_0022_manual_tema(conn: sqlite3.Connection) -> None:
    """
    Atualiza automaticamente o Manual do Sistema com os capítulos "Tema
    Claro e Tema Escuro" e "Padrão visual do sistema" — acrescentados ao
    final da lista já existente, sem alterar nenhum capítulo anterior.
    """
    from gat.tema_manual_conteudo import CAPITULOS_TEMA

    agora = datetime.now().isoformat()
    maior_ordem = conn.execute("SELECT COALESCE(MAX(ordem), 0) FROM manual_capitulos").fetchone()[0]
    for indice, (titulo, conteudo) in enumerate(CAPITULOS_TEMA, start=1):
        existe = conn.execute("SELECT id FROM manual_capitulos WHERE titulo = ?", (titulo,)).fetchone()
        if existe:
            continue
        conn.execute(
            "INSERT INTO manual_capitulos (ordem, titulo, conteudo, perfis_visiveis, criado_em) VALUES (?, ?, ?, NULL, ?)",
            (maior_ordem + indice, titulo, conteudo, agora),
        )


_MIGRACOES: list[tuple[int, str, Callable[[sqlite3.Connection], None]]] = [
    (1, "Índices de busca por N° AT e nome em Prestadores e Cessionários", _migracao_0001_indices_busca),
    (2, "Índices para avaliações (checklist/analistas), alertas com radar e histórico de atividades", _migracao_0002_indices_avaliacoes_alertas),
    (3, "Ciclo de vida completo dos alertas (Pendente/Em tratamento/Tratado/Adiado/Retirado/Reaberto)", _migracao_0003_ciclo_vida_alertas),
    (4, "Cadastro mestre de Prestadores/Cessionários + Obras/Canteiros, com backfill e vínculo aos projetos existentes", _migracao_0004_cadastro_mestre),
    (5, "Histórico estruturado de repactuações de prazo (data anterior/nova, motivo)", _migracao_0005_repactuacoes_prazo),
    (6, "Vínculo opcional de avaliação de checklist de Prestador com obra/canteiro", _migracao_0006_avaliacao_checklist_obra),
    (7, "Projetos de Cessionários: substitui PEP por LUC, N° RCI, N° RVP e datas de atualização", _migracao_0007_luc_rci_rvp_cessionarios),
    (8, "Avaliação obrigatória (Rev.01): congela como isentos os projetos já em revisão >= 1 sem avaliação no momento da ativação", _migracao_0008_avaliacao_obrigatoria_isentos),
    (9, "Fechamento mensal persistente e auditável da nota do analista", _migracao_0009_fechamento_avaliacao_analista),
    (10, "SLA/prioridades: colunas de SLA original/atual, redução manual, nível de prioridade e justificativa", _migracao_0010_sla_prioridades),
    (11, "Remove a isenção retroativa da avaliação obrigatória (aplica de fato a remoção decidida anteriormente)", _migracao_0011_remover_isencao_retroativa),
    (12, "Alertas manuais: tabela alertas_manuais (criação/edição/encerramento com histórico em historico_edicoes)", _migracao_0012_alertas_manuais),
    (13, "Manual do Sistema: capítulos, versões publicadas, confirmação de leitura e anexos, semeado com os 28 capítulos iniciais", _migracao_0013_manual_sistema),
    (14, "Cálculo automático de data prevista: coluna de ajuste manual (data_limite_ajustada_manualmente) em Prestadores/Cessionários", _migracao_0014_data_prevista_automatica),
    (15, "KPIs de prazo dos analistas: vínculo usuários.analista_vinculado com a lista RESPONSAVEIS", _migracao_0015_vinculo_analista_usuario),
    (16, "Módulo PMO: schema inicial (projetos, KPIs habilitados, cronograma, medições, entregáveis, riscos, comunicações, alerta automático de cronograma) + origem em Reuniões/Planos de Ação", _migracao_0016_pmo_schema),
    (17, "Módulo PMO: capítulos 'PMO – Gestão de Projetos' e 'Biblioteca de Indicadores (PMO)' no Manual do Sistema", _migracao_0017_manual_pmo),
    (18, "Módulo Arquivo: arquivamento lógico (arquivado_em/por/motivo/teste) em pmo_projetos, prestadores, cessionarios, cadastro_prestadores, cadastro_cessionarios, usuarios, reunioes, planos_acao, alertas_manuais, pmo_cronograma_arquivos + tabela arquivo_auditoria", _migracao_0018_arquivo_schema),
    (19, "Módulo Arquivo: bloqueia por padrão o acesso do perfil Consulta (todos os demais perfis mantêm acesso)", _migracao_0019_arquivo_permissao_consulta),
    (20, "Módulo Arquivo: capítulo 'Módulo Arquivo' no Manual do Sistema", _migracao_0020_manual_arquivo),
    (21, "Preferência de Tema Claro/Escuro por usuário (usuarios.tema_preferido)", _migracao_0021_tema_usuario),
    (22, "Manual do Sistema: capítulos 'Tema Claro e Tema Escuro' e 'Padrão visual do sistema'", _migracao_0022_manual_tema),
]


def _versao_schema_atual(conn: sqlite3.Connection) -> int:
    linha = conn.execute("SELECT MAX(versao) AS v FROM schema_version WHERE status = 'sucesso'").fetchone()
    return int(linha["v"]) if linha and linha["v"] is not None else 0


def _aplicar_migracoes() -> None:
    """
    Aplica apenas as migrações pendentes (versão > última aplicada com
    sucesso), criando backup automático antes de qualquer alteração
    estrutural e registrando cada tentativa em `schema_version`. Se uma
    migração falhar, a própria transação é revertida pelo SQLite (a conexão
    fecha sem commit), a falha fica registrada para diagnóstico e a
    inicialização é interrompida — o sistema nunca sobe com um schema
    parcialmente migrado, e a mesma migração não é considerada "aplicada"
    (será tentada novamente na próxima inicialização).
    """
    with _conectar() as conn:
        versao_atual = _versao_schema_atual(conn)
    pendentes = [m for m in _MIGRACOES if m[0] > versao_atual]
    if not pendentes:
        return

    if DB_PATH.exists():
        caminho_backup = criar_backup()
        if caminho_backup is None:
            raise RuntimeError(
                "Não foi possível criar o backup de segurança antes da migração do banco de dados. "
                "A atualização foi interrompida para evitar risco de perda de dados."
            )

    for versao, descricao, migrar in pendentes:
        agora = datetime.now().isoformat(timespec="seconds")
        try:
            with _conectar() as conn:
                migrar(conn)
                conn.execute(
                    "INSERT INTO schema_version (versao, aplicado_em, descricao, status) VALUES (?, ?, ?, 'sucesso')",
                    (versao, agora, descricao),
                )
        except Exception as exc:
            with _conectar() as conn_erro:
                conn_erro.execute(
                    "INSERT INTO schema_version (versao, aplicado_em, descricao, status) VALUES (?, ?, ?, ?)",
                    (versao, agora, descricao, f"erro: {exc}"),
                )
            raise RuntimeError(f"Falha ao aplicar a migração {versao} ({descricao}): {exc}") from exc


def listar_versoes_schema() -> pd.DataFrame:
    """Histórico de migrações aplicadas — usado em Administração."""
    with _conectar() as conn:
        return pd.read_sql_query("SELECT versao, aplicado_em, descricao, status FROM schema_version ORDER BY id", conn)


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
                deve_trocar_senha INTEGER NOT NULL DEFAULT 0,
                ultimo_acesso TEXT,
                criado_em TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS permissoes_modulo (
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                modulo TEXT NOT NULL,
                permitido INTEGER NOT NULL DEFAULT 1,
                PRIMARY KEY (usuario_id, modulo)
            );

            CREATE TABLE IF NOT EXISTS permissoes_area (
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                area TEXT NOT NULL,
                permitido INTEGER NOT NULL DEFAULT 1,
                PRIMARY KEY (usuario_id, area)
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

            CREATE TABLE IF NOT EXISTS observacoes_mensais (
                competencia TEXT PRIMARY KEY,
                texto TEXT NOT NULL,
                atualizado_em TEXT NOT NULL,
                atualizado_por TEXT
            );

            CREATE TABLE IF NOT EXISTS schema_version (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                versao INTEGER NOT NULL,
                aplicado_em TEXT NOT NULL,
                descricao TEXT NOT NULL,
                status TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS avaliacoes_checklist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo_entidade TEXT NOT NULL,
                codigo_entidade TEXT,
                nome_entidade TEXT NOT NULL,
                disciplina TEXT,
                projeto_id INTEGER,
                at_referencia TEXT,
                revisao INTEGER,
                data_avaliacao TEXT NOT NULL,
                analista_responsavel TEXT,
                respostas_json TEXT NOT NULL,
                pontuacao INTEGER NOT NULL,
                classificacao TEXT NOT NULL,
                acompanhamento TEXT NOT NULL,
                observacoes_gerais TEXT,
                criado_em TEXT NOT NULL,
                criado_por TEXT
            );

            CREATE TABLE IF NOT EXISTS avaliacoes_analistas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                analista TEXT NOT NULL,
                avaliador TEXT,
                mes INTEGER NOT NULL,
                ano INTEGER NOT NULL,
                etg INTEGER, horario INTEGER, reunioes INTEGER, disponibilidade INTEGER,
                conhecimento_tecnico INTEGER, produtividade INTEGER, qualidade INTEGER,
                qtd_documentos INTEGER, qtd_ats INTEGER, prazos INTEGER,
                organizacao INTEGER, colaboracao INTEGER, comunicacao INTEGER,
                justificativa TEXT,
                observacoes TEXT,
                criado_em TEXT NOT NULL,
                criado_por TEXT
            );

            CREATE TABLE IF NOT EXISTS alertas_radar (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                modulo TEXT NOT NULL,
                projeto_id INTEGER NOT NULL,
                tipo_alerta TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'ATIVO',
                justificativa TEXT,
                atualizado_em TEXT NOT NULL,
                atualizado_por TEXT,
                UNIQUE(modulo, projeto_id, tipo_alerta)
            );

            CREATE TABLE IF NOT EXISTS atividades_usuario (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario TEXT NOT NULL,
                perfil TEXT,
                tipo_evento TEXT NOT NULL,
                modulo TEXT,
                detalhe TEXT,
                data_hora TEXT NOT NULL
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
        _garantir_coluna(conn, "usuarios", "deve_trocar_senha", "INTEGER NOT NULL DEFAULT 0")
        _garantir_coluna(conn, "usuarios", "ultimo_acesso", "TEXT")

        total_usuarios = conn.execute("SELECT COUNT(*) AS n FROM usuarios").fetchone()["n"]
        if total_usuarios == 0:
            senha_hash = bcrypt.hashpw("Tecnoplano@2026".encode(), bcrypt.gensalt()).decode()
            cursor = conn.execute(
                "INSERT INTO usuarios (username, senha_hash, nome_completo, perfil, ativo, deve_trocar_senha, criado_em) "
                "VALUES (?, ?, ?, ?, 1, 0, ?)",
                ("admin", senha_hash, "Administrador GAT", PERFIL_ADMIN, datetime.now().isoformat()),
            )
            _semear_permissoes_perfil(conn, cursor.lastrowid, PERFIL_ADMIN)

        # Usuários pré-existentes (bancos de versões anteriores ao controle de
        # acesso granular) recebem acesso total por padrão — preservando o
        # comportamento que já tinham antes deste ajuste, já que o sistema
        # ainda não fazia nenhuma restrição de módulo/área. O administrador
        # pode restringi-los normalmente a partir de agora.
        for linha in conn.execute("SELECT id FROM usuarios").fetchall():
            tem_permissoes = conn.execute(
                "SELECT 1 FROM permissoes_modulo WHERE usuario_id = ? LIMIT 1", (linha["id"],)
            ).fetchone()
            if not tem_permissoes:
                _semear_permissoes_perfil(conn, linha["id"], PERFIL_ADMIN)

        # Áreas sensíveis introduzidas neste ajuste (notas de analistas, edição
        # de avaliações, exportação de OPR, histórico de atividades) começam
        # BLOQUEADAS por padrão para usuários já existentes — ao contrário do
        # fallback geral (`.get(area, True)`), que abriria acesso por omissão.
        # O administrador concede manualmente quem pode acessá-las.
        for linha in conn.execute("SELECT id FROM usuarios WHERE perfil != ?", (PERFIL_ADMIN,)).fetchall():
            for area in AREAS_RESTRITAS_PADRAO_BLOQUEADO:
                ja_definida = conn.execute(
                    "SELECT 1 FROM permissoes_area WHERE usuario_id = ? AND area = ?", (linha["id"], area)
                ).fetchone()
                if not ja_definida:
                    conn.execute(
                        "INSERT INTO permissoes_area (usuario_id, area, permitido) VALUES (?, ?, 0)",
                        (linha["id"], area),
                    )

        _semear_configuracoes_padrao(conn)

    _aplicar_migracoes()
    _backup_diario_e_por_atualizacao()


# ---------------------------------------------------------------------------
# Usuários
# ---------------------------------------------------------------------------


def buscar_usuario(username: str) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute(
            "SELECT * FROM usuarios WHERE username = ? AND ativo = 1", (username,)
        ).fetchone()
        return dict(linha) if linha else None


def buscar_usuario_por_id(usuario_id: int) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM usuarios WHERE id = ?", (usuario_id,)).fetchone()
        return dict(linha) if linha else None


def criar_usuario(username: str, senha: str, nome_completo: str, perfil: str, executor: str, analista_vinculado: str | None = None) -> int:
    """Cria um usuário com senha inicial temporária — o próprio usuário será
    obrigado a defini-la novamente no primeiro acesso (`deve_trocar_senha`).
    `analista_vinculado` (opcional, tipicamente para perfil ANALISTA) associa
    o login a um nome de RESPONSAVEIS — é o que permite ao próprio usuário
    ver seus KPIs de prazo sem enxergar os de colegas (item 16.1)."""
    senha_hash = bcrypt.hashpw(senha.encode(), bcrypt.gensalt()).decode()
    agora = datetime.now().isoformat()
    with _conectar() as conn:
        cursor = conn.execute(
            "INSERT INTO usuarios (username, senha_hash, nome_completo, perfil, ativo, deve_trocar_senha, criado_em, analista_vinculado) "
            "VALUES (?, ?, ?, ?, 1, 1, ?, ?)",
            (username, senha_hash, nome_completo, perfil, agora, analista_vinculado),
        )
        usuario_id = cursor.lastrowid
        _semear_permissoes_perfil(conn, usuario_id, perfil)
        _registrar_evento_seguranca(conn, "CRIACAO_USUARIO", username, executor, f"Usuário criado com perfil {perfil}.")
        return usuario_id


def listar_usuarios() -> pd.DataFrame:
    """Só usuários ativos (não arquivados) — os arquivados pelo módulo
    Arquivo ficam disponíveis exclusivamente em `gat.arquivo_database`.
    Arquivar um analista não bloqueia o login por si só: isso continua
    sendo controlado pelo campo `ativo` já existente."""
    with _conectar() as conn:
        return pd.read_sql_query(
            "SELECT id, username, nome_completo, perfil, ativo, deve_trocar_senha, ultimo_acesso, criado_em, analista_vinculado "
            "FROM usuarios WHERE arquivado_em IS NULL ORDER BY username",
            conn,
        )


def alterar_senha(username: str, nova_senha: str) -> None:
    """Uso interno/legado — prefira `redefinir_senha_admin` ou `alterar_senha_usuario`."""
    senha_hash = bcrypt.hashpw(nova_senha.encode(), bcrypt.gensalt()).decode()
    with _conectar() as conn:
        conn.execute("UPDATE usuarios SET senha_hash = ? WHERE username = ?", (senha_hash, username))


def redefinir_senha_admin(username: str, nova_senha: str, executor: str) -> None:
    """Administrador redefine a senha de um usuário — força troca no próximo
    login e nunca expõe a senha atual (o hash antigo é apenas substituído)."""
    senha_hash = bcrypt.hashpw(nova_senha.encode(), bcrypt.gensalt()).decode()
    with _conectar() as conn:
        conn.execute(
            "UPDATE usuarios SET senha_hash = ?, deve_trocar_senha = 1 WHERE username = ?",
            (senha_hash, username),
        )
        _registrar_evento_seguranca(conn, "REDEFINICAO_SENHA_ADMIN", username, executor, "Senha redefinida pelo administrador; troca exigida no próximo login.")


def alterar_senha_usuario(username: str, senha_atual: str, nova_senha: str) -> bool:
    """Alteração de senha pelo próprio usuário (Meu Perfil). Retorna False se
    a senha atual informada não confere — nenhuma alteração é feita nesse caso."""
    with _conectar() as conn:
        linha = conn.execute("SELECT senha_hash FROM usuarios WHERE username = ?", (username,)).fetchone()
        if not linha:
            return False
        try:
            confere = bcrypt.checkpw(senha_atual.encode(), linha["senha_hash"].encode())
        except (ValueError, AttributeError):
            confere = False
        if not confere:
            return False
        senha_hash = bcrypt.hashpw(nova_senha.encode(), bcrypt.gensalt()).decode()
        conn.execute(
            "UPDATE usuarios SET senha_hash = ?, deve_trocar_senha = 0 WHERE username = ?",
            (senha_hash, username),
        )
        _registrar_evento_seguranca(conn, "ALTERACAO_SENHA_PROPRIA", username, username, "Usuário alterou a própria senha.")
        return True


def definir_tema_usuario(username: str, tema: str) -> None:
    """Salva a preferência de tema (Claro/Escuro) do próprio usuário —
    persistida no banco, individual por conta, sobrevive a logout/login e
    a reinicializações do sistema."""
    if tema not in ("claro", "escuro"):
        raise ValueError("Tema inválido — use 'claro' ou 'escuro'.")
    with _conectar() as conn:
        conn.execute("UPDATE usuarios SET tema_preferido = ? WHERE username = ?", (tema, username))


def concluir_troca_senha_obrigatoria(username: str, nova_senha: str) -> None:
    """Define a nova senha pessoal no primeiro acesso (ou após redefinição pelo
    administrador), encerrando a exigência de troca."""
    senha_hash = bcrypt.hashpw(nova_senha.encode(), bcrypt.gensalt()).decode()
    with _conectar() as conn:
        conn.execute(
            "UPDATE usuarios SET senha_hash = ?, deve_trocar_senha = 0 WHERE username = ?",
            (senha_hash, username),
        )
        _registrar_evento_seguranca(conn, "ALTERACAO_SENHA_PROPRIA", username, username, "Senha pessoal definida no primeiro acesso.")


def registrar_ultimo_acesso(username: str) -> None:
    with _conectar() as conn:
        conn.execute("UPDATE usuarios SET ultimo_acesso = ? WHERE username = ?", (datetime.now().isoformat(), username))


def atualizar_usuario(username: str, nome_completo: str, perfil: str, executor: str, analista_vinculado: str | None = None) -> None:
    with _conectar() as conn:
        anterior = conn.execute("SELECT nome_completo, perfil, analista_vinculado FROM usuarios WHERE username = ?", (username,)).fetchone()
        conn.execute(
            "UPDATE usuarios SET nome_completo = ?, perfil = ?, analista_vinculado = ? WHERE username = ?",
            (nome_completo, perfil, analista_vinculado, username),
        )
        if anterior and anterior["perfil"] != perfil:
            _registrar_evento_seguranca(
                conn, "ALTERACAO_PERFIL", username, executor,
                f"Perfil alterado de {anterior['perfil']} para {perfil}.",
            )
        if anterior and (anterior["analista_vinculado"] or None) != (analista_vinculado or None):
            _registrar_evento_seguranca(
                conn, "ALTERACAO_ANALISTA_VINCULADO", username, executor,
                f"Analista vinculado alterado de {anterior['analista_vinculado'] or '—'} para {analista_vinculado or '—'}.",
            )


def ativar_usuario(username: str, executor: str) -> None:
    with _conectar() as conn:
        conn.execute("UPDATE usuarios SET ativo = 1 WHERE username = ?", (username,))
        _registrar_evento_seguranca(conn, "ATIVACAO_USUARIO", username, executor, "Usuário ativado.")


def desativar_usuario(username: str, executor: str | None = None) -> None:
    with _conectar() as conn:
        conn.execute("UPDATE usuarios SET ativo = 0 WHERE username = ?", (username,))
        _registrar_evento_seguranca(conn, "INATIVACAO_USUARIO", username, executor or username, "Usuário inativado.")


def exigir_troca_senha_proximo_login(username: str, executor: str) -> None:
    with _conectar() as conn:
        conn.execute("UPDATE usuarios SET deve_trocar_senha = 1 WHERE username = ?", (username,))
        _registrar_evento_seguranca(conn, "EXIGENCIA_TROCA_SENHA", username, executor, "Troca de senha exigida no próximo login.")


# ---------------------------------------------------------------------------
# Permissões (módulos e áreas)
# ---------------------------------------------------------------------------


def permissoes_usuario(usuario_id: int) -> dict[str, dict[str, bool]]:
    """Retorna as permissões efetivas do usuário: {"modulos": {...}, "areas": {...}}."""
    with _conectar() as conn:
        modulos = {
            linha["modulo"]: bool(linha["permitido"])
            for linha in conn.execute("SELECT modulo, permitido FROM permissoes_modulo WHERE usuario_id = ?", (usuario_id,)).fetchall()
        }
        areas = {
            linha["area"]: bool(linha["permitido"])
            for linha in conn.execute("SELECT area, permitido FROM permissoes_area WHERE usuario_id = ?", (usuario_id,)).fetchall()
        }
    # Módulos/áreas sem linha própria (esquema mais novo que o usuário)
    # herdam o padrão liberado, para não quebrar contas já existentes.
    for modulo in MODULOS_CONTROLADOS:
        modulos.setdefault(modulo, True)
    for area in AREAS_PERMISSAO:
        areas.setdefault(area, True)
    return {"modulos": modulos, "areas": areas}


def modulo_permitido(usuario: dict, modulo: str) -> bool:
    if usuario.get("perfil") == PERFIL_ADMIN:
        return True
    return permissoes_usuario(usuario["id"])["modulos"].get(modulo, True)


def area_permitida(usuario: dict, area: str) -> bool:
    if usuario.get("perfil") == PERFIL_ADMIN:
        return True
    return permissoes_usuario(usuario["id"])["areas"].get(area, True)


def definir_permissao_modulo(usuario_id: int, username_alvo: str, modulo: str, permitido: bool, executor: str) -> None:
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO permissoes_modulo (usuario_id, modulo, permitido) VALUES (?, ?, ?) "
            "ON CONFLICT(usuario_id, modulo) DO UPDATE SET permitido = excluded.permitido",
            (usuario_id, modulo, 1 if permitido else 0),
        )
        acao = "CONCESSAO_ACESSO" if permitido else "RETIRADA_ACESSO"
        _registrar_evento_seguranca(conn, acao, username_alvo, executor, f"Módulo '{modulo}': {'liberado' if permitido else 'bloqueado'}.")


def definir_permissao_area(usuario_id: int, username_alvo: str, area: str, permitido: bool, executor: str) -> None:
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO permissoes_area (usuario_id, area, permitido) VALUES (?, ?, ?) "
            "ON CONFLICT(usuario_id, area) DO UPDATE SET permitido = excluded.permitido",
            (usuario_id, area, 1 if permitido else 0),
        )
        acao = "CONCESSAO_ACESSO" if permitido else "RETIRADA_ACESSO"
        _registrar_evento_seguranca(conn, acao, username_alvo, executor, f"Área '{area}': {'liberada' if permitido else 'bloqueada'}.")


def registrar_tentativa_acesso_bloqueado(username: str, alvo: str) -> None:
    with _conectar() as conn:
        _registrar_evento_seguranca(conn, "TENTATIVA_ACESSO_BLOQUEADO", username, username, f"Tentativa de acesso a '{alvo}' sem permissão.")


def _registrar_evento_seguranca(conn: sqlite3.Connection, evento: str, usuario_alvo: str, executor: str, detalhes: str) -> None:
    """Grava um evento de auditoria de segurança — nunca inclui senha ou hash."""
    conn.execute(
        "INSERT INTO historico_edicoes (tabela, registro_id, campo, valor_anterior, valor_novo, usuario, data_hora) "
        "VALUES ('seguranca', 0, ?, NULL, ?, ?, ?)",
        (evento, f"[{usuario_alvo}] {detalhes}", executor, datetime.now().isoformat()),
    )


# ---------------------------------------------------------------------------
# Validação de importação (item 1 do ajuste de governança)
# ---------------------------------------------------------------------------


def _diagnostico_item(conn: sqlite3.Connection, tabela: str) -> dict[str, Any]:
    total = conn.execute(f"SELECT COUNT(*) AS n FROM {tabela}").fetchone()["n"]
    limites = conn.execute(f"SELECT MIN(item) AS mn, MAX(item) AS mx FROM {tabela} WHERE item IS NOT NULL").fetchone()
    minimo, maximo = limites["mn"], limites["mx"]
    faltantes: list[int] = []
    if minimo is not None and maximo is not None:
        existentes = {
            linha["item"] for linha in conn.execute(f"SELECT DISTINCT item AS item FROM {tabela} WHERE item IS NOT NULL").fetchall()
        }
        faltantes = sorted(set(range(minimo, maximo + 1)) - existentes)
    return {
        "total_importados": total,
        "item_minimo": minimo,
        "item_maximo": maximo,
        "itens_ausentes_na_origem": faltantes,
    }


def relatorio_validacao_importacao() -> dict[str, dict[str, Any]]:
    """Relatório de validação da importação, calculado inteiramente a partir
    do banco (não depende do arquivo de origem estar disponível em produção).

    A numeração de Item é preservada tal como veio da planilha (nunca
    renumerada); quando há números de Item ausentes na sequência, isso
    reflete linhas que já não existem fisicamente na planilha de origem
    (excluídas na origem antes da importação) — não uma falha da importação,
    que sempre grava todas as linhas com nome e data de solicitação
    preenchidos, sem aplicar nenhum filtro de status, duplicidade ou PEP.
    """
    with _conectar() as conn:
        prest = _diagnostico_item(conn, "prestadores")
        cess = _diagnostico_item(conn, "cessionarios")
    return {"prestadores": prest, "cessionarios": cess}


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


def registrar_historico(conn: sqlite3.Connection, tabela: str, registro_id: int, antigo: dict, novo: dict, usuario: str) -> None:
    """Versão pública de `_registrar_historico`, para módulos independentes
    (ex.: PMO) reaproveitarem o mesmo mecanismo de auditoria por campo já
    usado pelo GAT, sem depender de um nome privado."""
    _registrar_historico(conn, tabela, registro_id, antigo, novo, usuario)


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


def registrar_repactuacao_prazo(tabela: str, registro_id: int, data_anterior: str | None, data_nova: str | None, motivo: str, usuario: str) -> None:
    agora = datetime.now().isoformat()
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO repactuacoes_prazo (tabela, registro_id, data_anterior, data_nova, motivo, usuario, data_hora) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (tabela, registro_id, data_anterior, data_nova, motivo, usuario, agora),
        )


def listar_repactuacoes_prazo(tabela: str, registro_id: int) -> pd.DataFrame:
    with _conectar() as conn:
        return pd.read_sql_query(
            "SELECT * FROM repactuacoes_prazo WHERE tabela = ? AND registro_id = ? ORDER BY data_hora DESC",
            conn, params=(tabela, registro_id),
        )


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
    """Só análises ativas — as arquivadas pelo módulo Arquivo ficam
    disponíveis exclusivamente em `gat.arquivo_database`."""
    with _conectar() as conn:
        return pd.read_sql_query("SELECT * FROM prestadores WHERE arquivado_em IS NULL ORDER BY item, id", conn)


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
    """Só análises ativas — as arquivadas pelo módulo Arquivo ficam
    disponíveis exclusivamente em `gat.arquivo_database`."""
    with _conectar() as conn:
        return pd.read_sql_query("SELECT * FROM cessionarios WHERE arquivado_em IS NULL ORDER BY item, id", conn)


def obter_cessionario(registro_id: int) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM cessionarios WHERE id = ?", (registro_id,)).fetchone()
        return dict(linha) if linha else None


# ---------------------------------------------------------------------------
# Cadastro mestre de Prestadores (empresa, PEP, contatos — não é uma análise)
# ---------------------------------------------------------------------------


def inserir_cadastro_prestador(dados: dict[str, Any], usuario: str) -> int:
    codigo = (dados.get("codigo") or "").strip()
    if not codigo:
        raise ValueError("Código do prestador é obrigatório.")
    with _conectar() as conn:
        if conn.execute("SELECT id FROM cadastro_prestadores WHERE codigo = ?", (codigo,)).fetchone():
            raise ValueError(f"Já existe um cadastro de prestador com o código '{codigo}'.")
        campos = {c: dados.get(c) for c in COLUNAS_CADASTRO_PRESTADORES}
        campos["codigo"] = codigo
        campos["status"] = campos.get("status") or "ATIVO"
        campos["possui_pep"] = campos.get("possui_pep") or "NAO"
        agora = datetime.now().isoformat()
        cursor = conn.execute(
            f"INSERT INTO cadastro_prestadores ({', '.join(campos.keys())}, criado_em, criado_por, atualizado_em, atualizado_por) "
            f"VALUES ({', '.join(['?'] * len(campos))}, ?, ?, ?, ?)",
            (*campos.values(), agora, usuario, agora, usuario),
        )
        novo_id = cursor.lastrowid
        _registrar_historico(conn, "cadastro_prestadores", novo_id, {}, campos, usuario)
        return novo_id


def atualizar_cadastro_prestador(registro_id: int, dados: dict[str, Any], usuario: str) -> None:
    codigo = (dados.get("codigo") or "").strip()
    if not codigo:
        raise ValueError("Código do prestador é obrigatório.")
    with _conectar() as conn:
        antigo = conn.execute("SELECT * FROM cadastro_prestadores WHERE id = ?", (registro_id,)).fetchone()
        antigo_dict = dict(antigo) if antigo else {}
        if conn.execute("SELECT id FROM cadastro_prestadores WHERE codigo = ? AND id != ?", (codigo, registro_id)).fetchone():
            raise ValueError(f"Já existe outro cadastro de prestador com o código '{codigo}'.")
        campos = {c: dados.get(c) for c in COLUNAS_CADASTRO_PRESTADORES}
        campos["codigo"] = codigo
        campos["status"] = campos.get("status") or "ATIVO"
        campos["possui_pep"] = campos.get("possui_pep") or "NAO"
        agora = datetime.now().isoformat()
        set_clause = ", ".join(f"{c} = ?" for c in campos)
        conn.execute(
            f"UPDATE cadastro_prestadores SET {set_clause}, atualizado_em = ?, atualizado_por = ? WHERE id = ?",
            (*campos.values(), agora, usuario, registro_id),
        )
        _registrar_historico(conn, "cadastro_prestadores", registro_id, antigo_dict, campos, usuario)


def listar_cadastro_prestadores() -> pd.DataFrame:
    """Só prestadores ativos — os arquivados pelo módulo Arquivo ficam
    disponíveis exclusivamente em `gat.arquivo_database`."""
    with _conectar() as conn:
        return pd.read_sql_query("SELECT * FROM cadastro_prestadores WHERE arquivado_em IS NULL ORDER BY codigo", conn)


def obter_cadastro_prestador(registro_id: int) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM cadastro_prestadores WHERE id = ?", (registro_id,)).fetchone()
        return dict(linha) if linha else None


def obter_cadastro_prestador_por_codigo(codigo: str) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM cadastro_prestadores WHERE codigo = ?", (codigo,)).fetchone()
        return dict(linha) if linha else None


def definir_status_cadastro_prestador(registro_id: int, status: str, usuario: str) -> None:
    with _conectar() as conn:
        antigo = conn.execute("SELECT status FROM cadastro_prestadores WHERE id = ?", (registro_id,)).fetchone()
        antigo_dict = dict(antigo) if antigo else {}
        agora = datetime.now().isoformat()
        conn.execute(
            "UPDATE cadastro_prestadores SET status = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?",
            (status, agora, usuario, registro_id),
        )
        _registrar_historico(conn, "cadastro_prestadores", registro_id, antigo_dict, {"status": status}, usuario)


# ---------------------------------------------------------------------------
# Obras / Áreas vinculadas a um prestador (inclui identificação de canteiro)
# ---------------------------------------------------------------------------


def inserir_obra_prestador(dados: dict[str, Any], usuario: str) -> int:
    if not dados.get("prestador_id"):
        raise ValueError("Prestador é obrigatório para cadastrar uma obra.")
    if not (dados.get("nome_obra") or "").strip():
        raise ValueError("Nome da obra é obrigatório.")
    with _conectar() as conn:
        campos = {c: dados.get(c) for c in COLUNAS_OBRAS_PRESTADOR}
        campos["e_canteiro"] = 1 if campos.get("e_canteiro") else 0
        campos["status"] = campos.get("status") or "ATIVA"
        agora = datetime.now().isoformat()
        cursor = conn.execute(
            f"INSERT INTO obras_prestador ({', '.join(campos.keys())}, criado_em, criado_por, atualizado_em, atualizado_por) "
            f"VALUES ({', '.join(['?'] * len(campos))}, ?, ?, ?, ?)",
            (*campos.values(), agora, usuario, agora, usuario),
        )
        novo_id = cursor.lastrowid
        _registrar_historico(conn, "obras_prestador", novo_id, {}, campos, usuario)
        return novo_id


def atualizar_obra_prestador(registro_id: int, dados: dict[str, Any], usuario: str) -> None:
    with _conectar() as conn:
        antigo = conn.execute("SELECT * FROM obras_prestador WHERE id = ?", (registro_id,)).fetchone()
        antigo_dict = dict(antigo) if antigo else {}
        campos = {c: dados.get(c) for c in COLUNAS_OBRAS_PRESTADOR}
        campos["e_canteiro"] = 1 if campos.get("e_canteiro") else 0
        campos["status"] = campos.get("status") or "ATIVA"
        agora = datetime.now().isoformat()
        set_clause = ", ".join(f"{c} = ?" for c in campos)
        conn.execute(
            f"UPDATE obras_prestador SET {set_clause}, atualizado_em = ?, atualizado_por = ? WHERE id = ?",
            (*campos.values(), agora, usuario, registro_id),
        )
        _registrar_historico(conn, "obras_prestador", registro_id, antigo_dict, campos, usuario)


def listar_obras_prestador(prestador_id: int | None = None) -> pd.DataFrame:
    with _conectar() as conn:
        if prestador_id is None:
            return pd.read_sql_query("SELECT * FROM obras_prestador ORDER BY nome_obra", conn)
        return pd.read_sql_query(
            "SELECT * FROM obras_prestador WHERE prestador_id = ? ORDER BY nome_obra", conn, params=(prestador_id,)
        )


def obter_obra_prestador(registro_id: int) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM obras_prestador WHERE id = ?", (registro_id,)).fetchone()
        return dict(linha) if linha else None


def nome_exibicao_obra(obra: dict[str, Any]) -> str:
    """Nome de exibição da obra — "CANTEIRO – <nome>" quando marcada como
    canteiro, sem alterar o nome original armazenado no banco."""
    nome = obra.get("nome_obra") or ""
    return f"CANTEIRO – {nome}" if obra.get("e_canteiro") else nome


# ---------------------------------------------------------------------------
# Cadastro mestre de Cessionários (empresa, RVP/RCI/LUC, contatos)
# ---------------------------------------------------------------------------


def inserir_cadastro_cessionario(dados: dict[str, Any], usuario: str) -> int:
    codigo = (dados.get("codigo") or "").strip()
    if not codigo:
        raise ValueError("Código do cessionário é obrigatório.")
    with _conectar() as conn:
        if conn.execute("SELECT id FROM cadastro_cessionarios WHERE codigo = ?", (codigo,)).fetchone():
            raise ValueError(f"Já existe um cadastro de cessionário com o código '{codigo}'.")
        campos = {c: dados.get(c) for c in COLUNAS_CADASTRO_CESSIONARIOS}
        campos["codigo"] = codigo
        campos["status"] = campos.get("status") or "ATIVO"
        agora = datetime.now().isoformat()
        cursor = conn.execute(
            f"INSERT INTO cadastro_cessionarios ({', '.join(campos.keys())}, criado_em, criado_por, atualizado_em, atualizado_por) "
            f"VALUES ({', '.join(['?'] * len(campos))}, ?, ?, ?, ?)",
            (*campos.values(), agora, usuario, agora, usuario),
        )
        novo_id = cursor.lastrowid
        _registrar_historico(conn, "cadastro_cessionarios", novo_id, {}, campos, usuario)
        return novo_id


def atualizar_cadastro_cessionario(registro_id: int, dados: dict[str, Any], usuario: str) -> None:
    codigo = (dados.get("codigo") or "").strip()
    if not codigo:
        raise ValueError("Código do cessionário é obrigatório.")
    with _conectar() as conn:
        antigo = conn.execute("SELECT * FROM cadastro_cessionarios WHERE id = ?", (registro_id,)).fetchone()
        antigo_dict = dict(antigo) if antigo else {}
        if conn.execute("SELECT id FROM cadastro_cessionarios WHERE codigo = ? AND id != ?", (codigo, registro_id)).fetchone():
            raise ValueError(f"Já existe outro cadastro de cessionário com o código '{codigo}'.")
        campos = {c: dados.get(c) for c in COLUNAS_CADASTRO_CESSIONARIOS}
        campos["codigo"] = codigo
        campos["status"] = campos.get("status") or "ATIVO"
        agora = datetime.now().isoformat()
        set_clause = ", ".join(f"{c} = ?" for c in campos)
        conn.execute(
            f"UPDATE cadastro_cessionarios SET {set_clause}, atualizado_em = ?, atualizado_por = ? WHERE id = ?",
            (*campos.values(), agora, usuario, registro_id),
        )
        _registrar_historico(conn, "cadastro_cessionarios", registro_id, antigo_dict, campos, usuario)


def listar_cadastro_cessionarios() -> pd.DataFrame:
    """Só cessionários ativos — os arquivados pelo módulo Arquivo ficam
    disponíveis exclusivamente em `gat.arquivo_database`."""
    with _conectar() as conn:
        return pd.read_sql_query("SELECT * FROM cadastro_cessionarios WHERE arquivado_em IS NULL ORDER BY codigo", conn)


def obter_cadastro_cessionario(registro_id: int) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM cadastro_cessionarios WHERE id = ?", (registro_id,)).fetchone()
        return dict(linha) if linha else None


def obter_cadastro_cessionario_por_codigo(codigo: str) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM cadastro_cessionarios WHERE codigo = ?", (codigo,)).fetchone()
        return dict(linha) if linha else None


def definir_status_cadastro_cessionario(registro_id: int, status: str, usuario: str) -> None:
    with _conectar() as conn:
        antigo = conn.execute("SELECT status FROM cadastro_cessionarios WHERE id = ?", (registro_id,)).fetchone()
        antigo_dict = dict(antigo) if antigo else {}
        agora = datetime.now().isoformat()
        conn.execute(
            "UPDATE cadastro_cessionarios SET status = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?",
            (status, agora, usuario, registro_id),
        )
        _registrar_historico(conn, "cadastro_cessionarios", registro_id, antigo_dict, {"status": status}, usuario)


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

# Coluna aditiva (item "Reuniões" do módulo PMO): identifica se a reunião
# pertence ao GAT ou ao PMO. GAT nunca informa este campo em `dados` — por
# isso o valor é sempre resolvido explicitamente para 'GAT' aqui, nunca
# deixado para o DEFAULT da coluna (que não se aplica a um INSERT/UPDATE
# que já lista a coluna com um parâmetro).
_ORIGEM_PADRAO = "GAT"


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
    campos["origem"] = dados.get("origem") or _ORIGEM_PADRAO
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
        campos["origem"] = dados.get("origem") or (antigo_dict.get("origem") or _ORIGEM_PADRAO)
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
    """Só reuniões ativas — as arquivadas pelo módulo Arquivo ficam
    disponíveis exclusivamente em `gat.arquivo_database`."""
    with _conectar() as conn:
        return pd.read_sql_query(
            "SELECT * FROM reunioes WHERE arquivado_em IS NULL ORDER BY COALESCE(data_prevista, criado_em) DESC", conn
        )


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
        return pd.read_sql_query(
            "SELECT * FROM planos_acao WHERE reuniao_id = ? AND arquivado_em IS NULL ORDER BY id", conn, params=(reuniao_id,)
        )


# ---------------------------------------------------------------------------
# Planos de Ação (Central de Gestão)
# ---------------------------------------------------------------------------

COLUNAS_PLANO_ACAO = ["reuniao_id", "descricao", "responsavel", "prazo", "status", "pmo_projeto_id"]


def inserir_plano_acao(dados: dict[str, Any], usuario: str) -> int:
    agora = datetime.now().isoformat()
    campos = {c: dados.get(c) for c in COLUNAS_PLANO_ACAO}
    campos["origem"] = dados.get("origem") or _ORIGEM_PADRAO
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
        campos["origem"] = dados.get("origem") or (antigo_dict.get("origem") or _ORIGEM_PADRAO)
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


# ---------------------------------------------------------------------------
# Relatórios mensais (competência, comparativos e observações gerenciais)
# ---------------------------------------------------------------------------


def listar_anos_disponiveis() -> list[int]:
    """Anos com pelo menos uma Data de Solicitação registrada, para popular o
    seletor de competência (Mês/Ano) dos dashboards e relatórios."""
    with _conectar() as conn:
        anos: set[int] = set()
        for tabela in ("prestadores", "cessionarios"):
            for linha in conn.execute(
                f"SELECT DISTINCT substr(data_solicitacao, 1, 4) AS ano FROM {tabela} WHERE data_solicitacao IS NOT NULL"
            ).fetchall():
                if linha["ano"] and linha["ano"].isdigit():
                    anos.add(int(linha["ano"]))
    return sorted(anos, reverse=True)


def obter_observacao_mensal(competencia: str) -> str:
    with _conectar() as conn:
        linha = conn.execute(
            "SELECT texto FROM observacoes_mensais WHERE competencia = ?", (competencia,)
        ).fetchone()
        return linha["texto"] if linha else ""


def salvar_observacao_mensal(competencia: str, texto: str, usuario: str) -> None:
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO observacoes_mensais (competencia, texto, atualizado_em, atualizado_por) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(competencia) DO UPDATE SET texto = excluded.texto, atualizado_em = excluded.atualizado_em, "
            "atualizado_por = excluded.atualizado_por",
            (competencia, texto, datetime.now().isoformat(), usuario),
        )


def listar_planos_acao() -> pd.DataFrame:
    """Só planos de ação ativos — os arquivados pelo módulo Arquivo ficam
    disponíveis exclusivamente em `gat.arquivo_database`."""
    with _conectar() as conn:
        return pd.read_sql_query(
            "SELECT * FROM planos_acao WHERE arquivado_em IS NULL ORDER BY COALESCE(prazo, criado_em) ASC", conn
        )


def obter_plano_acao(plano_id: int) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM planos_acao WHERE id = ?", (plano_id,)).fetchone()
        return dict(linha) if linha else None


# ---------------------------------------------------------------------------
# Avaliação de Prestadores/Cessionários (checklist)
# ---------------------------------------------------------------------------

COLUNAS_AVALIACAO_CHECKLIST = [
    "tipo_entidade", "codigo_entidade", "nome_entidade", "disciplina", "projeto_id",
    "at_referencia", "revisao", "data_avaliacao", "analista_responsavel",
    "respostas_json", "pontuacao", "classificacao", "acompanhamento", "observacoes_gerais",
    "obra_id",
]


def inserir_avaliacao_checklist(dados: dict[str, Any], usuario: str) -> int:
    agora = datetime.now().isoformat()
    with _conectar() as conn:
        cursor = conn.execute(
            "INSERT INTO avaliacoes_checklist ("
            + ", ".join(COLUNAS_AVALIACAO_CHECKLIST)
            + ", criado_em, criado_por) VALUES ("
            + ", ".join(["?"] * len(COLUNAS_AVALIACAO_CHECKLIST))
            + ", ?, ?)",
            (*[dados.get(c) for c in COLUNAS_AVALIACAO_CHECKLIST], agora, usuario),
        )
        _registrar_historico(conn, "avaliacoes_checklist", cursor.lastrowid, {}, dados, usuario)
        return cursor.lastrowid


def atualizar_avaliacao_checklist(avaliacao_id: int, dados: dict[str, Any], usuario: str) -> None:
    with _conectar() as conn:
        antigo = conn.execute("SELECT * FROM avaliacoes_checklist WHERE id = ?", (avaliacao_id,)).fetchone()
        antigo_dict = dict(antigo) if antigo else {}
        campos = {c: dados.get(c) for c in COLUNAS_AVALIACAO_CHECKLIST}
        set_clause = ", ".join(f"{c} = ?" for c in campos)
        conn.execute(
            f"UPDATE avaliacoes_checklist SET {set_clause} WHERE id = ?",
            (*campos.values(), avaliacao_id),
        )
        _registrar_historico(conn, "avaliacoes_checklist", avaliacao_id, antigo_dict, campos, usuario)


def listar_avaliacoes_checklist(tipo_entidade: str | None = None) -> pd.DataFrame:
    with _conectar() as conn:
        if tipo_entidade:
            return pd.read_sql_query(
                "SELECT * FROM avaliacoes_checklist WHERE tipo_entidade = ? ORDER BY data_avaliacao DESC",
                conn, params=(tipo_entidade,),
            )
        return pd.read_sql_query("SELECT * FROM avaliacoes_checklist ORDER BY data_avaliacao DESC", conn)


def obter_avaliacao_checklist(avaliacao_id: int) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM avaliacoes_checklist WHERE id = ?", (avaliacao_id,)).fetchone()
        return dict(linha) if linha else None


def obter_avaliacao_checklist_por_revisao(
    tipo_entidade: str, at_referencia: str | None, disciplina: str | None, revisao: int, analista_responsavel: str | None
) -> dict[str, Any] | None:
    """Localiza uma avaliação já existente para a mesma AT + disciplina +
    revisão + analista responsável — usado para impedir duplicidade
    (item 7 da alteração de alertas/avaliações): cada revisão pode ter sua
    própria avaliação (Rev.01, Rev.02, Rev.03...), mas duas avaliações para
    a MESMA revisão da MESMA AT devem ser tratadas como o mesmo registro
    (atualiza o existente em vez de criar um novo). Sem AT informada, não
    há chave confiável para checar — retorna None (não impede o cadastro)."""
    if not at_referencia or not str(at_referencia).strip():
        return None
    with _conectar() as conn:
        linha = conn.execute(
            "SELECT * FROM avaliacoes_checklist WHERE tipo_entidade = ? AND at_referencia = ? AND revisao = ? "
            "AND COALESCE(disciplina, '') = COALESCE(?, '') AND COALESCE(analista_responsavel, '') = COALESCE(?, '') "
            "LIMIT 1",
            (tipo_entidade, str(at_referencia).strip(), int(revisao), disciplina, analista_responsavel),
        ).fetchone()
        return dict(linha) if linha else None


def existe_avaliacao_checklist(tipo_entidade: str, codigo_entidade: str | None, nome_entidade: str, disciplina: str | None) -> bool:
    """Usado para o indicador de avaliação obrigatória na REV1: True se já existe
    ao menos uma avaliação para esta combinação entidade + disciplina."""
    with _conectar() as conn:
        if codigo_entidade:
            linha = conn.execute(
                "SELECT 1 FROM avaliacoes_checklist WHERE tipo_entidade = ? AND codigo_entidade = ? "
                "AND COALESCE(disciplina, '') = COALESCE(?, '') LIMIT 1",
                (tipo_entidade, codigo_entidade, disciplina),
            ).fetchone()
        else:
            linha = conn.execute(
                "SELECT 1 FROM avaliacoes_checklist WHERE tipo_entidade = ? AND nome_entidade = ? "
                "AND COALESCE(disciplina, '') = COALESCE(?, '') LIMIT 1",
                (tipo_entidade, nome_entidade, disciplina),
            ).fetchone()
        return linha is not None


# ---------------------------------------------------------------------------
# Avaliação (nota) dos Analistas — restrita
# ---------------------------------------------------------------------------

COLUNAS_AVALIACAO_ANALISTA = [
    "analista", "avaliador", "mes", "ano", "etg", "horario", "reunioes", "disponibilidade",
    "conhecimento_tecnico", "produtividade", "qualidade", "qtd_documentos", "qtd_ats",
    "prazos", "organizacao", "colaboracao", "comunicacao", "justificativa", "observacoes",
]


def inserir_avaliacao_analista(dados: dict[str, Any], usuario: str) -> int:
    agora = datetime.now().isoformat()
    with _conectar() as conn:
        cursor = conn.execute(
            "INSERT INTO avaliacoes_analistas ("
            + ", ".join(COLUNAS_AVALIACAO_ANALISTA)
            + ", criado_em, criado_por) VALUES ("
            + ", ".join(["?"] * len(COLUNAS_AVALIACAO_ANALISTA))
            + ", ?, ?)",
            (*[dados.get(c) for c in COLUNAS_AVALIACAO_ANALISTA], agora, usuario),
        )
        _registrar_historico(conn, "avaliacoes_analistas", cursor.lastrowid, {}, dados, usuario)
        return cursor.lastrowid


def atualizar_avaliacao_analista(avaliacao_id: int, dados: dict[str, Any], usuario: str) -> None:
    with _conectar() as conn:
        antigo = conn.execute("SELECT * FROM avaliacoes_analistas WHERE id = ?", (avaliacao_id,)).fetchone()
        antigo_dict = dict(antigo) if antigo else {}
        campos = {c: dados.get(c) for c in COLUNAS_AVALIACAO_ANALISTA}
        set_clause = ", ".join(f"{c} = ?" for c in campos)
        conn.execute(
            f"UPDATE avaliacoes_analistas SET {set_clause} WHERE id = ?",
            (*campos.values(), avaliacao_id),
        )
        _registrar_historico(conn, "avaliacoes_analistas", avaliacao_id, antigo_dict, campos, usuario)


def listar_avaliacoes_analistas(analista: str | None = None) -> pd.DataFrame:
    with _conectar() as conn:
        if analista:
            return pd.read_sql_query(
                "SELECT * FROM avaliacoes_analistas WHERE analista = ? ORDER BY ano DESC, mes DESC",
                conn, params=(analista,),
            )
        return pd.read_sql_query("SELECT * FROM avaliacoes_analistas ORDER BY ano DESC, mes DESC", conn)


# ---------------------------------------------------------------------------
# Fechamento mensal da nota do analista (persistente e imutável)
# ---------------------------------------------------------------------------

COLUNAS_FECHAMENTO_AVALIACAO_ANALISTA = [
    "avaliacao_analista_id", "analista", "mes", "ano", "nota_original",
    "avaliacoes_obrigatorias", "avaliacoes_pendentes", "ats_pendentes",
    "penalizacao_fracao", "bonificacao", "nota_final",
    "justificativa_automatica", "recomendacao_gerencial",
]


def obter_fechamento_avaliacao_analista(analista: str, mes: int, ano: int) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute(
            "SELECT * FROM fechamentos_avaliacao_analista WHERE analista = ? AND mes = ? AND ano = ?",
            (analista, mes, ano),
        ).fetchone()
        return dict(linha) if linha else None


def listar_fechamentos_avaliacao_analista(mes: int | None = None, ano: int | None = None) -> pd.DataFrame:
    query = "SELECT * FROM fechamentos_avaliacao_analista WHERE 1=1"
    params: list[Any] = []
    if mes is not None:
        query += " AND mes = ?"
        params.append(mes)
    if ano is not None:
        query += " AND ano = ?"
        params.append(ano)
    with _conectar() as conn:
        return pd.read_sql_query(query + " ORDER BY ano DESC, mes DESC, analista", conn, params=params)


def fechar_avaliacao_analista(dados: dict[str, Any], usuario: str) -> int:
    """
    Congela a nota final calculada para um analista/competência — a
    partir daqui, essa nota não é mais recalculada automaticamente (ver
    `views/avaliacao_analistas.py`). Falha se a competência já estiver
    fechada (`UNIQUE(analista, mes, ano)`); nesse caso, use
    `recalcular_fechamento_avaliacao_analista`, restrito ao Administrador.
    """
    agora = datetime.now().isoformat()
    with _conectar() as conn:
        campos = {c: dados.get(c) for c in COLUNAS_FECHAMENTO_AVALIACAO_ANALISTA}
        cursor = conn.execute(
            "INSERT INTO fechamentos_avaliacao_analista ("
            + ", ".join(campos)
            + ", data_fechamento, usuario_fechamento) VALUES ("
            + ", ".join(["?"] * len(campos))
            + ", ?, ?)",
            (*campos.values(), agora, usuario),
        )
        _registrar_evento_seguranca(
            conn, "FECHAMENTO_AVALIACAO_ANALISTA", dados["analista"], usuario,
            f"Competência {dados['mes']:02d}/{dados['ano']} fechada com nota final {dados['nota_final']}.",
        )
        return cursor.lastrowid


def recalcular_fechamento_avaliacao_analista(analista: str, mes: int, ano: int, dados: dict[str, Any], usuario_admin: str) -> None:
    """Sobrescreve um fechamento já existente — ação restrita ao
    Administrador (`gat/permissions.py`/perfil), sempre registrada como
    evento de segurança com a nota anterior e a nova, para auditoria."""
    with _conectar() as conn:
        anterior = conn.execute(
            "SELECT * FROM fechamentos_avaliacao_analista WHERE analista = ? AND mes = ? AND ano = ?",
            (analista, mes, ano),
        ).fetchone()
        if anterior is None:
            raise ValueError("Não existe fechamento anterior para recalcular — use fechar_avaliacao_analista.")

        campos = {c: dados.get(c) for c in COLUNAS_FECHAMENTO_AVALIACAO_ANALISTA}
        set_clause = ", ".join(f"{c} = ?" for c in campos)
        conn.execute(
            f"UPDATE fechamentos_avaliacao_analista SET {set_clause}, data_fechamento = ?, usuario_fechamento = ? "
            "WHERE analista = ? AND mes = ? AND ano = ?",
            (*campos.values(), datetime.now().isoformat(), usuario_admin, analista, mes, ano),
        )
        _registrar_evento_seguranca(
            conn, "RECALCULO_AVALIACAO_ANALISTA", analista, usuario_admin,
            f"Competência {mes:02d}/{ano} recalculada: nota final {anterior['nota_final']} -> {dados['nota_final']}.",
        )


# ---------------------------------------------------------------------------
# Alertas — radar (retirar/reativar)
# ---------------------------------------------------------------------------


STATUS_ALERTA_OPCOES = ["PENDENTE", "EM_TRATAMENTO", "TRATADO", "ADIADO", "RETIRADO", "REABERTO"]


def status_radar(modulo: str, projeto_id: int, tipo_alerta: str) -> str:
    with _conectar() as conn:
        linha = conn.execute(
            "SELECT status FROM alertas_radar WHERE modulo = ? AND projeto_id = ? AND tipo_alerta = ?",
            (modulo, projeto_id, tipo_alerta),
        ).fetchone()
        return linha["status"] if linha else "PENDENTE"


def _upsert_alerta(modulo: str, projeto_id: int, tipo_alerta: str, campos: dict[str, Any], usuario: str, status_anterior: str | None = None) -> None:
    agora = datetime.now().isoformat()
    campos = {**campos, "atualizado_em": agora, "atualizado_por": usuario}
    colunas = list(campos.keys())
    with _conectar() as conn:
        conn.execute(
            f"INSERT INTO alertas_radar (modulo, projeto_id, tipo_alerta, {', '.join(colunas)}) "
            f"VALUES (?, ?, ?, {', '.join(['?'] * len(colunas))}) "
            f"ON CONFLICT(modulo, projeto_id, tipo_alerta) DO UPDATE SET "
            + ", ".join(f"{c} = excluded.{c}" for c in colunas),
            (modulo, projeto_id, tipo_alerta, *campos.values()),
        )
        _registrar_historico(conn, "alertas_radar", projeto_id, {"status": status_anterior}, {"status": campos.get("status")}, usuario)


def retirar_do_radar(modulo: str, projeto_id: int, tipo_alerta: str, justificativa: str, usuario: str) -> None:
    status_anterior = status_radar(modulo, projeto_id, tipo_alerta)
    _upsert_alerta(modulo, projeto_id, tipo_alerta, {"status": "RETIRADO", "justificativa": justificativa}, usuario, status_anterior)


def reativar_no_radar(modulo: str, projeto_id: int, tipo_alerta: str, usuario: str) -> None:
    status_anterior = status_radar(modulo, projeto_id, tipo_alerta)
    _upsert_alerta(modulo, projeto_id, tipo_alerta, {"status": "REABERTO"}, usuario, status_anterior)


def iniciar_tratamento_alerta(modulo: str, projeto_id: int, tipo_alerta: str, usuario: str) -> None:
    status_anterior = status_radar(modulo, projeto_id, tipo_alerta)
    _upsert_alerta(modulo, projeto_id, tipo_alerta, {"status": "EM_TRATAMENTO"}, usuario, status_anterior)


def marcar_tratado_alerta(modulo: str, projeto_id: int, tipo_alerta: str, providencia: str, responsavel: str, observacao: str | None, usuario: str) -> None:
    status_anterior = status_radar(modulo, projeto_id, tipo_alerta)
    _upsert_alerta(
        modulo, projeto_id, tipo_alerta,
        {
            "status": "TRATADO", "providencia": providencia, "responsavel_tratamento": responsavel,
            "data_tratamento": datetime.now().isoformat(), "observacao": observacao,
        },
        usuario, status_anterior,
    )


def adiar_alerta(modulo: str, projeto_id: int, tipo_alerta: str, adiado_para: str | None, observacao: str | None, usuario: str) -> None:
    status_anterior = status_radar(modulo, projeto_id, tipo_alerta)
    _upsert_alerta(modulo, projeto_id, tipo_alerta, {"status": "ADIADO", "adiado_para": adiado_para, "observacao": observacao}, usuario, status_anterior)


def reabrir_alerta(modulo: str, projeto_id: int, tipo_alerta: str, usuario: str) -> None:
    status_anterior = status_radar(modulo, projeto_id, tipo_alerta)
    _upsert_alerta(modulo, projeto_id, tipo_alerta, {"status": "REABERTO"}, usuario, status_anterior)


def listar_radar() -> pd.DataFrame:
    with _conectar() as conn:
        return pd.read_sql_query("SELECT * FROM alertas_radar ORDER BY atualizado_em DESC", conn)


# ---------------------------------------------------------------------------
# Alertas manuais (item 1 do módulo de SLA/Prioridades)
# ---------------------------------------------------------------------------

PRIORIDADE_ALERTA_MANUAL_OPCOES = ["Baixa", "Média", "Alta", "Urgente"]
STATUS_ALERTA_MANUAL_OPCOES = ["ABERTO", "ENCERRADO"]

_CAMPOS_ALERTA_MANUAL = [
    "modulo", "projeto_id", "titulo", "descricao", "num_at", "codigo_projeto",
    "nome_entidade", "disciplina", "revisao", "especialista", "prioridade",
    "vencimento", "observacoes", "destinatarios",
]


def criar_alerta_manual(dados: dict[str, Any], usuario: str) -> int:
    agora = datetime.now().isoformat()
    campos = {chave: dados.get(chave) for chave in _CAMPOS_ALERTA_MANUAL}
    with _conectar() as conn:
        cursor = conn.execute(
            f"INSERT INTO alertas_manuais ({', '.join(campos.keys())}, status, criado_por, criado_em) "
            f"VALUES ({', '.join(['?'] * len(campos))}, 'ABERTO', ?, ?)",
            (*campos.values(), usuario, agora),
        )
        alerta_id = cursor.lastrowid
        _registrar_historico(conn, "alertas_manuais", alerta_id, {}, {"status": "ABERTO", **campos}, usuario)
        return alerta_id


def obter_alerta_manual(alerta_id: int) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM alertas_manuais WHERE id = ?", (alerta_id,)).fetchone()
        return dict(linha) if linha else None


def atualizar_alerta_manual(alerta_id: int, dados: dict[str, Any], usuario: str) -> None:
    anterior = obter_alerta_manual(alerta_id)
    if anterior is None:
        return
    agora = datetime.now().isoformat()
    campos = {chave: dados.get(chave) for chave in _CAMPOS_ALERTA_MANUAL}
    with _conectar() as conn:
        conn.execute(
            f"UPDATE alertas_manuais SET {', '.join(f'{c} = ?' for c in campos)}, atualizado_por = ?, atualizado_em = ? "
            "WHERE id = ?",
            (*campos.values(), usuario, agora, alerta_id),
        )
        _registrar_historico(conn, "alertas_manuais", alerta_id, anterior, campos, usuario)


def encerrar_alerta_manual(alerta_id: int, motivo: str, usuario: str) -> None:
    agora = datetime.now().isoformat()
    with _conectar() as conn:
        conn.execute(
            "UPDATE alertas_manuais SET status = 'ENCERRADO', motivo_encerramento = ?, "
            "encerrado_por = ?, encerrado_em = ? WHERE id = ?",
            (motivo, usuario, agora, alerta_id),
        )
        _registrar_historico(conn, "alertas_manuais", alerta_id, {"status": "ABERTO"}, {"status": "ENCERRADO", "motivo_encerramento": motivo}, usuario)


def reabrir_alerta_manual(alerta_id: int, usuario: str) -> None:
    with _conectar() as conn:
        conn.execute(
            "UPDATE alertas_manuais SET status = 'ABERTO', motivo_encerramento = NULL, "
            "encerrado_por = NULL, encerrado_em = NULL WHERE id = ?",
            (alerta_id,),
        )
        _registrar_historico(conn, "alertas_manuais", alerta_id, {"status": "ENCERRADO"}, {"status": "ABERTO"}, usuario)


def listar_alertas_manuais(modulo: str | None = None) -> pd.DataFrame:
    """Só alertas ativos — os arquivados pelo módulo Arquivo somem da
    Central de Alertas e ficam disponíveis exclusivamente em
    `gat.arquivo_database`."""
    query = "SELECT * FROM alertas_manuais WHERE arquivado_em IS NULL"
    params: list[Any] = []
    if modulo:
        query += " AND modulo = ?"
        params.append(modulo)
    query += " ORDER BY criado_em DESC"
    with _conectar() as conn:
        return pd.read_sql_query(query, conn, params=params)


# ---------------------------------------------------------------------------
# Manual do Sistema
# ---------------------------------------------------------------------------

TIPOS_ANEXO_MANUAL = ["imagem", "video", "documento"]


def listar_manual_capitulos(perfil: str | None = None) -> pd.DataFrame:
    """Lista os capítulos na ordem de exibição. Quando `perfil` é informado
    e não é ADMIN, filtra para capítulos sem restrição de perfil
    (`perfis_visiveis` vazio/NULL = visível a todos) ou que incluam o
    perfil na lista — o Administrador sempre vê o manual completo."""
    with _conectar() as conn:
        df = pd.read_sql_query("SELECT * FROM manual_capitulos ORDER BY ordem", conn)
    if perfil and perfil != "ADMIN" and not df.empty:
        def _visivel(valor) -> bool:
            if not valor or (isinstance(valor, float) and pd.isna(valor)):
                return True
            return perfil in [p.strip() for p in str(valor).split(",") if p.strip()]
        df = df[df["perfis_visiveis"].apply(_visivel)]
    return df


def obter_manual_capitulo(capitulo_id: int) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM manual_capitulos WHERE id = ?", (capitulo_id,)).fetchone()
        return dict(linha) if linha else None


def criar_manual_capitulo(titulo: str, conteudo: str, perfis_visiveis: str | None, usuario: str) -> int:
    agora = datetime.now().isoformat()
    with _conectar() as conn:
        maior_ordem = conn.execute("SELECT COALESCE(MAX(ordem), 0) AS m FROM manual_capitulos").fetchone()["m"]
        cursor = conn.execute(
            "INSERT INTO manual_capitulos (ordem, titulo, conteudo, perfis_visiveis, criado_em, atualizado_por) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (int(maior_ordem) + 1, titulo, conteudo, perfis_visiveis, agora, usuario),
        )
        capitulo_id = cursor.lastrowid
        _registrar_historico(conn, "manual_capitulos", capitulo_id, {}, {"titulo": titulo}, usuario)
        return capitulo_id


def atualizar_manual_capitulo(capitulo_id: int, titulo: str, conteudo: str, perfis_visiveis: str | None, usuario: str) -> None:
    anterior = obter_manual_capitulo(capitulo_id)
    agora = datetime.now().isoformat()
    with _conectar() as conn:
        conn.execute(
            "UPDATE manual_capitulos SET titulo = ?, conteudo = ?, perfis_visiveis = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?",
            (titulo, conteudo, perfis_visiveis, agora, usuario, capitulo_id),
        )
        if anterior:
            _registrar_historico(
                conn, "manual_capitulos", capitulo_id,
                {"titulo": anterior.get("titulo"), "conteudo": anterior.get("conteudo")},
                {"titulo": titulo, "conteudo": conteudo}, usuario,
            )


def reordenar_manual_capitulos(ordem_ids: list[int], usuario: str) -> None:
    """`ordem_ids` já na nova ordem desejada — a posição na lista define a
    nova `ordem` (1, 2, 3...)."""
    agora = datetime.now().isoformat()
    with _conectar() as conn:
        for nova_ordem, capitulo_id in enumerate(ordem_ids, start=1):
            conn.execute(
                "UPDATE manual_capitulos SET ordem = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?",
                (nova_ordem, agora, usuario, capitulo_id),
            )


def excluir_manual_capitulo(capitulo_id: int, usuario: str) -> None:
    anterior = obter_manual_capitulo(capitulo_id)
    with _conectar() as conn:
        conn.execute("DELETE FROM manual_anexos WHERE capitulo_id = ?", (capitulo_id,))
        conn.execute("DELETE FROM manual_capitulos WHERE id = ?", (capitulo_id,))
        if anterior:
            _registrar_historico(conn, "manual_capitulos", capitulo_id, {"titulo": anterior.get("titulo")}, {"titulo": None}, usuario)


def versao_ativa_manual() -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM manual_versoes WHERE ativa = 1 ORDER BY numero_versao DESC LIMIT 1").fetchone()
        return dict(linha) if linha else None


def listar_manual_versoes() -> pd.DataFrame:
    with _conectar() as conn:
        return pd.read_sql_query("SELECT * FROM manual_versoes ORDER BY numero_versao DESC", conn)


def publicar_nova_versao_manual(notas: str, usuario: str) -> int:
    """Arquiva a versão ativa atual e publica uma nova — o conteúdo dos
    capítulos já é o vigente no momento da publicação (edições de capítulo
    não exigem uma nova versão para ficar visíveis; a versão serve para
    marcar marcos de publicação e disparar a confirmação de leitura)."""
    agora = datetime.now().isoformat()
    with _conectar() as conn:
        atual = conn.execute("SELECT MAX(numero_versao) AS m FROM manual_versoes").fetchone()["m"]
        nova_versao = int(atual or 0) + 1
        conn.execute("UPDATE manual_versoes SET ativa = 0")
        conn.execute(
            "INSERT INTO manual_versoes (numero_versao, notas, publicado_em, publicado_por, ativa) VALUES (?, ?, ?, ?, 1)",
            (nova_versao, notas, agora, usuario),
        )
        _registrar_historico(conn, "manual_versoes", nova_versao, {}, {"publicado_por": usuario, "notas": notas}, usuario)
        return nova_versao


def usuario_confirmou_leitura_manual(usuario: str, versao: int) -> bool:
    with _conectar() as conn:
        linha = conn.execute(
            "SELECT 1 FROM manual_confirmacoes_leitura WHERE usuario = ? AND versao = ?", (usuario, versao)
        ).fetchone()
        return linha is not None


def confirmar_leitura_manual(usuario: str, versao: int) -> None:
    agora = datetime.now().isoformat()
    with _conectar() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO manual_confirmacoes_leitura (usuario, versao, confirmado_em) VALUES (?, ?, ?)",
            (usuario, versao, agora),
        )


def listar_confirmacoes_leitura_manual(versao: int | None = None) -> pd.DataFrame:
    query = "SELECT * FROM manual_confirmacoes_leitura"
    params: list[Any] = []
    if versao is not None:
        query += " WHERE versao = ?"
        params.append(versao)
    query += " ORDER BY confirmado_em DESC"
    with _conectar() as conn:
        return pd.read_sql_query(query, conn, params=params)


def adicionar_anexo_manual(capitulo_id: int, tipo: str, nome_arquivo: str, conteudo: bytes, usuario: str) -> int:
    agora = datetime.now().isoformat()
    with _conectar() as conn:
        cursor = conn.execute(
            "INSERT INTO manual_anexos (capitulo_id, tipo, nome_arquivo, conteudo, criado_em, criado_por) VALUES (?, ?, ?, ?, ?, ?)",
            (capitulo_id, tipo, nome_arquivo, conteudo, agora, usuario),
        )
        return cursor.lastrowid


def listar_anexos_manual(capitulo_id: int) -> pd.DataFrame:
    with _conectar() as conn:
        return pd.read_sql_query(
            "SELECT id, capitulo_id, tipo, nome_arquivo, criado_em, criado_por FROM manual_anexos WHERE capitulo_id = ? ORDER BY criado_em",
            conn, params=[capitulo_id],
        )


def obter_anexo_manual(anexo_id: int) -> dict[str, Any] | None:
    with _conectar() as conn:
        linha = conn.execute("SELECT * FROM manual_anexos WHERE id = ?", (anexo_id,)).fetchone()
        return dict(linha) if linha else None


def remover_anexo_manual(anexo_id: int) -> None:
    with _conectar() as conn:
        conn.execute("DELETE FROM manual_anexos WHERE id = ?", (anexo_id,))


def listar_avaliacao_obrigatoria_isentos(modulo: str) -> set[int]:
    """IDs de projeto congelados como isentos do alerta de avaliação
    obrigatória (já estavam em revisão >= 1 sem avaliação quando a regra
    entrou em vigor — ver migração 8)."""
    with _conectar() as conn:
        linhas = conn.execute(
            "SELECT projeto_id FROM avaliacao_obrigatoria_isentos WHERE modulo = ?", (modulo,)
        ).fetchall()
        return {int(linha["projeto_id"]) for linha in linhas}


# ---------------------------------------------------------------------------
# Histórico de atividades por login
# ---------------------------------------------------------------------------


def registrar_atividade(usuario: str, perfil: str | None, tipo_evento: str, modulo: str | None = None, detalhe: str | None = None) -> None:
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO atividades_usuario (usuario, perfil, tipo_evento, modulo, detalhe, data_hora) VALUES (?, ?, ?, ?, ?, ?)",
            (usuario, perfil, tipo_evento, modulo, detalhe, datetime.now().isoformat()),
        )


def listar_atividades(
    usuario: str | None = None, tipo_evento: str | None = None, modulo: str | None = None,
) -> pd.DataFrame:
    with _conectar() as conn:
        query = "SELECT * FROM atividades_usuario WHERE 1=1"
        params: list[Any] = []
        if usuario:
            query += " AND usuario = ?"
            params.append(usuario)
        if tipo_evento:
            query += " AND tipo_evento = ?"
            params.append(tipo_evento)
        if modulo:
            query += " AND modulo = ?"
            params.append(modulo)
        query += " ORDER BY data_hora DESC"
        return pd.read_sql_query(query, conn, params=params)


def listar_reunioes_do_projeto(modulo: str, projeto_id: int) -> pd.DataFrame:
    """Reuniões ativas vinculadas a um projeto específico — usado na Linha
    do Tempo e nas abas de Reuniões do GAT/PMO."""
    with _conectar() as conn:
        return pd.read_sql_query(
            "SELECT r.* FROM reunioes r JOIN reuniao_projetos rp ON rp.reuniao_id = r.id "
            "WHERE rp.modulo = ? AND rp.projeto_id = ? AND r.arquivado_em IS NULL "
            "ORDER BY COALESCE(r.data_realizada, r.data_prevista)",
            conn, params=(modulo, projeto_id),
        )
