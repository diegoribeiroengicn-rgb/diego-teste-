import { obterPool } from "@/lib/db";
import { calcularHoldDias, diasUteisDecorridos, emHold, saldoDiasUteis } from "@/lib/dias-uteis";
import { classificarEntregaPrazo, diasUteisDiferenca, statusConcluidoEntrega, type Origem } from "@/lib/kpis-prazo-calculo";
import type { LinhaBaseGestor } from "@/lib/visao-gestor-calculo";

const STATUS_CANCELADO = "CANCELADO";
const SLA_PRESTADORES_DIAS_UTEIS = 10;
const SLA_CESSIONARIOS_NOVO = 10;
const SLA_CESSIONARIOS_REVISAO = 5;
const LIMIAR_VENCE_EM_BREVE = 2;

type LinhaBanco = {
  id: number;
  codigo: string | null;
  nome_entidade: string | null;
  disciplina: string | null;
  revisao: number | null;
  num_at: string | null;
  responsavel: string | null;
  status_analise: string | null;
  data_solicitacao: string | null;
  data_limite: string | null;
  data_analise: string | null;
  hold_inicio: string | null;
  hold_fim: string | null;
  sla_dias: number | null;
  sla_reduzido: number | null;
  nivel_prioridade: number | null;
  tipo: string | null;
};

function calcularSlaCessionario(tipo: string | null, revisao: number): number {
  if (tipo === "Quiosque") return SLA_CESSIONARIOS_REVISAO;
  if (revisao === 0 && (tipo === "Loja" || tipo === "Externo")) return SLA_CESSIONARIOS_NOVO;
  return SLA_CESSIONARIOS_REVISAO;
}

function enriquecerLinha(row: LinhaBanco, origem: Origem): LinhaBaseGestor {
  const holdDias = calcularHoldDias(row.hold_inicio, row.hold_fim);
  const estaEmHold = emHold(row.hold_inicio, row.hold_fim);
  const holdAbertoDesde = estaEmHold ? row.hold_inicio : null;
  const statusAnalise = (row.status_analise || "").trim().toUpperCase();

  let diasRestantes: number | null = null;
  let tempoAnaliseInterna: number | null = null;
  if (row.data_solicitacao) {
    if (origem === "prestadores") {
      const sla = row.sla_dias ?? SLA_PRESTADORES_DIAS_UTEIS;
      const decorridos = diasUteisDecorridos(row.data_solicitacao, row.data_analise, holdDias, holdAbertoDesde);
      diasRestantes = sla - decorridos;
      tempoAnaliseInterna = decorridos;
    } else {
      const sla = row.sla_dias ?? calcularSlaCessionario(row.tipo, row.revisao ?? 0);
      const saldo = saldoDiasUteis(row.data_solicitacao, sla, row.data_analise, holdDias, holdAbertoDesde);
      diasRestantes = saldo;
      tempoAnaliseInterna = saldo;
    }
  }

  const statusFinal = statusConcluidoEntrega(statusAnalise);
  const ativaAtrasada = !statusFinal && !estaEmHold && diasRestantes != null && diasRestantes < 0;
  const vence2Dias = !statusFinal && !estaEmHold && diasRestantes != null && diasRestantes >= 0 && diasRestantes <= LIMIAR_VENCE_EM_BREVE;

  return {
    id: row.id,
    origem,
    responsavel: (row.responsavel || "").trim().toUpperCase() || "SEM RESPONSÁVEL",
    disciplina: row.disciplina || "SEM DISCIPLINA",
    revisao: row.revisao,
    numAt: row.num_at,
    statusAnalise,
    dataSolicitacao: row.data_solicitacao,
    dataLimite: row.data_limite,
    dataAnalise: row.data_analise,
    emHold: estaEmHold,
    diasRestantes,
    classificacaoEntrega: classificarEntregaPrazo(row.data_limite, row.data_analise),
    diasUteisDiferenca: diasUteisDiferenca(row.data_limite, row.data_analise),
    ativaAtrasada,
    vence2Dias,
    codigo: row.codigo,
    nomeEntidade: row.nome_entidade,
    tipoModulo: origem === "prestadores" ? "Prestador" : "Cessionário",
    slaReduzido: !!row.sla_reduzido,
    nivelPrioridade: row.nivel_prioridade,
    tempoAnaliseInterna,
  };
}

/** Base combinada (Prestadores + Cessionários ativos) para a Visão do
 * Gestor — mesma base de gat/visao_gestor.py::montar_base_combinada,
 * já com as colunas de prazo da mesma engine dos KPIs de Prazo. */
export async function buscarBaseVisaoGestor(): Promise<LinhaBaseGestor[]> {
  const pool = obterPool();
  const [prestadores, cessionarios] = await Promise.all([
    pool.query<LinhaBanco>(
      `SELECT id, codigo, prestador AS nome_entidade, disciplina, revisao, num_at, responsavel, status_analise,
              data_solicitacao, data_limite, data_analise, hold_inicio, hold_fim, sla_dias, sla_reduzido,
              nivel_prioridade, NULL AS tipo
       FROM prestadores WHERE status_analise != $1`,
      [STATUS_CANCELADO],
    ),
    pool.query<LinhaBanco>(
      `SELECT id, codigo, cessionario AS nome_entidade, disciplina, revisao, num_at, responsavel, status_analise,
              data_solicitacao, data_limite, data_analise, hold_inicio, hold_fim, sla_dias, sla_reduzido,
              NULL::int AS nivel_prioridade, tipo
       FROM cessionarios WHERE status_analise != $1`,
      [STATUS_CANCELADO],
    ),
  ]);

  return [
    ...prestadores.rows.map((r) => enriquecerLinha(r, "prestadores")),
    ...cessionarios.rows.map((r) => enriquecerLinha(r, "cessionarios")),
  ];
}
