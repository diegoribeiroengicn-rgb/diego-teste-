"""
Configurações globais do Sistema GAT 2026 - Tecnoplano.

Concentra constantes de negócio, listas suspensas (extraídas da aba
LISTA_SUSPENSA da planilha oficial "Controle_GAT_Projetos_2026.xlsm") e a
paleta de cores institucional (extraída do dashboard HTML de referência
"dashboard_GAT_tecnoplano_Prestador_v5.html"), para que todo o sistema
utilize uma única fonte de verdade.
"""

import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Caminhos do projeto
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

# Caminho do banco de produção: separado do código-fonte por padrão (pasta
# `data/`, fora do que é substituído a cada deploy), mas configurável via a
# variável de ambiente DATABASE_PATH para apontar a um volume/disco
# persistente do ambiente de produção. O banco JAMAIS é recriado do zero se
# já existir nesse caminho — ver `gat/database.py::init_db`.
_database_path_env = os.environ.get("DATABASE_PATH", "").strip()
DB_PATH = Path(_database_path_env) if _database_path_env else DATA_DIR / "gat_tecnoplano.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

SEED_DB_PATH = DATA_DIR / "seed_gat_tecnoplano.db"
LOGO_PATH = BASE_DIR / "assets" / "tecnoplano_logo.png"

# Backups automáticos de segurança, criados antes de qualquer migração
# estrutural do banco (ver `gat/database.py::_aplicar_migracoes`).
BACKUP_DIR = Path(os.environ.get("GAT_BACKUP_DIR", "").strip() or (DB_PATH.parent / "backups"))
BACKUP_DIR.mkdir(parents=True, exist_ok=True)
MAX_BACKUPS = int(os.environ.get("GAT_MAX_BACKUPS", "30"))

# Versão da aplicação — usada apenas para identificar o release de origem
# nos nomes dos arquivos de backup (não confundir com a versão do schema,
# controlada pela tabela `schema_version`).
APP_VERSION = "1.5"

# ---------------------------------------------------------------------------
# Identidade visual Tecnoplano (paleta extraída do dashboard oficial)
# ---------------------------------------------------------------------------
CORES = {
    "bg": "#F8FAFC",
    "superficie_1": "#FFFFFF",
    "superficie_2": "#F1F5F9",
    "superficie_3": "#EFF4FF",
    "borda": "#E2E8F0",
    "borda_forte": "#CBD5E1",
    "navy": "#1B3A8A",       # cor primária Tecnoplano
    "azul": "#0040A7",
    "azul_2": "#2563EB",
    "azul_3": "#DBEAFE",
    "verde": "#16A34A",
    "lima": "#65A30D",
    "vermelho": "#DC2626",
    "laranja": "#EA580C",
    "roxo": "#7C3AED",
    "dourado": "#D97706",
    "ceu": "#0284C7",
    "texto": "#0F172A",
    "texto_fraco": "#64748B",
    "texto_dim": "#94A3B8",
    "verde_bg": "#DCFCE7",
    "lima_bg": "#ECFCCB",
    "vermelho_bg": "#FEE2E2",
    "laranja_bg": "#FFF7ED",
    "roxo_bg": "#EDE9FE",
    "dourado_bg": "#FEF3C7",
    "ceu_bg": "#E0F2FE",
}

# Cores associadas a cada status de análise (usadas em badges e gráficos)
CORES_STATUS_ENTREGA = {
    "ANTES DO PRAZO": CORES["verde"],
    "NO PRAZO": CORES["ceu"],
    "ATRASADO": CORES["vermelho"],
}

CORES_STATUS_ANALISE = {
    "EM ANÁLISE": CORES["azul_2"],
    "LIBERADO": CORES["verde"],
    "LIBERADO C/ REST.": CORES["lima"],
    "NÃO LIBERADO": CORES["laranja"],
    "EM HOLD": CORES["dourado"],
    "OBSOLETO": CORES["texto_dim"],
    "CANCELADO": CORES["texto_fraco"],
}

# Sequência de cores para gráficos categóricos (paleta Tecnoplano)
SEQUENCIA_GRAFICOS = [
    CORES["navy"], CORES["azul_2"], CORES["ceu"], CORES["verde"],
    CORES["dourado"], CORES["laranja"], CORES["roxo"], CORES["lima"],
    CORES["vermelho"],
]

