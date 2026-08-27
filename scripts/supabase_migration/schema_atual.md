# Radiografia do schema — GAT 2026 (SQLite)

Total de tabelas: **45** · Total de linhas: **13228**

## `historico_edicoes` (7730 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `tabela` | TEXT | sim | — |  |
| `registro_id` | INTEGER | sim | — |  |
| `campo` | TEXT | sim | — |  |
| `valor_anterior` | TEXT | não | — |  |
| `valor_novo` | TEXT | não | — |  |
| `usuario` | TEXT | não | — |  |
| `data_hora` | TEXT | sim | — |  |

## `atividades_usuario` (2404 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `usuario` | TEXT | sim | — |  |
| `perfil` | TEXT | não | — |  |
| `tipo_evento` | TEXT | sim | — |  |
| `modulo` | TEXT | não | — |  |
| `detalhe` | TEXT | não | — |  |
| `data_hora` | TEXT | sim | — |  |

**Índices:**
- `idx_atividades_usuario_periodo` em (usuario, data_hora)

## `permissoes_area` (1464 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `usuario_id` | INTEGER | sim | — | sim |
| `area` | TEXT | sim | — | sim |
| `permitido` | INTEGER | sim | 1 |  |

**Chaves estrangeiras:**
- `usuario_id` → `usuarios.id`

## `cessionarios` (640 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `item` | INTEGER | não | — |  |
| `codigo` | TEXT | não | — |  |
| `cessionario` | TEXT | sim | — |  |
| `disciplina` | TEXT | não | — |  |
| `disciplina_sla` | TEXT | não | — |  |
| `revisao` | INTEGER | sim | 0 |  |
| `num_documentos` | INTEGER | sim | 0 |  |
| `data_solicitacao` | TEXT | sim | — |  |
| `tipo` | TEXT | não | — |  |
| `sla_dias` | INTEGER | não | — |  |
| `data_limite` | TEXT | não | — |  |
| `data_analise` | TEXT | não | — |  |
| `hold_inicio` | TEXT | não | — |  |
| `hold_fim` | TEXT | não | — |  |
| `num_at` | TEXT | não | — |  |
| `revisao_at` | INTEGER | não | — |  |
| `responsavel` | TEXT | não | — |  |
| `status_analise` | TEXT | sim | 'EM ANÁLISE' |  |
| `observacoes` | TEXT | não | — |  |
| `natureza_revisao` | TEXT | não | — |  |
| `num_erros` | INTEGER | não | — |  |
| `etg` | TEXT | sim | 'NÃO' |  |
| `criado_em` | TEXT | sim | — |  |
| `criado_por` | TEXT | não | — |  |
| `atualizado_em` | TEXT | não | — |  |
| `atualizado_por` | TEXT | não | — |  |
| `pep` | TEXT | não | — |  |
| `cessionario_cadastro_id` | INTEGER | não | — |  |
| `luc` | TEXT | não | — |  |
| `numero_rci` | TEXT | não | — |  |
| `numero_rvp` | TEXT | não | — |  |
| `data_atualizacao_rci` | TEXT | não | — |  |
| `data_atualizacao_rvp` | TEXT | não | — |  |
| `sla_original` | INTEGER | não | — |  |
| `sla_reduzido` | INTEGER | sim | 0 |  |
| `justificativa_sla` | TEXT | não | — |  |
| `data_limite_original` | TEXT | não | — |  |
| `sla_alterado_por` | TEXT | não | — |  |
| `sla_alterado_em` | TEXT | não | — |  |
| `data_limite_ajustada_manualmente` | INTEGER | sim | 0 |  |
| `arquivado_em` | TEXT | não | — |  |
| `arquivado_por` | TEXT | não | — |  |
| `motivo_arquivamento` | TEXT | não | — |  |
| `arquivado_teste` | INTEGER | sim | 0 |  |
| `resumo_mfiles` | INTEGER | sim | 0 |  |
| `resumo_drive` | INTEGER | sim | 0 |  |
| `resumo_email` | INTEGER | sim | 0 |  |
| `resumo_popup_disparado_em` | TEXT | não | — |  |
| `resumo_ultima_geracao_em` | TEXT | não | — |  |
| `resumo_gerado_por` | TEXT | não | — |  |
| `resumo_qtd_geracoes` | INTEGER | sim | 0 |  |
| `avaliacao_opcional_perguntada_revisao` | INTEGER | não | — |  |

**Índices:**
- `idx_cessionarios_cadastro_id` em (cessionario_cadastro_id)
- `idx_cessionarios_nome` em (cessionario)
- `idx_cessionarios_num_at` em (num_at)

