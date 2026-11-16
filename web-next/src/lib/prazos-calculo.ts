import { calcularDataLimite, diasUteisEntre } from "@/lib/dias-uteis";
import { calcularSlaCessionario, SLA_PRESTADORES_DIAS_UTEIS } from "@/lib/analise-validacao-calculo";

/** Regras puras de prazo — SLA CONTRATUAL (gestão) e comparação com a data
 * da planilha. Fonte única: a importação, a prioridade manual, os Gantts e
 * os indicadores usam estas mesmas funções. */

export type TabelaPrazo = "prestadores" | "cessionarios";

/** SLA contratual (dias úteis): Prestadores 10 em todas as revisões;
 * Cessionários — Externo/Loja Rev. 00 = 10, Quiosque = 5, Rev. 01+ = 5. */
export function slaContratual(tabela: TabelaPrazo, tipo: string | null, revisao: number | null): number {
  return tabela === "prestadores" ? SLA_PRESTADORES_DIAS_UTEIS : calcularSlaCessionario(tipo, revisao ?? 0);
}

/** Vencimento contratual (ISO yyyy-mm-dd) = data de solicitação + SLA contratual. */
export function vencimentoContratual(dataSolicitacao: string | null, sla: number): string | null {
  const d = calcularDataLimite(dataSolicitacao, sla);
  return d ? d.toISOString().slice(0, 10) : null;
}

export const STATUS_ABERTOS_PRAZO = ["EM ANÁLISE", "EM HOLD", "RIOGALEÃO"];

export type Divergencia = {
  contratualSla: number;
  vencimentoContratual: string;
  dataPlanilha: string;
  /** Dias úteis entre o vencimento contratual e a data da planilha (negativo = planilha antes do contratual). */
  diferencaDiasUteis: number;
  /** Prazo da planilha em dias úteis contados da entrada. */
  slaPlanilha: number;
};

/** Compara a data de entrega da planilha com o vencimento contratual da
 * linha. Só linhas em aberto, sem HOLD e sem data ajustada manualmente
 * (HOLD/repactuação alteram o prazo por motivo legítimo e não são sinal de
 * prioridade). Devolve `null` quando não há divergência. */
export function detectarDivergencia(linha: {
  tabela: TabelaPrazo; tipo?: string | null; revisao: number | null; data_solicitacao: string | null; data_limite: string | null;
  status_analise: string | null; hold_inicio?: string | null; hold_fim?: string | null;
}): Divergencia | null {
  if (!linha.data_solicitacao || !linha.data_limite) return null;
  if (!STATUS_ABERTOS_PRAZO.includes((linha.status_analise ?? "").toUpperCase())) return null;
  if (linha.hold_inicio || linha.hold_fim) return null;
  const sla = slaContratual(linha.tabela, linha.tipo ?? null, linha.revisao);
  const venc = vencimentoContratual(linha.data_solicitacao, sla);
  const dataPlanilha = linha.data_limite.slice(0, 10);
  if (!venc || venc === dataPlanilha) return null;
  const dif = dataPlanilha >= venc ? diasUteisEntre(venc, dataPlanilha) - 1 : -(diasUteisEntre(dataPlanilha, venc) - 1);
  return {
    contratualSla: sla, vencimentoContratual: venc, dataPlanilha, diferencaDiasUteis: dif,
    slaPlanilha: dataPlanilha >= linha.data_solicitacao.slice(0, 10) ? diasUteisEntre(linha.data_solicitacao, dataPlanilha) : 0,
  };
}

/** Nível 1/2/3 (compatível com a Lista de Prioridades) a partir do SLA operacional. */
export function nivelPorSlaOperacional(sla: number): 1 | 2 | 3 {
  return sla <= 3 ? 1 : sla <= 5 ? 2 : 3;
}

/** Resultado da entrega frente aos dois prazos (gestão). */
export function avaliarEntrega(dataEntrega: string, vencimentoOperacional: string, vencimentoContratualISO: string) {
  return {
    operacionalCumprido: dataEntrega.slice(0, 10) <= vencimentoOperacional.slice(0, 10),
    contratualCumprido: dataEntrega.slice(0, 10) <= vencimentoContratualISO.slice(0, 10),
  };
}
