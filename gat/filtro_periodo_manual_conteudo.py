"""Conteúdo do capítulo "Filtros de Análises — Mês/Ano e Intervalo
Personalizado" no Manual do Sistema — usado apenas para semear a migração
correspondente. Depois de publicado, o conteúdo passa a ser gerido pela
Administração do Manual, como qualquer outro capítulo."""

from __future__ import annotations

_CONTEUDO_FILTRO_PERIODO = (
    "As telas **Prestadores > Projetos** e **Cessionários > Projetos** oferecem, dentro de Filtros, duas "
    "formas de consultar por período — sempre uma ou a outra, nunca as duas somadas:\n\n"
    "**Mês/Ano** — o filtro rápido de sempre, por competência.\n\n"
    "**Intervalo personalizado** — escolha uma Data Inicial e uma Data Final (com seletor de calendário, no "
    "formato DD/MM/AAAA) e o sistema mostra somente as análises cuja Data de Solicitação caia dentro desse "
    "intervalo — inclusive um único dia (Data Inicial igual à Data Final), uma semana, ou um intervalo que "
    "atravesse meses ou anos diferentes.\n\n"
    "Exemplo: selecionando Data Inicial 05/08/2026 e Data Final 12/08/2026, a tela mostra apenas as análises "
    "solicitadas entre essas duas datas, incluindo ambas.\n\n"
    "O intervalo personalizado usa exatamente a mesma referência de data do filtro por Mês/Ano (a Data de "
    "Solicitação) — nunca uma contagem diferente entre os dois filtros.\n\n"
    "Se a Data Inicial for informada posterior à Data Final, o sistema avisa \"A Data Inicial não pode ser "
    "posterior à Data Final\" e não aplica o filtro de período, sem interromper a tela.\n\n"
    "Qualquer um dos dois modos de período funciona em conjunto com os demais filtros já existentes "
    "(Responsável, Disciplina, Status, N° AT, Revisão, Prestador/Cessionário etc.) — o resultado combina "
    "todos os critérios marcados ao mesmo tempo.\n\n"
    "\"Limpar filtros\" remove também a seleção de período (Mês/Ano ou intervalo), restaurando a tela ao "
    "comportamento padrão.\n\n"
    "Ao exportar os dados filtrados (Excel ou CSV), o período efetivamente aplicado — mensal ou "
    "personalizado — aparece no cabeçalho do arquivo gerado (\"Período analisado: ...\") e no nome do "
    "arquivo."
)

CAPITULOS_FILTRO_PERIODO: list[tuple[str, str]] = [
    ("Filtros de Análises — Mês/Ano e Intervalo Personalizado", _CONTEUDO_FILTRO_PERIODO),
]