## `prestadores` (583 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `item` | INTEGER | não | — |  |
| `codigo` | TEXT | não | — |  |
| `prestador` | TEXT | sim | — |  |
| `disciplina` | TEXT | não | — |  |
| `disciplina_sla` | TEXT | não | — |  |
| `peps` | TEXT | não | — |  |
| `obra_referencia` | TEXT | não | — |  |
| `revisao` | INTEGER | sim | 0 |  |
| `num_documentos` | INTEGER | sim | 0 |  |
| `data_solicitacao` | TEXT | sim | — |  |
| `data_limite` | TEXT | não | — |  |
| `data_analise` | TEXT | não | — |  |
| `hold_inicio` | TEXT | não | — |  |
| `hold_fim` | TEXT | não | — |  |
| `num_at` | TEXT | não | — |  |
| `revisao_at` | INTEGER | não | — |  |
| `responsavel` | TEXT | não | — |  |
| `status_analise` | TEXT | sim | 'EM ANÁLISE' |  |
| `observacoes` | TEXT | não | — |  |
| `natureza_revisao` | TEXT | não | — |  |
| `num_erros` | INTEGER | não | — |  |
| `etg` | TEXT | sim | 'NÃO' |  |
| `criado_em` | TEXT | sim | — |  |
| `criado_por` | TEXT | não | — |  |
| `atualizado_em` | TEXT | não | — |  |
| `atualizado_por` | TEXT | não | — |  |
| `prestador_cadastro_id` | INTEGER | não | — |  |
| `obra_id` | INTEGER | não | — |  |
| `sla_dias` | INTEGER | não | — |  |
| `sla_original` | INTEGER | não | — |  |
| `sla_reduzido` | INTEGER | sim | 0 |  |
| `nivel_prioridade` | INTEGER | não | — |  |
| `justificativa_sla` | TEXT | não | — |  |
| `data_limite_original` | TEXT | não | — |  |
| `sla_alterado_por` | TEXT | não | — |  |
| `sla_alterado_em` | TEXT | não | — |  |
| `data_limite_ajustada_manualmente` | INTEGER | sim | 0 |  |
| `arquivado_em` | TEXT | não | — |  |
| `arquivado_por` | TEXT | não | — |  |
| `motivo_arquivamento` | TEXT | não | — |  |
| `arquivado_teste` | INTEGER | sim | 0 |  |
| `resumo_mfiles` | INTEGER | sim | 0 |  |
| `resumo_drive` | INTEGER | sim | 0 |  |
| `resumo_email` | INTEGER | sim | 0 |  |
| `resumo_popup_disparado_em` | TEXT | não | — |  |
| `resumo_ultima_geracao_em` | TEXT | não | — |  |
| `resumo_gerado_por` | TEXT | não | — |  |
| `resumo_qtd_geracoes` | INTEGER | sim | 0 |  |
| `avaliacao_opcional_perguntada_revisao` | INTEGER | não | — |  |

**Índices:**
- `idx_prestadores_obra_id` em (obra_id)
- `idx_prestadores_cadastro_id` em (prestador_cadastro_id)
- `idx_prestadores_nome` em (prestador)
- `idx_prestadores_num_at` em (num_at)

## `permissoes_modulo` (93 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `usuario_id` | INTEGER | sim | — | sim |
| `modulo` | TEXT | sim | — | sim |
| `permitido` | INTEGER | sim | 1 |  |

**Chaves estrangeiras:**
- `usuario_id` → `usuarios.id`

## `cadastro_cessionarios` (52 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `codigo` | TEXT | sim | — |  |
| `nome_empresa` | TEXT | sim | — |  |
| `luc` | TEXT | não | — |  |
| `rvp` | TEXT | não | — |  |
| `rci` | TEXT | não | — |  |
| `responsavel` | TEXT | não | — |  |
| `telefone` | TEXT | não | — |  |
| `email` | TEXT | não | — |  |
| `contatos` | TEXT | não | — |  |
| `status` | TEXT | sim | 'ATIVO' |  |
| `observacoes` | TEXT | não | — |  |
| `criado_em` | TEXT | sim | — |  |
| `criado_por` | TEXT | não | — |  |
| `atualizado_em` | TEXT | não | — |  |
| `atualizado_por` | TEXT | não | — |  |
| `arquivado_em` | TEXT | não | — |  |
| `arquivado_por` | TEXT | não | — |  |
| `motivo_arquivamento` | TEXT | não | — |  |
| `arquivado_teste` | INTEGER | sim | 0 |  |

