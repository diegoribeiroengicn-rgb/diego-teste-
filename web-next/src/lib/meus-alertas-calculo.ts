export type SituacaoPrazo = "ATRASADO" | "VENCE HOJE" | "VENCE EM BREVE";
export type Prioridade = "Alta" | "Média" | "Baixa";

const LIMIAR_VENCE_EM_BREVE = 2;

/** Mesma classificação usada em Projetos/Dashboards/Lista de Prioridades
 * (gat/business_rules.py::situacao_prazo), restrita aqui às 3 situações
 * alertáveis — "dentro do prazo" nunca vira alerta pessoal. */
export function situacaoPrazoAlertavel(diasRestantes: number): SituacaoPrazo | null {
  if (diasRestantes < 0) return "ATRASADO";
  if (diasRestantes === 0) return "VENCE HOJE";
  if (diasRestantes <= LIMIAR_VENCE_EM_BREVE) return "VENCE EM BREVE";
  return null;
}

/** Alta — vencido ou vence hoje; Média — vence amanhã (1 dia útil);
 * Baixa — vence em 2 dias úteis. Mesma regra de
 * gat/alertas_pessoais.py::_prioridade_prazo. */
export function prioridadePrazo(diasRestantes: number): Prioridade {
  if (diasRestantes <= 0) return "Alta";
  if (diasRestantes === 1) return "Média";
  return "Baixa";
}

export type Origem = "prestadores" | "cessionarios";

export type AlertaPrazo = {
  chave: string;
  origem: Origem;
  projetoId: number;
  codigo: string | null;
  nomeEntidade: string | null;
  disciplina: string | null;
  numAt: string | null;
  dataLimite: string | null;
  situacaoPrazo: SituacaoPrazo;
  diasRestantes: number;
  prioridade: Prioridade;
};

export type AlertaManual = {
  chave: string;
  id: number;
  origem: Origem;
  titulo: string;
  descricao: string | null;
  observacoes: string | null;
  numAt: string | null;
  codigoProjeto: string | null;
  nomeEntidade: string | null;
  prioridade: string | null;
  criadoPor: string;
  criadoEm: string;
  atualizadoPor: string | null;
  atualizadoEm: string | null;
};

const ORDEM_PRIORIDADE: Record<Prioridade, number> = { Alta: 0, Média: 1, Baixa: 2 };

export function ordenarAlertasPrazo(alertas: AlertaPrazo[]): AlertaPrazo[] {
  return [...alertas].sort(
    (a, b) => ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade] || a.diasRestantes - b.diasRestantes,
  );
}

export function listaDestinatarios(valor: string | null): string[] {
  return (valor || "").split(",").map((d) => d.trim()).filter(Boolean);
}
