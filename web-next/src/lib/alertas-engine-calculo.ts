import { classificacaoAtraso, nivelAlertaAtraso } from "@/lib/consolidado-calculo";

export const TIPO_PENDENTE_REUNIAO = "PENDENTE_REUNIAO";
export const TIPO_ATRASO_ANALISE = "ATRASO_ANALISE";
export const TIPO_AVALIACAO_CRITICA = "AVALIACAO_CRITICA";
export const TIPO_AVALIACAO_OBRIGATORIA = "AVALIACAO_OBRIGATORIA";
export const TIPO_PRAZO_PRIORITARIO = "PRAZO_PRIORITARIO";
export const TIPO_ALERTA_MAXIMO = "ALERTA_MAXIMO";
export const TIPO_ACOMPANHAMENTO_HOLD = "ACOMPANHAMENTO_HOLD";
export const TIPO_ATRASO_REENVIO = "ATRASO_REENVIO";

export type TipoAlerta =
  | typeof TIPO_PENDENTE_REUNIAO
  | typeof TIPO_ATRASO_ANALISE
  | typeof TIPO_AVALIACAO_CRITICA
  | typeof TIPO_AVALIACAO_OBRIGATORIA
  | typeof TIPO_PRAZO_PRIORITARIO
  | typeof TIPO_ALERTA_MAXIMO
  | typeof TIPO_ACOMPANHAMENTO_HOLD
  | typeof TIPO_ATRASO_REENVIO;

export const TIPO_ALERTA_LABELS: Record<TipoAlerta, string> = {
  [TIPO_PENDENTE_REUNIAO]: "Revisão ≥ REV2 sem liberação",
  [TIPO_ATRASO_ANALISE]: "Atraso na análise interna",
  [TIPO_AVALIACAO_CRITICA]: "Avaliação Crítica/Baixa",
  [TIPO_AVALIACAO_OBRIGATORIA]: "Avaliação obrigatória pendente",
  [TIPO_PRAZO_PRIORITARIO]: "Prazo prioritário próximo do vencimento",
  [TIPO_ALERTA_MAXIMO]: "Alerta Máximo — pelo menos 24 horas de atraso real",
  [TIPO_ACOMPANHAMENTO_HOLD]: "Acompanhamento de HOLD (3+ dias úteis)",
  [TIPO_ATRASO_REENVIO]: "Atraso no reenvio (retorno externo)",
};

export const STATUS_PENDENTE = "PENDENTE";
export const STATUS_EM_TRATAMENTO = "EM_TRATAMENTO";
export const STATUS_TRATADO = "TRATADO";
export const STATUS_ADIADO = "ADIADO";
export const STATUS_RETIRADO = "RETIRADO";
export const STATUS_REABERTO = "REABERTO";

export type StatusRadar =
  | typeof STATUS_PENDENTE
  | typeof STATUS_EM_TRATAMENTO
  | typeof STATUS_TRATADO
  | typeof STATUS_ADIADO
  | typeof STATUS_RETIRADO
  | typeof STATUS_REABERTO;

export const STATUS_RADAR_LABELS: Record<StatusRadar, string> = {
  [STATUS_PENDENTE]: "Pendente",
  [STATUS_EM_TRATAMENTO]: "Em tratamento",
  [STATUS_TRATADO]: "Tratado",
  [STATUS_ADIADO]: "Adiado",
  [STATUS_RETIRADO]: "Retirado do radar",
  [STATUS_REABERTO]: "Reaberto",
};

const STATUS_RADAR_ATIVOS = new Set<StatusRadar>([STATUS_PENDENTE, STATUS_EM_TRATAMENTO, STATUS_REABERTO]);
export function statusRadarAtivo(status: StatusRadar): boolean {
  return STATUS_RADAR_ATIVOS.has(status);
}

const LIMIAR_DIAS_UTEIS_ACOMPANHAMENTO_HOLD = 3;
const STATUS_NAO_LIBERADO = "NÃO LIBERADO";
const META_REVISAO_APROVACAO = 2;
const MARCO_AVALIACOES_OFICIAL = "2026-07-01";
const STATUS_CONCLUIDOS_PRIORIDADE = new Set(["LIBERADO", "LIBERADO C/ REST.", "NÃO LIBERADO", "OBSOLETO", "CANCELADO"]);

export type Origem = "prestadores" | "cessionarios";

export type LinhaAlertaBase = {
  id: number;
  nome: string | null;
  codigo: string | null;
  disciplina: string | null;
  numAt: string | null;
  revisao: number | null;
  responsavel: string | null;
  item: number | null;
  statusAnalise: string;
  dataAnalise: string | null;
  statusEntregaCalc: "ANTES DO PRAZO" | "NO PRAZO" | "ATRASADO" | null;
  emHold: boolean;
  diasRestantes: number | null;
  slaReduzido: boolean;
  nivelPrioridade: number | null;
  slaDias: number | null;
  diasHoldAbertos: number;
}

export type AlertaGerado = { tipoAlerta: TipoAlerta; detalhe: string | null };

function chaveEntidade(codigo: string | null, nome: string | null, disciplina: string | null): string {
  return `${codigo || nome || ""}::${disciplina || ""}`;
}

export function chaveAvaliacao(codigoEntidade: string | null, nomeEntidade: string | null, disciplina: string | null): string {
  return chaveEntidade(codigoEntidade, nomeEntidade, disciplina);
}

