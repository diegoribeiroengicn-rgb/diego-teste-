"""
Configurações globais do Sistema GAT 2026 - Tecnoplano.

Concentra constantes de negócio, listas suspensas (extraídas da aba
LISTA_SUSPENSA da planilha oficial "Controle_GAT_Projetos_2026.xlsm") e a
paleta de cores institucional (extraída do dashboard HTML de referência
"dashboard_GAT_tecnoplano_Prestador_v5.html"), para que todo o sistema
utilize uma única fonte de verdade.
"""

from pathlib import Path

# ---------------------------------------------------------------------------
# Caminhos do projeto
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

DB_PATH = DATA_DIR / "gat_tecnoplano.db"
SEED_DB_PATH = DATA_DIR / "seed_gat_tecnoplano.db"
LOGO_PATH = BASE_DIR / "assets" / "tecnoplano_logo.png"

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
    "pep": "PEP",
    "situacao_pep": "Situação do PEP",
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
    "cessionarios.cadastrar": "Cessionários — Cadastrar projeto",
    "cessionarios.editar": "Cessionários — Editar/cancelar projeto",
    "cessionarios.exportar": "Cessionários — Exportar dados",
    "consolidado.exportar": "Consolidado — Exportar dados",
    "documentos": "Visualizar documentos",
    "relatorios": "Gerar/exportar relatório Excel geral",
    "avaliacoes.visualizar": "Visualizar avaliações de prestadores",
    "avaliacoes.cadastrar": "Cadastrar avaliações de prestadores",
    "alertas": "Acessar Central de Alertas",
    "lembretes": "Acessar Lembretes (Sem PEP)",
    "reunioes": "Acessar Reuniões e Planos de Ação",
    "analistas": "Acessar dados dos analistas (desempenho/avaliação)",
    "configuracoes": "Acessar Configurações",
    "auditoria": "Acessar Auditoria",
    "administrar_usuarios": "Administrar usuários",
}

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
            "cessionarios.cadastrar": True,
            "cessionarios.editar": True,
            "cessionarios.exportar": False,
            "consolidado.exportar": False,
            "documentos": True,
            "relatorios": False,
            "avaliacoes.visualizar": True,
            "avaliacoes.cadastrar": True,
            "alertas": True,
            "lembretes": True,
            "reunioes": True,
            "analistas": True,
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
            "cessionarios.cadastrar": False,
            "cessionarios.editar": False,
            "cessionarios.exportar": False,
            "consolidado.exportar": False,
            "documentos": True,
            "relatorios": False,
            "avaliacoes.visualizar": True,
            "avaliacoes.cadastrar": False,
            "alertas": True,
            "lembretes": True,
            "reunioes": True,
            "analistas": True,
            "configuracoes": False,
            "auditoria": False,
            "administrar_usuarios": False,
        },
    },
}
