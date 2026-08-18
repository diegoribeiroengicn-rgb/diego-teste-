"""
Testes de sanidade (sem dependência de pytest) para a normalização segura
de dados usada nos KPIs/dashboards — cobre exatamente os casos exigidos
pela modificação de robustez de KPIs/SLA/prazos: valores ausentes, `NaN`,
`NaT`, strings vazias/malformadas/legadas e um DataFrame com um único
registro inconsistente misturado a registros válidos.

Executar com: `python3 scripts/testar_normalizacao_kpis.py` (a partir da
raiz do repositório). Não grava nada no banco — só exercita as funções
puras de `gat/normalizacao.py`, `gat/calendario.py` e `gat/business_rules.py`.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from gat.business_rules import (
    classificacao_atraso,
    dias_restantes_prioridade,
    montar_lista_atrasados,
    resumo_indicadores_atraso,
)
from gat.calendario import _to_date, calcular_hold_dias
from gat.config import SLA_PRESTADORES_DIAS_UTEIS
from gat.normalizacao import booleano_seguro, calculo_seguro, inteiro_seguro, texto_seguro

_falhas: list[str] = []


def checar(descricao: str, condicao: bool) -> None:
    status = "OK " if condicao else "FALHOU"
    print(f"[{status}] {descricao}")
    if not condicao:
        _falhas.append(descricao)


def secao(titulo: str) -> None:
    print(f"\n=== {titulo} ===")


# ---------------------------------------------------------------------------
# Item 36 — inteiro_seguro: os 8 casos exigidos
# ---------------------------------------------------------------------------
secao("inteiro_seguro — casos obrigatórios (item 36)")
checar("Caso 1: sla_dias=10 -> 10", inteiro_seguro(10, SLA_PRESTADORES_DIAS_UTEIS) == 10)
checar("Caso 2: sla_dias=None -> padrão", inteiro_seguro(None, SLA_PRESTADORES_DIAS_UTEIS) == SLA_PRESTADORES_DIAS_UTEIS)
checar("Caso 3: sla_dias=NaN -> padrão (sem ValueError)", inteiro_seguro(float("nan"), SLA_PRESTADORES_DIAS_UTEIS) == SLA_PRESTADORES_DIAS_UTEIS)
checar("Caso 4: sla_dias='' -> padrão (sem erro)", inteiro_seguro("", SLA_PRESTADORES_DIAS_UTEIS) == SLA_PRESTADORES_DIAS_UTEIS)
checar("Caso 5: sla_dias='10' -> 10", inteiro_seguro("10", SLA_PRESTADORES_DIAS_UTEIS) == 10)
checar("Caso 6: sla_dias=10.0 -> 10", inteiro_seguro(10.0, SLA_PRESTADORES_DIAS_UTEIS) == 10)
checar("Caso 7: sla_dias='nan' -> padrão (fallback seguro)", inteiro_seguro("nan", SLA_PRESTADORES_DIAS_UTEIS) == SLA_PRESTADORES_DIAS_UTEIS)
checar("Caso 8: campo ausente (registro antigo) -> padrão", inteiro_seguro(pd.Series({"x": 1}).get("sla_dias"), SLA_PRESTADORES_DIAS_UTEIS) == SLA_PRESTADORES_DIAS_UTEIS)

secao("inteiro_seguro — casos adicionais")
checar("'None' (texto) -> padrão", inteiro_seguro("None", 99) == 99)
checar("pd.NA -> padrão", inteiro_seguro(pd.NA, 99) == 99)
checar("pd.NaT -> padrão", inteiro_seguro(pd.NaT, 99) == 99)
checar("0 (zero legítimo) -> 0, não o padrão", inteiro_seguro(0, 99) == 0)
checar("'  7  ' (com espaços) -> 7", inteiro_seguro("  7  ", 99) == 7)
checar("'abc' (texto inválido) -> padrão", inteiro_seguro("abc", 99) == 99)

secao("texto_seguro / booleano_seguro")
checar("texto_seguro(NaN) -> ''", texto_seguro(float("nan")) == "")
checar("texto_seguro(None) -> ''", texto_seguro(None) == "")
checar("texto_seguro('Liberado') -> 'Liberado'", texto_seguro("Liberado") == "Liberado")
checar("booleano_seguro(NaN) -> False (não True)", booleano_seguro(float("nan")) is False)
checar("booleano_seguro(None) -> False", booleano_seguro(None) is False)
checar("booleano_seguro(1) -> True", booleano_seguro(1) is True)
checar("booleano_seguro(True) -> True", booleano_seguro(True) is True)

# ---------------------------------------------------------------------------
# dias_restantes_prioridade — mesmos casos, agora no cálculo real de SLA
# ---------------------------------------------------------------------------
secao("dias_restantes_prioridade — Prestadores, sla_dias variando")
for valor_sla, rotulo in [
    (10, "10 (int)"), (None, "None"), (float("nan"), "NaN"), ("", "'' vazio"),
    ("10", "'10' (string)"), (10.0, "10.0 (float)"), ("nan", "'nan' (texto)"),
]:
    row = pd.Series({"sla_dias": valor_sla, "dias_uteis_decorridos": 3})
    try:
        resultado = dias_restantes_prioridade(row, "prestadores")
        checar(f"sla_dias={rotulo} não levanta ValueError (resultado={resultado})", True)
    except ValueError as exc:
        checar(f"sla_dias={rotulo} não levanta ValueError ({exc})", False)

secao("dias_restantes_prioridade — registro antigo sem os campos (Caso 8)")
row_legado = pd.Series({"id": 1})
try:
    resultado = dias_restantes_prioridade(row_legado, "prestadores")
    checar(f"Registro sem sla_dias/dias_uteis_decorridos -> {resultado} (esperado: None, sem dados suficientes)", resultado is None)
except Exception as exc:  # noqa: BLE001 — este teste garante ausência total de exceção
    checar(f"Registro legado não levanta exceção ({exc})", False)

# ---------------------------------------------------------------------------
# classificacao_atraso com status_analise NaN (bug real encontrado na auditoria)
# ---------------------------------------------------------------------------
secao("classificacao_atraso — status_analise inconsistente")
try:
    resultado = classificacao_atraso(float("nan"), "ATRASADO")
    checar(f"status_analise=NaN não levanta AttributeError (resultado={resultado!r})", True)
except AttributeError as exc:
    checar(f"status_analise=NaN não levanta AttributeError ({exc})", False)

# ---------------------------------------------------------------------------
# Item 39 — um registro inconsistente não pode derrubar o cálculo do KPI
# ---------------------------------------------------------------------------
secao("resumo_indicadores_atraso — 500 registros bons + 1 registro ruim")
linhas = []
for i in range(500):
    linhas.append({
        "id": i, "status_analise": "EM ANÁLISE", "status_entrega_calc": "NO PRAZO" if i % 2 == 0 else "ATRASADO",
        "sla_dias": 10, "dias_uteis_decorridos": 3 if i % 2 == 0 else 12,
    })
# O registro 501: todos os campos numéricos/textuais corrompidos de formas distintas.
linhas.append({
    "id": 501, "status_analise": float("nan"), "status_entrega_calc": pd.NaT,
    "sla_dias": "nan", "dias_uteis_decorridos": "None",
})
df_misto = pd.DataFrame(linhas)

try:
    resumo = resumo_indicadores_atraso(df_misto, "prestadores")
    checar(f"resumo_indicadores_atraso não crasha com 1 registro ruim entre 500 bons (resumo={resumo})", True)
    checar("Os 500 registros bons continuam contabilizados (em_analise == 500)", resumo["em_analise"] == 500)
except Exception as exc:  # noqa: BLE001
    checar(f"resumo_indicadores_atraso NÃO deveria levantar exceção, mas levantou: {exc!r}", False)

secao("montar_lista_atrasados — mesmo DataFrame misto")
try:
    lista = montar_lista_atrasados(df_misto, "prestadores", "id")
    checar(f"montar_lista_atrasados não crasha com o mesmo DataFrame misto ({len(lista)} linha(s))", True)
except Exception as exc:  # noqa: BLE001
    checar(f"montar_lista_atrasados NÃO deveria levantar exceção, mas levantou: {exc!r}", False)

secao("calculo_seguro — protege contra falha inesperada sem mascarar bugs")
def _funcao_que_falha(x):
    return 1 / x  # ZeroDivisionError quando x == 0

checar("calculo_seguro captura ZeroDivisionError e retorna None", calculo_seguro(_funcao_que_falha, 0) is None)
checar("calculo_seguro repassa o resultado normal quando não há erro", calculo_seguro(_funcao_que_falha, 2) == 0.5)

# ---------------------------------------------------------------------------
# gat/calendario.py — datas ausentes/inválidas (item 6)
# ---------------------------------------------------------------------------
secao("_to_date / calcular_hold_dias — datas ausentes/inválidas")
for valor, rotulo in [(None, "None"), (float("nan"), "NaN"), (pd.NaT, "NaT"), ("", "''"), ("data-invalida", "string malformada")]:
    checar(f"_to_date({rotulo}) -> None (sem exceção)", _to_date(valor) is None)

try:
    resultado_hold = calcular_hold_dias(pd.NaT, pd.NaT)
    checar(f"calcular_hold_dias(NaT, NaT) -> {resultado_hold} (esperado 0, sem TypeError)", resultado_hold == 0)
except TypeError as exc:
    checar(f"calcular_hold_dias(NaT, NaT) não levanta TypeError ({exc})", False)

# ---------------------------------------------------------------------------
# Resultado final
# ---------------------------------------------------------------------------
print(f"\n{'=' * 60}")
if _falhas:
    print(f"{len(_falhas)} teste(s) FALHARAM:")
    for f in _falhas:
        print(f"  - {f}")
    sys.exit(1)
else:
    print("Todos os testes passaram.")
    sys.exit(0)