**Índices:**
- `idx_cadastro_cessionarios_codigo` em (codigo)
- `sqlite_autoindex_cadastro_cessionarios_1` (único) em (codigo)

## `manual_capitulos` (42 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `ordem` | INTEGER | sim | — |  |
| `titulo` | TEXT | sim | — |  |
| `conteudo` | TEXT | não | — |  |
| `perfis_visiveis` | TEXT | não | — |  |
| `criado_em` | TEXT | sim | — |  |
| `atualizado_em` | TEXT | não | — |  |
| `atualizado_por` | TEXT | não | — |  |

## `schema_version` (40 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `versao` | INTEGER | sim | — |  |
| `aplicado_em` | TEXT | sim | — |  |
| `descricao` | TEXT | sim | — |  |
| `status` | TEXT | sim | — |  |

## `cadastro_prestadores` (38 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `codigo` | TEXT | sim | — |  |
| `nome_empresa` | TEXT | sim | — |  |
| `possui_pep` | TEXT | sim | 'NAO' |  |
| `numero_pep` | TEXT | não | — |  |
| `responsavel` | TEXT | não | — |  |
| `telefone` | TEXT | não | — |  |
| `email` | TEXT | não | — |  |
| `contatos` | TEXT | não | — |  |
| `status` | TEXT | sim | 'ATIVO' |  |
| `observacoes` | TEXT | não | — |  |
| `criado_em` | TEXT | sim | — |  |
| `criado_por` | TEXT | não | — |  |
| `atualizado_em` | TEXT | não | — |  |
| `atualizado_por` | TEXT | não | — |  |
| `arquivado_em` | TEXT | não | — |  |
| `arquivado_por` | TEXT | não | — |  |
| `motivo_arquivamento` | TEXT | não | — |  |
| `arquivado_teste` | INTEGER | sim | 0 |  |

**Índices:**
- `idx_cadastro_prestadores_codigo` em (codigo)
- `sqlite_autoindex_cadastro_prestadores_1` (único) em (codigo)

## `codigos_disciplina` (35 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `disciplina` | TEXT | não | — | sim |
| `codigo` | TEXT | não | — |  |
| `descricao` | TEXT | não | — |  |
| `atualizado_em` | TEXT | sim | — |  |
| `atualizado_por` | TEXT | sim | — |  |

## `usuarios` (31 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `username` | TEXT | sim | — |  |
| `senha_hash` | TEXT | sim | — |  |
| `nome_completo` | TEXT | não | — |  |
| `perfil` | TEXT | sim | 'ANALISTA' |  |
| `ativo` | INTEGER | sim | 1 |  |
| `criado_em` | TEXT | sim | — |  |
| `deve_trocar_senha` | INTEGER | sim | 0 |  |
| `ultimo_acesso` | TEXT | não | — |  |
| `analista_vinculado` | TEXT | não | — |  |
| `arquivado_em` | TEXT | não | — |  |
| `arquivado_por` | TEXT | não | — |  |
| `motivo_arquivamento` | TEXT | não | — |  |
| `arquivado_teste` | INTEGER | sim | 0 |  |
| `tema_preferido` | TEXT | sim | 'claro' |  |

**Índices:**
- `sqlite_autoindex_usuarios_1` (único) em (username)

## `resumo_conclusao_historico` (22 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `tabela` | TEXT | sim | — |  |
| `registro_id` | INTEGER | sim | — |  |
| `evento` | TEXT | sim | — |  |
| `mfiles` | INTEGER | sim | 0 |  |
| `drive` | INTEGER | sim | 0 |  |
| `email` | INTEGER | sim | 0 |  |
| `selecao_anterior` | TEXT | não | — |  |
| `usuario` | TEXT | sim | — |  |
| `data_hora` | TEXT | sim | — |  |

**Índices:**
- `idx_resumo_conclusao_historico_registro` em (tabela, registro_id)

## `importacoes_planilha_historico` (14 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `data_hora` | TEXT | sim | — |  |
| `usuario` | TEXT | sim | — |  |
| `nome_arquivo` | TEXT | sim | — |  |
| `origem` | TEXT | sim | — |  |
| `lidos` | INTEGER | sim | 0 |  |
| `novos` | INTEGER | sim | 0 |  |
| `atualizados` | INTEGER | sim | 0 |  |
| `conflitos_tratados` | INTEGER | sim | 0 |  |
| `ignorados` | INTEGER | sim | 0 |  |
| `inconsistencias` | INTEGER | sim | 0 |  |
| `resultado` | TEXT | sim | — |  |
| `erro` | TEXT | não | — |  |
| `backup_ref` | TEXT | não | — |  |