/** "AT concluiu a Rev.01": revisão EXATAMENTE 1 e a análise já foi
 * concluída — só a Rev.01 gera avaliação obrigatória. Mesma regra de
 * gat/alertas_engine.py::rev1_concluida. */
export function rev1Concluida(revisao: number | null, dataAnalise: string | null): boolean {
  if (revisao !== 1) return false;
  return !!dataAnalise;
}

/** A obrigatoriedade só vale a partir do marco oficial (01/07/2026) —
 * antes disso a avaliação é sempre opcional, sem retroatividade. */
export function avaliacaoDentroPeriodoOficial(dataAnalise: string | null): boolean {
  if (!dataAnalise) return false;
  return dataAnalise.slice(0, 10) >= MARCO_AVALIACOES_OFICIAL;
}

/** Limiares (em dias úteis restantes) do alerta de vencimento próximo —
 * 5/3/1 para SLAs normais, menores para SLAs curtos. Mesma regra de
 * gat/business_rules.py::limites_alerta_vencimento. */
export function limitesAlertaVencimento(slaDias: number): [number, number, number] {
  if (slaDias >= 10) return [5, 3, 1];
  if (slaDias >= 5) return [3, 2, 1];
  return [2, 1, 1];
}

/** Projeto ativo (não concluído, não em HOLD) com nível de prioridade ou
 * SLA reduzido em vigor. Mesma regra de
 * gat/business_rules.py::em_lista_prioridades. */
function emListaPrioridades(linha: LinhaAlertaBase): boolean {
  if (linha.emHold) return false;
  const prioritario = linha.slaReduzido || linha.nivelPrioridade != null;
  if (!prioritario) return false;
  return !STATUS_CONCLUIDOS_PRIORIDADE.has(linha.statusAnalise);
}

/** Monta a lista de alertas disparados por uma linha de projeto — mesma
 * regra de gat/alertas_engine.py::montar_alertas_modulo. ATRASO_REENVIO
 * não nasce aqui: é por INTERVALO entre revisões (não por linha), montado
 * à parte em lib/alertas-engine.ts a partir de revisoes-calculo.ts. */
export function determinarAlertasLinha(
  linha: LinhaAlertaBase,
  modulo: Origem,
  criticos: Set<string>,
  avaliados: Set<string>,
  isentos: Set<number>,
): AlertaGerado[] {
  const resultado: AlertaGerado[] = [];
  const chave = chaveEntidade(linha.codigo, linha.nome, linha.disciplina);

  if (linha.statusAnalise === STATUS_NAO_LIBERADO && (linha.revisao ?? 0) >= META_REVISAO_APROVACAO) {
    resultado.push({ tipoAlerta: TIPO_PENDENTE_REUNIAO, detalhe: null });
  }

  if (linha.statusEntregaCalc === "ATRASADO" && !linha.emHold) {
    resultado.push({ tipoAlerta: TIPO_ATRASO_ANALISE, detalhe: null });
  }

  if (classificacaoAtraso(linha.statusAnalise, linha.statusEntregaCalc, linha.emHold) === "ATIVO_ATRASADO") {
    if (nivelAlertaAtraso(linha.diasRestantes) === "ALERTA_MAXIMO") {
      const diasAtraso = linha.diasRestantes != null ? -linha.diasRestantes : null;
      resultado.push({
        tipoAlerta: TIPO_ALERTA_MAXIMO,
        detalhe: `ATENÇÃO: esta análise está com pelo menos 24 horas de atraso real (${diasAtraso ?? "?"} dia(s) útil(eis)) e exige atuação imediata.`,
      });
    }
  }

  if (criticos.has(chave)) {
    resultado.push({ tipoAlerta: TIPO_AVALIACAO_CRITICA, detalhe: null });
  }

  if (
    rev1Concluida(linha.revisao, linha.dataAnalise) &&
    avaliacaoDentroPeriodoOficial(linha.dataAnalise) &&
    !avaliados.has(chave) &&
    !isentos.has(linha.id)
  ) {
    const rotulo = modulo === "prestadores" ? "avaliação de prestador" : "avaliação do projetista do cessionário";
    resultado.push({
      tipoAlerta: TIPO_AVALIACAO_OBRIGATORIA,
      detalhe: `Existe uma ${rotulo} pendente para a AT ${linha.numAt || "—"}.`,
    });
  }

  if (emListaPrioridades(linha) && linha.diasRestantes != null) {
    const [limite5, limite3, limite1] = limitesAlertaVencimento(linha.slaDias ?? 10);
    if (linha.diasRestantes <= limite5) {
      resultado.push({
        tipoAlerta: TIPO_PRAZO_PRIORITARIO,
        detalhe: `Prazo prioritário: restam ${linha.diasRestantes} dia(s) útil(eis) (limites de alerta: ${limite5}/${limite3}/${limite1}).`,
      });
    }
  }

  if (linha.emHold && linha.diasHoldAbertos >= LIMIAR_DIAS_UTEIS_ACOMPANHAMENTO_HOLD) {
    resultado.push({
      tipoAlerta: TIPO_ACOMPANHAMENTO_HOLD,
      detalhe: `Em HOLD há ${linha.diasHoldAbertos} dia(s) útil(eis) — acompanhamento com o especialista recomendado.`,
    });
  }

  return resultado;
}
