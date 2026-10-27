import { obterPool } from "@/lib/db";
import { calcularHoldDias, diasUteisDecorridos, emHold, saldoDiasUteis } from "@/lib/dias-uteis";

const SLA_PRESTADORES_DIAS_UTEIS = 10;
const SLA_CESSIONARIOS_NOVO = 10;
const SLA_CESSIONARIOS_REVISAO = 5;

const STATUS_CONCLUIDOS = new Set(["LIBERADO", "LIBERADO C/ REST.", "NÃO LIBERADO", "OBSOLETO", "CANCELADO"]);
const NIVEIS_PRIORIDADE_LABELS: Record<number, string> = {
  3: "Nível 3 (7 dias úteis)",
  2: "Nível 2 (5 dias úteis)",
  1: "Nível 1 (até 3 dias úteis)",
};

const MOTIVO_PRIORIDADE: Record<1 | 2 | 3, string> = {
  1: "Prioridade Nível 1",
  2: "Prioridade Nível 2",
  3: "Prioridade Nível 3",
};
const MOTIVO_SLA_REDUZIDO = "SLA reduzido";
const MOTIVO_VENCE_2_DIAS = "Vence em 2 dias úteis";
const MOTIVO_VENCE_1_DIA = "Vence em 1 dia útil";
const MOTIVO_VENCE_HOJE = "Vence hoje";
const MOTIVO_PRAZO_VENCIDO = "Prazo vencido";
const MOTIVO_PRIORIDADE_HOLD = "Prioridade – Em HOLD";

const RANK_NIVEL: Record<number, number> = { 1: 4, 2: 5, 3: 6 };

export type TipoPrioridade = "Prestador" | "Cessionário";
export type CorMapaCalor = "verde" | "amarelo" | "laranja" | "vermelho" | "roxo" | "azul";
export type SituacaoPrazo = "DENTRO DO PRAZO" | "VENCE EM BREVE" | "VENCE HOJE" | "ATRASADO" | "EM HOLD";

export type ItemPrioridade = {
  tipo: TipoPrioridade;
  modulo: "prestadores" | "cessionarios";
  id: number;
  nome_entidade: string | null;
  codigo: string | null;
  num_at: string | null;
  disciplina: string | null;
  revisao: number | null;
  responsavel: string | null;
  origem_prioridade: string;
  nivel_prioridade: number | null;
  sla_reduzido: boolean;
  sla_dias: number | null;
  sla_original: number | null;
  data_solicitacao: string | null;
  data_limite: string | null;
  justificativa_sla: string | null;
  dias_restantes: number | null;
  situacao_prazo: SituacaoPrazo;
  em_hold: boolean;
  cor_mapa_calor: CorMapaCalor;
  status_analise: string | null;
  motivos_entrada: string[];
  criticidade: number;
};

type LinhaBanco = {
  id: number;
  codigo: string | null;
  num_at: string | null;
  disciplina: string | null;
  revisao: number | null;
  responsavel: string | null;
  nivel_prioridade: number | null;
  sla_reduzido: number | null;
  sla_dias: number | null;
  sla_original: number | null;
  data_solicitacao: string | null;
  data_limite: string | null;
  data_analise: string | null;
  hold_inicio: string | null;
  hold_fim: string | null;
  justificativa_sla: string | null;
  status_analise: string | null;
  tipo?: string | null; // só cessionários
  nome_entidade: string | null;
};

function situacaoPrazo(diasRestantes: number | null): Exclude<SituacaoPrazo, "EM HOLD"> {
  if (diasRestantes == null) return "DENTRO DO PRAZO";
  if (diasRestantes < 0) return "ATRASADO";
  if (diasRestantes === 0) return "VENCE HOJE";
  if (diasRestantes <= 2) return "VENCE EM BREVE";
  return "DENTRO DO PRAZO";
}

function calcularSlaCessionario(tipo: string | null, revisao: number): number {
  if (tipo === "Quiosque") return SLA_CESSIONARIOS_REVISAO;
  if (revisao === 0 && (tipo === "Loja" || tipo === "Externo")) return SLA_CESSIONARIOS_NOVO;
  return SLA_CESSIONARIOS_REVISAO;
}