# ---------------------------------------------------------------------------
# Regras de negócio / governança
# ---------------------------------------------------------------------------
META_REVISAO_APROVACAO = 2          # Meta corporativa: aprovar até a REV2
STATUS_CANCELADO = "CANCELADO"
STATUS_NAO_LIBERADO = "NÃO LIBERADO"
STATUS_PENDENTE_REUNIAO = "PENDENTE DE REUNIÃO"

# SLA fixo (em dias úteis) aplicado às análises de Prestadores
SLA_PRESTADORES_DIAS_UTEIS = 10

# Regra de SLA de Cessionários: depende do tipo de operação e se é a
# primeira revisão (revisão 0) ou uma revisão subsequente.
SLA_CESSIONARIOS_NOVO = 10   # revisão 0 em Quiosque/Loja/Externo
SLA_CESSIONARIOS_REVISAO = 5  # demais revisões

# ---------------------------------------------------------------------------
# Listas suspensas (aba LISTA_SUSPENSA da planilha oficial)
# ---------------------------------------------------------------------------
RESPONSAVEIS = [
    "ALLINE", "DIEGO", "FÁTIMA", "GABRIEL", "INEZ", "JEFFERSON",
    "JESSICA BANDEIRA", "JESSICA NAPOLEÃO", "LEONARDO", "LETÍCIA",
    "MATHEUS", "MAYRON", "RIOGALEÃO", "THAINÁ NOBRE", "VIRGINIA", "WESLEY",
]

DISCIPLINAS = [
    "ELÉTRICA", "TELEMÁTICA", "HIDRÁULICA", "ESGOTO", "ARQUITETURA", "SOM",
    "AR CONDICIONADO", "HIDROSSANTÁRIO", "ESTRUTURA", "INCÊNDIO", "SDAI",
    "COMBATE A INCÊNDIO", "ESTRUTURA (MC)", "HIDROSSANITÁRIO",
    "TELECOM / ESPECIAIS", "SPDA", "ÁGUAS PLUVIAIS", "CERCAMENTO",
    "TELEFONIA", "TELEMATICA", "PAISAGISMO", "SINALIZAÇÃO VERTICAL",
    "SINALIZAÇÃO HORIZONTAL", "PAVIMENTAÇÃO", "GEOMÉTRICO", "EXAUSTÃO",
    "HVAC", "GERAL", "DRENAGEM",
]

DISCIPLINAS_SLA = [
    "ARQUITETURA", "ELÉTRICA", "INSTALAÇÕES HIDROSSANITÁRIAS", "SPK",
    "DETECÇÃO", "SINAL. EMERGÊNCIA/R. DE FUGA/EXTINTORES", "HVAC", "CIVIL",
    "PAVIMENTO", "ART/RRT", "ESTRUTURAS",
]

STATUS_ANALISE_OPCOES = [
    "EM ANÁLISE", "LIBERADO", "LIBERADO C/ REST.", "NÃO LIBERADO",
    "EM HOLD", "OBSOLETO", "CANCELADO",
]

STATUS_ENTREGA_OPCOES = ["ANTES DO PRAZO", "NO PRAZO", "ATRASADO"]

TIPO_CESSIONARIO_OPCOES = ["Quiosque", "Loja", "Externo", "Outros"]

ETG_OPCOES = ["NÃO", "SIM"]

# ---------------------------------------------------------------------------
# Central de Gestão — Reuniões e Planos de Ação
# ---------------------------------------------------------------------------
STATUS_PLANO_ACAO_OPCOES = ["PENDENTE", "EM ANDAMENTO", "CONCLUÍDO"]
CORES_STATUS_PLANO_ACAO = {
    "PENDENTE": CORES["laranja"],
    "EM ANDAMENTO": CORES["azul_2"],
    "CONCLUÍDO": CORES["verde"],
}

