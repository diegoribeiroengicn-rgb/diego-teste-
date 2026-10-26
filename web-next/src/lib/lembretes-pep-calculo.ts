export const CRITICIDADE_INFORMATIVO = "INFORMATIVO";
export const CRITICIDADE_ATENCAO = "ATENÇÃO";
export const CRITICIDADE_CRITICO = "CRÍTICO";

export type Criticidade = typeof CRITICIDADE_INFORMATIVO | typeof CRITICIDADE_ATENCAO | typeof CRITICIDADE_CRITICO;

/** Classifica a criticidade de um projeto sem PEP conforme limiares (em
 * dias corridos) parametrizáveis via Administração — mesma regra de
 * gat/business_rules.py::criticidade_pep. */
export function criticidadePep(diasSemPep: number, diasAtencao: number, diasCritico: number): Criticidade {
  if (diasSemPep >= diasCritico) return CRITICIDADE_CRITICO;
  if (diasSemPep >= diasAtencao) return CRITICIDADE_ATENCAO;
  return CRITICIDADE_INFORMATIVO;
}

export type LembretePep = {
  id: number;
  item: number | null;
  codigo: string | null;
  nome: string | null;
  disciplina: string | null;
  numAt: string | null;
  responsavel: string | null;
  dataSolicitacao: string | null;
  diasSemPep: number;
  criticidade: Criticidade;
};
