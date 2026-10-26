import { diasUteisEntre, paraData } from "@/lib/dias-uteis";

const STATUS_CONCLUIDO_ENTREGA = new Set(["LIBERADO", "LIBERADO C/ REST.", "NÃO LIBERADO"]);

export const CLASSIFICACAO_ANTES_PRAZO = "ANTES_DO_PRAZO";
export const CLASSIFICACAO_NO_DIA = "NO_DIA";
export const CLASSIFICACAO_COM_ATRASO = "COM_ATRASO";

export type ClassificacaoEntrega =
  | typeof CLASSIFICACAO_ANTES_PRAZO
  | typeof CLASSIFICACAO_NO_DIA
  | typeof CLASSIFICACAO_COM_ATRASO;

export const LABEL_CLASSIFICACAO: Record<ClassificacaoEntrega, string> = {
  [CLASSIFICACAO_ANTES_PRAZO]: "Antes do prazo",
  [CLASSIFICACAO_NO_DIA]: "No dia",
  [CLASSIFICACAO_COM_ATRASO]: "Com atraso",
};

export type Origem = "prestadores" | "cessionarios";

export type LinhaPrazo = {
  id: number;
  origem: Origem;
  responsavel: string;
  disciplina: string;
  revisao: number | null;
  numAt: string | null;
  statusAnalise: string;
  dataSolicitacao: string | null;
  dataLimite: string | null;
  dataAnalise: string | null;
  emHold: boolean;
  diasRestantes: number | null;
  classificacaoEntrega: ClassificacaoEntrega | null;
  diasUteisDiferenca: number | null;
  ativaAtrasada: boolean;
  vence2Dias: boolean;
};

/** Comparação direta de datas (calendário, não dias úteis) entre a Data
 * Prevista (data_limite) e a Data Efetiva (data_analise) — só se aplica a
 * análises já concluídas. Mesma regra de
 * gat/kpis_analistas_prazo.py::_classificar_entrega_prazo. */
export function classificarEntregaPrazo(dataLimite: string | null, dataAnalise: string | null): ClassificacaoEntrega | null {
  const lim = paraData(dataLimite);
  const ana = paraData(dataAnalise);
  if (!lim || !ana) return null;
  if (ana.getTime() < lim.getTime()) return CLASSIFICACAO_ANTES_PRAZO;
  if (ana.getTime() === lim.getTime()) return CLASSIFICACAO_NO_DIA;
  return CLASSIFICACAO_COM_ATRASO;
}

/** Dias úteis de antecipação (negativo) ou atraso (positivo) entre a data
 * prevista e a efetiva — 0 quando caem no mesmo dia. Mesma regra de
 * gat/kpis_analistas_prazo.py::_dias_uteis_diferenca. */
export function diasUteisDiferenca(dataLimite: string | null, dataAnalise: string | null): number | null {
  const lim = paraData(dataLimite);
  const ana = paraData(dataAnalise);
  if (!lim || !ana) return null;
  if (ana.getTime() === lim.getTime()) return 0;
  const dias = diasUteisEntre(dataLimite, dataAnalise);
  return dias > 0 ? dias - 1 : dias + 1;
}

export function statusConcluidoEntrega(statusAnalise: string): boolean {
  return STATUS_CONCLUIDO_ENTREGA.has(statusAnalise);
}

export type KpisPrazoAnalista = {
  totalEntregue: number;
  antesPrazo: number;
  noDia: number;
  comAtraso: number;
  pctAntesPrazo: number;
  pctNoDia: number;
  pctAtraso: number;
  pctCumprimentoPrazo: number;
  mediaDiasAntecipacao: number;
  mediaDiasAtraso: number;
  atrasadosEmAnalise: number;
  vencem2DiasUteis: number;
  emHold: number;
};

function kpisVazio(): KpisPrazoAnalista {
  return {
    totalEntregue: 0, antesPrazo: 0, noDia: 0, comAtraso: 0,
    pctAntesPrazo: 0, pctNoDia: 0, pctAtraso: 0, pctCumprimentoPrazo: 0,
    mediaDiasAntecipacao: 0, mediaDiasAtraso: 0,
    atrasadosEmAnalise: 0, vencem2DiasUteis: 0, emHold: 0,
  };
}

function media(valores: number[]): number {
  if (!valores.length) return 0;
  return Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 10) / 10;
}

function pct(parte: number, total: number): number {
  return total ? Math.round((parte / total) * 1000) / 10 : 0;
}

/** Indicadores de prazo de um analista (ou de toda a base filtrada quando
 * `analista` é omitido — visão consolidada da equipe). Mesma regra de
 * gat/kpis_analistas_prazo.py::calcular_kpis_prazo_analista. */
export function calcularKpisPrazoAnalista(linhas: LinhaPrazo[], analista?: string | null): KpisPrazoAnalista {
  const sub = analista ? linhas.filter((l) => l.responsavel === analista) : linhas;
  if (!sub.length) return kpisVazio();

  const concluidos = sub.filter((l) => l.classificacaoEntrega != null);
  const antes = concluidos.filter((l) => l.classificacaoEntrega === CLASSIFICACAO_ANTES_PRAZO);
  const noDia = concluidos.filter((l) => l.classificacaoEntrega === CLASSIFICACAO_NO_DIA);
  const atraso = concluidos.filter((l) => l.classificacaoEntrega === CLASSIFICACAO_COM_ATRASO);
  const total = concluidos.length;

  return {
    totalEntregue: total,
    antesPrazo: antes.length,
    noDia: noDia.length,
    comAtraso: atraso.length,
    pctAntesPrazo: pct(antes.length, total),
    pctNoDia: pct(noDia.length, total),
    pctAtraso: pct(atraso.length, total),
    pctCumprimentoPrazo: pct(antes.length + noDia.length, total),
    mediaDiasAntecipacao: media(antes.map((l) => -(l.diasUteisDiferenca ?? 0))),
    mediaDiasAtraso: media(atraso.map((l) => l.diasUteisDiferenca ?? 0)),
    atrasadosEmAnalise: sub.filter((l) => l.ativaAtrasada).length,
    vencem2DiasUteis: sub.filter((l) => l.vence2Dias).length,
    emHold: sub.filter((l) => l.emHold).length,
  };
}

export type LinhaConsolidadaAnalista = KpisPrazoAnalista & { analista: string };

/** Indicadores consolidados por analista, lado a lado — visão restrita a
 * Gestor/Administrador. Mesma regra de
 * gat/kpis_analistas_prazo.py::tabela_consolidada_por_analista. */
export function tabelaConsolidadaPorAnalista(linhas: LinhaPrazo[], analistas: string[]): LinhaConsolidadaAnalista[] {
  const resultado: LinhaConsolidadaAnalista[] = [];
  for (const analista of analistas) {
    const kpis = calcularKpisPrazoAnalista(linhas, analista);
    if (!kpis.totalEntregue && !kpis.atrasadosEmAnalise && !kpis.vencem2DiasUteis && !kpis.emHold) continue;
    resultado.push({ analista, ...kpis });
  }
  return resultado;
}