**Índices:**
- `idx_importacoes_planilha_historico_data` em (data_hora)

## `backups_historico` (11 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `arquivo` | TEXT | sim | — |  |
| `tipo` | TEXT | sim | 'AUTOMATICO' |  |
| `usuario` | TEXT | não | — |  |
| `tamanho_bytes` | INTEGER | não | — |  |
| `criado_em` | TEXT | sim | — |  |
| `situacao` | TEXT | sim | 'OK' |  |
| `observacoes` | TEXT | não | — |  |

**Índices:**
- `idx_backups_historico_arquivo` em (arquivo)
- `sqlite_autoindex_backups_historico_1` (único) em (arquivo)

## `alertas_radar` (10 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `modulo` | TEXT | sim | — |  |
| `projeto_id` | INTEGER | sim | — |  |
| `tipo_alerta` | TEXT | sim | — |  |
| `status` | TEXT | sim | 'ATIVO' |  |
| `justificativa` | TEXT | não | — |  |
| `atualizado_em` | TEXT | sim | — |  |
| `atualizado_por` | TEXT | não | — |  |
| `providencia` | TEXT | não | — |  |
| `responsavel_tratamento` | TEXT | não | — |  |
| `data_tratamento` | TEXT | não | — |  |
| `observacao` | TEXT | não | — |  |
| `adiado_para` | TEXT | não | — |  |

**Índices:**
- `idx_alertas_radar_status` em (status)
- `idx_alertas_radar_projeto` em (modulo, projeto_id)
- `sqlite_autoindex_alertas_radar_1` (único) em (modulo, projeto_id, tipo_alerta)

## `arquivo_auditoria` (5 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `tabela` | TEXT | sim | — |  |
| `registro_id` | INTEGER | sim | — |  |
| `tipo_operacao` | TEXT | sim | — |  |
| `usuario` | TEXT | sim | — |  |
| `data_hora` | TEXT | sim | — |  |
| `justificativa` | TEXT | não | — |  |
| `descricao_registro` | TEXT | não | — |  |
| `origem` | TEXT | não | — |  |

**Índices:**
- `idx_arquivo_auditoria_tabela` em (tabela, registro_id)

## `configuracoes` (5 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `chave` | TEXT | não | — | sim |
| `valor` | TEXT | sim | — |  |

## `avaliacoes_checklist` (4 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `tipo_entidade` | TEXT | sim | — |  |
| `codigo_entidade` | TEXT | não | — |  |
| `nome_entidade` | TEXT | sim | — |  |
| `disciplina` | TEXT | não | — |  |
| `projeto_id` | INTEGER | não | — |  |
| `at_referencia` | TEXT | não | — |  |
| `revisao` | INTEGER | não | — |  |
| `data_avaliacao` | TEXT | sim | — |  |
| `analista_responsavel` | TEXT | não | — |  |
| `respostas_json` | TEXT | sim | — |  |
| `pontuacao` | INTEGER | sim | — |  |
| `classificacao` | TEXT | sim | — |  |
| `acompanhamento` | TEXT | sim | — |  |
| `observacoes_gerais` | TEXT | não | — |  |
| `criado_em` | TEXT | sim | — |  |
| `criado_por` | TEXT | não | — |  |
| `obra_id` | INTEGER | não | — |  |

**Índices:**
- `idx_avaliacoes_checklist_obra` em (obra_id)
- `idx_avaliacoes_checklist_projeto` em (projeto_id)
- `idx_avaliacoes_checklist_entidade` em (tipo_entidade, codigo_entidade, disciplina)

## `alertas_manuais` (1 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `modulo` | TEXT | sim | — |  |
| `projeto_id` | INTEGER | não | — |  |
| `titulo` | TEXT | sim | — |  |
| `descricao` | TEXT | não | — |  |
| `num_at` | TEXT | não | — |  |
| `codigo_projeto` | TEXT | não | — |  |
| `nome_entidade` | TEXT | não | — |  |
| `disciplina` | TEXT | não | — |  |
| `revisao` | INTEGER | não | — |  |
| `especialista` | TEXT | não | — |  |
| `prioridade` | TEXT | sim | 'Média' |  |
| `vencimento` | TEXT | não | — |  |
| `observacoes` | TEXT | não | — |  |
| `destinatarios` | TEXT | não | — |  |
| `status` | TEXT | sim | 'ABERTO' |  |
| `criado_por` | TEXT | sim | — |  |
| `criado_em` | TEXT | sim | — |  |
| `atualizado_por` | TEXT | não | — |  |
| `atualizado_em` | TEXT | não | — |  |
| `encerrado_por` | TEXT | não | — |  |
| `encerrado_em` | TEXT | não | — |  |
| `motivo_encerramento` | TEXT | não | — |  |
| `arquivado_em` | TEXT | não | — |  |
| `arquivado_por` | TEXT | não | — |  |
| `motivo_arquivamento` | TEXT | não | — |  |
| `arquivado_teste` | INTEGER | sim | 0 |  |

