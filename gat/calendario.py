"""
Calendário oficial de feriados do Rio de Janeiro (RJ) e funções de cálculo
de dias úteis equivalentes às funções NETWORKDAYS/WORKDAY do Excel,
utilizadas na planilha original "Controle_GAT_Projetos_2026.xlsm"
(aba FERIADOS_2026).
"""

from datetime import date, datetime, timedelta

import numpy as np

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
    """Normaliza datetime/date/str/None para `date`."""
    if valor is None or valor == "":
        return None
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    if isinstance(valor, str):
        return datetime.fromisoformat(valor).date()
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


def dias_uteis_decorridos(data_solicitacao, data_analise=None, hold_dias: int = 0) -> int:
    """
    Calcula os dias úteis decorridos de uma análise (Coluna L - Prestadores):
    conta os dias úteis entre a data de solicitação e a data de análise
    (quando já concluída) ou a data de hoje (quando ainda em andamento,
    tornando o cálculo 100% dinâmico), descontando os dias em hold.
    """
    inicio = _to_date(data_solicitacao)
    if inicio is None:
        return 0
    fim = _to_date(data_analise) or date.today()
    return max(dias_uteis_entre(inicio, fim) - (hold_dias or 0), 0)


def saldo_dias_uteis(data_solicitacao, sla_dias_uteis: int, data_analise=None, hold_dias: int = 0) -> int:
    """
    Calcula o saldo de dias úteis (Coluna K - Cessionários): é o total de
    dias úteis do SLA menos os dias úteis já decorridos. Valores negativos
    indicam que o prazo já foi estourado.
    """
    decorridos = dias_uteis_decorridos(data_solicitacao, data_analise, hold_dias)
    return (sla_dias_uteis or 0) - decorridos


def calcular_hold_dias(hold_inicio, hold_fim) -> int:
    """Calcula os dias úteis em hold (suspensão da análise)."""
    if not hold_inicio or not hold_fim:
        return 0
    return max(dias_uteis_entre(hold_inicio, hold_fim), 0)