# ---------------------------------------------------------------------------
# Avaliação de Prestadores (aba AVALIAÇÃO_PRESTADORES / LEGENDA)
# ---------------------------------------------------------------------------
FAIXAS_AVALIACAO = [
    (13, 15, "EXCELENTE", "Projeto com alto nível de maturidade e alta probabilidade de liberação total ou parcial na revisão atual. Não demanda acompanhamento especial."),
    (10, 12, "BOM", "Projeto com poucas pendências e bom nível de maturidade. Boa probabilidade de liberação parcial na revisão seguinte. Não demanda acompanhamento especial."),
    (7, 9, "REGULAR", "Projeto em desenvolvimento. Pode demandar acompanhamento próximo para melhor aproveitamento na revisão seguinte."),
    (4, 6, "BAIXO", "Projeto com baixo nível de maturidade. Demanda acompanhamento semanal dos projetistas."),
    (1, 3, "CRÍTICO", "Projeto com baixíssimo nível de maturidade. Demanda alerta ao prestador, cobrança semanal e atenção para possível ciclo extenso de revisões."),
]

CORES_CLASSIFICACAO_AVALIACAO = {
    "EXCELENTE": CORES["verde"],
    "BOM": CORES["lima"],
    "REGULAR": CORES["dourado"],
    "BAIXO": CORES["laranja"],
    "CRÍTICO": CORES["vermelho"],
}

# Checklist de avaliação de Prestadores/Cessionários (15 perguntas Sim/Não/N-A,
# agrupadas nas 5 categorias do modelo Tecnoplano). A pontuação (soma de
# respostas "SIM", 0 a 15) usa as mesmas faixas de FAIXAS_AVALIACAO acima.
CHECKLIST_AVALIACAO = {
    "Qualidade de Projeto": [
        ("qp_projeto_completo", "Projeto completo"),
        ("qp_definicao_solucoes", "Definição clara das soluções"),
        ("qp_qualidade_representacao", "Boa qualidade de representação"),
    ],
    "Manuais e Normas": [
        ("mn_aderencia_manuais", "Aderência aos manuais internos"),
        ("mn_atendimento_normas", "Atendimento às normas técnicas"),
        ("mn_adequacao_levantamento", "Adequação aos materiais de levantamento fornecidos"),
    ],
    "Documentação Geral": [
        ("dg_jogo_completo_mesma_data", "Submissão do jogo completo na mesma data, em PDF e DWG"),
        ("dg_carimbo_codificacao", "Carimbo e codificação conforme procedimento"),
        ("dg_prazo_entre_revisoes", "Prazo razoável entre revisões"),
    ],
    "Revisões": [
        ("rv_atendimento_50pct_at", "Atendimento de pelo menos 50% dos itens da AT"),
        ("rv_compatibilizacao", "Compatibilização entre arquitetura e projetos complementares"),
        ("rv_consistencia_revisoes", "Consistência entre revisões"),
    ],
    "Comunicação": [
        ("cm_participacao_reunioes", "Participação efetiva em reuniões"),
        ("cm_alteracoes_evidenciadas", "Alterações evidenciadas conforme solicitado"),
        ("cm_justificativa_plausivel", "Justificativa plausível para itens não atendidos"),
    ],
}
RESPOSTA_CHECKLIST_OPCOES = ["SIM", "NÃO", "N/A"]
ACOMPANHAMENTO_POR_FAIXA = {
    "EXCELENTE": "Não demanda acompanhamento",
    "BOM": "Não demanda acompanhamento",
    "REGULAR": "Demanda acompanhamento",
    "BAIXO": "Demanda acompanhamento",
    "CRÍTICO": "Demanda atenção e acompanhamento",
}
TIPO_ENTIDADE_AVALIACAO = ["PRESTADOR", "CESSIONARIO"]

# ---------------------------------------------------------------------------
# Avaliação (nota) dos Analistas — módulo restrito, separado da produtividade
# ---------------------------------------------------------------------------
ESCALA_AVALIACAO_ANALISTA = {
    1: "Insuficiente",
    2: "Abaixo do esperado",
    3: "Dentro do esperado",
    4: "Bom",
    5: "Excelente",
}
CRITERIOS_AVALIACAO_ANALISTA = [
    ("etg", "Apontamento de ETG"),
    ("horario", "Cumprimento de horário"),
    ("reunioes", "Comparecimento em reuniões"),
    ("disponibilidade", "Disponibilidade"),
    ("conhecimento_tecnico", "Conhecimento técnico"),
    ("produtividade", "Produtividade"),
    ("qualidade", "Qualidade das análises"),
    ("qtd_documentos", "Quantidade de documentos gerados"),
    ("qtd_ats", "Quantidade de ATs"),
    ("prazos", "Cumprimento de prazos"),
    ("organizacao", "Organização"),
    ("colaboracao", "Colaboração"),
    ("comunicacao", "Comunicação"),
]