**Índices:**
- `idx_alertas_manuais_status` em (status)
- `idx_alertas_manuais_modulo` em (modulo)

## `manual_confirmacoes_leitura` (1 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `usuario` | TEXT | sim | — |  |
| `versao` | INTEGER | sim | — |  |
| `confirmado_em` | TEXT | sim | — |  |

**Índices:**
- `sqlite_autoindex_manual_confirmacoes_leitura_1` (único) em (usuario, versao)

## `manual_versoes` (1 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `numero_versao` | INTEGER | sim | — |  |
| `notas` | TEXT | não | — |  |
| `publicado_em` | TEXT | sim | — |  |
| `publicado_por` | TEXT | sim | — |  |
| `ativa` | INTEGER | sim | 0 |  |

## `planos_acao` (1 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `reuniao_id` | INTEGER | não | — |  |
| `descricao` | TEXT | sim | — |  |
| `responsavel` | TEXT | não | — |  |
| `prazo` | TEXT | não | — |  |
| `status` | TEXT | sim | 'PENDENTE' |  |
| `criado_em` | TEXT | sim | — |  |
| `criado_por` | TEXT | não | — |  |
| `concluido_em` | TEXT | não | — |  |
| `concluido_por` | TEXT | não | — |  |
| `origem` | TEXT | sim | 'GAT' |  |
| `pmo_projeto_id` | INTEGER | não | — |  |
| `arquivado_em` | TEXT | não | — |  |
| `arquivado_por` | TEXT | não | — |  |
| `motivo_arquivamento` | TEXT | não | — |  |
| `arquivado_teste` | INTEGER | sim | 0 |  |

**Chaves estrangeiras:**
- `pmo_projeto_id` → `pmo_projetos.id`
- `reuniao_id` → `reunioes.id`

## `reunioes` (1 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `titulo` | TEXT | sim | — |  |
| `pauta` | TEXT | não | — |  |
| `data_prevista` | TEXT | não | — |  |
| `data_realizada` | TEXT | não | — |  |
| `ata` | TEXT | não | — |  |
| `decisoes` | TEXT | não | — |  |
| `criado_em` | TEXT | sim | — |  |
| `criado_por` | TEXT | não | — |  |
| `atualizado_em` | TEXT | não | — |  |
| `atualizado_por` | TEXT | não | — |  |
| `origem` | TEXT | sim | 'GAT' |  |
| `arquivado_em` | TEXT | não | — |  |
| `arquivado_por` | TEXT | não | — |  |
| `motivo_arquivamento` | TEXT | não | — |  |
| `arquivado_teste` | INTEGER | sim | 0 |  |

## `avaliacao_obrigatoria_isentos` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `modulo` | TEXT | sim | — | sim |
| `projeto_id` | INTEGER | sim | — | sim |
| `motivo` | TEXT | sim | 'PRE_EXISTENTE_NA_ATIVACAO' |  |
| `criado_em` | TEXT | sim | — |  |

## `avaliacoes_analistas` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `analista` | TEXT | sim | — |  |
| `avaliador` | TEXT | não | — |  |
| `mes` | INTEGER | sim | — |  |
| `ano` | INTEGER | sim | — |  |
| `etg` | INTEGER | não | — |  |
| `horario` | INTEGER | não | — |  |
| `reunioes` | INTEGER | não | — |  |
| `disponibilidade` | INTEGER | não | — |  |
| `conhecimento_tecnico` | INTEGER | não | — |  |
| `produtividade` | INTEGER | não | — |  |
| `qualidade` | INTEGER | não | — |  |
| `qtd_documentos` | INTEGER | não | — |  |
| `qtd_ats` | INTEGER | não | — |  |
| `prazos` | INTEGER | não | — |  |
| `organizacao` | INTEGER | não | — |  |
| `colaboracao` | INTEGER | não | — |  |
| `comunicacao` | INTEGER | não | — |  |
| `justificativa` | TEXT | não | — |  |
| `observacoes` | TEXT | não | — |  |
| `criado_em` | TEXT | sim | — |  |
| `criado_por` | TEXT | não | — |  |