function montarItem(row: LinhaBanco, modulo: "prestadores" | "cessionarios", rotuloTipo: TipoPrioridade): ItemPrioridade | null {
  const status = (row.status_analise || "").trim().toUpperCase();
  if (STATUS_CONCLUIDOS.has(status)) return null;

  const holdDias = calcularHoldDias(row.hold_inicio, row.hold_fim);
  const estaEmHold = emHold(row.hold_inicio, row.hold_fim);
  const holdAbertoDesde = estaEmHold ? row.hold_inicio : null;

  let diasRestantes: number | null;
  let slaEfetivo: number | null;
  if (modulo === "prestadores") {
    slaEfetivo = row.sla_dias ?? SLA_PRESTADORES_DIAS_UTEIS;
    const decorridos = diasUteisDecorridos(row.data_solicitacao, row.data_analise, holdDias, holdAbertoDesde);
    diasRestantes = row.data_solicitacao ? slaEfetivo - decorridos : null;
  } else {
    slaEfetivo = row.sla_dias ?? calcularSlaCessionario(row.tipo ?? null, row.revisao ?? 0);
    diasRestantes = row.data_solicitacao
      ? saldoDiasUteis(row.data_solicitacao, slaEfetivo, row.data_analise, holdDias, holdAbertoDesde)
      : null;
  }

  const nivel = row.nivel_prioridade;
  const slaReduzido = !!row.sla_reduzido;

  const motivos: string[] = [];
  if (estaEmHold) {
    if (nivel != null && NIVEIS_PRIORIDADE_LABELS[nivel]) motivos.push(MOTIVO_PRIORIDADE_HOLD);
  } else {
    if (nivel != null && (nivel === 1 || nivel === 2 || nivel === 3)) motivos.push(MOTIVO_PRIORIDADE[nivel]);
    if (slaReduzido) motivos.push(MOTIVO_SLA_REDUZIDO);
    if (diasRestantes != null) {
      if (diasRestantes < 0) motivos.push(MOTIVO_PRAZO_VENCIDO);
      else if (diasRestantes === 0) motivos.push(MOTIVO_VENCE_HOJE);
      else if (diasRestantes === 1) motivos.push(MOTIVO_VENCE_1_DIA);
      else if (diasRestantes === 2) motivos.push(MOTIVO_VENCE_2_DIAS);
    }
  }
  if (!motivos.length) return null;

  const origemPrioridade = nivel != null && NIVEIS_PRIORIDADE_LABELS[nivel]
    ? NIVEIS_PRIORIDADE_LABELS[nivel]
    : slaReduzido ? "SLA reduzido" : "—";

  let corMapaCalor: CorMapaCalor;
  if (estaEmHold) corMapaCalor = "azul";
  else if (slaReduzido || nivel === 1) corMapaCalor = "roxo";
  else {
    const mapa: Record<Exclude<SituacaoPrazo, "EM HOLD">, CorMapaCalor> = {
      "DENTRO DO PRAZO": "verde", "VENCE EM BREVE": "amarelo", "VENCE HOJE": "laranja", ATRASADO: "vermelho",
    };
    corMapaCalor = mapa[situacaoPrazo(diasRestantes)];
  }

  let criticidade: number;
  if (estaEmHold) {
    criticidade = nivel != null && RANK_NIVEL[nivel] != null ? RANK_NIVEL[nivel] : 8;
  } else if (diasRestantes != null && diasRestantes < 0) criticidade = 0;
  else if (diasRestantes === 0) criticidade = 1;
  else if (diasRestantes === 1) criticidade = 2;
  else if (diasRestantes === 2) criticidade = 3;
  else if (nivel != null && RANK_NIVEL[nivel] != null) criticidade = RANK_NIVEL[nivel];
  else if (slaReduzido) criticidade = 7;
  else criticidade = 8;

  return {
    tipo: rotuloTipo,
    modulo,
    id: row.id,
    nome_entidade: row.nome_entidade,
    codigo: row.codigo,
    num_at: row.num_at,
    disciplina: row.disciplina,
    revisao: row.revisao,
    responsavel: row.responsavel,
    origem_prioridade: origemPrioridade,
    nivel_prioridade: nivel,
    sla_reduzido: slaReduzido,
    sla_dias: slaEfetivo,
    sla_original: row.sla_original,
    data_solicitacao: row.data_solicitacao,
    data_limite: row.data_limite,
    justificativa_sla: row.justificativa_sla,
    dias_restantes: diasRestantes,
    situacao_prazo: estaEmHold ? "EM HOLD" : situacaoPrazo(diasRestantes),
    em_hold: estaEmHold,
    cor_mapa_calor: corMapaCalor,
    status_analise: row.status_analise,
    motivos_entrada: motivos,
    criticidade,
  };
}

/** Lista de Prioridades — único painel com Prestadores e Cessionários
 * juntos: projetos ativos com nível de prioridade, SLA reduzido, ou a até
 * 2 dias úteis do vencimento/já atrasados. Mesma regra de
 * gat/business_rules.py::montar_lista_prioridades. */
export async function buscarListaPrioridades(): Promise<ItemPrioridade[]> {
  const pool = obterPool();

  const [prestadores, cessionarios] = await Promise.all([
    pool.query<LinhaBanco>(
      `SELECT id, codigo, prestador AS nome_entidade, num_at, disciplina, revisao, responsavel,
              nivel_prioridade, sla_reduzido, sla_dias, sla_original,
              data_solicitacao, data_limite, data_analise, hold_inicio, hold_fim,
              justificativa_sla, status_analise
       FROM prestadores WHERE arquivado_em IS NULL`,
    ),
    pool.query<LinhaBanco>(
      `SELECT id, codigo, cessionario AS nome_entidade, num_at, disciplina, revisao, responsavel,
              NULL::int AS nivel_prioridade, sla_reduzido, sla_dias, sla_original,
              data_solicitacao, data_limite, data_analise, hold_inicio, hold_fim,
              justificativa_sla, status_analise, tipo
       FROM cessionarios WHERE arquivado_em IS NULL`,
    ),
  ]);

  const itens: ItemPrioridade[] = [];
  for (const row of prestadores.rows) {
    const item = montarItem(row, "prestadores", "Prestador");
    if (item) itens.push(item);
  }
  for (const row of cessionarios.rows) {
    const item = montarItem(row, "cessionarios", "Cessionário");
    if (item) itens.push(item);
  }

  itens.sort((a, b) => {
    if (a.criticidade !== b.criticidade) return a.criticidade - b.criticidade;
    const da = a.data_limite ? new Date(a.data_limite).getTime() : Infinity;
    const db = b.data_limite ? new Date(b.data_limite).getTime() : Infinity;
    return da - db;
  });
  return itens;
}
