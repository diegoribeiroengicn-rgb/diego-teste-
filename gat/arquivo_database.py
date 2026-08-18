"""Camada de dados do módulo Arquivo: arquivamento lógico, restauração e
exclusão definitiva — reaproveitando a mesma conexão/persistência
automática do GAT (`gat.database.conectar`) para não duplicar
infraestrutura, do mesmo jeito que `gat/pmo_database.py` já faz.

Cada operação (arquivar/restaurar/excluir) grava uma linha em
`arquivo_auditoria` — uma trilha dedicada e mais simples do que o
`historico_edicoes` genérico (que registra diffs campo a campo), porque
aqui o que importa é o "quem/quando/o quê/por quê" da operação em si, não
o valor anterior de cada coluna.
"""

from __future__ import annotations

import pandas as pd

from gat.arquivo_business_rules import (
    CATEGORIAS_POR_CHAVE,
    TABELAS_ARQUIVAVEIS,
    TIPO_ARQUIVAMENTO,
    TIPO_EXCLUSAO,
    TIPO_RESTAURACAO,
)
from gat.database import conectar
from gat.horario import agora_br

_COLUNAS_DESCRICAO: dict[str, list[str]] = {
    "pmo_projetos": ["nome", "cliente", "contratada"],
    "prestadores": ["codigo", "prestador", "num_at", "revisao_at"],
    "cessionarios": ["codigo", "cessionario", "num_at", "revisao_at"],
    "cadastro_prestadores": ["codigo", "nome_empresa"],
    "cadastro_cessionarios": ["codigo", "nome_empresa"],
    "usuarios": ["username", "nome_completo"],
    "reunioes": ["titulo", "data_prevista"],
    "planos_acao": ["descricao", "responsavel"],
    "alertas_manuais": ["titulo", "codigo_projeto"],
    "pmo_cronograma_arquivos": ["nome_arquivo", "formato"],
}


def _descricao_registro(tabela: str, registro: dict) -> str:
    campos = _COLUNAS_DESCRICAO.get(tabela, ["id"])
    partes = [str(registro[c]) for c in campos if registro.get(c) not in (None, "")]
    return " — ".join(partes) if partes else f"{tabela} #{registro.get('id')}"