**Índices:**
- `idx_avaliacoes_analistas_periodo` em (analista, ano, mes)

## `avaliacoes_prestadores` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `codigo_prestador` | TEXT | não | — |  |
| `nome_prestador` | TEXT | sim | — |  |
| `data_avaliacao` | TEXT | sim | — |  |
| `nome_projeto` | TEXT | não | — |  |
| `at_referencia` | TEXT | não | — |  |
| `nota` | INTEGER | sim | — |  |
| `analista_responsavel` | TEXT | não | — |  |
| `observacoes` | TEXT | não | — |  |
| `criado_em` | TEXT | sim | — |  |
| `criado_por` | TEXT | não | — |  |

## `devolutiva_cobrancas` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `modulo` | TEXT | sim | — |  |
| `projeto_id` | INTEGER | sim | — |  |
| `numero_cobranca` | INTEGER | sim | — |  |
| `data_cobranca` | TEXT | sim | — |  |
| `hora_cobranca` | TEXT | não | — |  |
| `usuario` | TEXT | sim | — |  |
| `canal` | TEXT | não | — |  |
| `observacao` | TEXT | não | — |  |
| `criado_em` | TEXT | sim | — |  |

**Índices:**
- `idx_devolutiva_cobrancas_projeto` em (modulo, projeto_id)

## `fechamentos_avaliacao_analista` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `avaliacao_analista_id` | INTEGER | não | — |  |
| `analista` | TEXT | sim | — |  |
| `mes` | INTEGER | sim | — |  |
| `ano` | INTEGER | sim | — |  |
| `nota_original` | REAL | sim | — |  |
| `avaliacoes_obrigatorias` | INTEGER | sim | 0 |  |
| `avaliacoes_pendentes` | INTEGER | sim | 0 |  |
| `ats_pendentes` | TEXT | não | — |  |
| `penalizacao_fracao` | REAL | sim | 0 |  |
| `bonificacao` | REAL | sim | 0 |  |
| `nota_final` | REAL | sim | — |  |
| `justificativa_automatica` | TEXT | sim | — |  |
| `recomendacao_gerencial` | TEXT | não | — |  |
| `data_fechamento` | TEXT | sim | — |  |
| `usuario_fechamento` | TEXT | sim | — |  |

**Chaves estrangeiras:**
- `avaliacao_analista_id` → `avaliacoes_analistas.id`

**Índices:**
- `idx_fechamentos_avaliacao_analista_competencia` em (mes, ano)
- `sqlite_autoindex_fechamentos_avaliacao_analista_1` (único) em (analista, mes, ano)

## `manual_anexos` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `capitulo_id` | INTEGER | sim | — |  |
| `tipo` | TEXT | sim | — |  |
| `nome_arquivo` | TEXT | sim | — |  |
| `conteudo` | BLOB | sim | — |  |
| `criado_em` | TEXT | sim | — |  |
| `criado_por` | TEXT | sim | — |  |

**Chaves estrangeiras:**
- `capitulo_id` → `manual_capitulos.id`

**Índices:**
- `idx_manual_anexos_capitulo` em (capitulo_id)

## `obras_prestador` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `prestador_id` | INTEGER | sim | — |  |
| `nome_obra` | TEXT | sim | — |  |
| `codigo_referencia` | TEXT | não | — |  |
| `status` | TEXT | sim | 'ATIVA' |  |
| `e_canteiro` | INTEGER | sim | 0 |  |
| `observacoes` | TEXT | não | — |  |
| `criado_em` | TEXT | sim | — |  |
| `criado_por` | TEXT | não | — |  |
| `atualizado_em` | TEXT | não | — |  |
| `atualizado_por` | TEXT | não | — |  |

**Chaves estrangeiras:**
- `prestador_id` → `cadastro_prestadores.id`

**Índices:**
- `idx_obras_prestador_prestador_id` em (prestador_id)

## `observacoes_mensais` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `competencia` | TEXT | não | — | sim |
| `texto` | TEXT | sim | — |  |
| `atualizado_em` | TEXT | sim | — |  |
| `atualizado_por` | TEXT | não | — |  |

## `pmo_alertas_cronograma` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `projeto_id` | INTEGER | sim | — |  |
| `alerta_manual_id` | INTEGER | não | — |  |
| `status` | TEXT | sim | 'ATIVO' |  |
| `criado_em` | TEXT | sim | — |  |
| `qtd_lembretes` | INTEGER | sim | 0 |  |
| `ultimo_lembrete_em` | TEXT | não | — |  |
| `proximo_lembrete_em` | TEXT | não | — |  |
| `encerrado_em` | TEXT | não | — |  |
| `anexado_por` | TEXT | não | — |  |
| `anexado_em` | TEXT | não | — |  |

