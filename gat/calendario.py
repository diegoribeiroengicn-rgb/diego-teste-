"""
Calendário oficial de feriados do Rio de Janeiro (RJ) e funções de cálculo
de dias úteis equivalentes às funções NETWORKDAYS/WORKDAY do Excel,
utilizadas na planilha original "Controle_GAT_Projetos_2026.xlsm"
(aba FERIADOS_2026).
"""

from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd

from gat.horario import hoje_br

# Lista oficial de feriados extraída da aba FERIADOS_2026 da planilha GAT,
# incluindo feriados nacionais e pontos facultativos considerados pela
# Tecnoplano no cálculo de dias úteis.
FERIADOS_RJ: list[date] = [
    date(2025, 12, 24),  # Véspera de Natal
    date(2025, 12, 25),  # Natal
    date(2025, 12, 31),  # Véspera de Ano Novo
    date(2026, 1, 1),    # Confraternização Universal
    date(2026, 1, 20),   # São Sebastião
    date(2026, 2, 16),   # Carnaval
    date(2026, 2, 17),   # Carnaval
    date(2026, 4, 3),    # Paixão de Cristo
    date(2026, 4, 21),   # Tiradentes
    date(2026, 4, 23),   # São Jorge
    date(2026, 5, 1),    # Dia do Trabalho
    date(2026, 6, 4),    # Corpus Christi
    date(2026, 9, 7),    # Independência do Brasil
    date(2026, 10, 12),  # Nossa Sr.a Aparecida - Padroeira do Brasil
    date(2026, 10, 19),  # Dia do Trabalhador da Construção Civil
    date(2026, 11, 2),   # Finados
    date(2026, 11, 15),  # Proclamação da República
    date(2026, 11, 20),  # Dia Nacional de Zumbi e da Consciência Negra
    date(2026, 12, 25),  # Natal
    date(2026, 12, 31),  # Véspera de Ano Novo
    date(2027, 1, 1),    # Confraternização Universal
]

_FERIADOS_NP = np.array(FERIADOS_RJ, dtype="datetime64[D]")


def _to_date(valor) -> date | None:
    """Normaliza datetime/date/str/None para `date`, tolerando também
    `NaN`/`NaT` (o `pandas.NaT` é reconhecido pelo Python como instância de
    `datetime`/`date`, então precisa ser descartado antes dos `isinstance`
    abaixo) e strings vazias, malformadas ou legadas ("nan", "None") —
    nunca levanta exceção, apenas retorna `None` quando o valor não é uma
    data válida."""
    try:
        if pd.isna(valor):
            return None
    except (TypeError, ValueError):
        pass
    if valor is None or valor == "":
        return None
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    if isinstance(valor, str):
        try:
            return datetime.fromisoformat(valor).date()
        except ValueError:
            return None
    return None


def dias_uteis_entre(data_inicio, data_fim) -> int:
    """
    Equivalente à função NETWORKDAYS do Excel: conta os dias úteis entre
    duas datas (inclusive), descontando finais de semana e feriados do
    calendário oficial do RJ.
    """
    inicio = _to_date(data_inicio)
    fim = _to_date(data_fim)
    if inicio is None or fim is None:
        return 0
    sinal = 1
    if fim < inicio:
        inicio, fim = fim, inicio
        sinal = -1
    # numpy.busday_count é exclusivo no limite superior; soma-se 1 dia para
    # incluir a data final, replicando o comportamento do NETWORKDAYS do Excel.
    dias = np.busday_count(
        np.datetime64(inicio, "D"),
        np.datetime64(fim + timedelta(days=1), "D"),
        holidays=_FERIADOS_NP,
    )
    return int(dias) * sinal


def dias_corridos_entre(data_inicio, data_fim) -> int | None:
    """
    Dias corridos (calendário) entre duas datas, inclusive — usado ao lado
    de `dias_uteis_entre` nos relatórios que precisam apresentar as duas
    contagens (nunca uma no lugar da outra). Retorna `None` quando alguma
    das datas é inválida/ausente, em vez de inventar um valor.
    """
    inicio = _to_date(data_inicio)
    fim = _to_date(data_fim)
    if inicio is None or fim is None:
        return None
    return (fim - inicio).days


