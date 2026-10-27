export const PERFIL_ADMIN = "ADMIN";
export const PERFIL_GESTOR = "GESTOR";
export const PERFIL_ANALISTA = "ANALISTA";
export const PERFIL_CONSULTA = "CONSULTA";
export const PERFIS_OPCOES = [PERFIL_ADMIN, PERFIL_GESTOR, PERFIL_ANALISTA, PERFIL_CONSULTA];

export const RESPONSAVEIS = [
  "ALLINE", "DIEGO", "FÁTIMA", "GABRIEL", "INEZ", "JEFFERSON",
  "JESSICA BANDEIRA", "JESSICA NAPOLEÃO", "LEONARDO", "LETÍCIA",
  "MATHEUS", "MAYRON", "RIOGALEÃO", "THAINÁ NOBRE", "VIRGINIA", "WESLEY",
];

export const DISCIPLINAS = [
  "ELÉTRICA", "TELEMÁTICA", "HIDRÁULICA", "ESGOTO", "ARQUITETURA", "SOM",
  "AR CONDICIONADO", "HIDROSSANTÁRIO", "ESTRUTURA", "INCÊNDIO", "SDAI",
  "COMBATE A INCÊNDIO", "ESTRUTURA (MC)", "HIDROSSANITÁRIO",
  "TELECOM / ESPECIAIS", "SPDA", "ÁGUAS PLUVIAIS", "CERCAMENTO",
  "TELEFONIA", "TELEMATICA", "PAISAGISMO", "SINALIZAÇÃO VERTICAL",
  "SINALIZAÇÃO HORIZONTAL", "PAVIMENTAÇÃO", "GEOMÉTRICO", "EXAUSTÃO",
  "HVAC", "GERAL", "DRENAGEM",
];

/** Mesma lista de views/administracao.py::_TIPOS_HISTORICO — "reunioes"
 * e "planos_acao" nunca têm linhas (área cortada do sistema), mas a
 * opção de filtro continua existindo para não quebrar quem já viu o
 * Streamlit. */
export const TIPOS_HISTORICO = ["Todas", "prestadores", "cessionarios", "reunioes", "planos_acao", "seguranca"];

/** Módulos de acesso independente — quando bloqueado, o módulo não
 * aparece no menu, não abre por navegação direta e não fornece dados.
 * Mesma lista de gat/config.py::MODULOS_CONTROLADOS. */
export const MODULOS_CONTROLADOS = ["prestadores", "cessionarios", "consolidado"] as const;
export const MODULOS_LABELS: Record<string, string> = {
  prestadores: "Prestadores de Serviço",
  cessionarios: "Cessionários",
  consolidado: "Consolidado",
};

/** Mesma lista de gat/config.py::AREAS_PERMISSAO. */
export const AREAS_PERMISSAO: Record<string, string> = {
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
  "manual_sistema": "Manual do Sistema — Consultar",
  "manual_sistema.administrar": "Manual do Sistema — Editar/publicar/administrar",
  "lembretes": "Acessar Lembretes (Sem PEP)",
  "reunioes": "Acessar Reuniões e Planos de Ação",
  "analistas": "Analistas — Visualizar módulo e estatísticas",
  "analistas.notas": "Analistas — Visualizar notas/avaliações",
  "analistas.avaliar": "Analistas — Inserir/editar avaliações",
  "analistas.relatorios": "Analistas — Gerar relatórios/exportar",
  "analistas.kpis_prazo": "Analistas — KPIs de prazo (próprios, se Analista; da equipe, se Gestor/Admin)",
  "analistas.kpis_prazo.consolidado": "Analistas — KPIs de prazo, indicadores consolidados da equipe",
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
  "visao_gestor": "Visão do Gestor — Painel executivo diário da equipe (Gestor/Administrador)",
  "pmo": "PMO — Acessar Portfólio de Projetos e páginas de projeto",
  "pmo.cadastrar": "PMO — Cadastrar novo projeto",
  "arquivo": "Arquivo — Acessar o módulo de arquivamento/restauração de registros",
  "localizacao_ats": "Localização de ATs — Consultar",
};

export type PermissoesTemplate = { modulos: Record<string, boolean>; areas: Record<string, boolean> };

