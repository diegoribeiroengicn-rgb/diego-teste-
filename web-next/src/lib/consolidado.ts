import { obterPool } from "@/lib/db";
import { calcularHoldDias, diasUteisDecorridos, emHold, saldoDiasUteis } from "@/lib/dias-uteis";
import type { LinhaConsolidada, Origem, StatusEntrega } from "@/lib/consolidado-calculo";

const STATUS_CANCELADO = "CANCELADO";
const SLA_PRESTADORES_DIAS_UTEIS = 10;
const SLA_CESSIONARIOS_NOVO = 10;
const SLA_CESSIONARIOS_REVISAO = 5;

type LinhaBanco = {
  id: number;
  responsavel: string | null;
  status_analise: string | null;
  disciplina: string | null;
  revisao: number | null;
  data_solicitacao: string | null;
  data_analise: string | null;
  data_limite: string | null;
  hold_inicio: string | null;
  hold_fim: string | null;
  sla_dias: number | null;
  tipo: string | null;
  peps: string | null;
};

function calcularSlaCessionario(tipo: string | null, revisao: number): number {
  if (tipo === "Quiosque") return SLA_CESSIONARIOS_REVISAO;
  if (revisao === 0 && (tipo === "Loja" || tipo === "Externo")) return SLA_CESSIONARIOS_NOVO;
  return SLA_CESSIONARIOS_REVISAO;
}

function enriquecerLinha(row: LinhaBanco, origem: Origem): LinhaConsolidada {
  const holdDias = calcularHoldDias(row.hold_inicio, row.hold_fim);
  const estaEmHold = emHold(row.hold_inicio, row.hold_fim);
  const holdAbertoDesde = estaEmHold ? row.hold_inicio : null;

  let statusEntregaCalc: StatusEntrega | null = null;
  let diasRestantes: number | null = null;

  if (row.data_solicitacao) {
    if (origem === "prestadores") {
      const sla = row.sla_dias ?? SLA_PRESTADORES_DIAS_UTEIS;
      const decorridos = diasUteisDecorridos(row.data_solicitacao, row.data_analise, holdDias, holdAbertoDesde);
      statusEntregaCalc = decorridos < sla ? "ANTES DO PRAZO" : decorridos === sla ? "NO PRAZO" : "ATRASADO";
      diasRestantes = sla - decorridos;
    } else {
      const sla = row.sla_dias ?? calcularSlaCessionario(row.tipo, row.revisao ?? 0);
      const saldo = saldoDiasUteis(row.data_solicitacao, sla, row.data_analise, holdDias, holdAbertoDesde);
      statusEntregaCalc = saldo > 0 ? "ANTES DO PRAZO" : saldo === 0 ? "NO PRAZO" : "ATRASADO";
      diasRestantes = saldo;
    }
    if (estaEmHold && statusEntregaCalc === "ATRASADO") statusEntregaCalc = "NO PRAZO";
  }

  return {
    id: row.id,
    origem,
    responsavel: (row.responsavel || "").trim().toUpperCase() || "SEM RESPONSÁVEL",
    statusAnalise: (row.status_analise || "").trim().toUpperCase(),
    disciplina: row.disciplina || "SEM DISCIPLINA",
    dataSolicitacao: row.data_solicitacao,
    dataAnalise: row.data_analise,
    dataLimite: row.data_limite,
    statusEntregaCalc,
    emHold: estaEmHold,
    diasRestantes,
    temPep: origem === "prestadores" ? !!(row.peps && row.peps.trim()) : null,
  };
}

/** Painel Geral Consolidado — união de Prestadores e Cessionários ativos
 * (CANCELADO sempre excluído), espelhando gat/business_rules.py::
 * filtrar_ativos + enriquecer_prestadores/enriquecer_cessionarios. */
export async function buscarLinhasConsolidado(): Promise<LinhaConsolidada[]> {
  const pool = obterPool();

  const [prestadores, cessionarios] = await Promise.all([
    pool.query<LinhaBanco>(
      `SELECT id, responsavel, status_analise, disciplina, revisao,
              data_solicitacao, data_analise, data_limite, hold_inicio, hold_fim,
              sla_dias, NULL AS tipo, peps
       FROM prestadores WHERE status_analise != $1 AND arquivado_em IS NULL`,
      [STATUS_CANCELADO],
    ),
    pool.query<LinhaBanco>(
      `SELECT id, responsavel, status_analise, disciplina, revisao,
              data_solicitacao, data_analise, data_limite, hold_inicio, hold_fim,
              sla_dias, tipo, NULL AS peps
       FROM cessionarios WHERE status_analise != $1 AND arquivado_em IS NULL`,
      [STATUS_CANCELADO],
    ),
  ]);

  return [
    ...prestadores.rows.map((r) => enriquecerLinha(r, "prestadores")),
    ...cessionarios.rows.map((r) => enriquecerLinha(r, "cessionarios")),
  ];
}
