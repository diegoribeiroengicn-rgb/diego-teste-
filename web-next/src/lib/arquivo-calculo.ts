import { PERFIL_ADMIN, PERFIL_CONSULTA, PERFIL_GESTOR } from "@/lib/administracao-calculo";

export const TIPO_ARQUIVAMENTO = "ARQUIVAMENTO";
export const TIPO_RESTAURACAO = "RESTAURACAO";
export const TIPO_EXCLUSAO = "EXCLUSAO_DEFINITIVA";

export const ORIGEM_GAT = "GAT";
export const ORIGEM_PMO = "PMO";

export type Granularidade = "registro" | "projeto_codigo";

export type CategoriaArquivo = {
  chave: string;
  rotulo: string;
  tabela: string | null;
  origem: string | null;
  granularidade: Granularidade;
  reservada: boolean;
  mensagemReservada: string;
};

/** Mesma lista de gat/arquivo_business_rules.py::CATEGORIAS — "Reuniões
 * Arquivadas" e "Planos de Ação Arquivadas" ficam de fora: toda a área
 * de Reuniões/Planos de Ação foi retirada do sistema (decisão já
 * aplicada em todo o restante da migração). As categorias de PMO
 * (pmo_projetos, documentos) continuam na lista — as tabelas já
 * existem no banco compartilhado — mas ficam sempre vazias até o
 * módulo PMO ser portado para o Next.js. */
export const CATEGORIAS: CategoriaArquivo[] = [
  { chave: "pmo_projetos", rotulo: "Projetos PMO Arquivados", tabela: "pmo_projetos", origem: ORIGEM_PMO, granularidade: "registro", reservada: false, mensagemReservada: "" },
  { chave: "projetos_gat", rotulo: "Projetos GAT Arquivados", tabela: null, origem: ORIGEM_GAT, granularidade: "projeto_codigo", reservada: false, mensagemReservada: "" },
  { chave: "analises", rotulo: "Análises Arquivadas", tabela: null, origem: ORIGEM_GAT, granularidade: "registro", reservada: false, mensagemReservada: "" },
  { chave: "analistas", rotulo: "Analistas Arquivados", tabela: "usuarios", origem: null, granularidade: "registro", reservada: false, mensagemReservada: "" },
  { chave: "prestadores", rotulo: "Prestadores Arquivados", tabela: "cadastro_prestadores", origem: ORIGEM_GAT, granularidade: "registro", reservada: false, mensagemReservada: "" },
  { chave: "cessionarios", rotulo: "Cessionários Arquivados", tabela: "cadastro_cessionarios", origem: ORIGEM_GAT, granularidade: "registro", reservada: false, mensagemReservada: "" },
  {
    chave: "projetistas", rotulo: "Projetistas Arquivados", tabela: null, origem: null, granularidade: "registro", reservada: true,
    mensagemReservada: "O sistema ainda não possui um cadastro próprio de Projetista — a avaliação do projetista é registrada dentro da avaliação do Cessionário. Esta categoria ficará disponível assim que esse cadastro for criado.",
  },
  { chave: "alertas", rotulo: "Alertas Arquivados", tabela: "alertas_manuais", origem: null, granularidade: "registro", reservada: false, mensagemReservada: "" },
  {
    chave: "relatorios", rotulo: "Relatórios Arquivados", tabela: null, origem: null, granularidade: "registro", reservada: true,
    mensagemReservada: "Os relatórios do GAT e do PMO são gerados sob demanda (Word/Excel) e não ficam salvos no banco de dados — não há, portanto, um registro persistente para arquivar. Esta categoria ficará disponível caso o sistema passe a guardar relatórios gerados.",
  },
  { chave: "documentos", rotulo: "Documentos Arquivados", tabela: "pmo_cronograma_arquivos", origem: ORIGEM_PMO, granularidade: "registro", reservada: false, mensagemReservada: "" },
  { chave: "outros", rotulo: "Outros Registros Arquivados", tabela: null, origem: null, granularidade: "registro", reservada: true, mensagemReservada: "Reservado para uso futuro." },
];

