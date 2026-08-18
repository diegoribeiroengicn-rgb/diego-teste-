"""
Camada de dados do módulo PMO (Project Management Office).

Totalmente independente do GAT em regras de negócio e modelo de dados
próprio (tabelas `pmo_*`), mas compartilhando a mesma plataforma/banco de
dados: reaproveita a conexão pública (`gat.database.conectar`) — a mesma
persistência automática pós-gravação usada pelo GAT — e, nos três módulos
explicitamente compartilhados (Reuniões, Planos de Ação, Alertas), reusa
as próprias funções e tabelas do GAT, sempre com identificação de origem
('pmo' em `alertas_manuais.modulo`/`reuniao_projetos.modulo`, 'PMO' em
`reunioes.origem`/`planos_acao.origem`).
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from gat.database import (
    atualizar_plano_acao,
    atualizar_reuniao,
    conectar,
    criar_alerta_manual,
    encerrar_alerta_manual,
    inserir_plano_acao,
    inserir_reuniao,
    listar_alertas_manuais,
    listar_planos_acao,
    listar_reunioes_do_projeto,
    obter_alerta_manual,
    reabrir_alerta_manual,
    registrar_historico,
)
from gat.horario import agora_br, hoje_br
from gat.pmo_business_rules import (
    KPI_ORDEM,
    KPI_PADRAO_HABILITADO,
    MENSAGEM_LEMBRETE_CRONOGRAMA,
    TITULO_ALERTA_CRONOGRAMA,
    calcular_caminho_critico,
    proximo_lembrete_cronograma,
)

ORIGEM_PMO = "PMO"
MODULO_ALERTA_PMO = "pmo"

# ---------------------------------------------------------------------------
# Projetos
# ---------------------------------------------------------------------------

COLUNAS_PROJETO = [
    "nome", "cliente", "contratada", "gerente", "data_inicio", "data_prevista_termino",
    "valor_contratual", "tipo_contrato", "observacoes",
]


def criar_projeto(dados: dict[str, Any], kpis_habilitados: list[str] | None, usuario: str) -> int:
    """
    Cadastra um novo projeto PMO e, na sequência:
    * grava a configuração inicial dos KPIs (apenas os selecionados ficam
      habilitados — os demais existem na tabela já desabilitados, prontos
      para serem ligados depois sem perder nenhum dado já registrado);
    * gera automaticamente o alerta "Cronograma pendente de recebimento.",
      obrigatório para todo projeto novo enquanto não houver cronograma.
    """
    agora = agora_br().isoformat()
    campos = {c: dados.get(c) for c in COLUNAS_PROJETO}
    habilitados = set(kpis_habilitados or [k for k, padrao in KPI_PADRAO_HABILITADO.items() if padrao])
    with conectar() as conn:
        cursor = conn.execute(
            f"INSERT INTO pmo_projetos ({', '.join(campos.keys())}, criado_em, criado_por) "
            f"VALUES ({', '.join(['?'] * len(campos))}, ?, ?)",
            (*campos.values(), agora, usuario),
        )
        projeto_id = cursor.lastrowid
        for chave in KPI_ORDEM:
            conn.execute(
                "INSERT INTO pmo_projeto_kpis (projeto_id, kpi_chave, habilitado, habilitado_em) VALUES (?, ?, ?, ?)",
                (projeto_id, chave, 1 if chave in habilitados else 0, agora if chave in habilitados else None),
            )
        registrar_historico(conn, "pmo_projetos", projeto_id, {}, campos, usuario)
    _criar_alerta_cronograma_pendente(projeto_id, usuario)
    return projeto_id


def atualizar_projeto(projeto_id: int, dados: dict[str, Any], usuario: str) -> None:
    campos = {c: dados.get(c) for c in COLUNAS_PROJETO}
    agora = agora_br().isoformat()
    with conectar() as conn:
        antigo = conn.execute("SELECT * FROM pmo_projetos WHERE id = ?", (projeto_id,)).fetchone()
        antigo_dict = dict(antigo) if antigo else {}
        set_clause = ", ".join(f"{c} = ?" for c in campos)
        conn.execute(
            f"UPDATE pmo_projetos SET {set_clause}, atualizado_em = ?, atualizado_por = ? WHERE id = ?",
            (*campos.values(), agora, usuario, projeto_id),
        )
        registrar_historico(conn, "pmo_projetos", projeto_id, antigo_dict, campos, usuario)


def atualizar_status_calculado(
    projeto_id: int, saude: str, percentual_execucao: float,
    proximo_marco_nome: str | None, proximo_marco_data: str | None,
) -> None:
    """Atualiza os campos derivados (recalculados pelas regras de negócio a
    partir do cronograma/riscos/medições) sem gerar entrada de histórico —
    não é uma edição do usuário, é o próprio sistema mantendo o cartão do
    projeto atualizado."""
    with conectar() as conn:
        conn.execute(
            "UPDATE pmo_projetos SET saude = ?, percentual_execucao = ?, proximo_marco = ?, proximo_marco_data = ? WHERE id = ?",
            (saude, percentual_execucao, proximo_marco_nome, proximo_marco_data, projeto_id),
        )


def definir_status_projeto(projeto_id: int, status: str, usuario: str) -> None:
    with conectar() as conn:
        antigo = conn.execute("SELECT status FROM pmo_projetos WHERE id = ?", (projeto_id,)).fetchone()
        agora = agora_br().isoformat()
        conn.execute(
            "UPDATE pmo_projetos SET status = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?",
            (status, agora, usuario, projeto_id),
        )
        registrar_historico(conn, "pmo_projetos", projeto_id, dict(antigo) if antigo else {}, {"status": status}, usuario)


def obter_projeto(projeto_id: int) -> dict[str, Any] | None:
    with conectar() as conn:
        linha = conn.execute("SELECT * FROM pmo_projetos WHERE id = ?", (projeto_id,)).fetchone()
        return dict(linha) if linha else None


def listar_projetos() -> pd.DataFrame:
    """Só projetos ativos — os arquivados pelo módulo Arquivo somem do
    Portfólio/Dashboards e ficam disponíveis exclusivamente em
    `gat.arquivo_database`."""
    with conectar() as conn:
        return pd.read_sql_query("SELECT * FROM pmo_projetos WHERE arquivado_em IS NULL ORDER BY nome", conn)


# ---------------------------------------------------------------------------
# Configuração dos KPIs por projeto
# ---------------------------------------------------------------------------


def listar_kpis_projeto(projeto_id: int) -> pd.DataFrame:
    with conectar() as conn:
        return pd.read_sql_query(
            "SELECT * FROM pmo_projeto_kpis WHERE projeto_id = ?", conn, params=(projeto_id,),
        )


def kpis_habilitados_projeto(projeto_id: int) -> set[str]:
    df = listar_kpis_projeto(projeto_id)
    if df.empty:
        return set()
    return set(df.loc[df["habilitado"] == 1, "kpi_chave"])


def definir_kpis_projeto(projeto_id: int, chaves_habilitadas: set[str], usuario: str) -> None:
    """
    Atualiza a configuração dos KPIs habilitados para o projeto — nunca
    apaga a linha de um indicador desabilitado (preserva os dados já
    lançados naquele módulo) e nunca cria um indicador que já existe (a
    tabela já tem uma linha para cada um dos 14 desde o cadastro do
    projeto): apenas liga/desliga a flag `habilitado`.
    """
    atuais = listar_kpis_projeto(projeto_id)
    agora = agora_br().isoformat()
    with conectar() as conn:
        for _, linha in atuais.iterrows():
            chave = linha["kpi_chave"]
            deve_habilitar = chave in chaves_habilitadas
            se_habilitado = bool(linha["habilitado"])
            if deve_habilitar == se_habilitado:
                continue
            if deve_habilitar:
                conn.execute(
                    "UPDATE pmo_projeto_kpis SET habilitado = 1, habilitado_em = ? WHERE projeto_id = ? AND kpi_chave = ?",
                    (agora, projeto_id, chave),
                )
            else:
                conn.execute(
                    "UPDATE pmo_projeto_kpis SET habilitado = 0, desabilitado_em = ? WHERE projeto_id = ? AND kpi_chave = ?",
                    (agora, projeto_id, chave),
                )
            registrar_historico(
                conn, "pmo_projeto_kpis", int(linha["id"]),
                {"habilitado": se_habilitado}, {"habilitado": deve_habilitar}, usuario,
            )


# ---------------------------------------------------------------------------
# Cronograma
# ---------------------------------------------------------------------------


def anexar_cronograma(
    projeto_id: int, nome_arquivo: str, formato: str, conteudo: bytes,
    atividades: pd.DataFrame | None, usuario: str,
) -> int:
    """
    Registra um novo arquivo de cronograma como o cronograma ativo do
    projeto — o(s) arquivo(s) anterior(es) não são apagados, apenas ficam
    marcados como inativos (histórico completo preservado). Quando
    `atividades` é informado (interpretação automática disponível para
    Excel e Primavera XER — ver `gat/pmo_cronograma_import.py`), já grava
    as atividades com o caminho crítico calculado. Encerra automaticamente
    o alerta de cronograma pendente.
    """
    agora = agora_br().isoformat()
    with conectar() as conn:
        conn.execute(
            "UPDATE pmo_cronograma_arquivos SET ativo = 0, removido_por = ?, removido_em = ? "
            "WHERE projeto_id = ? AND ativo = 1",
            (usuario, agora, projeto_id),
        )
        interpretado = 1 if atividades is not None and not atividades.empty else 0
        cursor = conn.execute(
            "INSERT INTO pmo_cronograma_arquivos (projeto_id, nome_arquivo, formato, conteudo, interpretado, "
            "ativo, enviado_por, enviado_em) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
            (projeto_id, nome_arquivo, formato, conteudo, interpretado, usuario, agora),
        )
        arquivo_id = cursor.lastrowid
        if atividades is not None and not atividades.empty:
            processadas = calcular_caminho_critico(atividades)
            for _, linha in processadas.iterrows():
                conn.execute(
                    "INSERT INTO pmo_cronograma_atividades (arquivo_id, projeto_id, identificador_origem, nome, "
                    "data_inicio, data_fim, duracao_dias, percentual_concluido, e_marco, predecessoras, "
                    "caminho_critico, folga_dias) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        arquivo_id, projeto_id, linha.get("identificador_origem"), linha["nome"],
                        linha.get("data_inicio"), linha.get("data_fim"), linha.get("duracao_dias"),
                        linha.get("percentual_concluido", 0), int(linha.get("e_marco", 0) or 0),
                        linha.get("predecessoras"), int(linha.get("caminho_critico", 0)), linha.get("folga_dias"),
                    ),
                )
        registrar_historico(conn, "pmo_cronograma_arquivos", arquivo_id, {}, {"nome_arquivo": nome_arquivo, "formato": formato}, usuario)
    _encerrar_alerta_cronograma(projeto_id, usuario)
    return arquivo_id


def remover_cronograma_ativo(projeto_id: int, usuario: str) -> None:
    """Remove (soft — preserva o arquivo e as atividades para histórico) o
    cronograma ativo do projeto e reativa automaticamente o alerta de
    cronograma pendente, reiniciando a contagem dos lembretes."""
    agora = agora_br().isoformat()
    with conectar() as conn:
        arquivo = conn.execute(
            "SELECT id FROM pmo_cronograma_arquivos WHERE projeto_id = ? AND ativo = 1", (projeto_id,)
        ).fetchone()
        if arquivo is None:
            return
        conn.execute(
            "UPDATE pmo_cronograma_arquivos SET ativo = 0, removido_por = ?, removido_em = ? WHERE id = ?",
            (usuario, agora, arquivo["id"]),
        )
        registrar_historico(conn, "pmo_cronograma_arquivos", arquivo["id"], {"ativo": True}, {"ativo": False}, usuario)
    _reativar_alerta_cronograma(projeto_id, usuario)


def obter_cronograma_ativo(projeto_id: int) -> dict[str, Any] | None:
    with conectar() as conn:
        linha = conn.execute(
            "SELECT * FROM pmo_cronograma_arquivos WHERE projeto_id = ? AND ativo = 1 AND arquivado_em IS NULL", (projeto_id,)
        ).fetchone()
        return dict(linha) if linha else None


def listar_arquivos_cronograma(projeto_id: int) -> pd.DataFrame:
    """Só documentos ativos — os arquivados pelo módulo Arquivo ficam
    disponíveis exclusivamente em `gat.arquivo_database`."""
    with conectar() as conn:
        return pd.read_sql_query(
            "SELECT id, nome_arquivo, formato, interpretado, ativo, enviado_por, enviado_em, removido_por, removido_em "
            "FROM pmo_cronograma_arquivos WHERE projeto_id = ? AND arquivado_em IS NULL ORDER BY enviado_em DESC",
            conn, params=(projeto_id,),
        )


def listar_atividades_cronograma(projeto_id: int) -> pd.DataFrame:
    cronograma = obter_cronograma_ativo(projeto_id)
    if cronograma is None:
        return pd.DataFrame()
    with conectar() as conn:
        return pd.read_sql_query(
            "SELECT * FROM pmo_cronograma_atividades WHERE arquivo_id = ? ORDER BY id",
            conn, params=(cronograma["id"],),
        )


# ---------------------------------------------------------------------------
# Alerta automático de cronograma pendente (ciclo de vida completo)
# ---------------------------------------------------------------------------


def _criar_alerta_cronograma_pendente(projeto_id: int, usuario: str) -> int:
    alerta_id = criar_alerta_manual(
        {
            "modulo": MODULO_ALERTA_PMO, "projeto_id": projeto_id, "titulo": TITULO_ALERTA_CRONOGRAMA,
            "descricao": MENSAGEM_LEMBRETE_CRONOGRAMA, "prioridade": "Alta",
        },
        usuario,
    )
    agora = agora_br().isoformat()
    proximo = proximo_lembrete_cronograma(hoje_br()).isoformat()
    with conectar() as conn:
        conn.execute(
            "INSERT INTO pmo_alertas_cronograma (projeto_id, alerta_manual_id, status, criado_em, proximo_lembrete_em) "
            "VALUES (?, ?, 'ATIVO', ?, ?)",
            (projeto_id, alerta_id, agora, proximo),
        )
    return alerta_id


def obter_alerta_cronograma(projeto_id: int) -> dict[str, Any] | None:
    with conectar() as conn:
        linha = conn.execute("SELECT * FROM pmo_alertas_cronograma WHERE projeto_id = ?", (projeto_id,)).fetchone()
        return dict(linha) if linha else None


def _encerrar_alerta_cronograma(projeto_id: int, usuario: str) -> None:
    estado = obter_alerta_cronograma(projeto_id)
    if estado is None or estado["status"] != "ATIVO":
        return
    agora = agora_br().isoformat()
    with conectar() as conn:
        conn.execute(
            "UPDATE pmo_alertas_cronograma SET status = 'ENCERRADO', encerrado_em = ?, anexado_por = ?, anexado_em = ? "
            "WHERE projeto_id = ?",
            (agora, usuario, agora, projeto_id),
        )
        registrar_historico(
            conn, "pmo_alertas_cronograma", estado["id"], {"status": "ATIVO"},
            {"status": "ENCERRADO", "anexado_por": usuario}, usuario,
        )
    if estado.get("alerta_manual_id"):
        encerrar_alerta_manual(estado["alerta_manual_id"], "Cronograma anexado.", usuario)


def _reativar_alerta_cronograma(projeto_id: int, usuario: str) -> None:
    estado = obter_alerta_cronograma(projeto_id)
    if estado is None:
        _criar_alerta_cronograma_pendente(projeto_id, usuario)
        return
    if estado["status"] == "ATIVO":
        return
    proximo = proximo_lembrete_cronograma(hoje_br()).isoformat()
    with conectar() as conn:
        conn.execute(
            "UPDATE pmo_alertas_cronograma SET status = 'ATIVO', qtd_lembretes = 0, ultimo_lembrete_em = NULL, "
            "proximo_lembrete_em = ?, encerrado_em = NULL, anexado_por = NULL, anexado_em = NULL WHERE projeto_id = ?",
            (proximo, projeto_id),
        )
        registrar_historico(
            conn, "pmo_alertas_cronograma", estado["id"], {"status": "ENCERRADO"}, {"status": "ATIVO"}, usuario,
        )
    if estado.get("alerta_manual_id") and obter_alerta_manual(estado["alerta_manual_id"]):
        reabrir_alerta_manual(estado["alerta_manual_id"], usuario)
    else:
        _criar_alerta_cronograma_pendente(projeto_id, usuario)


def verificar_e_gerar_lembretes_cronograma(usuario_sistema: str = "sistema") -> int:
    """
    Verifica todos os alertas de cronograma pendente ainda ativos e, para
    os que já atingiram a data do próximo lembrete (padrão: 3 dias úteis
    desde o último), registra um novo lembrete e agenda o seguinte. Deve
    ser chamada a cada carregamento do Portfólio/Dashboard do PMO — o
    sistema não tem um agendador em segundo plano, então a verificação
    acontece de forma automática sempre que alguém abre uma tela do PMO.
    Retorna a quantidade de lembretes gerados nesta chamada.
    """
    hoje = hoje_br().isoformat()
    with conectar() as conn:
        pendentes = conn.execute(
            "SELECT * FROM pmo_alertas_cronograma WHERE status = 'ATIVO' AND proximo_lembrete_em <= ?", (hoje,)
        ).fetchall()
    gerados = 0
    for linha in pendentes:
        agora = agora_br().isoformat()
        proximo = proximo_lembrete_cronograma(hoje_br()).isoformat()
        with conectar() as conn:
            conn.execute(
                "INSERT INTO pmo_cronograma_lembretes (projeto_id, enviado_em, mensagem) VALUES (?, ?, ?)",
                (linha["projeto_id"], agora, MENSAGEM_LEMBRETE_CRONOGRAMA),
            )
            conn.execute(
                "UPDATE pmo_alertas_cronograma SET qtd_lembretes = qtd_lembretes + 1, ultimo_lembrete_em = ?, "
                "proximo_lembrete_em = ? WHERE id = ?",
                (agora, proximo, linha["id"]),
            )
        gerados += 1
    return gerados


def listar_lembretes_cronograma(projeto_id: int) -> pd.DataFrame:
    with conectar() as conn:
        return pd.read_sql_query(
            "SELECT * FROM pmo_cronograma_lembretes WHERE projeto_id = ? ORDER BY enviado_em DESC",
            conn, params=(projeto_id,),
        )


# ---------------------------------------------------------------------------
# Medições
# ---------------------------------------------------------------------------

COLUNAS_MEDICAO = [
    "competencia_mes", "competencia_ano", "percentual", "valor_medido", "situacao",
    "valor_aprovado", "data_aprovacao", "valor_pago", "data_pagamento", "valor_glosado",
]


def inserir_medicao(projeto_id: int, dados: dict[str, Any], usuario: str) -> int:
    agora = agora_br().isoformat()
    campos = {c: dados.get(c) for c in COLUNAS_MEDICAO}
    with conectar() as conn:
        cursor = conn.execute(
            f"INSERT INTO pmo_medicoes (projeto_id, {', '.join(campos.keys())}, criado_por, criado_em) "
            f"VALUES (?, {', '.join(['?'] * len(campos))}, ?, ?)",
            (projeto_id, *campos.values(), usuario, agora),
        )
        medicao_id = cursor.lastrowid
        registrar_historico(conn, "pmo_medicoes", medicao_id, {}, campos, usuario)
        return medicao_id


def atualizar_medicao(medicao_id: int, dados: dict[str, Any], usuario: str) -> None:
    campos = {c: dados.get(c) for c in COLUNAS_MEDICAO}
    agora = agora_br().isoformat()
    with conectar() as conn:
        antigo = conn.execute("SELECT * FROM pmo_medicoes WHERE id = ?", (medicao_id,)).fetchone()
        set_clause = ", ".join(f"{c} = ?" for c in campos)
        conn.execute(
            f"UPDATE pmo_medicoes SET {set_clause}, atualizado_em = ?, atualizado_por = ? WHERE id = ?",
            (*campos.values(), agora, usuario, medicao_id),
        )
        registrar_historico(conn, "pmo_medicoes", medicao_id, dict(antigo) if antigo else {}, campos, usuario)


def listar_medicoes(projeto_id: int) -> pd.DataFrame:
    with conectar() as conn:
        return pd.read_sql_query(
            "SELECT * FROM pmo_medicoes WHERE projeto_id = ? ORDER BY competencia_ano DESC, competencia_mes DESC",
            conn, params=(projeto_id,),
        )


def resumo_financeiro(projeto_id: int) -> dict[str, float]:
    """Consolidado financeiro do projeto: valor contratado (do cadastro do
    projeto) e valores medido/aprovado/pago/glosado (soma de todas as
    medições) — o Financeiro é inteiramente derivado das Medições, sem
    tabela própria redundante."""
    projeto = obter_projeto(projeto_id) or {}
    medicoes = listar_medicoes(projeto_id)
    contratado = float(projeto.get("valor_contratual") or 0)
    medido = float(medicoes["valor_medido"].fillna(0).sum()) if not medicoes.empty else 0.0
    aprovado = float(medicoes["valor_aprovado"].fillna(0).sum()) if not medicoes.empty else 0.0
    pago = float(medicoes["valor_pago"].fillna(0).sum()) if not medicoes.empty else 0.0
    glosado = float(medicoes["valor_glosado"].fillna(0).sum()) if not medicoes.empty else 0.0
    return {
        "valor_contratado": contratado, "valor_medido": medido, "valor_aprovado": aprovado,
        "valor_pago": pago, "valor_glosado": glosado, "saldo": contratado - pago,
    }


# ---------------------------------------------------------------------------
# Entregáveis
# ---------------------------------------------------------------------------

COLUNAS_ENTREGAVEL = ["nome", "previsto", "entregue", "data_prevista", "data_entrega", "percentual_documental", "observacoes"]


def inserir_entregavel(projeto_id: int, dados: dict[str, Any], usuario: str) -> int:
    agora = agora_br().isoformat()
    campos = {c: dados.get(c) for c in COLUNAS_ENTREGAVEL}
    with conectar() as conn:
        cursor = conn.execute(
            f"INSERT INTO pmo_entregaveis (projeto_id, {', '.join(campos.keys())}, criado_por, criado_em) "
            f"VALUES (?, {', '.join(['?'] * len(campos))}, ?, ?)",
            (projeto_id, *campos.values(), usuario, agora),
        )
        entregavel_id = cursor.lastrowid
        registrar_historico(conn, "pmo_entregaveis", entregavel_id, {}, campos, usuario)
        return entregavel_id


def atualizar_entregavel(entregavel_id: int, dados: dict[str, Any], usuario: str) -> None:
    campos = {c: dados.get(c) for c in COLUNAS_ENTREGAVEL}
    agora = agora_br().isoformat()
    with conectar() as conn:
        antigo = conn.execute("SELECT * FROM pmo_entregaveis WHERE id = ?", (entregavel_id,)).fetchone()
        set_clause = ", ".join(f"{c} = ?" for c in campos)
        conn.execute(
            f"UPDATE pmo_entregaveis SET {set_clause}, atualizado_em = ?, atualizado_por = ? WHERE id = ?",
            (*campos.values(), agora, usuario, entregavel_id),
        )
        registrar_historico(conn, "pmo_entregaveis", entregavel_id, dict(antigo) if antigo else {}, campos, usuario)


def listar_entregaveis(projeto_id: int) -> pd.DataFrame:
    with conectar() as conn:
        return pd.read_sql_query("SELECT * FROM pmo_entregaveis WHERE projeto_id = ? ORDER BY id", conn, params=(projeto_id,))


# ---------------------------------------------------------------------------
# Gestão de Riscos
# ---------------------------------------------------------------------------

COLUNAS_RISCO = ["descricao", "probabilidade", "impacto", "status", "responsavel", "plano_mitigacao"]


def inserir_risco(projeto_id: int, dados: dict[str, Any], usuario: str) -> int:
    agora = agora_br().isoformat()
    campos = {c: dados.get(c) for c in COLUNAS_RISCO}
    with conectar() as conn:
        cursor = conn.execute(
            f"INSERT INTO pmo_riscos (projeto_id, {', '.join(campos.keys())}, criado_por, criado_em) "
            f"VALUES (?, {', '.join(['?'] * len(campos))}, ?, ?)",
            (projeto_id, *campos.values(), usuario, agora),
        )
        risco_id = cursor.lastrowid
        registrar_historico(conn, "pmo_riscos", risco_id, {}, campos, usuario)
        return risco_id


def atualizar_risco(risco_id: int, dados: dict[str, Any], usuario: str) -> None:
    campos = {c: dados.get(c) for c in COLUNAS_RISCO}
    agora = agora_br().isoformat()
    with conectar() as conn:
        antigo = conn.execute("SELECT * FROM pmo_riscos WHERE id = ?", (risco_id,)).fetchone()
        set_clause = ", ".join(f"{c} = ?" for c in campos)
        conn.execute(
            f"UPDATE pmo_riscos SET {set_clause}, atualizado_em = ?, atualizado_por = ? WHERE id = ?",
            (*campos.values(), agora, usuario, risco_id),
        )
        registrar_historico(conn, "pmo_riscos", risco_id, dict(antigo) if antigo else {}, campos, usuario)


def listar_riscos(projeto_id: int) -> pd.DataFrame:
    with conectar() as conn:
        return pd.read_sql_query("SELECT * FROM pmo_riscos WHERE projeto_id = ? ORDER BY id", conn, params=(projeto_id,))


# ---------------------------------------------------------------------------
# Comunicações
# ---------------------------------------------------------------------------

COLUNAS_COMUNICACAO = ["data", "tipo", "descricao", "responsavel"]


def inserir_comunicacao(projeto_id: int, dados: dict[str, Any], usuario: str) -> int:
    agora = agora_br().isoformat()
    campos = {c: dados.get(c) for c in COLUNAS_COMUNICACAO}
    with conectar() as conn:
        cursor = conn.execute(
            f"INSERT INTO pmo_comunicacoes (projeto_id, {', '.join(campos.keys())}, criado_por, criado_em) "
            f"VALUES (?, {', '.join(['?'] * len(campos))}, ?, ?)",
            (projeto_id, *campos.values(), usuario, agora),
        )
        comunicacao_id = cursor.lastrowid
        registrar_historico(conn, "pmo_comunicacoes", comunicacao_id, {}, campos, usuario)
        return comunicacao_id


def listar_comunicacoes(projeto_id: int) -> pd.DataFrame:
    with conectar() as conn:
        return pd.read_sql_query("SELECT * FROM pmo_comunicacoes WHERE projeto_id = ? ORDER BY data DESC", conn, params=(projeto_id,))


# ---------------------------------------------------------------------------
# Reuniões, Planos de Ação e Alertas — módulos compartilhados com o GAT
# ---------------------------------------------------------------------------


def criar_reuniao_pmo(projeto_id: int, dados: dict[str, Any], participantes: list[str], usuario: str) -> int:
    dados_completos = {**dados, "origem": ORIGEM_PMO}
    return inserir_reuniao(dados_completos, [(MODULO_ALERTA_PMO, projeto_id)], participantes, usuario)


def atualizar_reuniao_pmo(reuniao_id: int, projeto_id: int, dados: dict[str, Any], participantes: list[str], usuario: str) -> None:
    dados_completos = {**dados, "origem": ORIGEM_PMO}
    atualizar_reuniao(reuniao_id, dados_completos, [(MODULO_ALERTA_PMO, projeto_id)], participantes, usuario)


def listar_reunioes_projeto(projeto_id: int) -> pd.DataFrame:
    return listar_reunioes_do_projeto(MODULO_ALERTA_PMO, projeto_id)


def criar_plano_acao_pmo(projeto_id: int, dados: dict[str, Any], usuario: str) -> int:
    dados_completos = {**dados, "origem": ORIGEM_PMO, "pmo_projeto_id": projeto_id}
    return inserir_plano_acao(dados_completos, usuario)


def atualizar_plano_acao_pmo(plano_id: int, dados: dict[str, Any], usuario: str) -> None:
    atualizar_plano_acao(plano_id, {**dados, "origem": ORIGEM_PMO}, usuario)


def listar_planos_acao_projeto(projeto_id: int) -> pd.DataFrame:
    todos = listar_planos_acao()
    if todos.empty or "pmo_projeto_id" not in todos.columns:
        return pd.DataFrame()
    return todos[todos["pmo_projeto_id"] == projeto_id]


def criar_alerta_pmo(
    projeto_id: int, titulo: str, descricao: str, usuario: str,
    prioridade: str = "Média", vencimento: str | None = None,
) -> int:
    """Alerta configurado livremente pelo gerente do projeto (marcos,
    vencimentos etc.) — mesma infraestrutura do alerta automático de
    cronograma pendente."""
    return criar_alerta_manual(
        {"modulo": MODULO_ALERTA_PMO, "projeto_id": projeto_id, "titulo": titulo, "descricao": descricao, "prioridade": prioridade, "vencimento": vencimento},
        usuario,
    )


def listar_alertas_projeto(projeto_id: int) -> pd.DataFrame:
    todos = listar_alertas_manuais(MODULO_ALERTA_PMO)
    if todos.empty:
        return todos
    return todos[todos["projeto_id"] == projeto_id]


def listar_alertas_pmo() -> pd.DataFrame:
    return listar_alertas_manuais(MODULO_ALERTA_PMO)
