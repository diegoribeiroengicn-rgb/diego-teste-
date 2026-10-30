/** "Registrar tratativa" de um projeto em HOLD — porta de
 * gat/ui/modals_hold.py::dialog_tratativa_hold. Confirma o contato com o
 * especialista e decide se o projeto permanece em HOLD ou é retirado
 * (o que encerra o HOLD e recalcula SLA/prazo automaticamente, pois são
 * 100% dinâmicos — ver lib/dias-uteis.ts). */

export const DECISAO_HOLD_OPCOES = ["MANTER", "RETIRADO"] as const;
export type DecisaoHold = (typeof DECISAO_HOLD_OPCOES)[number];

export const LABEL_DECISAO_HOLD: Record<DecisaoHold, string> = {
  MANTER: "Permanece em HOLD",
  RETIRADO: "Retirar do HOLD",
};

export type DadosTratativaHold = {
  especialista: string;
  dataContato: string;
  resolucao: string;
  decisao: DecisaoHold;
};

/** Mesma validação do pop-up original: especialista, data do contato e o
 * registro do que foi resolvido são todos obrigatórios. */
export function validarTratativaHold(dados: DadosTratativaHold): string | null {
  if (!dados.especialista?.trim()) return "Informe o especialista contatado.";
  if (!dados.dataContato) return "Informe a data do contato.";
  if (!dados.resolucao?.trim()) return "O registro do que foi resolvido é obrigatório.";
  return null;
}
