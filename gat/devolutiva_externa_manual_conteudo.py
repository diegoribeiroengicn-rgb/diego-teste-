"""Conteúdo do capítulo "Devolutiva Externa" no Manual do Sistema — usado
apenas para semear a migração correspondente. Depois de publicado, o
conteúdo passa a ser gerido pela Administração do Manual, como qualquer
outro capítulo."""

from __future__ import annotations

_CONTEUDO_DEVOLUTIVA_EXTERNA = (
    "A Devolutiva Externa é o período em que uma análise já foi respondida pela Tecnoplano (AT emitida com "
    "status \"Liberado c/ Rest.\" ou \"Não Liberado\") e aguarda uma nova revisão do Prestador ou Cessionário — "
    "o projeto sai da responsabilidade temporal do especialista nesse momento e passa a ser acompanhado por "
    "esta regra, nunca contando como atraso do analista nem entrando na Lista de Atrasadas de \"Quem está "
    "fazendo o quê\" (Visão do Gestor).\n\n"
    "**Marco inicial**\n\n"
    "A contagem começa automaticamente na data de emissão/entrega da última AT (a Data de Conclusão da "
    "Análise da revisão mais recente).\n\n"
    "**1ª cobrança — 10 dias úteis**\n\n"
    "Quando completam 10 dias úteis sem retorno, o sistema sinaliza \"1ª cobrança necessária\" em Central de "
    "Alertas > Devolutivas Pendentes, com uma minuta de e-mail de cobrança pronta para copiar e enviar.\n\n"
    "**Cobranças seguintes — a cada 5 dias úteis**\n\n"
    "Após confirmar o envio de uma cobrança (\"Confirmar cobrança realizada\"), o sistema inicia automaticamente "
    "uma nova contagem de 5 dias úteis. Se o projeto continuar sem retorno, uma nova cobrança passa a ser "
    "necessária — e assim sucessivamente, sem limite máximo de cobranças, enquanto o projeto não retornar "
    "para Em Análise/Em Andamento. A partir da 2ª cobrança, a minuta do e-mail é uma reiteração, mencionando "
    "a data da primeira solicitação.\n\n"
    "**O sistema nunca envia o e-mail automaticamente**\n\n"
    "O sistema apenas gera a minuta (assunto + corpo) e disponibiliza para o usuário copiar e enviar pelo "
    "canal de e-mail habitual. A cobrança só é registrada na Linha do Tempo e no histórico depois que o "
    "usuário confirma explicitamente que o envio foi realizado.\n\n"
    "**Uma única pendência ativa por projeto**\n\n"
    "A Central de Alertas nunca duplica cobranças: cada projeto aparece uma única vez em Devolutivas "
    "Pendentes, com a situação atual calculada em tempo real (Aguardando prazo inicial, 1ª/2ª/3ª... cobrança "
    "necessária, cobrança realizada aguardando o próximo prazo, ou Em HOLD).\n\n"
    "**HOLD sempre prevalece**\n\n"
    "Ao entrar em HOLD, a contagem dos 10 ou 5 dias úteis é pausada, nenhuma nova cobrança é gerada e nenhum "
    "atraso ou Alerta Máximo é produzido — apenas o acompanhamento próprio de HOLD continua ativo. Ao sair do "
    "HOLD, a contagem retoma exatamente do ponto em que parou, desconsiderando os dias em HOLD.\n\n"
    "**Retorno da revisão — encerramento automático**\n\n"
    "Assim que uma nova revisão é registrada para o mesmo projeto (ou a análise volta para Em Análise/Em "
    "Andamento), a Devolutiva Externa se encerra automaticamente — não depende de nenhuma ação manual. A "
    "Linha do Tempo registra a data do retorno, os dias úteis totais de devolutiva e quantas cobranças foram "
    "realizadas; o histórico de todas as cobranças permanece preservado para sempre, mesmo depois do retorno, "
    "da conclusão ou do arquivamento do projeto.\n\n"
    "**Cancelamento, arquivamento ou encerramento definitivo**\n\n"
    "Também interrompem as cobranças, sem apagar nenhum histórico já registrado.\n\n"
    "**Separação em relação ao SLA do analista**\n\n"
    "O tempo em Devolutiva Externa nunca é somado ao SLA interno do especialista nem conta como atraso "
    "operacional — o fluxo é sempre: Em Análise → AT emitida → sai da responsabilidade temporal do analista "
    "→ Aguardando Devolutiva Externa → nova revisão recebida → Em Análise/Em Andamento → novo SLA interno.\n\n"
    "**Onde acompanhar**\n\n"
    "Central de Alertas > Devolutivas Pendentes (lista completa com situação, dias sem retorno, cobranças "
    "realizadas e ação de gerar a próxima cobrança) e Visão do Gestor > área \"Aguardando Devolutiva Externa\" "
    "(resumo executivo: Prestadores/Cessionários aguardando retorno e cobranças pendentes, sempre separado "
    "dos indicadores de atraso interno)."
)

CAPITULOS_DEVOLUTIVA_EXTERNA: list[tuple[str, str]] = [
    ("Devolutiva Externa", _CONTEUDO_DEVOLUTIVA_EXTERNA),
]
