"""Conteúdo dos capítulos de Tema/Padrão Visual no Manual do Sistema —
usado apenas para semear a migração correspondente. Depois de publicado,
o conteúdo passa a ser gerido pela Administração do Manual, como qualquer
outro capítulo."""

from __future__ import annotations

_CONTEUDO_TEMA_CLARO_ESCURO = (
    "**Como alternar o tema**\n\n"
    "No menu lateral, logo abaixo do seu nome, há o controle **Aparência** com as opções **Tema Claro** e "
    "**Tema Escuro**. A troca é imediata — não é preciso recarregar a página, sair e entrar novamente, nem "
    "fechar e reabrir a aplicação.\n\n"
    "**A preferência é individual**\n\n"
    "Cada usuário tem sua própria escolha de tema, salva na sua conta. Um usuário pode usar o Tema Escuro "
    "enquanto outro usa o Tema Claro, sem que a escolha de um afete o outro.\n\n"
    "**A escolha fica salva**\n\n"
    "O tema selecionado permanece depois de sair do sistema (logout), em um novo login, após reinicialização "
    "do servidor, atualização do sistema ou nova publicação — a preferência é gravada no banco de dados, não "
    "apenas na sessão do navegador.\n\n"
    "**O que muda e o que não muda**\n\n"
    "A escolha de tema afeta apenas a aparência da interface: fundo, menus, cards, tabelas, formulários, "
    "modais, gráficos e demais telas do GAT, do PMO e do módulo Arquivo. Os relatórios exportados (Word, "
    "Excel, PDF) continuam sempre no padrão corporativo de impressão, independentemente do tema escolhido na "
    "tela. O mapa de calor e os indicadores de status permanecem funcionando normalmente nos dois temas, "
    "sempre acompanhados de legenda em texto.\n\n"
    "**A logomarca da Tecnoplano**\n\n"
    "A logomarca mantém sua aparência e cores originais nos dois temas — nenhum filtro de cor ou inversão é "
    "aplicado sobre ela."
)

_CONTEUDO_PADRAO_VISUAL = (
    "**Ícones profissionais**\n\n"
    "O sistema usa exclusivamente a biblioteca Material Symbols para ícones — a mesma em todas as telas, "
    "com tamanho e traço consistentes. Não são usados emoticons ou emojis em nenhum elemento gerado "
    "automaticamente pelo sistema (menus, botões, alertas, mensagens, relatórios, e-mails, atas, OPRs ou "
    "Manual do Sistema). Textos livres digitados pelos próprios usuários (observações, atas, comentários) "
    "não são alterados — se um usuário digitar um emoji em um campo de texto, ele é preservado normalmente.\n\n"
    "**Cores com significado**\n\n"
    "Cores são usadas para indicar status, prazo e criticidade (por exemplo, verde para dentro do prazo, "
    "amarelo para próximo do vencimento, vermelho para prazo vencido), mas nunca isoladamente — toda "
    "indicação por cor vem acompanhada de um rótulo em texto ou de um tooltip explicativo, para não depender "
    "só da percepção de cor.\n\n"
    "**Identidade corporativa**\n\n"
    "A paleta institucional (azul Tecnoplano no Tema Claro; tons de grafite e azul mais claro no Tema Escuro) "
    "é aplicada de forma consistente em toda a aplicação. Botões de ações críticas — arquivar, restaurar, "
    "excluir definitivamente, salvar, confirmar — sempre têm texto, nunca são apenas um ícone isolado.\n\n"
    "**Legibilidade e conforto visual**\n\n"
    "O sistema evita blocos de texto muito longos sem hierarquia visual, contrastes agressivos e excesso de "
    "elementos coloridos na mesma tela. Espaçamento, tipografia e agrupamento de informações seguem o mesmo "
    "padrão em todos os módulos (GAT, PMO, Arquivo, Administração), para que o usuário não precise se "
    "reacostumar com uma aparência diferente ao trocar de módulo."
)

CAPITULOS_TEMA: list[tuple[str, str]] = [
    ("Tema Claro e Tema Escuro", _CONTEUDO_TEMA_CLARO_ESCURO),
    ("Padrão visual do sistema", _CONTEUDO_PADRAO_VISUAL),
]
