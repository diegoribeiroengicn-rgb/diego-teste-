"""
Fonte única de verdade para a data/hora "agora" do sistema — sempre no
fuso horário de Brasília (America/Sao_Paulo, UTC-3, sem horário de verão
desde 2019), independentemente do fuso horário do servidor/container onde
a aplicação está hospedada (em produção, o servidor roda em UTC).

Usar `agora_br()`/`hoje_br()` em vez de `datetime.now()`/`date.today()`
em qualquer lugar do sistema que grave ou exiba data/hora ao usuário
(carimbos de criação/edição, histórico, auditoria, relatórios, nomes de
arquivo, cabeçalhos) — os valores retornados são "naive" (sem tzinfo),
mantendo compatibilidade direta com `.isoformat()`/`.strftime()` já usados
em todo o sistema; apenas o valor numérico é corrigido para o horário de
Brasília, não o fuso é anexado ao objeto.
"""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

FUSO_BRASILIA = ZoneInfo("America/Sao_Paulo")


def agora_br() -> datetime:
    """Data/hora atual em Brasília, como `datetime` naive (sem tzinfo)."""
    return datetime.now(FUSO_BRASILIA).replace(tzinfo=None)


def hoje_br() -> date:
    """Data atual em Brasília."""
    return agora_br().date()
