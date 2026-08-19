"""Conteúdo do capítulo "Ranking de Prestadores e Projetistas de
Cessionários" no Manual do Sistema — usado apenas para semear a migração
correspondente. Depois de publicado, o conteúdo passa a ser gerido pela
Administração do Manual, como qualquer outro capítulo."""

from __future__ import annotations

_CONTEUDO_RANKING_AVALIACOES = (
    "As avaliações oficiais de Prestadores e Projetistas de Cessionários passaram a ser consideradas a "
    "partir de **01/07/2026** — marco oficial de implantação. Não há obrigatoriedade retroativa.\n\n"
    "**Antes de 01/07/2026 — Opcional**\n\n"
    "Toda avaliação (checklist) cuja Rev.01 foi concluída antes do marco é classificada como \"Avaliação "
    "Opcional\": não gera alerta na Central de Alertas, não conta como falta, não reduz o percentual de "
    "cumprimento nem a nota do analista, não afeta bônus, e não aparece como obrigação pendente. O "
    "especialista pode realizá-la voluntariamente a qualquer momento — nada é apagado —, mas ela nunca entra "
    "no Ranking de Prestadores nem no Ranking de Projetistas de Cessionários.\n\n"
    "**A partir de 01/07/2026 — Obrigatório**\n\n"
    "Segue normalmente todas as regras já existentes de obrigatoriedade da avaliação a partir da Rev.01: "
    "gera alerta de avaliação pendente, entra na penalização/bonificação mensal do analista e conta no "
    "ranking. Julho de 2026 em diante — sempre, mês após mês, nunca só julho.\n\n"
    "**Ranking de Prestadores e Ranking de Projetistas de Cessionários**\n\n"
    "Em Avaliação > aba Ranking, escolha o Tipo (Prestador ou Projetista de Cessionário) para consultar o "
    "ranking correspondente — os dois nunca se misturam. Usa exclusivamente avaliações efetivamente "
    "concluídas a partir de 01/07/2026: avaliação pendente nunca é tratada como nota zero, ela simplesmente "
    "não entra no cálculo.\n\n"
    "Cada posição mostra a nota média, a quantidade de avaliações usadas (sempre visível, para dar contexto "
    "à média — uma nota alta com poucas avaliações não tem o mesmo peso estatístico de uma nota com muitas), "
    "a melhor e a menor nota, e a data da avaliação mais recente. Em caso de empate na média, desempata por "
    "maior quantidade de avaliações e, persistindo, pela nota da avaliação mais recente — sem nunca alterar "
    "as notas.\n\n"
    "Selecionando um registro do ranking, o Detalhamento mostra cada avaliação que formou aquela nota — AT, "
    "projeto, disciplina, revisão, data, nota e a média acumulada até aquele ponto — para conferir de onde "
    "veio a posição.\n\n"
    "Filtros disponíveis: Mês/Ano ou Intervalo personalizado, Disciplina e Prestador/Projetista — o período "
    "oficial do ranking nunca considera avaliações anteriores a julho de 2026, mesmo que o filtro selecionado "
    "inclua datas anteriores.\n\n"
    "**Sobre o Projetista de Cessionário**\n\n"
    "O sistema ainda não possui um cadastro próprio de Projetista — a avaliação do projetista é sempre "
    "registrada associada diretamente ao Cessionário (loja, quiosque ou externo) avaliado. Por isso, no "
    "Ranking de Projetistas de Cessionários, o nome do projetista e o Cessionário relacionado correspondem "
    "à mesma identidade."
)

CAPITULOS_RANKING_AVALIACOES: list[tuple[str, str]] = [
    ("Ranking de Prestadores e Projetistas de Cessionários", _CONTEUDO_RANKING_AVALIACOES),
]
