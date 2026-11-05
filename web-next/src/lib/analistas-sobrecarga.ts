import { obterPool } from "@/lib/db";
import { calcularHoldDias, diasUteisDecorridos, emHold, saldoDiasUteis } from "@/lib/dias-uteis";
import type { LinhaCargaAnalista } from "@/lib/analistas-sobrecarga-calculo";

const STATUS_CANCELADO = "CANCELADO";
const SLA_PRESTADORES_DIAS_UTEIS = 10;
const SLA_CESSIONARIOS_NOVO = 10;
const SLA_CESSIONARIOS_REVISAO = 5;

type LinhaBanco = {
  responsavel: string | null;
  status_analise: string | null;
  data_solicitacao: string | null;
  data_analise: string | null;
  hold_inicio: string | null;
  hold_fim: string | null;
  sla_dias: number | null;
  sla_reduzido: number | null;
  nivel_prioridade: number | null;
  revisao: number | null;
  tipo: string | null;
};

function calcularSlaCessionario(tipo: string | null, revisao: number): number {
  if (tipo === "Quiosque") return SLA_CESSIONARIOS_REVISAO;
  if (revisao === 0 && (tipo === "Loja" || tipo === "Externo")) return SLA_CESSIONARIOS_NOVO;
  return SLA_CESSIONARIOS_REVISAO;
}

function enriquecerLinha(row: LinhaBanco, origem: "prestadores" | "cessionarios"): LinhaCargaAnalista {
  const holdDias = calcularHoldDias(row.hold_inicio, row.hold_fim);
  const estaEmHold = emHold(row.hold_inicio, row.hold_fim);
  const holdAbertoDesde = estaEmHold ? row.hold_inicio : null;

  let diasRestantes: number | null = null;
  if (row.data_solicitacao) {
    if (origem === "prestadores") {
      const sla = row.sla_dias ?? SLA_PRESTADORES_DIAS_UTEIS;
      const decorridos = diasUteisDecorridos(row.data_solicitacao, row.data_analise, holdDias, holdAbertoDesde);
      diasRestantes = sla - decorridos;
    } else {
      const sla = row.sla_dias ?? calcularSlaCessionario(row.tipo, row.revisao ?? 0);
      diasRestantes = saldoDiasUteis(row.data_solicitacao, sla, row.data_analise, holdDias, holdAbertoDesde);
    }
  }

  return {
    responsavel: row.responsavel,
    statusAnalise: (row.status_analise || "").trim().toUpperCase(),
    diasRestantes,
    emHold: estaEmHold,
    nivelPrioridade: row.nivel_prioridade,
    slaReduzido: !!row.sla_reduzido,
  };
}

/** Base (Prestadores + Cessionários ativos) para o indicador de carga por
 * analista — mesmo padrão de enriquecimento (SLA/hold) já usado em
 * lib/visao-gestor.ts e lib/alertas-engine.ts, com consulta própria para
 * não acoplar este indicador a esses outros módulos. */
export async function buscarLinhasCargaAnalistas(): Promise<LinhaCargaAnalista[]> {
  const pool = obterPool();
  const [prestadores, cessionarios] = await Promise.all([
    pool.query<LinhaBanco>(
      `SELECT responsavel, status_analise, data_solicitacao, data_analise, hold_inicio, hold_fim,
              sla_dias, sla_reduzido, nivel_prioridade, revisao, NULL AS tipo
       FROM prestadores WHERE status_analise != $1 AND arquivado_em IS NULL`,
      [STATUS_CANCELADO],
    ),
    pool.query<LinhaBanco>(
      `SELECT responsavel, status_analise, data_solicitacao, data_analise, hold_inicio, hold_fim,
              sla_dias, sla_reduzido, NULL::int AS nivel_prioridade, revisao, tipo
       FROM cessionarios WHERE status_analise != $1 AND arquivado_em IS NULL`,
      [STATUS_CANCELADO],
    ),
  ]);

  return [
    ...prestadores.rows.map((r) => enriquecerLinha(r, "prestadores")),
    ...cessionarios.rows.map((r) => enriquecerLinha(r, "cessionarios")),
  ];
}