const AREAS_ANALISTA: Record<string, boolean> = {
  dashboard: true, "prestadores.cadastrar": true, "prestadores.editar": true, "prestadores.exportar": false,
  "prestadores.exportar_completo": false, "prestadores.cadastro_mestre": true, "cessionarios.cadastrar": true,
  "cessionarios.editar": true, "cessionarios.exportar": false, "cessionarios.exportar_completo": false,
  "cessionarios.cadastro_mestre": true, "consolidado.exportar": false, "consolidado.exportar_completo": false,
  documentos: true, relatorios: false, "avaliacoes.visualizar": true, "avaliacoes.cadastrar": true,
  alertas: true, "alertas.manual": true, lista_prioridades: true, "lista_prioridades.relatorios": true,
  "prioridades.definir": true, manual_sistema: true, "manual_sistema.administrar": false, lembretes: true,
  reunioes: true, analistas: true, "analistas.notas": false, "analistas.avaliar": false, "analistas.relatorios": false,
  "analistas.kpis_prazo": true, "analistas.kpis_prazo.consolidado": false, visao_gestor: false, pmo: false,
  "pmo.cadastrar": false, arquivo: true, "avaliacoes.editar": false, "avaliacoes.relatorios": false,
  "opr.prestadores": true, "opr.cessionarios": true, "opr.consolidado": true, "opr.exportar": false,
  linha_tempo: true, historico_atividades: false, "alertas.consolidado": false, configuracoes: false,
  auditoria: false, administrar_usuarios: false, localizacao_ats: true,
};

const AREAS_CONSULTA: Record<string, boolean> = {
  dashboard: true, "prestadores.cadastrar": false, "prestadores.editar": false, "prestadores.exportar": false,
  "prestadores.exportar_completo": false, "prestadores.cadastro_mestre": false, "cessionarios.cadastrar": false,
  "cessionarios.editar": false, "cessionarios.exportar": false, "cessionarios.exportar_completo": false,
  "cessionarios.cadastro_mestre": false, "consolidado.exportar": false, "consolidado.exportar_completo": false,
  documentos: true, relatorios: false, "avaliacoes.visualizar": true, "avaliacoes.cadastrar": false,
  alertas: true, "alertas.manual": false, lista_prioridades: true, "lista_prioridades.relatorios": false,
  "prioridades.definir": false, manual_sistema: true, "manual_sistema.administrar": false, lembretes: true,
  reunioes: true, analistas: true, "analistas.notas": false, "analistas.avaliar": false, "analistas.relatorios": false,
  "analistas.kpis_prazo": false, "analistas.kpis_prazo.consolidado": false, visao_gestor: false, pmo: false,
  "pmo.cadastrar": false, arquivo: false, "avaliacoes.editar": false, "avaliacoes.relatorios": false,
  "opr.prestadores": true, "opr.cessionarios": true, "opr.consolidado": true, "opr.exportar": false,
  linha_tempo: true, historico_atividades: false, "alertas.consolidado": false, configuracoes: false,
  auditoria: false, administrar_usuarios: false, localizacao_ats: true,
};

/** Templates padrão de permissão por perfil — usados apenas como ponto
 * de partida ao criar um usuário; a partir daí as permissões viram
 * individuais. Mesma regra de gat/config.py::PERFIS_PADRAO. */
export const PERFIS_PADRAO: Record<string, PermissoesTemplate> = {
  [PERFIL_ADMIN]: {
    modulos: Object.fromEntries(MODULOS_CONTROLADOS.map((m) => [m, true])),
    areas: Object.fromEntries(Object.keys(AREAS_PERMISSAO).map((a) => [a, true])),
  },
  [PERFIL_GESTOR]: {
    modulos: Object.fromEntries(MODULOS_CONTROLADOS.map((m) => [m, true])),
    areas: Object.fromEntries(Object.keys(AREAS_PERMISSAO).map((a) => [a, a !== "administrar_usuarios"])),
  },
  [PERFIL_ANALISTA]: {
    modulos: Object.fromEntries(MODULOS_CONTROLADOS.map((m) => [m, true])),
    areas: AREAS_ANALISTA,
  },
  [PERFIL_CONSULTA]: {
    modulos: Object.fromEntries(MODULOS_CONTROLADOS.map((m) => [m, true])),
    areas: AREAS_CONSULTA,
  },
};

/** Agrupamento de áreas exibidas no editor de permissões — mesma
 * curadoria (deliberadamente parcial) de gat/ui/modals_usuarios.py::
 * _GRUPOS_AREA; áreas mais novas/restritas (ex.: analistas.notas,
 * visao_gestor, pmo, arquivo) não aparecem aqui no Python original —
 * seu valor de origem vem só do template do perfil na criação do
 * usuário, editável apenas por alteração direta no banco. */
export const GRUPOS_AREA: [string, string[]][] = [
  ["Prestadores", ["prestadores.cadastrar", "prestadores.editar", "prestadores.exportar"]],
  ["Cessionários", ["cessionarios.cadastrar", "cessionarios.editar", "cessionarios.exportar"]],
  ["Consolidado", ["consolidado.exportar"]],
  ["Geral", ["dashboard", "documentos", "relatorios", "avaliacoes.visualizar", "avaliacoes.cadastrar", "analistas"]],
  ["Gestão", ["alertas", "lembretes", "reunioes"]],
  ["Sistema", ["configuracoes", "auditoria", "administrar_usuarios"]],
];
