import { calcularKpisPrazoAnalista, type LinhaPrazo } from "@/lib/kpis-prazo-calculo";
import type { ItemPrioridade } from "@/lib/lista-prioridades";
import type { AlertaItem } from "@/lib/alertas-engine";

/** Mesma regra de gat/business_rules.py::STATUS_ATIVO_ANALISE. */
export const STATUS_ATIVO_ANALISE = new Set(["EM ANÁLISE", "EM HOLD", "RIOGALEÃO"]);

export type LinhaBaseGestor = LinhaPrazo & {
  codigo: string | null;
  nomeEntidade: string | null;
  tipoModulo: "Prestador" | "Cessionário";
  slaReduzido: boolean;
  nivelPrioridade: number | null;
  /** Para Prestadores: dias úteis decorridos (cresce com o tempo). Para
   * Cessionários: saldo de dias úteis (decresce, pode ficar negativo) —
   * mesma combinação heterogênea de gat/visao_gestor.py::montar_painel_
   * por_analista (coalesce de dias_uteis_decorridos/saldo_dias_uteis). */
  tempoAnaliseInterna: number | null;
};

export type PainelAnalista = {
  analista: string;
  emAndamento: number;
  concluidos: number;
  atrasados: number;
  emHold: number;
  prioridades: number;
  alertasAtivos: number;
  aguardandoAvaliacao: number;
  tempoMedioDias: number;
  vence2Dias: number;
  pctNoPrazo: number;
  pctAtraso: number;
  slaReduzidoQtd: number;
};

/** Painel "Quem está fazendo o quê" + distribuição de carga — uma linha
 * por analista com os indicadores agregados. Mesma regra de
 * gat/visao_gestor.py::montar_painel_por_analista. */
export function montarPainelPorAnalista(
  base: LinhaBaseGestor[],
  listaPrioridades: ItemPrioridade[],
  alertasAtivos: AlertaItem[],
  pendenciasAvaliacao: AlertaItem[],
  analistas: string[],
): PainelAnalista[] {
  const resultado: PainelAnalista[] = [];
  for (const analista of analistas) {
    const sub = base.filter((l) => l.responsavel === analista);
    const emAndamento = sub.filter((l) => STATUS_ATIVO_ANALISE.has(l.statusAnalise));
    const kpis = calcularKpisPrazoAnalista(base, analista);
    const prioridadesAnalista = listaPrioridades.filter((p) => p.responsavel === analista);
    const alertasAnalista = alertasAtivos.filter((a) => a.responsavel === analista);
    const pendenciasAnalista = pendenciasAvaliacao.filter((p) => p.responsavel === analista);

    if (!sub.length && !prioridadesAnalista.length && !alertasAnalista.length) continue;

    const tempos = emAndamento.map((l) => l.tempoAnaliseInterna).filter((v): v is number => v != null);
    const tempoMedio = tempos.length ? tempos.reduce((s, v) => s + v, 0) / tempos.length : 0;
    const emHoldQtd = sub.filter((l) => l.emHold).length;

    resultado.push({
      analista,
      emAndamento: emAndamento.length,
      concluidos: kpis.totalEntregue,
      atrasados: kpis.atrasadosEmAnalise,
      emHold: emHoldQtd,
      prioridades: prioridadesAnalista.length,
      alertasAtivos: alertasAnalista.length,
      aguardandoAvaliacao: pendenciasAnalista.length,
      tempoMedioDias: Math.round(tempoMedio * 10) / 10,
      vence2Dias: kpis.vencem2DiasUteis,
      pctNoPrazo: kpis.pctCumprimentoPrazo,
      pctAtraso: kpis.pctAtraso,
      slaReduzidoQtd: sub.filter((l) => l.slaReduzido).length,
    });
  }
  return resultado;
}

export type StatusOperacional = "ATRASADO" | "ATENCAO" | "EM_DIA" | "SEM_PENDENCIAS";

/** Situação operacional resumida do analista, para o cartão. Mesma regra
 * de gat/visao_gestor.py::status_operacional. */
export function statusOperacional(atrasados: number, vence2Dias: number, emAndamento: number): StatusOperacional {
  if (atrasados > 0) return "ATRASADO";
  if (vence2Dias > 0) return "ATENCAO";
  if (emAndamento > 0) return "EM_DIA";
  return "SEM_PENDENCIAS";
}

/** Proxy do que o analista "está analisando agora": entre as análises
 * ativas sob sua responsabilidade, a de data de solicitação mais antiga
 * (FIFO) — o sistema não registra foco de tela a tela. Mesma regra de
 * gat/visao_gestor.py::analise_atual_provavel. */
export function analiseAtualProvavel(base: LinhaBaseGestor[], analista: string): LinhaBaseGestor | null {
  const ativos = base.filter((l) => l.responsavel === analista && STATUS_ATIVO_ANALISE.has(l.statusAnalise));
  if (!ativos.length) return null;
  const comData = ativos.filter((l) => l.dataSolicitacao);
  if (!comData.length) return ativos[0];
  return comData.reduce((maisAntiga, l) =>
    new Date(l.dataSolicitacao!).getTime() < new Date(maisAntiga.dataSolicitacao!).getTime() ? l : maisAntiga,
  );
}

export type ComparativoAnalista = {
  analista: string;
  atAtual: string;
  prioridadeAtual: string;
  atRecomendado: string;
  motivoRecomendado: string;
  diasRestantesRecomendado: number | null;
};

/** O que o analista está (provavelmente) analisando agora x a análise de
 * maior criticidade recomendada pela Lista de Prioridades. Retorna null
 * quando não há divergência a relatar. Mesma regra de
 * gat/visao_gestor.py::comparativo_atual_vs_prioridade. */
export function comparativoAtualVsPrioridade(
  base: LinhaBaseGestor[],
  listaPrioridades: ItemPrioridade[],
  analista: string,
): ComparativoAnalista | null {
  const prioridadesAnalista = listaPrioridades.filter((p) => p.responsavel === analista);
  if (!prioridadesAnalista.length) return null;

  const topo = prioridadesAnalista[0];
  const atual = analiseAtualProvavel(base, analista);
  const atTopo = topo.num_at || topo.codigo;
  const atAtual = atual?.numAt ?? null;
  if (atual && atAtual && atTopo && String(atAtual) === String(atTopo)) return null;

  let prioridadeAtual = "Normal";
  if (atual && atAtual) {
    const atualNaLista = prioridadesAnalista.find((p) => String(p.num_at) === String(atAtual));
    if (atualNaLista) prioridadeAtual = atualNaLista.origem_prioridade || "Normal";
  }

  return {
    analista,
    atAtual: atAtual || "—",
    prioridadeAtual,
    atRecomendado: atTopo || "—",
    motivoRecomendado: topo.motivos_entrada.join(", ") || topo.origem_prioridade || "—",
    diasRestantesRecomendado: topo.dias_restantes,
  };
}