def _registrar_auditoria(conn, tabela: str, registro_id: int, tipo_operacao: str, usuario: str, justificativa: str | None, descricao_registro: str) -> None:
    categoria = next((c for c in CATEGORIAS_POR_CHAVE.values() if c.tabela == tabela), None)
    origem = categoria.origem if categoria else None
    conn.execute(
        """
        INSERT INTO arquivo_auditoria (tabela, registro_id, tipo_operacao, usuario, data_hora, justificativa, descricao_registro, origem)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (tabela, registro_id, tipo_operacao, usuario, agora_br().isoformat(timespec="seconds"), justificativa, descricao_registro, origem),
    )


def _validar_tabela(tabela: str) -> None:
    if tabela not in TABELAS_ARQUIVAVEIS:
        raise ValueError(f"'{tabela}' não é uma tabela arquivável pelo módulo Arquivo.")


def arquivar_registro(tabela: str, registro_id: int, usuario: str, motivo: str | None = None, teste: bool = False) -> None:
    _validar_tabela(tabela)
    with conectar() as conn:
        registro = conn.execute(f"SELECT * FROM {tabela} WHERE id = ?", (registro_id,)).fetchone()
        if registro is None:
            raise ValueError("Registro não encontrado.")
        registro = dict(registro)
        if registro.get("arquivado_em"):
            return
        agora = agora_br().isoformat(timespec="seconds")
        conn.execute(
            f"UPDATE {tabela} SET arquivado_em = ?, arquivado_por = ?, motivo_arquivamento = ?, arquivado_teste = ? WHERE id = ?",
            (agora, usuario, motivo, 1 if teste else 0, registro_id),
        )
        _registrar_auditoria(conn, tabela, registro_id, TIPO_ARQUIVAMENTO, usuario, motivo, _descricao_registro(tabela, registro))


def restaurar_registro(tabela: str, registro_id: int, usuario: str, justificativa: str | None = None) -> None:
    _validar_tabela(tabela)
    with conectar() as conn:
        registro = conn.execute(f"SELECT * FROM {tabela} WHERE id = ?", (registro_id,)).fetchone()
        if registro is None:
            raise ValueError("Registro não encontrado.")
        registro = dict(registro)
        conn.execute(
            f"UPDATE {tabela} SET arquivado_em = NULL, arquivado_por = NULL, motivo_arquivamento = NULL, arquivado_teste = 0 WHERE id = ?",
            (registro_id,),
        )
        _registrar_auditoria(conn, tabela, registro_id, TIPO_RESTAURACAO, usuario, justificativa, _descricao_registro(tabela, registro))


def excluir_definitivamente(tabela: str, registro_id: int, usuario: str, justificativa: str) -> None:
    """Só pode ser chamada para um registro já arquivado — a exclusão
    definitiva nunca alcança um registro ativo. Exige justificativa (parte
    da confirmação dupla feita na interface)."""
    _validar_tabela(tabela)
    if not justificativa or not justificativa.strip():
        raise ValueError("Informe a justificativa da exclusão definitiva.")
    with conectar() as conn:
        registro = conn.execute(f"SELECT * FROM {tabela} WHERE id = ?", (registro_id,)).fetchone()
        if registro is None:
            raise ValueError("Registro não encontrado.")
        registro = dict(registro)
        if not registro.get("arquivado_em"):
            raise ValueError("Só é possível excluir definitivamente um registro que já esteja arquivado.")
        descricao = _descricao_registro(tabela, registro)
        conn.execute(f"DELETE FROM {tabela} WHERE id = ?", (registro_id,))
        _registrar_auditoria(conn, tabela, registro_id, TIPO_EXCLUSAO, usuario, justificativa.strip(), descricao)


def listar_arquivados(tabela: str, apenas_teste: bool | None = None) -> pd.DataFrame:
    _validar_tabela(tabela)
    with conectar() as conn:
        df = pd.read_sql_query(f"SELECT * FROM {tabela} WHERE arquivado_em IS NOT NULL ORDER BY arquivado_em DESC", conn)
    if apenas_teste is True:
        df = df[df["arquivado_teste"] == 1]
    elif apenas_teste is False:
        df = df[df["arquivado_teste"] == 0]
    return df


# ---------------------------------------------------------------------------
# Projeto GAT (granularidade por código, cruzando prestadores + cessionarios)
# ---------------------------------------------------------------------------


def listar_codigos_gat_ativos() -> pd.DataFrame:
    """Códigos de projeto GAT com ao menos uma análise ativa (não arquivada)."""
    with conectar() as conn:
        df = pd.read_sql_query(
            """
            SELECT codigo, COUNT(*) AS qtd_analises FROM (
                SELECT codigo FROM prestadores WHERE arquivado_em IS NULL
                UNION ALL
                SELECT codigo FROM cessionarios WHERE arquivado_em IS NULL
            ) GROUP BY codigo ORDER BY codigo
            """,
            conn,
        )
    return df


def listar_codigos_gat_arquivados() -> pd.DataFrame:
    """Códigos de projeto GAT totalmente arquivados (todas as análises de
    prestadores e cessionarios daquele código estão arquivadas)."""
    with conectar() as conn:
        total = pd.read_sql_query(
            "SELECT codigo, COUNT(*) AS total FROM (SELECT codigo FROM prestadores UNION ALL SELECT codigo FROM cessionarios) GROUP BY codigo",
            conn,
        )
        arquivados = pd.read_sql_query(
            """
            SELECT codigo, COUNT(*) AS arquivados, MAX(arquivado_em) AS arquivado_em FROM (
                SELECT codigo, arquivado_em FROM prestadores WHERE arquivado_em IS NOT NULL
                UNION ALL
                SELECT codigo, arquivado_em FROM cessionarios WHERE arquivado_em IS NOT NULL
            ) GROUP BY codigo
            """,
            conn,
        )
    if total.empty or arquivados.empty:
        return pd.DataFrame(columns=["codigo", "arquivado_em"])
    fundidos = total.merge(arquivados, on="codigo", how="inner")
    totalmente_arquivados = fundidos[fundidos["total"] == fundidos["arquivados"]]
    return totalmente_arquivados[["codigo", "arquivado_em"]].sort_values("arquivado_em", ascending=False)


def arquivar_projeto_gat(codigo: str, usuario: str, motivo: str | None = None, teste: bool = False) -> int:
    agora = agora_br().isoformat(timespec="seconds")
    total = 0
    with conectar() as conn:
        for tabela in ("prestadores", "cessionarios"):
            linhas = conn.execute(f"SELECT id FROM {tabela} WHERE codigo = ? AND arquivado_em IS NULL", (codigo,)).fetchall()
            for linha in linhas:
                conn.execute(
                    f"UPDATE {tabela} SET arquivado_em = ?, arquivado_por = ?, motivo_arquivamento = ?, arquivado_teste = ? WHERE id = ?",
                    (agora, usuario, motivo, 1 if teste else 0, linha["id"]),
                )
                total += 1
        if total > 0:
            _registrar_auditoria(conn, "projetos_gat", 0, TIPO_ARQUIVAMENTO, usuario, motivo, f"Projeto GAT {codigo} ({total} análise(s))")
    return total


def restaurar_projeto_gat(codigo: str, usuario: str, justificativa: str | None = None) -> int:
    total = 0
    with conectar() as conn:
        for tabela in ("prestadores", "cessionarios"):
            linhas = conn.execute(f"SELECT id FROM {tabela} WHERE codigo = ? AND arquivado_em IS NOT NULL", (codigo,)).fetchall()
            for linha in linhas:
                conn.execute(
                    f"UPDATE {tabela} SET arquivado_em = NULL, arquivado_por = NULL, motivo_arquivamento = NULL, arquivado_teste = 0 WHERE id = ?",
                    (linha["id"],),
                )
                total += 1
        if total > 0:
            _registrar_auditoria(conn, "projetos_gat", 0, TIPO_RESTAURACAO, usuario, justificativa, f"Projeto GAT {codigo} ({total} análise(s))")
    return total


# ---------------------------------------------------------------------------
# Auditoria
# ---------------------------------------------------------------------------


def listar_auditoria(tipo_operacao: str | None = None, tabela: str | None = None, origem: str | None = None) -> pd.DataFrame:
    condicoes = []
    parametros: list = []
    if tipo_operacao:
        condicoes.append("tipo_operacao = ?")
        parametros.append(tipo_operacao)
    if tabela:
        condicoes.append("tabela = ?")
        parametros.append(tabela)
    if origem:
        condicoes.append("origem = ?")
        parametros.append(origem)
    where = f"WHERE {' AND '.join(condicoes)}" if condicoes else ""
    with conectar() as conn:
        df = pd.read_sql_query(f"SELECT * FROM arquivo_auditoria {where} ORDER BY data_hora DESC", conn, params=parametros)
    return df


__all__ = [
    "arquivar_registro", "restaurar_registro", "excluir_definitivamente", "listar_arquivados",
    "listar_codigos_gat_ativos", "listar_codigos_gat_arquivados", "arquivar_projeto_gat", "restaurar_projeto_gat",
    "listar_auditoria",
]
