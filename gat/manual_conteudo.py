"""Conteúdo-base (versão 1) do Manual do Sistema — os 28 capítulos definidos
no pedido de criação do módulo. Apenas documenta regras e funcionalidades já
existentes no sistema; usado unicamente para semear a migração inicial
(`_migracao_0013_manual_sistema`) — depois de publicado, o conteúdo passa a
ser gerido pela Administração do Manual (editar/reordenar/publicar nova
versão), sem depender mais deste arquivo."""

from __future__ import annotations

CAPITULOS_INICIAIS: list[tuple[str, str]] = [
    (
        "Apresentação do sistema",
        "O Sistema GAT foi desenvolvido para controlar análises técnicas, projetos, revisões, avaliações, "
        "alertas, reuniões, planos de ação, prazos, prioridades e indicadores.\n\n"
        "Todas as ações realizadas no sistema podem ser registradas no histórico, permitindo identificar o "
        "usuário responsável, a data, o horário e a alteração realizada.\n\n"
        "O sistema deve ser utilizado de forma responsável, garantindo que as informações cadastradas "
        "representem a situação real de cada análise.\n\n"
        "Os usuários devem manter os dados atualizados e evitar cadastros duplicados, informações "
        "incompletas ou alterações sem justificativa.",
    ),
    (
        "Perfis de usuário",
        "O sistema possui quatro perfis de acesso, cada um com um conjunto de permissões de módulo e de área:\n\n"
        "- **Administrador**: acesso completo a todos os módulos e áreas, incluindo administração de usuários "
        "e configurações do sistema.\n"
        "- **Gestor**: acesso completo a todos os módulos e áreas, exceto a administração de usuários.\n"
        "- **Analista (especialista)**: acesso operacional — cadastro e edição de projetos, avaliações, "
        "alertas, reuniões e relatórios do dia a dia; sem acesso a áreas administrativas sensíveis "
        "(notas de analistas, exportação completa, auditoria, configurações).\n"
        "- **Consulta**: acesso somente leitura às telas liberadas para o perfil, sem cadastro, edição ou "
        "exportação de dados.\n\n"
        "As permissões de cada usuário podem ser personalizadas individualmente pelo Administrador na área "
        "Administração, prevalecendo sempre sobre o padrão do perfil de origem.",
    ),
    (
        "Acesso e login",
        "O acesso ao sistema é feito por usuário e senha, cadastrados pelo Administrador.\n\n"
        "No primeiro acesso (ou após uma redefinição de senha pelo Administrador), o sistema exige a troca "
        "da senha antes de liberar qualquer outra tela.\n\n"
        "Cada usuário pode alterar a própria senha a qualquer momento em Meu Perfil.\n\n"
        "Tentativas de acesso bloqueadas (módulo ou área sem permissão) ficam registradas na auditoria de "
        "segurança do sistema.\n\n"
        "Não compartilhar login ou senha — cada usuário é responsável pelas ações registradas em seu login.",
    ),
    (
        "Tela inicial",
        "A tela **Início** funciona como um portal: apresenta cartões de acesso rápido aos módulos liberados "
        "para o usuário e indicadores (KPIs) resumidos de Prestadores, Cessionários e Consolidado.\n\n"
        "Clicar em um KPI da tela inicial leva diretamente à lista de projetos já filtrada pela situação "
        "daquele indicador (por exemplo, projetos atrasados ou sem PEP).",
    ),
    (
        "Cadastro de projetos",
        "Um novo projeto (análise técnica) é criado pelo botão **Novo Cadastro**, disponível nas telas de "
        "Projetos de Prestadores e de Cessionários, para quem tiver a permissão correspondente.\n\n"
        "O cadastro pode ser vinculado ao Cadastro Mestre de Prestadores/Cessionários já existente — ao "
        "vincular, código, nome, PEP (Prestadores) e RVP/RCI/LUC (Cessionários) são preenchidos "
        "automaticamente a partir do cadastro mestre.\n\n"
        "Campos como N° AT, disciplina, revisão, especialista responsável, data de solicitação e status da "
        "análise são obrigatórios. O SLA e a data limite são calculados automaticamente — ver capítulo SLA.",
    ),
    (
        "Prestadores",
        "O módulo Prestadores reúne: Dashboard (indicadores e gráficos), Projetos (cadastro/edição/consulta "
        "das análises), Cadastro (cadastro mestre de prestadores e suas obras/canteiros), Canteiros (painel "
        "consolidado por obra) e Avaliação (checklist de avaliação do prestador).\n\n"
        "O SLA padrão de Prestadores é de 10 dias úteis em todas as revisões, salvo Nível de Prioridade ou "
        "SLA reduzido em vigor — ver capítulo SLA.",
    ),
    (
        "Cessionários",
        "O módulo Cessionários reúne: Dashboard, Projetos, Cadastro (cadastro mestre de cessionários) e "
        "Avaliação (checklist do projetista do cessionário).\n\n"
        "O tipo do cessionário (Loja, Quiosque ou Externo) determina o SLA padrão da análise — ver capítulo "
        "SLA.",
    ),
    (
        "Especialistas",
        "O módulo Analistas apresenta a produtividade mensal de cada especialista (quantidade de análises, "
        "cumprimento de prazo, ATs por competência) e, para quem tiver a permissão correspondente, o módulo "
        "de Avaliação dos Especialistas com as notas e indicadores individuais — ver capítulo Avaliação dos "
        "Especialistas.",
    ),
    (
        "Análises técnicas",
        "Ao receber uma nova análise, o especialista deve conferir: número da AT, projeto, disciplina, "
        "revisão, Prestador ou Cessionário, projetista (quando aplicável), data de entrada, especialista "
        "responsável, SLA, data limite e status.\n\n"
        "Quando o cadastro é realizado, o sistema calcula automaticamente a data limite de acordo com as "
        "regras de SLA em vigor. O especialista deve atualizar o status sempre que houver alteração no "
        "andamento da análise — não informar uma análise como concluída antes da efetiva finalização "
        "técnica.\n\n"
        "**Status existentes**: Em Análise, Liberado, Liberado c/ Rest., Não Liberado, Em Hold, Obsoleto e "
        "Cancelado. Ao finalizar uma análise prioritária como \"Liberado c/ Rest.\" ou \"Não Liberado\", o "
        "sistema exige que o especialista confirme a leitura de um aviso para informar o líder responsável "
        "(Diego para Prestadores, Alline para Cessionários) — ver capítulo Prioridades.",
    ),
    (
        "Revisões",
        "Cada nova revisão de uma análise (REV00, REV01, REV02...) é registrada como um novo lançamento, "
        "preservando o histórico das revisões anteriores.\n\n"
        "A meta corporativa é a aprovação até a Revisão 2 (REV2); projetos \"Não Liberado\" que ultrapassam "
        "essa meta são sinalizados como gargalo crítico (Pendente de Reunião) e aparecem na Central de "
        "Alertas.\n\n"
        "O retorno de uma revisão para a seguinte também é monitorado: um atraso acima do SLA de 10 dias "
        "úteis entre revisões gera o alerta de Atraso no Reenvio.",
    ),
    (
        "Avaliações de Prestadores",
        "As avaliações de Prestadores devem ser realizadas pelo especialista responsável pela análise.\n\n"
        "A avaliação registra a qualidade da entrega, atendimento aos comentários, organização, cumprimento "
        "das premissas e demais critérios do checklist (15 perguntas, 0 a 15 pontos).\n\n"
        "A avaliação obrigatória segue as regras já existentes no sistema, incluindo a obrigatoriedade a "
        "partir da Revisão 01. O especialista pode registrar uma avaliação em outras revisões quando "
        "considerar necessário — avaliações de revisões diferentes não são duplicadas.\n\n"
        "Exemplo: AT-XXX-26-PXXX-494-01 (avaliação da Revisão 01), AT-XXX-26-PXXX-494-02 (avaliação da "
        "Revisão 02), AT-XXX-26-PXXX-494-03 (avaliação da Revisão 03) — cada revisão pode possuir avaliação "
        "independente. A duplicidade só ocorre quando há duas avaliações para a mesma AT, mesma disciplina, "
        "mesma revisão, mesmo Prestador e mesmo especialista.",
    ),
    (
        "Avaliações de Projetistas de Cessionários",
        "Nos projetos de Cessionários, a avaliação é direcionada ao Projetista do Cessionário.\n\n"
        "O especialista avalia a qualidade técnica, atendimento aos comentários, compatibilização, "
        "organização dos documentos e demais critérios do checklist.\n\n"
        "A avaliação do Projetista não é misturada com a avaliação de Prestadores: cada tipo possui "
        "formulário próprio, histórico próprio, indicadores próprios e resultados próprios.",
    ),
    (
        "Avaliação dos Especialistas",
        "O sistema registra indicadores relacionados aos próprios especialistas, considerando: quantidade de "
        "análises, cumprimento de prazo, avaliações realizadas, avaliações pendentes, qualidade das "
        "análises, produtividade, histórico de atividades e outros critérios existentes.\n\n"
        "As regras de nota, redução, bonificação, recomendação ou penalidade seguem exatamente o que já "
        "está configurado no sistema — ver capítulo Penalidades e impactos nas avaliações.",
    ),
    (
        "Alertas",
        "Os alertas automáticos avisam sobre: prazos, avaliações pendentes, análises prioritárias, SLA "
        "próximo do vencimento, pendências, reuniões e planos de ação.\n\n"
        "Os alertas manuais podem ser criados por usuários autorizados para situações específicas, "
        "informando título, descrição, N° AT, projeto, Prestador/Cessionário, disciplina, revisão, "
        "especialista, prioridade, vencimento, observações e destinatários — permanecem ativos até serem "
        "encerrados manualmente, com o histórico completo de criação, edição e encerramento registrado.\n\n"
        "Um alerta só deve ser encerrado quando a situação tiver sido efetivamente tratada — não marcar "
        "como concluído apenas para retirar o alerta da tela.",
    ),
    (
        "SLA",
        "O sistema calcula os prazos em dias úteis, desconsiderando sábados, domingos e feriados cadastrados "
        "no calendário oficial do Rio de Janeiro.\n\n"
        "**Prestadores** — todas as revisões: 10 dias úteis.\n\n"
        "**Cessionários — Loja** — Revisão 00: 10 dias úteis; Revisão 01 em diante: 5 dias úteis.\n\n"
        "**Quiosques** — todas as revisões: 5 dias úteis.\n\n"
        "**Externos** — Revisão 00: 10 dias úteis; Revisão 01 em diante: 5 dias úteis.\n\n"
        "Quando um SLA reduzido é aplicado, a nova data limite aparece automaticamente, preservando para "
        "sempre o SLA e a data limite originais no histórico do registro.",
    ),
    (
        "Prioridades",
        "**Prioridades de Prestadores** — Nível 3: 7 dias úteis; Nível 2: 5 dias úteis; Nível 1: 3 dias "
        "úteis ou menos (definido manualmente entre 1 e 3 dias). Cessionários não possuem níveis "
        "automáticos, apenas a opção de SLA reduzido.\n\n"
        "O especialista deve tratar as análises conforme a ordem da Lista de Prioridades, considerando o "
        "nível e os dias úteis restantes.\n\n"
        "Ao finalizar uma análise prioritária como \"Liberado c/ Rest.\" ou \"Não Liberado\", o especialista "
        "deve informar seu líder, conforme a mensagem apresentada pelo sistema: **para Prestadores, "
        "comunicar Diego; para Cessionários, comunicar Alline.**",
    ),
    (
        "Lista de Prioridades",
        "A Lista de Prioridades é a única tela do sistema em que Prestadores e Cessionários aparecem juntos: "
        "reúne automaticamente todo projeto com Nível de Prioridade ou SLA reduzido em vigor, ainda em "
        "andamento.\n\n"
        "Um projeto sai da lista automaticamente assim que a análise é concluída (Liberado, Liberado c/ "
        "Rest., Não Liberado, Obsoleto ou Cancelado) — a prioridade e o SLA aplicados permanecem registrados "
        "no histórico do projeto mesmo após a saída da lista.",
    ),
    (
        "Mapa de calor",
        "Cada linha da Lista de Prioridades recebe uma cor conforme a proximidade do prazo: 🟢 verde "
        "(dentro do prazo), 🟡 amarelo (vence em breve), 🟠 laranja (vence hoje) e 🔴 vermelho (atrasado).\n\n"
        "O 🟣 roxo tem prioridade sobre as demais cores e sinaliza reforço: SLA reduzido manualmente ou "
        "Nível 1 de prioridade, independentemente dos dias restantes, por ser a situação mais crítica.",
    ),
    (
        "Reuniões",
        "O módulo Reuniões permite registrar reuniões vinculadas a um ou mais projetos, com participantes, "
        "pauta e ata — servindo de base para os Planos de Ação relacionados.",
    ),
    (
        "Planos de ação",
        "Um Plano de Ação registra uma providência a ser tomada, com responsável, prazo e status de "
        "acompanhamento, podendo estar vinculado a uma reunião de origem.",
    ),
    (
        "Relatórios",
        "O sistema oferece Relatórios Mensais por módulo, o One Page Report executivo, o OPR "
        "(individual/coletivo) de Prestadores e Cessionários, e os Relatórios de Prioridades — todos "
        "exportáveis em Excel, Word e/ou PDF, conforme a permissão do usuário.",
    ),
    (
        "Anexos e documentos",
        "A área de Documentos reúne os anexos vinculados aos projetos e módulos do sistema.\n\n"
        "No Manual do Sistema, o Administrador pode anexar imagens, vídeos e documentos a cada capítulo, "
        "servindo de material de apoio à documentação.",
    ),
    (
        "Histórico e rastreabilidade",
        "O sistema registra: inclusão de projetos, alterações de dados, mudança de status, especialista "
        "responsável, datas de entrada e conclusão, avaliações, notas, revisões, alertas, prioridades, SLA "
        "original, SLA reduzido, justificativas, mensagens exibidas, confirmações de leitura, reuniões, "
        "atas, planos de ação, relatórios, uploads, backups, restaurações, cancelamentos, reaberturas e "
        "alterações administrativas.\n\n"
        "O histórico contém, sempre que possível: usuário, data, hora, ação realizada, valor anterior, novo "
        "valor e justificativa.",
    ),
    (
        "Penalidades e impactos nas avaliações",
        "A não realização das avaliações obrigatórias pode afetar a nota final do especialista, conforme as "
        "regras já configuradas no sistema:\n\n"
        "- A ausência de uma avaliação pode reduzir a nota final do especialista em 1/3;\n"
        "- A ausência de duas avaliações pode reduzir a nota final em 1/2;\n"
        "- A ausência de mais de duas avaliações continua limitando a redução a 1/2;\n"
        "- A realização de todas as avaliações obrigatórias pode representar pontuação adicional;\n"
        "- Caso o especialista já esteja com a nota máxima, o sistema mantém a nota máxima e apresenta uma "
        "recomendação de reconhecimento, treinamento ou premiação, visível somente ao Administrador.\n\n"
        "Este capítulo apenas documenta as regras já implementadas — nenhuma penalidade nova é criada aqui.",
    ),
    (
        "Backup e preservação dos dados",
        "Todos os dados devem permanecer salvos após reinicializações e atualizações do sistema.\n\n"
        "O Administrador deve realizar backups periódicos e antes de alterações importantes. O sistema "
        "permite: gerar backup, fazer download, restaurar, registrar o responsável e registrar data e hora "
        "de cada operação.\n\n"
        "A restauração exige confirmação explícita antes de substituir os dados atuais.",
    ),
    (
        "Boas práticas",
        "Cada usuário é responsável pelas informações inseridas utilizando seu login. Não compartilhar login "
        "ou senha, nem realizar alterações utilizando o perfil de outro usuário.\n\n"
        "Não excluir, alterar ou encerrar registros sem verificar a situação real. As justificativas devem "
        "ser preenchidas de maneira objetiva e verdadeira.\n\n"
        "Todas as alterações relevantes permanecem registradas para auditoria e rastreabilidade.",
    ),
    (
        "Perguntas frequentes",
        "**Esqueci minha senha, e agora?** Solicite ao Administrador a redefinição — no próximo acesso será "
        "exigida a troca da senha.\n\n"
        "**Por que não vejo um módulo/tela que outro colega vê?** O acesso é controlado por módulo e por "
        "área; solicite ao Administrador a liberação necessária.\n\n"
        "**Por que a data limite mudou sozinha?** O SLA e a data limite são recalculados automaticamente "
        "sempre que um campo relevante muda (data de solicitação, SLA reduzido, nível de prioridade, hold).\n\n"
        "**Por que este projeto saiu da Lista de Prioridades?** A saída é automática assim que a análise é "
        "concluída — a prioridade aplicada continua registrada no histórico do projeto.\n\n"
        "**Onde vejo o histórico de uma alteração?** Nas telas de Alertas, Histórico da Gestão e Histórico "
        "de Atividades, e nos detalhes de cada registro quando disponível.",
    ),
    (
        "Suporte e comunicação de erros",
        "Em caso de dúvida sobre o funcionamento do sistema, consulte primeiro este Manual do Sistema — "
        "utilize a pesquisa por palavra-chave para localizar rapidamente o capítulo relevante.\n\n"
        "Para reportar um erro, comportamento inesperado ou solicitar uma melhoria, contate o Administrador "
        "do sistema, informando: tela em que ocorreu, ação realizada, mensagem exibida (se houver) e "
        "horário aproximado — essas informações agilizam o diagnóstico.",
    ),
]
