"""
Devolutiva Externa — regra definitiva de cobrança recorrente após a
emissão da última AT (consolida e substitui a regra anterior isolada de
"Atraso no Reenvio" de `gat/revisoes.py` para o caso ainda em aberto, sem
uma próxima revisão registrada — `TIPO_ATRASO_REENVIO` continua existindo
e cobrindo o caso retrospectivo, quando a revisão seguinte já chegou fora
do SLA de 10 dias úteis).

Marco inicial: data de emissão/entrega da última AT (`data_analise` da
revisão mais recente de um projeto, quando o status exige devolutiva do
Prestador/Cessionário). Regra:

* 10 dias úteis sem retorno → 1ª cobrança;
* +5 dias úteis sem retorno → 2ª cobrança;
* +5 dias úteis sem retorno → 3ª cobrança; e assim sucessivamente, sem
  limite máximo, enquanto o projeto não retornar para Em Análise/Em
  Andamento (ou seja, enquanto a revisão mais recente continuar com um
  dos status de `STATUS_AGUARDA_DEVOLUTIVA_EXTERNA`).

HOLD sempre prevalece: pausa a contagem (10 ou 5 dias) e nunca gera nova
cobrança, atraso ou Alerta Máximo enquanto o projeto estiver em HOLD
aberto — mesma regra central de `gat.calendario.em_hold`/
`dias_uteis_decorridos` (via `hold_aberto_desde`) já usada no SLA interno
e na Lista de Prioridades.

O período de devolutiva externa nunca é contado como atraso do analista:
a revisão mais recente já está em um status de `STATUS_CONCLUIDO_ENTREGA`
(`gat.kpis_analistas_prazo`), portanto já fica fora de "atrasados_em_analise"
e do SLA interno sem nenhuma alteração adicional — este módulo só cuida
da contagem/cobrança do lado externo.
"""

from __future__ import annotations

import pandas as pd

from gat.calendario import calcular_hold_dias, dias_uteis_decorridos, em_hold, somar_dias_uteis
from gat.normalizacao import booleano_seguro, texto_seguro
from gat.revisoes import linha_mais_recente_por_projeto

SLA_PRIMEIRA_COBRANCA_DIAS_UTEIS = 10
SLA_COBRANCAS_SEGUINTES_DIAS_UTEIS = 5

# Status da revisão mais recente que caracteriza "aguardando devolutiva
# externa" — a análise Tecnoplano já foi concluída e emitida (AT emitida),
# mas depende de uma nova revisão do Prestador/Cessionário para prosseguir.
# "LIBERADO" (aprovado sem restrições) não entra: não há mais nada
# pendente do lado externo.
STATUS_AGUARDA_DEVOLUTIVA_EXTERNA = {"LIBERADO C/ REST.", "NÃO LIBERADO"}

SITUACAO_AGUARDANDO_PRAZO_INICIAL = "AGUARDANDO_PRAZO_INICIAL"
SITUACAO_PRIMEIRA_COBRANCA_NECESSARIA = "PRIMEIRA_COBRANCA_NECESSARIA"
SITUACAO_COBRANCA_REALIZADA = "COBRANCA_REALIZADA"
SITUACAO_NOVA_COBRANCA_NECESSARIA = "NOVA_COBRANCA_NECESSARIA"
SITUACAO_EM_HOLD = "EM_HOLD"

SITUACAO_DEVOLUTIVA_LABELS = {
    SITUACAO_AGUARDANDO_PRAZO_INICIAL: "Aguardando prazo inicial",
    SITUACAO_PRIMEIRA_COBRANCA_NECESSARIA: "1ª cobrança necessária",
    SITUACAO_COBRANCA_REALIZADA: "Cobrança realizada",
    SITUACAO_NOVA_COBRANCA_NECESSARIA: "Nova cobrança necessária",
    SITUACAO_EM_HOLD: "Em HOLD",
}


def _data(valor):
    convertido = pd.to_datetime(valor, errors="coerce")
    return convertido.date() if pd.notna(convertido) else None


def esta_aguardando_devolutiva_externa(status_analise) -> bool:
    """True quando o status da revisão mais recente exige devolutiva
    externa (AT emitida, aguardando nova revisão do Prestador/
    Cessionário) — fonte única desta condição, usada em todas as telas."""
    return texto_seguro(status_analise).strip().upper() in STATUS_AGUARDA_DEVOLUTIVA_EXTERNA