**Chaves estrangeiras:**
- `alerta_manual_id` → `alertas_manuais.id`
- `projeto_id` → `pmo_projetos.id`

**Índices:**
- `sqlite_autoindex_pmo_alertas_cronograma_1` (único) em (projeto_id)

## `pmo_comunicacoes` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `projeto_id` | INTEGER | sim | — |  |
| `data` | TEXT | sim | — |  |
| `tipo` | TEXT | não | — |  |
| `descricao` | TEXT | sim | — |  |
| `responsavel` | TEXT | não | — |  |
| `criado_em` | TEXT | sim | — |  |
| `criado_por` | TEXT | sim | — |  |

**Chaves estrangeiras:**
- `projeto_id` → `pmo_projetos.id`

**Índices:**
- `idx_pmo_comunicacoes_projeto` em (projeto_id)

## `pmo_cronograma_arquivos` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `projeto_id` | INTEGER | sim | — |  |
| `nome_arquivo` | TEXT | sim | — |  |
| `formato` | TEXT | sim | — |  |
| `conteudo` | BLOB | sim | — |  |
| `interpretado` | INTEGER | sim | 0 |  |
| `ativo` | INTEGER | sim | 1 |  |
| `enviado_por` | TEXT | sim | — |  |
| `enviado_em` | TEXT | sim | — |  |
| `removido_por` | TEXT | não | — |  |
| `removido_em` | TEXT | não | — |  |
| `arquivado_em` | TEXT | não | — |  |
| `arquivado_por` | TEXT | não | — |  |
| `motivo_arquivamento` | TEXT | não | — |  |
| `arquivado_teste` | INTEGER | sim | 0 |  |

**Chaves estrangeiras:**
- `projeto_id` → `pmo_projetos.id`

**Índices:**
- `idx_pmo_cronograma_arquivos_projeto` em (projeto_id)

## `pmo_cronograma_atividades` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `arquivo_id` | INTEGER | sim | — |  |
| `projeto_id` | INTEGER | sim | — |  |
| `identificador_origem` | TEXT | não | — |  |
| `nome` | TEXT | sim | — |  |
| `data_inicio` | TEXT | não | — |  |
| `data_fim` | TEXT | não | — |  |
| `duracao_dias` | REAL | não | — |  |
| `percentual_concluido` | REAL | sim | 0 |  |
| `e_marco` | INTEGER | sim | 0 |  |
| `predecessoras` | TEXT | não | — |  |
| `caminho_critico` | INTEGER | sim | 0 |  |
| `folga_dias` | REAL | não | — |  |

**Chaves estrangeiras:**
- `projeto_id` → `pmo_projetos.id`
- `arquivo_id` → `pmo_cronograma_arquivos.id`

**Índices:**
- `idx_pmo_cronograma_atividades_projeto` em (projeto_id)
- `idx_pmo_cronograma_atividades_arquivo` em (arquivo_id)

## `pmo_cronograma_lembretes` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `projeto_id` | INTEGER | sim | — |  |
| `enviado_em` | TEXT | sim | — |  |
| `mensagem` | TEXT | sim | — |  |

**Chaves estrangeiras:**
- `projeto_id` → `pmo_projetos.id`

**Índices:**
- `idx_pmo_cronograma_lembretes_projeto` em (projeto_id)

## `pmo_entregaveis` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `projeto_id` | INTEGER | sim | — |  |
| `nome` | TEXT | sim | — |  |
| `previsto` | INTEGER | sim | 1 |  |
| `entregue` | INTEGER | sim | 0 |  |
| `data_prevista` | TEXT | não | — |  |
| `data_entrega` | TEXT | não | — |  |
| `percentual_documental` | REAL | sim | 0 |  |
| `observacoes` | TEXT | não | — |  |
| `criado_em` | TEXT | sim | — |  |
| `criado_por` | TEXT | sim | — |  |
| `atualizado_em` | TEXT | não | — |  |
| `atualizado_por` | TEXT | não | — |  |

**Chaves estrangeiras:**
- `projeto_id` → `pmo_projetos.id`

**Índices:**
- `idx_pmo_entregaveis_projeto` em (projeto_id)