PRIORIDADE_OPCOES = ["BAIXA", "NORMAL", "ALTA"]

MESES_PT = [
    "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO",
    "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
]

# ---------------------------------------------------------------------------
# Mapeamento de colunas para exibição/exportação (fiel à planilha original)
# ---------------------------------------------------------------------------
COLUNAS_EXIBICAO_PRESTADORES = {
    "item": "Item",
    "codigo": "Código",
    "prestador": "Prestador de Serviço",
    "disciplina": "Disciplina",
    "disciplina_sla": "Disciplina (SLA)",
    "peps": "PEP'S",
    "situacao_pep": "Situação do PEP",
    "obra_referencia": "Obra de Referência",
    "revisao": "Revisão",
    "num_documentos": "N° de Doc.",
    "data_solicitacao": "Data de Solicitação",
    "data_limite": "Data Limite",
    "data_analise": "Data Análise",
    "hold_inicio": "Hold (Início)",
    "hold_fim": "Hold (Fim)",
    "hold_dias": "Hold (Dias)",
    "dias_uteis_decorridos": "Dias Úteis Decorridos",
    "status_entrega_calc": "Status Entrega",
    "num_at": "N° AT",
    "revisao_at": "REV. AT",
    "responsavel": "Responsável",
    "status_analise": "Status Análise",
    "observacoes": "Observações",
    "natureza_revisao": "Natureza da Revisão",
    "num_erros": "N° de Erros Encontrados",
    "etg": "ETG",
    "categoria_governanca": "Categoria (Governança)",
}

COLUNAS_EXIBICAO_CESSIONARIOS = {
    "item": "Item",
    "codigo": "Código",
    "cessionario": "Cessionário",
    "disciplina": "Disciplina",
    "disciplina_sla": "Disciplina (SLA)",
    "revisao": "Revisão",
    "num_documentos": "N° de Doc.",
    "data_solicitacao": "Data de Solicitação",
    "tipo": "Tipo",
    "luc": "LUC",
    "numero_rci": "N° RCI",
    "numero_rvp": "N° RVP",
    "data_atualizacao_rci": "Data Atualização RCI",
    "data_atualizacao_rvp": "Data Atualização RVP",
    "sla_dias": "SLA (Dias úteis)",
    "data_limite": "Data Limite",
    "data_analise": "Data Análise",
    "hold_inicio": "Hold (Início)",
    "hold_fim": "Hold (Fim)",
    "hold_dias": "Hold (Dias)",
    "saldo_dias_uteis": "Saldo de Dias Úteis",
    "status_entrega_calc": "Status Entrega",
    "num_at": "N° AT",
    "revisao_at": "REV. AT",
    "responsavel": "Responsável",
    "status_analise": "Status Análise",
    "observacoes": "Observações",
    "natureza_revisao": "Natureza da Revisão",
    "num_erros": "N° de Erros Encontrados",
    "etg": "ETG",
    "categoria_governanca": "Categoria (Governança)",
}

COLUNAS_EXIBICAO_AVALIACOES = {
    "codigo_prestador": "Cód. Prestador",
    "nome_prestador": "Nome do Prestador",
    "data_avaliacao": "Data Avaliação",
    "nome_projeto": "Nome do Projeto",
    "at_referencia": "AT de Referência",
    "nota": "Nota (1-15)",
    "classificacao": "Status",
    "analista_responsavel": "Analista Responsável",
    "observacoes": "Observações",
}