def dias_uteis_devolutiva(data_referencia, hold_inicio, hold_fim, em_hold_atual: bool) -> int:
    """
    Dias úteis decorridos desde `data_referencia` (data da última AT ou da
    última cobrança confirmada) até hoje, descontando apenas o HOLD que
    tenha começado a partir dessa referência (um HOLD anterior pertence à
    fase interna da análise, já descontado em outro lugar — nunca contado
    duas vezes). Reaproveita `dias_uteis_decorridos` (mesma função central
    do SLA interno) para o congelamento em HOLD aberto.
    """
    referencia = _data(data_referencia)
    if referencia is None:
        return 0
    inicio_hold = _data(hold_inicio)
    hold_conta_na_janela = inicio_hold is not None and inicio_hold >= referencia
    hold_dias = calcular_hold_dias(hold_inicio, hold_fim) if hold_conta_na_janela else 0
    hold_aberto_desde = hold_inicio if (em_hold_atual and hold_conta_na_janela) else None
    return dias_uteis_decorridos(referencia, None, hold_dias, hold_aberto_desde)


def situacao_devolutiva(data_ultima_at, hold_inicio, hold_fim, em_hold_atual: bool, datas_cobrancas: list) -> dict:
    """
    Situação atual da devolutiva externa de um projeto (item 16): número
    de cobranças já realizadas, dias úteis decorridos desde a referência
    atual (última AT ou última cobrança confirmada), se uma nova cobrança
    já é devida (e qual número), e a data prevista da próxima verificação.
    HOLD sempre prevalece — pausa a contagem e nunca indica nova cobrança.
    """
    datas_validas = sorted(d for d in (_data(x) for x in datas_cobrancas) if d is not None)
    numero_cobrancas_realizadas = len(datas_validas)
    data_referencia = datas_validas[-1] if datas_validas else _data(data_ultima_at)
    limiar = SLA_COBRANCAS_SEGUINTES_DIAS_UTEIS if numero_cobrancas_realizadas else SLA_PRIMEIRA_COBRANCA_DIAS_UTEIS

    base = {
        "numero_cobrancas_realizadas": numero_cobrancas_realizadas,
        "data_referencia": data_referencia,
        "data_ultima_cobranca": datas_validas[-1] if datas_validas else None,
        "data_primeira_cobranca": datas_validas[0] if datas_validas else None,
    }

    if data_referencia is None:
        return {
            **base, "situacao": None, "situacao_label": "Sem data de referência",
            "dias_uteis_decorridos": 0, "numero_proxima_cobranca": None,
            "data_prevista_proxima_verificacao": None, "acao_necessaria": False,
        }

    dias = dias_uteis_devolutiva(data_referencia, hold_inicio, hold_fim, em_hold_atual)

    if em_hold_atual:
        return {
            **base, "situacao": SITUACAO_EM_HOLD, "situacao_label": SITUACAO_DEVOLUTIVA_LABELS[SITUACAO_EM_HOLD],
            "dias_uteis_decorridos": dias, "numero_proxima_cobranca": None,
            "data_prevista_proxima_verificacao": None, "acao_necessaria": False,
        }

    data_prevista = somar_dias_uteis(data_referencia, limiar)

    if dias < limiar:
        situacao = SITUACAO_AGUARDANDO_PRAZO_INICIAL if numero_cobrancas_realizadas == 0 else SITUACAO_COBRANCA_REALIZADA
        label = (
            SITUACAO_DEVOLUTIVA_LABELS[situacao] if situacao == SITUACAO_AGUARDANDO_PRAZO_INICIAL
            else f"{numero_cobrancas_realizadas}ª cobrança realizada — aguardando prazo"
        )
        return {
            **base, "situacao": situacao, "situacao_label": label,
            "dias_uteis_decorridos": dias, "numero_proxima_cobranca": None,
            "data_prevista_proxima_verificacao": data_prevista, "acao_necessaria": False,
        }

    numero_proxima = numero_cobrancas_realizadas + 1
    situacao = SITUACAO_PRIMEIRA_COBRANCA_NECESSARIA if numero_proxima == 1 else SITUACAO_NOVA_COBRANCA_NECESSARIA
    label = "1ª cobrança necessária" if numero_proxima == 1 else f"{numero_proxima}ª cobrança necessária"
    return {
        **base, "situacao": situacao, "situacao_label": label,
        "dias_uteis_decorridos": dias, "numero_proxima_cobranca": numero_proxima,
        "data_prevista_proxima_verificacao": data_prevista, "acao_necessaria": True,
    }


