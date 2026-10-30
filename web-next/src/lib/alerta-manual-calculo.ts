/** Alertas Manuais (Central de Alertas) — alertas criados livremente por
 * um usuário para um projeto de Prestador ou Cessionário, independentes
 * dos alertas automáticos do motor de gargalo/atraso. Mesma regra de
 * gat/database.py::criar_alerta_manual (tabela `alertas_manuais`,
 * também já usada pelo PMO em lib/pmo.ts com `modulo = "pmo"`). */

export const PRIORIDADE_ALERTA_MANUAL_OPCOES = ["Baixa", "Média", "Alta", "Urgente"] as const;
export type PrioridadeAlertaManual = (typeof PRIORIDADE_ALERTA_MANUAL_OPCOES)[number];

export const STATUS_ALERTA_MANUAL_OPCOES = ["ABERTO", "ENCERRADO"] as const;
export type StatusAlertaManual = (typeof STATUS_ALERTA_MANUAL_OPCOES)[number];

export const CAMPOS_ALERTA_MANUAL = [
  "modulo", "projeto_id", "titulo", "descricao", "num_at", "codigo_projeto",
  "nome_entidade", "disciplina", "revisao", "especialista", "prioridade",
  "vencimento", "observacoes", "destinatarios",
] as const;

export type DadosAlertaManual = {
  modulo: "prestadores" | "cessionarios";
  projeto_id: number | null;
  titulo: string;
  descricao: string | null;
  num_at: string | null;
  codigo_projeto: string | null;
  nome_entidade: string;
  disciplina: string | null;
  revisao: number | null;
  especialista: string | null;
  prioridade: PrioridadeAlertaManual;
  vencimento: string | null;
  observacoes: string | null;
  destinatarios: string | null;
};

/** Mesma validação do pop-up original (gat/ui/modals_alerta_manual.py) —
 * título e o nome da entidade (Prestador/Cessionário) são obrigatórios. */
export function validarAlertaManual(dados: Pick<DadosAlertaManual, "titulo" | "nome_entidade" | "modulo">): string | null {
  if (!dados.titulo?.trim()) return "O título é obrigatório.";
  if (!dados.nome_entidade?.trim()) {
    return `O campo ${dados.modulo === "prestadores" ? "Prestador" : "Cessionário"} é obrigatório.`;
  }
  return null;
}
