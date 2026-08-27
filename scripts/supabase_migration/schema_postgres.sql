-- DDL PostgreSQL gerado automaticamente a partir do schema SQLite do GAT 2026.
-- Gerado por scripts/supabase_migration/2_gerar_ddl_postgres.py — revisar antes de aplicar.
-- Nomes de tabela/coluna preservados EXATAMENTE como no SQLite.

CREATE TABLE "alertas_manuais" (
    "id" BIGSERIAL PRIMARY KEY,
    "modulo" TEXT NOT NULL,
    "projeto_id" BIGINT,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "num_at" TEXT,
    "codigo_projeto" TEXT,
    "nome_entidade" TEXT,
    "disciplina" TEXT,
    "revisao" BIGINT,
    "especialista" TEXT,
    "prioridade" TEXT NOT NULL DEFAULT 'Média',
    "vencimento" TEXT,
    "observacoes" TEXT,
    "destinatarios" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "criado_por" TEXT NOT NULL,
    "criado_em" TEXT NOT NULL,
    "atualizado_por" TEXT,
    "atualizado_em" TEXT,
    "encerrado_por" TEXT,
    "encerrado_em" TEXT,
    "motivo_encerramento" TEXT,
    "arquivado_em" TEXT,
    "arquivado_por" TEXT,
    "motivo_arquivamento" TEXT,
    "arquivado_teste" BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX "idx_alertas_manuais_status" ON "alertas_manuais" ("status");
CREATE INDEX "idx_alertas_manuais_modulo" ON "alertas_manuais" ("modulo");

CREATE TABLE "alertas_radar" (
    "id" BIGSERIAL PRIMARY KEY,
    "modulo" TEXT NOT NULL,
    "projeto_id" BIGINT NOT NULL,
    "tipo_alerta" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "justificativa" TEXT,
    "atualizado_em" TEXT NOT NULL,
    "atualizado_por" TEXT,
    "providencia" TEXT,
    "responsavel_tratamento" TEXT,
    "data_tratamento" TEXT,
    "observacao" TEXT,
    "adiado_para" TEXT
);
CREATE INDEX "idx_alertas_radar_status" ON "alertas_radar" ("status");
CREATE INDEX "idx_alertas_radar_projeto" ON "alertas_radar" ("modulo", "projeto_id");
CREATE UNIQUE INDEX "sqlite_autoindex_alertas_radar_1" ON "alertas_radar" ("modulo", "projeto_id", "tipo_alerta");

CREATE TABLE "arquivo_auditoria" (
    "id" BIGSERIAL PRIMARY KEY,
    "tabela" TEXT NOT NULL,
    "registro_id" BIGINT NOT NULL,
    "tipo_operacao" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "data_hora" TEXT NOT NULL,
    "justificativa" TEXT,
    "descricao_registro" TEXT,
    "origem" TEXT
);
CREATE INDEX "idx_arquivo_auditoria_tabela" ON "arquivo_auditoria" ("tabela", "registro_id");

CREATE TABLE "atividades_usuario" (
    "id" BIGSERIAL PRIMARY KEY,
    "usuario" TEXT NOT NULL,
    "perfil" TEXT,
    "tipo_evento" TEXT NOT NULL,
    "modulo" TEXT,
    "detalhe" TEXT,
    "data_hora" TEXT NOT NULL
);
CREATE INDEX "idx_atividades_usuario_periodo" ON "atividades_usuario" ("usuario", "data_hora");

CREATE TABLE "avaliacao_obrigatoria_isentos" (
    "modulo" TEXT NOT NULL,
    "projeto_id" BIGINT NOT NULL,
    "motivo" TEXT NOT NULL DEFAULT 'PRE_EXISTENTE_NA_ATIVACAO',
    "criado_em" TEXT NOT NULL,
    PRIMARY KEY ("modulo", "projeto_id")
);

CREATE TABLE "avaliacoes_analistas" (
    "id" BIGSERIAL PRIMARY KEY,
    "analista" TEXT NOT NULL,
    "avaliador" TEXT,
    "mes" BIGINT NOT NULL,
    "ano" BIGINT NOT NULL,
    "etg" BIGINT,
    "horario" BIGINT,
    "reunioes" BIGINT,
    "disponibilidade" BIGINT,
    "conhecimento_tecnico" BIGINT,
    "produtividade" BIGINT,
    "qualidade" BIGINT,
    "qtd_documentos" BIGINT,
    "qtd_ats" BIGINT,
    "prazos" BIGINT,
    "organizacao" BIGINT,
    "colaboracao" BIGINT,
    "comunicacao" BIGINT,
    "justificativa" TEXT,
    "observacoes" TEXT,
    "criado_em" TEXT NOT NULL,
    "criado_por" TEXT
);
CREATE INDEX "idx_avaliacoes_analistas_periodo" ON "avaliacoes_analistas" ("analista", "ano", "mes");

CREATE TABLE "avaliacoes_checklist" (
    "id" BIGSERIAL PRIMARY KEY,
    "tipo_entidade" TEXT NOT NULL,
    "codigo_entidade" TEXT,
    "nome_entidade" TEXT NOT NULL,
    "disciplina" TEXT,
    "projeto_id" BIGINT,
    "at_referencia" TEXT,
    "revisao" BIGINT,
    "data_avaliacao" TEXT NOT NULL,
    "analista_responsavel" TEXT,
    "respostas_json" TEXT NOT NULL,
    "pontuacao" BIGINT NOT NULL,
    "classificacao" TEXT NOT NULL,
    "acompanhamento" TEXT NOT NULL,
    "observacoes_gerais" TEXT,
    "criado_em" TEXT NOT NULL,
    "criado_por" TEXT,
    "obra_id" BIGINT
);
CREATE INDEX "idx_avaliacoes_checklist_obra" ON "avaliacoes_checklist" ("obra_id");
CREATE INDEX "idx_avaliacoes_checklist_projeto" ON "avaliacoes_checklist" ("projeto_id");
CREATE INDEX "idx_avaliacoes_checklist_entidade" ON "avaliacoes_checklist" ("tipo_entidade", "codigo_entidade", "disciplina");

CREATE TABLE "avaliacoes_prestadores" (
    "id" BIGSERIAL PRIMARY KEY,
    "codigo_prestador" TEXT,
    "nome_prestador" TEXT NOT NULL,
    "data_avaliacao" TEXT NOT NULL,
    "nome_projeto" TEXT,
    "at_referencia" TEXT,
    "nota" BIGINT NOT NULL,
    "analista_responsavel" TEXT,
    "observacoes" TEXT,
    "criado_em" TEXT NOT NULL,
    "criado_por" TEXT
);

CREATE TABLE "backups_historico" (
    "id" BIGSERIAL PRIMARY KEY,
    "arquivo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'AUTOMATICO',
    "usuario" TEXT,
    "tamanho_bytes" BIGINT,
    "criado_em" TEXT NOT NULL,
    "situacao" TEXT NOT NULL DEFAULT 'OK',
    "observacoes" TEXT
);
CREATE INDEX "idx_backups_historico_arquivo" ON "backups_historico" ("arquivo");
CREATE UNIQUE INDEX "sqlite_autoindex_backups_historico_1" ON "backups_historico" ("arquivo");

CREATE TABLE "cadastro_cessionarios" (
    "id" BIGSERIAL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "nome_empresa" TEXT NOT NULL,
    "luc" TEXT,
    "rvp" TEXT,
    "rci" TEXT,
    "responsavel" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "contatos" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "observacoes" TEXT,
    "criado_em" TEXT NOT NULL,
    "criado_por" TEXT,
    "atualizado_em" TEXT,
    "atualizado_por" TEXT,
    "arquivado_em" TEXT,
    "arquivado_por" TEXT,
    "motivo_arquivamento" TEXT,
    "arquivado_teste" BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX "idx_cadastro_cessionarios_codigo" ON "cadastro_cessionarios" ("codigo");
CREATE UNIQUE INDEX "sqlite_autoindex_cadastro_cessionarios_1" ON "cadastro_cessionarios" ("codigo");

CREATE TABLE "cadastro_prestadores" (
    "id" BIGSERIAL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "nome_empresa" TEXT NOT NULL,
    "possui_pep" TEXT NOT NULL DEFAULT 'NAO',
    "numero_pep" TEXT,
    "responsavel" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "contatos" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "observacoes" TEXT,
    "criado_em" TEXT NOT NULL,
    "criado_por" TEXT,
    "atualizado_em" TEXT,
    "atualizado_por" TEXT,
    "arquivado_em" TEXT,
    "arquivado_por" TEXT,
    "motivo_arquivamento" TEXT,
    "arquivado_teste" BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX "idx_cadastro_prestadores_codigo" ON "cadastro_prestadores" ("codigo");
CREATE UNIQUE INDEX "sqlite_autoindex_cadastro_prestadores_1" ON "cadastro_prestadores" ("codigo");

CREATE TABLE "cessionarios" (
    "id" BIGSERIAL PRIMARY KEY,
    "item" BIGINT,
    "codigo" TEXT,
    "cessionario" TEXT NOT NULL,
    "disciplina" TEXT,
    "disciplina_sla" TEXT,
    "revisao" BIGINT NOT NULL DEFAULT 0,
    "num_documentos" BIGINT NOT NULL DEFAULT 0,
    "data_solicitacao" TEXT NOT NULL,
    "tipo" TEXT,
    "sla_dias" BIGINT,
    "data_limite" TEXT,
    "data_analise" TEXT,
    "hold_inicio" TEXT,
    "hold_fim" TEXT,
    "num_at" TEXT,
    "revisao_at" BIGINT,
    "responsavel" TEXT,
    "status_analise" TEXT NOT NULL DEFAULT 'EM ANÁLISE',
    "observacoes" TEXT,
    "natureza_revisao" TEXT,
    "num_erros" BIGINT,
    "etg" TEXT NOT NULL DEFAULT 'NÃO',
    "criado_em" TEXT NOT NULL,
    "criado_por" TEXT,
    "atualizado_em" TEXT,
    "atualizado_por" TEXT,
    "pep" TEXT,
    "cessionario_cadastro_id" BIGINT,
    "luc" TEXT,
    "numero_rci" TEXT,
    "numero_rvp" TEXT,
    "data_atualizacao_rci" TEXT,
    "data_atualizacao_rvp" TEXT,
    "sla_original" BIGINT,
    "sla_reduzido" BIGINT NOT NULL DEFAULT 0,
    "justificativa_sla" TEXT,
    "data_limite_original" TEXT,
    "sla_alterado_por" TEXT,
    "sla_alterado_em" TEXT,
    "data_limite_ajustada_manualmente" BIGINT NOT NULL DEFAULT 0,
    "arquivado_em" TEXT,
    "arquivado_por" TEXT,
    "motivo_arquivamento" TEXT,
    "arquivado_teste" BIGINT NOT NULL DEFAULT 0,
    "resumo_mfiles" BIGINT NOT NULL DEFAULT 0,
    "resumo_drive" BIGINT NOT NULL DEFAULT 0,
    "resumo_email" BIGINT NOT NULL DEFAULT 0,
    "resumo_popup_disparado_em" TEXT,
    "resumo_ultima_geracao_em" TEXT,
    "resumo_gerado_por" TEXT,
    "resumo_qtd_geracoes" BIGINT NOT NULL DEFAULT 0,
    "avaliacao_opcional_perguntada_revisao" BIGINT
);
CREATE INDEX "idx_cessionarios_cadastro_id" ON "cessionarios" ("cessionario_cadastro_id");
CREATE INDEX "idx_cessionarios_nome" ON "cessionarios" ("cessionario");
CREATE INDEX "idx_cessionarios_num_at" ON "cessionarios" ("num_at");

CREATE TABLE "codigos_disciplina" (
    "disciplina" TEXT,
    "codigo" TEXT,
    "descricao" TEXT,
    "atualizado_em" TEXT NOT NULL,
    "atualizado_por" TEXT NOT NULL,
    PRIMARY KEY ("disciplina")
);

CREATE TABLE "configuracoes" (
    "chave" TEXT,
    "valor" TEXT NOT NULL,
    PRIMARY KEY ("chave")
);

CREATE TABLE "devolutiva_cobrancas" (
    "id" BIGSERIAL PRIMARY KEY,
    "modulo" TEXT NOT NULL,
    "projeto_id" BIGINT NOT NULL,
    "numero_cobranca" BIGINT NOT NULL,
    "data_cobranca" TEXT NOT NULL,
    "hora_cobranca" TEXT,
    "usuario" TEXT NOT NULL,
    "canal" TEXT,
    "observacao" TEXT,
    "criado_em" TEXT NOT NULL
);
CREATE INDEX "idx_devolutiva_cobrancas_projeto" ON "devolutiva_cobrancas" ("modulo", "projeto_id");

CREATE TABLE "fechamentos_avaliacao_analista" (
    "id" BIGSERIAL PRIMARY KEY,
    "avaliacao_analista_id" BIGINT,
    "analista" TEXT NOT NULL,
    "mes" BIGINT NOT NULL,
    "ano" BIGINT NOT NULL,
    "nota_original" DOUBLE PRECISION NOT NULL,
    "avaliacoes_obrigatorias" BIGINT NOT NULL DEFAULT 0,
    "avaliacoes_pendentes" BIGINT NOT NULL DEFAULT 0,
    "ats_pendentes" TEXT,
    "penalizacao_fracao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonificacao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nota_final" DOUBLE PRECISION NOT NULL,
    "justificativa_automatica" TEXT NOT NULL,
    "recomendacao_gerencial" TEXT,
    "data_fechamento" TEXT NOT NULL,
    "usuario_fechamento" TEXT NOT NULL,
    FOREIGN KEY ("avaliacao_analista_id") REFERENCES "avaliacoes_analistas" ("id") ON DELETE SET NULL
);
CREATE INDEX "idx_fechamentos_avaliacao_analista_competencia" ON "fechamentos_avaliacao_analista" ("mes", "ano");
CREATE UNIQUE INDEX "sqlite_autoindex_fechamentos_avaliacao_analista_1" ON "fechamentos_avaliacao_analista" ("analista", "mes", "ano");

CREATE TABLE "historico_edicoes" (
    "id" BIGSERIAL PRIMARY KEY,
    "tabela" TEXT NOT NULL,
    "registro_id" BIGINT NOT NULL,
    "campo" TEXT NOT NULL,
    "valor_anterior" TEXT,
    "valor_novo" TEXT,
    "usuario" TEXT,
    "data_hora" TEXT NOT NULL
);

CREATE TABLE "importacoes_planilha_historico" (
    "id" BIGSERIAL PRIMARY KEY,
    "data_hora" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "lidos" BIGINT NOT NULL DEFAULT 0,
    "novos" BIGINT NOT NULL DEFAULT 0,
    "atualizados" BIGINT NOT NULL DEFAULT 0,
    "conflitos_tratados" BIGINT NOT NULL DEFAULT 0,
    "ignorados" BIGINT NOT NULL DEFAULT 0,
    "inconsistencias" BIGINT NOT NULL DEFAULT 0,
    "resultado" TEXT NOT NULL,
    "erro" TEXT,
    "backup_ref" TEXT
);
CREATE INDEX "idx_importacoes_planilha_historico_data" ON "importacoes_planilha_historico" ("data_hora");

CREATE TABLE "manual_capitulos" (
    "id" BIGSERIAL PRIMARY KEY,
    "ordem" BIGINT NOT NULL,
    "titulo" TEXT NOT NULL,
    "conteudo" TEXT,
    "perfis_visiveis" TEXT,
    "criado_em" TEXT NOT NULL,
    "atualizado_em" TEXT,
    "atualizado_por" TEXT
);

CREATE TABLE "manual_confirmacoes_leitura" (
    "id" BIGSERIAL PRIMARY KEY,
    "usuario" TEXT NOT NULL,
    "versao" BIGINT NOT NULL,
    "confirmado_em" TEXT NOT NULL
);
CREATE UNIQUE INDEX "sqlite_autoindex_manual_confirmacoes_leitura_1" ON "manual_confirmacoes_leitura" ("usuario", "versao");

CREATE TABLE "manual_versoes" (
    "id" BIGSERIAL PRIMARY KEY,
    "numero_versao" BIGINT NOT NULL,
    "notas" TEXT,
    "publicado_em" TEXT NOT NULL,
    "publicado_por" TEXT NOT NULL,
    "ativa" BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE "obras_prestador" (
    "id" BIGSERIAL PRIMARY KEY,
    "prestador_id" BIGINT NOT NULL,
    "nome_obra" TEXT NOT NULL,
    "codigo_referencia" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVA',
    "e_canteiro" BIGINT NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "criado_em" TEXT NOT NULL,
    "criado_por" TEXT,
    "atualizado_em" TEXT,
    "atualizado_por" TEXT,
    FOREIGN KEY ("prestador_id") REFERENCES "cadastro_prestadores" ("id") ON DELETE CASCADE
);
CREATE INDEX "idx_obras_prestador_prestador_id" ON "obras_prestador" ("prestador_id");

CREATE TABLE "observacoes_mensais" (
    "competencia" TEXT,
    "texto" TEXT NOT NULL,
    "atualizado_em" TEXT NOT NULL,
    "atualizado_por" TEXT,
    PRIMARY KEY ("competencia")
);

CREATE TABLE "pmo_projetos" (
    "id" BIGSERIAL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "cliente" TEXT,
    "contratada" TEXT,
    "gerente" TEXT,
    "data_inicio" TEXT,
    "data_prevista_termino" TEXT,
    "valor_contratual" DOUBLE PRECISION,
    "tipo_contrato" TEXT,
    "observacoes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'EM ANDAMENTO',
    "saude" TEXT NOT NULL DEFAULT 'VERDE',
    "percentual_execucao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proximo_marco" TEXT,
    "proximo_marco_data" TEXT,
    "criado_em" TEXT NOT NULL,
    "criado_por" TEXT NOT NULL,
    "atualizado_em" TEXT,
    "atualizado_por" TEXT,
    "arquivado_em" TEXT,
    "arquivado_por" TEXT,
    "motivo_arquivamento" TEXT,
    "arquivado_teste" BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE "pmo_riscos" (
    "id" BIGSERIAL PRIMARY KEY,
    "projeto_id" BIGINT NOT NULL,
    "descricao" TEXT NOT NULL,
    "probabilidade" BIGINT NOT NULL,
    "impacto" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "responsavel" TEXT,
    "plano_mitigacao" TEXT,
    "criado_em" TEXT NOT NULL,
    "criado_por" TEXT NOT NULL,
    "atualizado_em" TEXT,
    "atualizado_por" TEXT,
    FOREIGN KEY ("projeto_id") REFERENCES "pmo_projetos" ("id") ON DELETE CASCADE
);
CREATE INDEX "idx_pmo_riscos_projeto" ON "pmo_riscos" ("projeto_id");

CREATE TABLE "prestadores" (
    "id" BIGSERIAL PRIMARY KEY,
    "item" BIGINT,
    "codigo" TEXT,
    "prestador" TEXT NOT NULL,
    "disciplina" TEXT,
    "disciplina_sla" TEXT,
    "peps" TEXT,
    "obra_referencia" TEXT,
    "revisao" BIGINT NOT NULL DEFAULT 0,
    "num_documentos" BIGINT NOT NULL DEFAULT 0,
    "data_solicitacao" TEXT NOT NULL,
    "data_limite" TEXT,
    "data_analise" TEXT,
    "hold_inicio" TEXT,
    "hold_fim" TEXT,
    "num_at" TEXT,
    "revisao_at" BIGINT,
    "responsavel" TEXT,
    "status_analise" TEXT NOT NULL DEFAULT 'EM ANÁLISE',
    "observacoes" TEXT,
    "natureza_revisao" TEXT,
    "num_erros" BIGINT,
    "etg" TEXT NOT NULL DEFAULT 'NÃO',
    "criado_em" TEXT NOT NULL,
    "criado_por" TEXT,
    "atualizado_em" TEXT,
    "atualizado_por" TEXT,
    "prestador_cadastro_id" BIGINT,
    "obra_id" BIGINT,
    "sla_dias" BIGINT,
    "sla_original" BIGINT,
    "sla_reduzido" BIGINT NOT NULL DEFAULT 0,
    "nivel_prioridade" BIGINT,
    "justificativa_sla" TEXT,
    "data_limite_original" TEXT,
    "sla_alterado_por" TEXT,
    "sla_alterado_em" TEXT,
    "data_limite_ajustada_manualmente" BIGINT NOT NULL DEFAULT 0,
    "arquivado_em" TEXT,
    "arquivado_por" TEXT,
    "motivo_arquivamento" TEXT,
    "arquivado_teste" BIGINT NOT NULL DEFAULT 0,
    "resumo_mfiles" BIGINT NOT NULL DEFAULT 0,
    "resumo_drive" BIGINT NOT NULL DEFAULT 0,
    "resumo_email" BIGINT NOT NULL DEFAULT 0,
    "resumo_popup_disparado_em" TEXT,
    "resumo_ultima_geracao_em" TEXT,
    "resumo_gerado_por" TEXT,
    "resumo_qtd_geracoes" BIGINT NOT NULL DEFAULT 0,
    "avaliacao_opcional_perguntada_revisao" BIGINT
);
CREATE INDEX "idx_prestadores_obra_id" ON "prestadores" ("obra_id");
CREATE INDEX "idx_prestadores_cadastro_id" ON "prestadores" ("prestador_cadastro_id");
CREATE INDEX "idx_prestadores_nome" ON "prestadores" ("prestador");
CREATE INDEX "idx_prestadores_num_at" ON "prestadores" ("num_at");

CREATE TABLE "repactuacoes_prazo" (
    "id" BIGSERIAL PRIMARY KEY,
    "tabela" TEXT NOT NULL,
    "registro_id" BIGINT NOT NULL,
    "data_anterior" TEXT,
    "data_nova" TEXT,
    "motivo" TEXT NOT NULL,
    "usuario" TEXT,
    "data_hora" TEXT NOT NULL
);
CREATE INDEX "idx_repactuacoes_prazo_registro" ON "repactuacoes_prazo" ("tabela", "registro_id");

CREATE TABLE "resumo_conclusao_historico" (
    "id" BIGSERIAL PRIMARY KEY,
    "tabela" TEXT NOT NULL,
    "registro_id" BIGINT NOT NULL,
    "evento" TEXT NOT NULL,
    "mfiles" BIGINT NOT NULL DEFAULT 0,
    "drive" BIGINT NOT NULL DEFAULT 0,
    "email" BIGINT NOT NULL DEFAULT 0,
    "selecao_anterior" TEXT,
    "usuario" TEXT NOT NULL,
    "data_hora" TEXT NOT NULL
);
CREATE INDEX "idx_resumo_conclusao_historico_registro" ON "resumo_conclusao_historico" ("tabela", "registro_id");

CREATE TABLE "reunioes" (
    "id" BIGSERIAL PRIMARY KEY,
    "titulo" TEXT NOT NULL,
    "pauta" TEXT,
    "data_prevista" TEXT,
    "data_realizada" TEXT,
    "ata" TEXT,
    "decisoes" TEXT,
    "criado_em" TEXT NOT NULL,
    "criado_por" TEXT,
    "atualizado_em" TEXT,
    "atualizado_por" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'GAT',
    "arquivado_em" TEXT,
    "arquivado_por" TEXT,
    "motivo_arquivamento" TEXT,
    "arquivado_teste" BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE "schema_version" (
    "id" BIGSERIAL PRIMARY KEY,
    "versao" BIGINT NOT NULL,
    "aplicado_em" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "status" TEXT NOT NULL
);

CREATE TABLE "usuarios" (
    "id" BIGSERIAL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "nome_completo" TEXT,
    "perfil" TEXT NOT NULL DEFAULT 'ANALISTA',
    "ativo" BIGINT NOT NULL DEFAULT 1,
    "criado_em" TEXT NOT NULL,
    "deve_trocar_senha" BIGINT NOT NULL DEFAULT 0,
    "ultimo_acesso" TEXT,
    "analista_vinculado" TEXT,
    "arquivado_em" TEXT,
    "arquivado_por" TEXT,
    "motivo_arquivamento" TEXT,
    "arquivado_teste" BIGINT NOT NULL DEFAULT 0,
    "tema_preferido" TEXT NOT NULL DEFAULT 'claro'
);
CREATE UNIQUE INDEX "sqlite_autoindex_usuarios_1" ON "usuarios" ("username");

CREATE TABLE "manual_anexos" (
    "id" BIGSERIAL PRIMARY KEY,
    "capitulo_id" BIGINT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "criado_em" TEXT NOT NULL,
    "criado_por" TEXT NOT NULL,
    FOREIGN KEY ("capitulo_id") REFERENCES "manual_capitulos" ("id") ON DELETE CASCADE
);
CREATE INDEX "idx_manual_anexos_capitulo" ON "manual_anexos" ("capitulo_id");

CREATE TABLE "permissoes_area" (
    "usuario_id" BIGINT NOT NULL,
    "area" TEXT NOT NULL,
    "permitido" BIGINT NOT NULL DEFAULT 1,
    PRIMARY KEY ("usuario_id", "area"),
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE CASCADE
);

CREATE TABLE "permissoes_modulo" (
    "usuario_id" BIGINT NOT NULL,
    "modulo" TEXT NOT NULL,
    "permitido" BIGINT NOT NULL DEFAULT 1,
    PRIMARY KEY ("usuario_id", "modulo"),
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE CASCADE
);

CREATE TABLE "planos_acao" (
    "id" BIGSERIAL PRIMARY KEY,
    "reuniao_id" BIGINT,
    "descricao" TEXT NOT NULL,
    "responsavel" TEXT,
    "prazo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "criado_em" TEXT NOT NULL,
    "criado_por" TEXT,
    "concluido_em" TEXT,
    "concluido_por" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'GAT',
    "pmo_projeto_id" BIGINT,
    "arquivado_em" TEXT,
    "arquivado_por" TEXT,
    "motivo_arquivamento" TEXT,
    "arquivado_teste" BIGINT NOT NULL DEFAULT 0,
    FOREIGN KEY ("pmo_projeto_id") REFERENCES "pmo_projetos" ("id"),
    FOREIGN KEY ("reuniao_id") REFERENCES "reunioes" ("id") ON DELETE SET NULL
);

CREATE TABLE "pmo_alertas_cronograma" (
    "id" BIGSERIAL PRIMARY KEY,
    "projeto_id" BIGINT NOT NULL,
    "alerta_manual_id" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "criado_em" TEXT NOT NULL,
    "qtd_lembretes" BIGINT NOT NULL DEFAULT 0,
    "ultimo_lembrete_em" TEXT,
    "proximo_lembrete_em" TEXT,
    "encerrado_em" TEXT,
    "anexado_por" TEXT,
    "anexado_em" TEXT,
    FOREIGN KEY ("alerta_manual_id") REFERENCES "alertas_manuais" ("id"),
    FOREIGN KEY ("projeto_id") REFERENCES "pmo_projetos" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "sqlite_autoindex_pmo_alertas_cronograma_1" ON "pmo_alertas_cronograma" ("projeto_id");

CREATE TABLE "pmo_comunicacoes" (
    "id" BIGSERIAL PRIMARY KEY,
    "projeto_id" BIGINT NOT NULL,
    "data" TEXT NOT NULL,
    "tipo" TEXT,
    "descricao" TEXT NOT NULL,
    "responsavel" TEXT,
    "criado_em" TEXT NOT NULL,
    "criado_por" TEXT NOT NULL,
    FOREIGN KEY ("projeto_id") REFERENCES "pmo_projetos" ("id") ON DELETE CASCADE
);
CREATE INDEX "idx_pmo_comunicacoes_projeto" ON "pmo_comunicacoes" ("projeto_id");

CREATE TABLE "pmo_cronograma_arquivos" (
    "id" BIGSERIAL PRIMARY KEY,
    "projeto_id" BIGINT NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "formato" TEXT NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "interpretado" BIGINT NOT NULL DEFAULT 0,
    "ativo" BIGINT NOT NULL DEFAULT 1,
    "enviado_por" TEXT NOT NULL,
    "enviado_em" TEXT NOT NULL,
    "removido_por" TEXT,
    "removido_em" TEXT,
    "arquivado_em" TEXT,
    "arquivado_por" TEXT,
    "motivo_arquivamento" TEXT,
    "arquivado_teste" BIGINT NOT NULL DEFAULT 0,
    FOREIGN KEY ("projeto_id") REFERENCES "pmo_projetos" ("id") ON DELETE CASCADE
);
CREATE INDEX "idx_pmo_cronograma_arquivos_projeto" ON "pmo_cronograma_arquivos" ("projeto_id");

CREATE TABLE "pmo_cronograma_atividades" (
    "id" BIGSERIAL PRIMARY KEY,
    "arquivo_id" BIGINT NOT NULL,
    "projeto_id" BIGINT NOT NULL,
    "identificador_origem" TEXT,
    "nome" TEXT NOT NULL,
    "data_inicio" TEXT,
    "data_fim" TEXT,
    "duracao_dias" DOUBLE PRECISION,
    "percentual_concluido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "e_marco" BIGINT NOT NULL DEFAULT 0,
    "predecessoras" TEXT,
    "caminho_critico" BIGINT NOT NULL DEFAULT 0,
    "folga_dias" DOUBLE PRECISION,
    FOREIGN KEY ("projeto_id") REFERENCES "pmo_projetos" ("id") ON DELETE CASCADE,
    FOREIGN KEY ("arquivo_id") REFERENCES "pmo_cronograma_arquivos" ("id") ON DELETE CASCADE
);
CREATE INDEX "idx_pmo_cronograma_atividades_projeto" ON "pmo_cronograma_atividades" ("projeto_id");
CREATE INDEX "idx_pmo_cronograma_atividades_arquivo" ON "pmo_cronograma_atividades" ("arquivo_id");

CREATE TABLE "pmo_cronograma_lembretes" (
    "id" BIGSERIAL PRIMARY KEY,
    "projeto_id" BIGINT NOT NULL,
    "enviado_em" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    FOREIGN KEY ("projeto_id") REFERENCES "pmo_projetos" ("id") ON DELETE CASCADE
);
CREATE INDEX "idx_pmo_cronograma_lembretes_projeto" ON "pmo_cronograma_lembretes" ("projeto_id");

CREATE TABLE "pmo_entregaveis" (
    "id" BIGSERIAL PRIMARY KEY,
    "projeto_id" BIGINT NOT NULL,
    "nome" TEXT NOT NULL,
    "previsto" BIGINT NOT NULL DEFAULT 1,
    "entregue" BIGINT NOT NULL DEFAULT 0,
    "data_prevista" TEXT,
    "data_entrega" TEXT,
    "percentual_documental" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "criado_em" TEXT NOT NULL,
    "criado_por" TEXT NOT NULL,
    "atualizado_em" TEXT,
    "atualizado_por" TEXT,
    FOREIGN KEY ("projeto_id") REFERENCES "pmo_projetos" ("id") ON DELETE CASCADE
);
CREATE INDEX "idx_pmo_entregaveis_projeto" ON "pmo_entregaveis" ("projeto_id");

CREATE TABLE "pmo_medicoes" (
    "id" BIGSERIAL PRIMARY KEY,
    "projeto_id" BIGINT NOT NULL,
    "competencia_mes" BIGINT NOT NULL,
    "competencia_ano" BIGINT NOT NULL,
    "percentual" DOUBLE PRECISION,
    "valor_medido" DOUBLE PRECISION,
    "situacao" TEXT NOT NULL DEFAULT 'EM ANÁLISE',
    "valor_aprovado" DOUBLE PRECISION,
    "data_aprovacao" TEXT,
    "valor_pago" DOUBLE PRECISION,
    "data_pagamento" TEXT,
    "valor_glosado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criado_por" TEXT NOT NULL,
    "criado_em" TEXT NOT NULL,
    "atualizado_em" TEXT,
    "atualizado_por" TEXT,
    FOREIGN KEY ("projeto_id") REFERENCES "pmo_projetos" ("id") ON DELETE CASCADE
);
CREATE INDEX "idx_pmo_medicoes_projeto" ON "pmo_medicoes" ("projeto_id");

CREATE TABLE "pmo_projeto_kpis" (
    "id" BIGSERIAL PRIMARY KEY,
    "projeto_id" BIGINT NOT NULL,
    "kpi_chave" TEXT NOT NULL,
    "habilitado" BIGINT NOT NULL DEFAULT 1,
    "habilitado_em" TEXT,
    "desabilitado_em" TEXT,
    FOREIGN KEY ("projeto_id") REFERENCES "pmo_projetos" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "sqlite_autoindex_pmo_projeto_kpis_1" ON "pmo_projeto_kpis" ("projeto_id", "kpi_chave");

CREATE TABLE "reuniao_participantes" (
    "id" BIGSERIAL PRIMARY KEY,
    "reuniao_id" BIGINT NOT NULL,
    "nome" TEXT NOT NULL,
    FOREIGN KEY ("reuniao_id") REFERENCES "reunioes" ("id") ON DELETE CASCADE
);

CREATE TABLE "reuniao_projetos" (
    "id" BIGSERIAL PRIMARY KEY,
    "reuniao_id" BIGINT NOT NULL,
    "modulo" TEXT NOT NULL,
    "projeto_id" BIGINT NOT NULL,
    FOREIGN KEY ("reuniao_id") REFERENCES "reunioes" ("id") ON DELETE CASCADE
);
