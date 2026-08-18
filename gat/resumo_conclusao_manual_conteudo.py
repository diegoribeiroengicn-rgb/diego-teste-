"""Conteúdo do capítulo "Resumo de Conclusão da Análise" no Manual do
Sistema — usado apenas para semear a migração correspondente. Depois de
publicado, o conteúdo passa a ser gerido pela Administração do Manual,
como qualquer outro capítulo."""

from __future__ import annotations

_CONTEUDO_RESUMO_CONCLUSAO = (
    "**Quando o recurso é acionado**\n\n"
    "Ao salvar uma análise de Prestador ou Cessionário informando a Data Análise (conclusão) junto com um "
    "status final — Liberado, Liberado c/ Rest. ou Não Liberado —, o sistema abre automaticamente, pela "
    "primeira vez que isso acontece para aquela análise, o pop-up do Resumo de Conclusão. Editar outros "
    "campos depois (observações, disciplina, etc.) não faz o pop-up reaparecer.\n\n"
    "**Como selecionar M-Files, Drive e/ou E-mail**\n\n"
    "No pop-up, marque onde a análise foi disponibilizada: M-Files, Drive e/ou E-mail, em qualquer "
    "combinação — nenhuma opção é obrigatória. O sistema monta automaticamente a frase correspondente (por "
    "exemplo, \"Postada no M-Files e Drive\" ou \"Enviada por e-mail\"), sem exigir digitação.\n\n"
    "**Como visualizar a prévia**\n\n"
    "Assim que você marca os canais, uma prévia do card é exibida no próprio pop-up: número completo da AT, "
    "onde foi disponibilizada, prestador/cessionário e obra (ou tipo, no caso de cessionário), disciplina e "
    "revisão, e o status por extenso — tudo vindo automaticamente do cadastro da análise.\n\n"
    "**Como gerar o arquivo**\n\n"
    "Clique em \"Confirmar e gerar Resumo de Conclusão\". O sistema grava a seleção de canais e disponibiliza "
    "dois botões de download: PNG (recomendado para WhatsApp/Teams) e PDF compacto — nenhum dos dois usa o "
    "formato A4; ambos mantêm o mesmo tamanho pequeno do card.\n\n"
    "**Como baixar novamente**\n\n"
    "Depois de gerado, o botão \"Editar canais / baixar novamente\" permite reabrir a seleção e baixar de "
    "novo, quantas vezes forem necessárias.\n\n"
    "**Como alterar posteriormente os canais de disponibilização**\n\n"
    "A qualquer momento, na tela de Projetos (Prestadores ou Cessionários), selecione a análise já concluída "
    "e clique em \"Resumo de Conclusão\" para reabrir o recurso, revisar/editar os canais marcados e gerar um "
    "novo arquivo. A seleção anterior fica preservada no histórico.\n\n"
    "**Onde essas informações ficam registradas**\n\n"
    "Cada geração, edição de canais ou novo download fica registrado com data/hora e usuário responsável, "
    "visível no próprio pop-up (\"Histórico deste Resumo de Conclusão\") e consultável nos Relatórios "
    "Mensais, na seção \"Resumo de Conclusão\" — quantidade disponibilizada em cada canal, combinações "
    "utilizadas, data de conclusão e responsável. Esse recurso não altera SLA, avaliações, prioridades, KPIs "
    "ou permissões já existentes."
)

CAPITULOS_RESUMO_CONCLUSAO: list[tuple[str, str]] = [
    ("Resumo de Conclusão da Análise", _CONTEUDO_RESUMO_CONCLUSAO),
]
