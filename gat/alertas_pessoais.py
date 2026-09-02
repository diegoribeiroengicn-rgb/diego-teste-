"""
Alertas pessoais direcionados a um analista específico ("Meus Alertas"):

* Prazos da própria carga (vencido / vence hoje / vence em breve) —
  reaproveita a mesma classificação já usada em Projetos e nos Dashboards
  (`gat.business_rules.dias_restantes_prioridade` + `situacao_prazo`),
  calculada sempre ao vivo a partir dos dados atuais. Não introduz uma
  tabela de detecção própria nem uma regra de SLA nova — some sozinho
  quando o status muda para um status final ou o prazo deixa de estar
  vencido/próximo, sem precisar de um passo manual de "concluir".
* Alertas manuais (`gat.ui.modals_alerta_manual`) endereçados a este
  usuário via `alertas_manuais.destinatarios` — mesmo dado já usado na
  Central de Alertas, só filtrado para quem foi direcionado.

Este módulo não duplica nem substitui a Central de Alertas
(`gat.alertas_engine`, `alertas_radar`): é uma camada de notificação
pessoal por cima dos mesmos dados/regras já existentes.
"""

from __future__ import annotations

import pandas as pd

from gat.business_rules import dias_restantes_prioridade, situacao_prazo
from gat.database import listar_alertas_manuais, listar_alertas_pessoais_vistos
from gat.normalizacao import calculo_seguro, texto_seguro

_COLUNAS_PRAZO = [
    "modulo", "projeto_id", "codigo", "nome_entidade", "disciplina", "num_at",
    "data_limite", "situacao_prazo", "dias_restantes", "prioridade", "chave",
]

_SITUACOES_ALERTAVEIS = {"ATRASADO", "VENCE HOJE", "VENCE EM BREVE"}


def _prioridade_prazo(dias_restantes: int) -> str:
    """Alta — vencido ou vence hoje; Média — vence amanhã (1 dia útil);
    Baixa — vence em 2 dias úteis (o próprio limiar de VENCE EM BREVE em
    `situacao_prazo` já não deixa nada além de 2 dias chegar aqui)."""
    if dias_restantes <= 0:
        return "Alta"
    if dias_restantes == 1:
        return "Média"
    return "Baixa"


def montar_alertas_prazo_pessoais(df_prest: pd.DataFrame, df_cess: pd.DataFrame, analista_vinculado: str | None) -> pd.DataFrame:
    """Análises "EM ANÁLISE" (HOLD fica de fora — SLA pausado, nada a
    notificar agora) do `analista_vinculado`, com prazo vencido/vence
    hoje/vence em breve."""
    if not analista_vinculado:
        return pd.DataFrame(columns=_COLUNAS_PRAZO)

    alvo = analista_vinculado.strip().upper()
    linhas = []
    for modulo, df, coluna_nome in (("prestadores", df_prest, "prestador"), ("cessionarios", df_cess, "cessionario")):
        if df.empty:
            continue
        sub = df[
            (df["responsavel"].fillna("").astype(str).str.strip().str.upper() == alvo)
            & (df["status_analise"].fillna("").astype(str).str.strip().str.upper() == "EM ANÁLISE")
        ]
        for _, row in sub.iterrows():
            dias = calculo_seguro(dias_restantes_prioridade, row, modulo, contexto="dias_restantes_prioridade")
            if dias is None:
                continue
            chave_situacao = situacao_prazo(dias)
            if chave_situacao not in _SITUACOES_ALERTAVEIS:
                continue
            data_limite = texto_seguro(row.get("data_limite"))
            linhas.append({
                "modulo": modulo,
                "projeto_id": int(row["id"]),
                "codigo": texto_seguro(row.get("codigo")),
                "nome_entidade": texto_seguro(row.get(coluna_nome)),
                "disciplina": texto_seguro(row.get("disciplina")),
                "num_at": texto_seguro(row.get("num_at")),
                "data_limite": data_limite,
                "situacao_prazo": chave_situacao,
                "dias_restantes": dias,
                "prioridade": _prioridade_prazo(dias),
                "chave": f"{modulo}:{int(row['id'])}:{data_limite}",
            })

    if not linhas:
        return pd.DataFrame(columns=_COLUNAS_PRAZO)

    resultado = pd.DataFrame(linhas)
    ordem_prioridade = {"Alta": 0, "Média": 1, "Baixa": 2}
    resultado["_ordem"] = resultado["prioridade"].map(ordem_prioridade)
    return resultado.sort_values(["_ordem", "dias_restantes"]).drop(columns=["_ordem"]).reset_index(drop=True)


def _lista_destinatarios(valor) -> list[str]:
    return [d.strip() for d in str(valor or "").split(",") if d.strip()]


def montar_alertas_manuais_pessoais(username: str) -> pd.DataFrame:
    """Alertas manuais ABERTOS endereçados a `username`. `chave` inclui a
    data da última edição — se o alerta for editado depois de visto, ele
    reaparece para o destinatário (a mensagem mudou)."""
    manuais = pd.concat(
        [listar_alertas_manuais("prestadores"), listar_alertas_manuais("cessionarios")], ignore_index=True
    )
    if manuais.empty:
        return manuais

    endereçado = manuais["destinatarios"].apply(lambda v: username in _lista_destinatarios(v))
    direcionados = manuais[endereçado & (manuais["status"] == "ABERTO")].copy()
    if direcionados.empty:
        return direcionados
    direcionados["chave"] = direcionados.apply(
        lambda r: f"{int(r['id'])}:{r.get('atualizado_em') or r.get('criado_em')}", axis=1
    )
    return direcionados


def filtrar_nao_vistos(df_prazo: pd.DataFrame, df_manuais: pd.DataFrame, username: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Remove de cada lista os alertas já marcados como vistos por este
    usuário (mesmo estado — `chave` inclui o que precisa mudar para
    reaparecer)."""
    vistos = listar_alertas_pessoais_vistos(username)
    prazo_pendente = df_prazo[~df_prazo["chave"].apply(lambda c: ("PRAZO", c) in vistos)] if not df_prazo.empty else df_prazo
    manuais_pendente = df_manuais[~df_manuais["chave"].apply(lambda c: ("MANUAL", c) in vistos)] if not df_manuais.empty else df_manuais
    return prazo_pendente, manuais_pendente


def carregar_alertas_pessoais(usuario: dict, df_prest: pd.DataFrame, df_cess: pd.DataFrame) -> dict:
    """Ponto único usado pelo pop-up, pelo contador da barra lateral e pela
    página "Meus Alertas" — garante que os três nunca divirjam."""
    prazo = montar_alertas_prazo_pessoais(df_prest, df_cess, usuario.get("analista_vinculado"))
    manuais = montar_alertas_manuais_pessoais(usuario["username"])
    prazo_pendente, manuais_pendente = filtrar_nao_vistos(prazo, manuais, usuario["username"])
    return {
        "prazo": prazo,
        "manuais": manuais,
        "prazo_pendente": prazo_pendente,
        "manuais_pendente": manuais_pendente,
        "total_pendente": len(prazo_pendente) + len(manuais_pendente),
    }