# ---------------------------------------------------------------------------
# Perfis de usuário e controle de acesso (módulos e áreas)
# ---------------------------------------------------------------------------
PERFIL_ADMIN = "ADMIN"
PERFIL_GESTOR = "GESTOR"
PERFIL_ANALISTA = "ANALISTA"
PERFIL_CONSULTA = "CONSULTA"
PERFIS_OPCOES = [PERFIL_ADMIN, PERFIL_GESTOR, PERFIL_ANALISTA, PERFIL_CONSULTA]

# Módulos de acesso independente (item 3 do ajuste de governança): quando
# bloqueado, o módulo não aparece no menu, não abre por navegação direta e
# não fornece dados por nenhuma chamada interna do sistema.
MODULOS_CONTROLADOS = ["prestadores", "cessionarios", "consolidado"]
MODULOS_LABELS = {
    "prestadores": "Prestadores de Serviço",
    "cessionarios": "Cessionários",
    "consolidado": "Consolidado",
}

# Áreas/funcionalidades específicas (item 4): permissões binárias adicionais,
# independentes do módulo, cobrindo ações e telas sensíveis do sistema.
AREAS_PERMISSAO = {
    "dashboard": "Visualizar dashboards",
    "prestadores.cadastrar": "Prestadores — Cadastrar projeto",
    "prestadores.editar": "Prestadores — Editar/cancelar projeto",
    "prestadores.exportar": "Prestadores — Exportar dados",
    "prestadores.exportar_completo": "Prestadores — Exportar base completa (sem filtro)",
    "prestadores.cadastro_mestre": "Cadastro de Prestadores — Cadastrar/editar/inativar",
    "cessionarios.cadastrar": "Cessionários — Cadastrar projeto",
    "cessionarios.editar": "Cessionários — Editar/cancelar projeto",
    "cessionarios.exportar": "Cessionários — Exportar dados",
    "cessionarios.exportar_completo": "Cessionários — Exportar base completa (sem filtro)",
    "cessionarios.cadastro_mestre": "Cadastro de Cessionários — Cadastrar/editar/inativar",
    "consolidado.exportar": "Consolidado — Exportar dados",
    "consolidado.exportar_completo": "Consolidado — Exportar base completa (sem filtro)",
    "documentos": "Visualizar documentos",
    "relatorios": "Gerar/exportar relatório Excel geral",
    "avaliacoes.visualizar": "Visualizar avaliações de prestadores",
    "avaliacoes.cadastrar": "Cadastrar avaliações de prestadores",
    "alertas": "Acessar Central de Alertas",
    "alertas.manual": "Alertas manuais — Criar/editar/encerrar",
    "lista_prioridades": "Lista de Prioridades — Visualizar",
    "lista_prioridades.relatorios": "Lista de Prioridades — Gerar relatórios (Word/Excel/PDF)",
    "prioridades.definir": "Prioridades e SLA — Definir Nível de Prioridade / SLA reduzido",
    "lembretes": "Acessar Lembretes (Sem PEP)",
    "reunioes": "Acessar Reuniões e Planos de Ação",
    "analistas": "Analistas — Visualizar módulo e estatísticas",
    "analistas.notas": "Analistas — Visualizar notas/avaliações",
    "analistas.avaliar": "Analistas — Inserir/editar avaliações",
    "analistas.relatorios": "Analistas — Gerar relatórios/exportar",
    "avaliacoes.editar": "Avaliação de Prestadores/Cessionários — Editar",
    "avaliacoes.relatorios": "Avaliação de Prestadores/Cessionários — Relatórios/exportar",
    "opr.prestadores": "OPR — Prestadores",
    "opr.cessionarios": "OPR — Cessionários",
    "opr.consolidado": "OPR — Consolidado",
    "opr.exportar": "OPR — Exportar (PDF/Word)",
    "linha_tempo": "Linha do Tempo — Visualizar/exportar",
    "historico_atividades": "Histórico de Atividades por Login",
    "alertas.consolidado": "Central de Alertas — Visão consolidada (Prestadores + Cessionários)",
    "configuracoes": "Acessar Configurações",
    "auditoria": "Acessar Auditoria",
    "administrar_usuarios": "Administrar usuários",
}