def montar_devolutivas_pendentes(df: pd.DataFrame, modulo: str, coluna_nome: str, coluna_codigo: str = "codigo") -> pd.DataFrame:
    """
    Uma linha por projeto atualmente aguardando devolutiva externa (a
    revisão mais recente exige retorno do Prestador/Cessionário e ainda
    não houve retorno) — base da seção "Devolutivas Pendentes" da Central
    de Alertas e da área "Aguardando Devolutiva Externa" da Visão do
    Gestor. `df` já deve vir de `enriquecer_prestadores`/
    `enriquecer_cessionarios` (para trazer a coluna `em_hold`).
    """
    colunas = [
        "modulo", "projeto_id", "codigo", "nome", "obra_id", "disciplina", "num_at", "revisao",
        "data_ultima_at", "responsavel", "hold_inicio", "hold_fim", "em_hold",
        "situacao", "situacao_label", "dias_uteis_decorridos", "numero_cobrancas_realizadas",
        "numero_proxima_cobranca", "data_referencia", "data_ultima_cobranca", "data_primeira_cobranca",
        "data_prevista_proxima_verificacao", "acao_necessaria",
    ]
    if df.empty:
        return pd.DataFrame(columns=colunas)

    from gat.database import listar_cobrancas_devolutiva

    recentes = linha_mais_recente_por_projeto(df, coluna_nome, coluna_codigo)
    candidatos = recentes[recentes["status_analise"].apply(esta_aguardando_devolutiva_externa)]
    if candidatos.empty:
        return pd.DataFrame(columns=colunas)

    cobrancas = listar_cobrancas_devolutiva(modulo)

    linhas = []
    for _, row in candidatos.iterrows():
        projeto_id = int(row["id"])
        datas_cobrancas = (
            cobrancas.loc[cobrancas["projeto_id"] == projeto_id, "data_cobranca"].tolist()
            if not cobrancas.empty else []
        )
        em_hold_atual = booleano_seguro(row.get("em_hold")) if "em_hold" in row.index else em_hold(row.get("hold_inicio"), row.get("hold_fim"))
        info = situacao_devolutiva(row.get("data_analise"), row.get("hold_inicio"), row.get("hold_fim"), em_hold_atual, datas_cobrancas)
        linhas.append({
            "modulo": modulo, "projeto_id": projeto_id,
            "codigo": row.get(coluna_codigo), "nome": row.get(coluna_nome),
            "obra_id": row.get("obra_id"), "disciplina": row.get("disciplina"),
            "num_at": row.get("num_at"), "revisao": row.get("revisao"),
            "data_ultima_at": row.get("data_analise"), "responsavel": row.get("responsavel"),
            "hold_inicio": row.get("hold_inicio"), "hold_fim": row.get("hold_fim"), "em_hold": em_hold_atual,
            **info,
        })
    return pd.DataFrame(linhas, columns=colunas)


def _fmt_data(valor) -> str:
    d = _data(valor)
    return d.strftime("%d/%m/%Y") if d else "—"


def gerar_minuta_cobranca(
    numero_cobranca: int, codigo: str | None, nome_entidade: str | None, disciplina: str | None,
    num_at: str | None, data_ultima_at, data_primeira_cobranca=None,
) -> dict:
    """
    Minuta do e-mail de cobrança (itens 2 e 10) — nunca enviada
    automaticamente, apenas gerada para o usuário copiar/enviar e depois
    confirmar. A partir da 2ª cobrança, o texto deixa claro que se trata
    de uma reiteração.
    """
    codigo_label = texto_seguro(codigo).strip() or "—"
    nome_label = texto_seguro(nome_entidade).strip() or "—"
    identificacao = f"{codigo_label} – {nome_label}"
    disciplina_label = texto_seguro(disciplina).strip() or "—"
    at_label = texto_seguro(num_at).strip() or "—"
    data_at_label = _fmt_data(data_ultima_at)

    if numero_cobranca <= 1:
        assunto = f"Solicitação de atualização – {identificacao} – {disciplina_label}"
        corpo = (
            "Prezados,\n\n"
            f"Solicitamos a atualização referente ao projeto {identificacao}, disciplina {disciplina_label}, "
            f"considerando que até o momento não identificamos o recebimento de nova revisão após a emissão "
            f"da {at_label}, em {data_at_label}.\n\n"
            "Solicitamos, por gentileza, informar o andamento das adequações e a previsão para reenvio da "
            "documentação.\n\n"
            "Atenciosamente,"
        )
    else:
        data_primeira_label = _fmt_data(data_primeira_cobranca)
        assunto = f"Reiteração – Solicitação de atualização – {identificacao} – {disciplina_label}"
        corpo = (
            "Prezados,\n\n"
            f"Reiteramos a solicitação de atualização referente ao projeto {identificacao}, disciplina "
            f"{disciplina_label}, considerando que até o momento não identificamos o recebimento de nova "
            f"revisão após a emissão da {at_label}, em {data_at_label}.\n\n"
            f"A primeira solicitação de atualização foi realizada em {data_primeira_label}.\n\n"
            "Solicitamos, por gentileza, informar o andamento das adequações e a previsão para reenvio da "
            "documentação.\n\n"
            "Atenciosamente,"
        )
    return {"assunto": assunto, "corpo": corpo}
