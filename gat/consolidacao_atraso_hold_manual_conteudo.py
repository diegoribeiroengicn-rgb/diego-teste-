"""Conteúdo do capítulo "SLA, Atraso, HOLD e Alerta Máximo" no Manual do
Sistema — usado apenas para semear a migração correspondente. Depois de
publicado, o conteúdo passa a ser gerido pela Administração do Manual, como
qualquer outro capítulo."""

from __future__ import annotations

_CONTEUDO_SLA_ATRASO_HOLD = (
    "Este capítulo consolida, num só lugar, as regras de SLA, atraso, HOLD e Alerta Máximo — regra "
    "definitiva do sistema, que substitui qualquer entendimento anterior conflitante sobre o assunto.\n\n"
    "**O que é HOLD**\n\n"
    "Uma análise entra em HOLD quando o especialista registra uma data de início de HOLD sem data de fim — "
    "enquanto essa data de fim não é preenchida, a análise está \"em HOLD aberto\". O relógio de dias úteis "
    "do SLA fica congelado no instante em que o HOLD começou: nem os dias já decorridos avançam, nem o prazo "
    "passa a vencer, até que o HOLD seja encerrado.\n\n"
    "**HOLD nunca é atraso**\n\n"
    "Uma análise em HOLD aberto **nunca** é contada como atrasada, em nenhuma tela do sistema (Início, Visão "
    "Geral, Dashboard de Prestadores/Cessionários, Visão do Gestor, KPIs de Prazo dos Analistas, Lista de "
    "Prioridades, Central de Alertas, relatórios) — mesmo que a análise já estivesse atrasada antes de entrar "
    "em HOLD, ou que o prazo congelado, se recalculado hoje sem o HOLD, já estivesse vencido. Essa é a regra "
    "central e única fonte de verdade: todas as telas leem o mesmo cálculo de status de entrega, não existem "
    "cálculos de atraso independentes por tela.\n\n"
    "**Alerta Máximo — pelo menos 24 horas de atraso real**\n\n"
    "Uma análise ativa (fora de HOLD, sem status final) que ultrapassa o prazo já gera o Alerta Máximo assim "
    "que o atraso completa pelo menos 24 horas reais — como o sistema mede prazos em dias úteis inteiros, "
    "isso corresponde ao primeiro dia útil em que a análise aparece com o prazo vencido. Esta regra substitui "
    "definitivamente a regra anterior, que só gerava o Alerta Máximo depois de mais de 2 dias úteis de "
    "atraso acumulado.\n\n"
    "**Projetos em HOLD nunca poderão gerar Alerta Máximo de atraso enquanto permanecerem em HOLD.**\n\n"
    "**Ordem de avaliação do status de uma análise**\n\n"
    "O sistema avalia o status de uma análise sempre na mesma ordem, parando na primeira condição que se "
    "aplica: Arquivado → Cancelado → Concluído (status final) → HOLD → Em Análise → dentro do prazo → "
    "atrasado → Alerta Máximo. Uma vez determinado que a análise está em HOLD, o sistema não avalia mais "
    "atraso nem Alerta Máximo para ela.\n\n"
    "**Saindo do HOLD**\n\n"
    "Ao encerrar o HOLD (registrar a data de fim, com a decisão \"Mantido\" ou \"Retirado\" da tratativa do "
    "acompanhamento de 3 dias úteis, quando aplicável), o SLA e a data prevista de entrega são recalculados "
    "automaticamente a partir da regra de sempre — os dias em HOLD nunca contam contra o prazo do "
    "especialista.\n\n"
    "**Acompanhamento de HOLD (alerta de 3 dias úteis)**\n\n"
    "Uma análise que permanece em HOLD aberto por 3 dias úteis dispara um alerta de acompanhamento na "
    "Central de Alertas, exigindo contato com o especialista responsável, registro do que foi resolvido e "
    "uma decisão: manter em HOLD ou retirar do HOLD. Este alerta é tratado com o mesmo mecanismo dos demais "
    "alertas do sistema (Pendente/Em tratamento/Tratado) e nunca é confundido com o Alerta Máximo de atraso — "
    "uma análise nunca tem os dois alertas ativos ao mesmo tempo.\n\n"
    "**\"Quem está fazendo o quê\" e KPIs dos Analistas**\n\n"
    "O painel \"Quem está fazendo o quê\" (Visão do Gestor) e os KPIs de Prazo dos Analistas separam, para "
    "cada especialista, a situação atual (em análise, dentro do prazo, prazo vencido/atrasadas, Alerta "
    "Máximo, **em HOLD**, prioridades) do histórico de entregas (antes do prazo, no prazo, com atraso). Uma "
    "análise em HOLD nunca é contada como atraso do especialista nesses painéis — aparece separadamente, na "
    "própria contagem \"Em HOLD\".\n\n"
    "**Lista de Prioridades**\n\n"
    "Um projeto que já possuía formalmente um Nível de Prioridade antes ou durante o HOLD continua aparecendo "
    "na Lista de Prioridades, identificado com o motivo \"Prioridade – Em HOLD\" e a cor 🔵 azul no mapa de "
    "calor — sem contar como atraso, sem escalar a criticidade pela proximidade do prazo (congelada) e sem "
    "gerar Alerta Máximo."
)

CAPITULOS_CONSOLIDACAO_ATRASO_HOLD: list[tuple[str, str]] = [
    ("SLA, Atraso, HOLD e Alerta Máximo", _CONTEUDO_SLA_ATRASO_HOLD),
]