# Áreas sensíveis que, para usuários já existentes (sem uma escolha explícita
# do administrador ainda), começam BLOQUEADAS por padrão — ao contrário do
# comportamento geral do sistema (área sem registro = liberada). Usado na
# migração de backfill em `gat/database.py::init_db`.
AREAS_RESTRITAS_PADRAO_BLOQUEADO = [
    "analistas.notas", "analistas.avaliar", "analistas.relatorios",
    "avaliacoes.editar", "avaliacoes.relatorios",
    "opr.exportar", "historico_atividades", "alertas.consolidado",
]

# Templates padrão de permissão por perfil — usados apenas como ponto de
# partida ao criar um usuário; a partir daí, as permissões viram
# individuais e podem ser livremente editadas pelo administrador (as
# personalizações do usuário sempre prevalecem sobre o perfil de origem).
PERFIS_PADRAO: dict[str, dict[str, dict[str, bool]]] = {
    PERFIL_ADMIN: {
        "modulos": {m: True for m in MODULOS_CONTROLADOS},
        "areas": {a: True for a in AREAS_PERMISSAO},
    },
    PERFIL_GESTOR: {
        "modulos": {m: True for m in MODULOS_CONTROLADOS},
        "areas": {a: True for a in AREAS_PERMISSAO if a != "administrar_usuarios"},
    },
    PERFIL_ANALISTA: {
        "modulos": {m: True for m in MODULOS_CONTROLADOS},
        "areas": {
            "dashboard": True,
            "prestadores.cadastrar": True,
            "prestadores.editar": True,
            "prestadores.exportar": False,
            "prestadores.exportar_completo": False,
            "prestadores.cadastro_mestre": True,
            "cessionarios.cadastrar": True,
            "cessionarios.editar": True,
            "cessionarios.exportar": False,
            "cessionarios.exportar_completo": False,
            "cessionarios.cadastro_mestre": True,
            "consolidado.exportar": False,
            "consolidado.exportar_completo": False,
            "documentos": True,
            "relatorios": False,
            "avaliacoes.visualizar": True,
            "avaliacoes.cadastrar": True,
            "alertas": True,
            "alertas.manual": True,
            "lista_prioridades": True,
            "lista_prioridades.relatorios": True,
            "prioridades.definir": True,
            "lembretes": True,
            "reunioes": True,
            "analistas": True,
            "analistas.notas": False,
            "analistas.avaliar": False,
            "analistas.relatorios": False,
            "avaliacoes.editar": False,
            "avaliacoes.relatorios": False,
            "opr.prestadores": True,
            "opr.cessionarios": True,
            "opr.consolidado": True,
            "opr.exportar": False,
            "linha_tempo": True,
            "historico_atividades": False,
            "alertas.consolidado": False,
            "configuracoes": False,
            "auditoria": False,
            "administrar_usuarios": False,
        },
    },
    PERFIL_CONSULTA: {
        "modulos": {m: True for m in MODULOS_CONTROLADOS},
        "areas": {
            "dashboard": True,
            "prestadores.cadastrar": False,
            "prestadores.editar": False,
            "prestadores.exportar": False,
            "prestadores.exportar_completo": False,
            "prestadores.cadastro_mestre": False,
            "cessionarios.cadastrar": False,
            "cessionarios.editar": False,
            "cessionarios.exportar": False,
            "cessionarios.exportar_completo": False,
            "cessionarios.cadastro_mestre": False,
            "consolidado.exportar": False,
            "consolidado.exportar_completo": False,
            "documentos": True,
            "relatorios": False,
            "avaliacoes.visualizar": True,
            "avaliacoes.cadastrar": False,
            "alertas": True,
            "alertas.manual": False,
            "lista_prioridades": True,
            "lista_prioridades.relatorios": False,
            "prioridades.definir": False,
            "lembretes": True,
            "reunioes": True,
            "analistas": True,
            "analistas.notas": False,
            "analistas.avaliar": False,
            "analistas.relatorios": False,
            "avaliacoes.editar": False,
            "avaliacoes.relatorios": False,
            "opr.prestadores": True,
            "opr.cessionarios": True,
            "opr.consolidado": True,
            "opr.exportar": False,
            "linha_tempo": True,
            "historico_atividades": False,
            "alertas.consolidado": False,
            "configuracoes": False,
            "auditoria": False,
            "administrar_usuarios": False,
        },
    },
}