export const TABELAS_ARQUIVAVEIS = [
  "pmo_projetos", "prestadores", "cessionarios", "cadastro_prestadores",
  "cadastro_cessionarios", "usuarios", "alertas_manuais", "pmo_cronograma_arquivos",
];

/** Todo perfil operacional acessa o módulo Arquivo, exceto Consulta.
 * Mesma regra de gat/arquivo_business_rules.py::perfil_pode_acessar_arquivo. */
export function perfilPodeAcessarArquivo(perfil: string): boolean {
  return perfil !== PERFIL_CONSULTA;
}

export function perfilPodeArquivarERestaurar(perfil: string): boolean {
  return perfil !== PERFIL_CONSULTA;
}

/** Exclusão definitiva: exclusiva de Administrador e Gestor. */
export function perfilPodeExcluirDefinitivamente(perfil: string): boolean {
  return perfil === PERFIL_ADMIN || perfil === PERFIL_GESTOR;
}

const COLUNAS_EXIBICAO: Record<string, string[]> = {
  pmo_projetos: ["nome", "cliente", "contratada"],
  prestadores: ["codigo", "prestador", "num_at", "revisao_at"],
  cessionarios: ["codigo", "cessionario", "num_at", "revisao_at"],
  cadastro_prestadores: ["codigo", "nome_empresa"],
  cadastro_cessionarios: ["codigo", "nome_empresa"],
  usuarios: ["username", "nome_completo", "perfil"],
  alertas_manuais: ["titulo", "codigo_projeto"],
  pmo_cronograma_arquivos: ["nome_arquivo", "formato"],
};

/** Descrição legível de um registro arquivado a partir dos campos mais
 * relevantes da tabela — mesma regra de views/arquivo.py::_descricao_linha. */
export function descricaoLinha(tabela: string, linha: Record<string, unknown>): string {
  const campos = COLUNAS_EXIBICAO[tabela] ?? [];
  const partes = campos.map((c) => linha[c]).filter((v) => v !== null && v !== undefined && v !== "").map(String);
  return partes.length ? partes.join(" — ") : `${tabela} #${linha.id ?? ""}`;
}

export type RegistroArquivado = Record<string, unknown> & {
  id: number;
  arquivado_em: string | null;
  arquivado_por: string | null;
  motivo_arquivamento: string | null;
  arquivado_teste: boolean | number | null;
};

export type FiltrosArquivo = {
  texto: string;
  usuarioFiltro: string;
  apenasTeste: boolean;
  dataDe: string | null;
  dataAte: string | null;
};

/** Mesma regra de views/arquivo.py::_aplicar_filtros. */
export function aplicarFiltrosArquivo<T extends RegistroArquivado>(linhas: T[], filtros: FiltrosArquivo): T[] {
  let resultado = linhas;
  const texto = filtros.texto.trim().toLowerCase();
  if (texto) {
    resultado = resultado.filter((l) => Object.values(l).some((v) => v != null && String(v).toLowerCase().includes(texto)));
  }
  const usuarioFiltro = filtros.usuarioFiltro.trim().toLowerCase();
  if (usuarioFiltro) {
    resultado = resultado.filter((l) => (String(l.arquivado_por ?? "")).toLowerCase().includes(usuarioFiltro));
  }
  if (filtros.apenasTeste) {
    resultado = resultado.filter((l) => !!l.arquivado_teste);
  }
  if (filtros.dataDe) {
    resultado = resultado.filter((l) => !!l.arquivado_em && String(l.arquivado_em).slice(0, 10) >= filtros.dataDe!);
  }
  if (filtros.dataAte) {
    resultado = resultado.filter((l) => !!l.arquivado_em && String(l.arquivado_em).slice(0, 10) <= filtros.dataAte!);
  }
  return resultado;
}
