"""Conteúdo do capítulo do módulo Arquivo no Manual do Sistema — usado
apenas para semear a migração de manual correspondente. Depois de
publicado, o conteúdo passa a ser gerido pela Administração do Manual,
como qualquer outro capítulo."""

from __future__ import annotations

_CONTEUDO_ARQUIVO = (
    "**Objetivo**\n\n"
    "O módulo Arquivo gerencia registros que deixaram de fazer parte da operação do dia a dia, mas que "
    "ainda precisam ser preservados antes de uma eventual exclusão definitiva. Um registro pode estar em "
    "dois estados: **Ativo** (participa normalmente de KPIs, dashboards, relatórios, alertas e pesquisas) "
    "ou **Arquivado** (some das telas e indicadores operacionais, mas continua existindo no banco de dados, "
    "acessível apenas pelo módulo Arquivo).\n\n"
    "**Arquivar não é excluir**\n\n"
    "Arquivar um registro nunca apaga nenhuma informação — apenas o retira da operação corrente. Todo "
    "registro arquivado pode ser restaurado integralmente a qualquer momento, sem perda de dados. Somente "
    "um registro já arquivado pode, depois, ser excluído definitivamente — e essa exclusão exige confirmação "
    "dupla e fica registrada em auditoria.\n\n"
    "**Categorias disponíveis**\n\n"
    "Projetos PMO, Projetos GAT (por código — arquiva de uma vez todas as análises de Prestadores e "
    "Cessionários daquele código), Análises (uma análise/AT específica), Analistas, Prestadores, "
    "Cessionários, Reuniões, Planos de Ação, Alertas e Documentos (arquivos de cronograma do PMO). As "
    "categorias Projetistas e Relatórios ficam reservadas para uso futuro: hoje o sistema não tem um "
    "cadastro próprio de Projetista (é um rótulo usado dentro da avaliação do Cessionário) e os relatórios "
    "do GAT/PMO são gerados sob demanda, sem ficar salvos no banco.\n\n"
    "**Como arquivar**\n\n"
    "O botão **Arquivar** aparece diretamente na tela de cada tipo de registro (Prestadores, Cessionários, "
    "Cadastros, Administração, Reuniões, Planos de Ação, Central de Alertas, Linha do Tempo para projetos "
    "GAT, e na Configuração do Projeto/aba Cronograma no PMO). Ao arquivar, é possível informar um motivo "
    "opcional e marcar o registro como \"de teste\" — útil para descartar depois, pelo Administrador, "
    "projetos e registros fictícios criados durante o desenvolvimento.\n\n"
    "**Como restaurar**\n\n"
    "No módulo Arquivo, escolha a categoria, localize o registro e use o botão **Restaurar** — o registro "
    "volta imediatamente a aparecer nas telas, KPIs, dashboards, relatórios e pesquisas normais, com todo o "
    "histórico intacto.\n\n"
    "**Como excluir definitivamente**\n\n"
    "Só é possível excluir definitivamente um registro que já esteja arquivado. O botão **Excluir "
    "Definitivamente** pede confirmação dupla (\"Deseja realmente excluir definitivamente este registro?\" "
    "seguido de \"Esta operação não poderá ser desfeita\") e uma justificativa obrigatória antes de executar "
    "a exclusão — que, ao contrário do arquivamento, apaga o registro do banco de dados.\n\n"
    "**Permissões por perfil**\n\n"
    "Todos os perfis operacionais podem arquivar, restaurar e consultar registros arquivados, exceto o "
    "perfil Consulta (que não acessa o módulo Arquivo, salvo autorização específica do Administrador). A "
    "exclusão definitiva é exclusiva dos perfis Administrador e Gestor — nenhum outro perfil vê esse botão.\n\n"
    "**Auditoria**\n\n"
    "Toda operação de arquivamento, restauração ou exclusão definitiva fica registrada com usuário, perfil, "
    "data, hora, o registro afetado, o módulo de origem (GAT ou PMO) e a justificativa, quando houver. Essa "
    "trilha nunca é apagada, mesmo quando o registro de origem é excluído definitivamente, e alimenta os "
    "relatórios de Arquivamentos, Restaurações e Exclusões (aba Auditoria do módulo Arquivo).\n\n"
    "**Área de Testes**\n\n"
    "Registros marcados como \"de teste\" no momento do arquivamento podem ser filtrados na aba Registros "
    "Arquivados (\"Somente registros de teste\") — útil para o Administrador localizar e excluir "
    "definitivamente projetos fictícios, ATs de teste e demais registros criados durante o desenvolvimento, "
    "sem misturá-los com o histórico real arquivado."
)

CAPITULOS_ARQUIVO: list[tuple[str, str]] = [
    ("Módulo Arquivo", _CONTEUDO_ARQUIVO),
]