## `pmo_medicoes` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `projeto_id` | INTEGER | sim | — |  |
| `competencia_mes` | INTEGER | sim | — |  |
| `competencia_ano` | INTEGER | sim | — |  |
| `percentual` | REAL | não | — |  |
| `valor_medido` | REAL | não | — |  |
| `situacao` | TEXT | sim | 'EM ANÁLISE' |  |
| `valor_aprovado` | REAL | não | — |  |
| `data_aprovacao` | TEXT | não | — |  |
| `valor_pago` | REAL | não | — |  |
| `data_pagamento` | TEXT | não | — |  |
| `valor_glosado` | REAL | sim | 0 |  |
| `criado_por` | TEXT | sim | — |  |
| `criado_em` | TEXT | sim | — |  |
| `atualizado_em` | TEXT | não | — |  |
| `atualizado_por` | TEXT | não | — |  |

**Chaves estrangeiras:**
- `projeto_id` → `pmo_projetos.id`

**Índices:**
- `idx_pmo_medicoes_projeto` em (projeto_id)

## `pmo_projeto_kpis` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `projeto_id` | INTEGER | sim | — |  |
| `kpi_chave` | TEXT | sim | — |  |
| `habilitado` | INTEGER | sim | 1 |  |
| `habilitado_em` | TEXT | não | — |  |
| `desabilitado_em` | TEXT | não | — |  |

**Chaves estrangeiras:**
- `projeto_id` → `pmo_projetos.id`

**Índices:**
- `sqlite_autoindex_pmo_projeto_kpis_1` (único) em (projeto_id, kpi_chave)

## `pmo_projetos` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `nome` | TEXT | sim | — |  |
| `cliente` | TEXT | não | — |  |
| `contratada` | TEXT | não | — |  |
| `gerente` | TEXT | não | — |  |
| `data_inicio` | TEXT | não | — |  |
| `data_prevista_termino` | TEXT | não | — |  |
| `valor_contratual` | REAL | não | — |  |
| `tipo_contrato` | TEXT | não | — |  |
| `observacoes` | TEXT | não | — |  |
| `status` | TEXT | sim | 'EM ANDAMENTO' |  |
| `saude` | TEXT | sim | 'VERDE' |  |
| `percentual_execucao` | REAL | sim | 0 |  |
| `proximo_marco` | TEXT | não | — |  |
| `proximo_marco_data` | TEXT | não | — |  |
| `criado_em` | TEXT | sim | — |  |
| `criado_por` | TEXT | sim | — |  |
| `atualizado_em` | TEXT | não | — |  |
| `atualizado_por` | TEXT | não | — |  |
| `arquivado_em` | TEXT | não | — |  |
| `arquivado_por` | TEXT | não | — |  |
| `motivo_arquivamento` | TEXT | não | — |  |
| `arquivado_teste` | INTEGER | sim | 0 |  |

## `pmo_riscos` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `projeto_id` | INTEGER | sim | — |  |
| `descricao` | TEXT | sim | — |  |
| `probabilidade` | INTEGER | sim | — |  |
| `impacto` | INTEGER | sim | — |  |
| `status` | TEXT | sim | 'ABERTO' |  |
| `responsavel` | TEXT | não | — |  |
| `plano_mitigacao` | TEXT | não | — |  |
| `criado_em` | TEXT | sim | — |  |
| `criado_por` | TEXT | sim | — |  |
| `atualizado_em` | TEXT | não | — |  |
| `atualizado_por` | TEXT | não | — |  |

**Chaves estrangeiras:**
- `projeto_id` → `pmo_projetos.id`

**Índices:**
- `idx_pmo_riscos_projeto` em (projeto_id)

## `repactuacoes_prazo` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `tabela` | TEXT | sim | — |  |
| `registro_id` | INTEGER | sim | — |  |
| `data_anterior` | TEXT | não | — |  |
| `data_nova` | TEXT | não | — |  |
| `motivo` | TEXT | sim | — |  |
| `usuario` | TEXT | não | — |  |
| `data_hora` | TEXT | sim | — |  |

**Índices:**
- `idx_repactuacoes_prazo_registro` em (tabela, registro_id)

## `reuniao_participantes` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `reuniao_id` | INTEGER | sim | — |  |
| `nome` | TEXT | sim | — |  |

**Chaves estrangeiras:**
- `reuniao_id` → `reunioes.id`

## `reuniao_projetos` (0 linha(s))

| Coluna | Tipo (SQLite) | Obrigatória | Padrão | PK |
|---|---|---|---|---|
| `id` | INTEGER | não | — | sim |
| `reuniao_id` | INTEGER | sim | — |  |
| `modulo` | TEXT | sim | — |  |
| `projeto_id` | INTEGER | sim | — |  |

**Chaves estrangeiras:**
- `reuniao_id` → `reunioes.id`
