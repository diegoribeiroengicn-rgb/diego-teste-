/** Validação obrigatória ao salvar uma análise (Prestadores ou
 * Cessionários) — porta exata de gat/ui/validacao_campos.py, compartilhada
 * pelos dois formulários para que nunca divirjam sobre quais campos são
 * obrigatórios nem sobre as mensagens exibidas. */

import { STATUS_ATIVO_ANALISE } from "@/lib/visao-gestor-calculo";
import { STATUS_FINAIS_BAIXA } from "@/lib/resumo-conclusao-calculo";

export const SLA_PRESTADORES_DIAS_UTEIS = 10;
const SLA_CESSIONARIOS_NOVO = 10;
const SLA_CESSIONARIOS_REVISAO = 5;

/** SLA padrão (dias úteis) de uma análise de cessionário, por tipo de
 * operação e revisão — mesma regra de
 * gat/business_rules.py::calcular_sla_cessionario (via meus-alertas.ts,
 * reaproduzida aqui para o formulário de cadastro/edição). */
export function calcularSlaCessionario(tipo: string | null, revisao: number): number {
  if (tipo === "Quiosque") return SLA_CESSIONARIOS_REVISAO;
  if (revisao === 0 && (tipo === "Loja" || tipo === "Externo")) return SLA_CESSIONARIOS_NOVO;
  return SLA_CESSIONARIOS_REVISAO;
}

/** Status para os quais a AT passa a ser exigida quando a análise SAI de
 * "EM ANÁLISE" diretamente para um deles — é nesse momento que a AT
 * (documento formal de retorno ao prestador/cessionário) passa a existir
 * de fato. */
const STATUS_EXIGEM_AT = new Set(["NÃO LIBERADO", "LIBERADO C/ REST.", "LIBERADO"]);

/** N° AT só é obrigatório numa transição específica: o status ANTERIOR
 * era "EM ANÁLISE" e o NOVO é um dos status finais que geram AT. Sem
 * mudança de status, ou permanecendo em "EM ANÁLISE", ou indo para
 * qualquer outro status (EM HOLD, OBSOLETO, CANCELADO...), a AT não é
 * cobrada. Um cadastro NOVO (sem `statusAnterior`) é tratado como se
 * tivesse partido de "EM ANÁLISE". */
export function atObrigatorio(statusAnterior: string | null, statusAnalise: string | null): boolean {
  const anterior = (statusAnterior || "EM ANÁLISE").trim().toUpperCase();
  const novo = (statusAnalise || "").trim().toUpperCase();
  if (anterior === novo) return false;
  if (anterior !== "EM ANÁLISE") return false;
  return STATUS_EXIGEM_AT.has(novo);
}

export type ErrosAnalise = Partial<{ at: string; status: string; data: string }>;

function ehStatusFinalResumo(status: string | null): boolean {
  return !!status && (STATUS_FINAIS_BAIXA as readonly string[]).includes(status.trim().toUpperCase());
}

/** Retorna um objeto {campo: mensagem} apenas para os campos que
 * falharem — objeto vazio significa que está tudo certo. Chaves
 * possíveis: "at", "status", "data". `statusAnterior` (status ANTES
 * desta edição — null/omitido para um cadastro novo) decide se a AT é
 * exigida (ver `atObrigatorio`). Mesma regra de
 * gat/ui/validacao_campos.py::validar_at_data_status. */
export function validarAtDataStatus(
  numAt: string | null, dataAnalise: string | null, statusAnalise: string | null,
  holdInicio: string | null, holdFim: string | null, statusAnterior: string | null = null,
): ErrosAnalise {
  const erros: ErrosAnalise = {};
  if (atObrigatorio(statusAnterior, statusAnalise) && !(numAt || "").trim()) {
    erros.at = "Informe o número da AT antes de salvar (obrigatório ao liberar/não liberar a partir de \"Em Análise\").";
  }
  const statusNormalizado = (statusAnalise || "").trim().toUpperCase();
  if (dataAnalise && STATUS_ATIVO_ANALISE.has(statusNormalizado)) {
    erros.status = "Informe o status da análise antes de salvar.";
  }
  if (ehStatusFinalResumo(statusAnalise) && !dataAnalise) {
    erros.data = "Informe a data correspondente antes de salvar.";
  }
  const holdAberto = !!holdInicio && !holdFim;
  if (holdAberto && statusNormalizado === "EM ANÁLISE" && !erros.status) {
    erros.status = "Há um Hold em aberto — defina o Status Análise como EM HOLD ou preencha o Fim de Hold.";
  }
  return erros;
}

/** Mensagem única a exibir: a específica do campo quando só um está
 * errado, ou uma mensagem geral quando há mais de um. */
export function mensagemErros(erros: ErrosAnalise): string {
  const valores = Object.values(erros);
  if (valores.length > 1) return "Preencha os campos destacados antes de salvar.";
  return valores[0] ?? "";
}