def somar_dias_uteis(data_base, quantidade_dias: int) -> date | None:
    """
    Equivalente à função WORKDAY do Excel: soma `quantidade_dias` dias úteis
    à `data_base`, pulando finais de semana e feriados do calendário RJ.
    """
    base = _to_date(data_base)
    if base is None:
        return None
    resultado = np.busday_offset(
        np.datetime64(base, "D"),
        quantidade_dias,
        roll="forward",
        holidays=_FERIADOS_NP,
    )
    return resultado.astype(date)


def calcular_data_limite(data_solicitacao, sla_dias_uteis: int) -> date | None:
    """
    Calcula a data limite/prevista de entrega a partir da data de
    solicitação e do SLA em dias úteis, replicando a fórmula original da
    planilha: `WORKDAY(data_solicitacao - 1, sla, feriados)`.
    """
    base = _to_date(data_solicitacao)
    if base is None:
        return None
    return somar_dias_uteis(base - timedelta(days=1), sla_dias_uteis)


def dias_uteis_decorridos(data_solicitacao, data_analise=None, hold_dias: int = 0, hold_aberto_desde=None) -> int:
    """
    Calcula os dias úteis decorridos de uma análise (Coluna L - Prestadores):
    conta os dias úteis entre a data de solicitação e a data de análise
    (quando já concluída) ou a data de hoje (quando ainda em andamento,
    tornando o cálculo 100% dinâmico), descontando os dias em hold.

    `hold_aberto_desde`: quando o projeto está atualmente em HOLD aberto
    (ver `em_hold`) e ainda não há `data_analise`, o relógio de dias
    decorridos é congelado na data de início do HOLD em vez de continuar
    avançando até hoje — o SLA fica pausado enquanto o HOLD estiver aberto,
    e volta a contar a partir de onde parou assim que o HOLD for encerrado
    (`hold_fim` preenchido, quando `hold_dias` passa a descontar o período
    integral já fechado).
    """
    inicio = _to_date(data_solicitacao)
    if inicio is None:
        return 0
    if data_analise is None and hold_aberto_desde is not None:
        fim = _to_date(hold_aberto_desde) or hoje_br()
    else:
        fim = _to_date(data_analise) or hoje_br()
    return max(dias_uteis_entre(inicio, fim) - (hold_dias or 0), 0)


def saldo_dias_uteis(data_solicitacao, sla_dias_uteis: int, data_analise=None, hold_dias: int = 0, hold_aberto_desde=None) -> int:
    """
    Calcula o saldo de dias úteis (Coluna K - Cessionários): é o total de
    dias úteis do SLA menos os dias úteis já decorridos. Valores negativos
    indicam que o prazo já foi estourado. Ver `dias_uteis_decorridos` sobre
    `hold_aberto_desde` (congelamento do SLA durante HOLD aberto).
    """
    decorridos = dias_uteis_decorridos(data_solicitacao, data_analise, hold_dias, hold_aberto_desde)
    return (sla_dias_uteis or 0) - decorridos


def calcular_hold_dias(hold_inicio, hold_fim) -> int:
    """Calcula os dias úteis em hold (suspensão da análise) já ENCERRADO
    (ambas as datas preenchidas). Usa `_to_date` (via `dias_uteis_entre`)
    para decidir ausência de data — evitar checar `not hold_inicio`/
    `not hold_fim` diretamente, porque `NaN` (float) é truthy em Python e
    não seria pego por essa negação. Para HOLD ainda aberto, ver `em_hold`
    e `dias_uteis_hold_aberto`."""
    if _to_date(hold_inicio) is None or _to_date(hold_fim) is None:
        return 0
    return max(dias_uteis_entre(hold_inicio, hold_fim), 0)


def em_hold(hold_inicio, hold_fim) -> bool:
    """True quando o projeto está atualmente em HOLD (intervalo aberto):
    `hold_inicio` preenchido e `hold_fim` ainda vazio. Fonte única de
    verdade para "está em HOLD agora" — usada pela Página Inicial,
    Dashboards, Visão Geral, Central de Alertas e Lista de HOLD, para que
    todos apresentem exatamente os mesmos números."""
    return _to_date(hold_inicio) is not None and _to_date(hold_fim) is None


def dias_uteis_hold_aberto(hold_inicio) -> int:
    """Dias úteis decorridos desde o início de um HOLD ainda aberto até
    hoje — usado para disparar o alerta de acompanhamento aos 3 dias
    úteis. Só faz sentido chamar quando `em_hold(...)` for `True`."""
    inicio = _to_date(hold_inicio)
    if inicio is None:
        return 0
    return max(dias_uteis_entre(inicio, hoje_br()), 0)
