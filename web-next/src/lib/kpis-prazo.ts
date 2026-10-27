import { obterPool } from "@/lib/db";
import { calcularHoldDias, diasUteisDecorridos, emHold, saldoDiasUteis } from "@/lib/dias-uteis";
import {
  classificarEntregaPrazo,
  diasUteisDiferenca,
  statusConcluidoEntrega,
  type LinhaPrazo,
  type Origem,
} from "@/lib/kpis-prazo-calculo";

const STATUS_CANCELADO = "CANCELADO";
const SLA_PRESTADORES_DIAS_UTEIS = 10;
const SLA_CESSIONARIOS_NOVO = 10;
const SLA_CESSIONARIOS_REVISAO = 5;
const LIMIAR_VENCE_EM_BREVE = 2;

type LinhaBanco = {
  id: number;
  responsavel: string | null;
  disciplina: string | null;
  revisao: number | null;
  num_at: string | null;
  status_analise: string | null;
  data_solicitacao: string | null;
  data_limite: string | null;
  data_analise: string | null;
  hold_inicio: string | null;
  hold_fim: string | null;
  sla_dias: number | null;
  tipo: string | null;
};

function calcularSlaCessionario(tipo: string | null, revisao: number): number {
  if (tipo === "Quiosque") return SLA_CESSIONARIOS_REVISAO;
  if (revisao === 0 && (tipo === "Loja" || tipo === "Externo")) return SLA_CESSIONARIOS_NOVO;
  return SLA_CESSIONARIOS_REVISAO;
}

function enriquecerLinha(row: LinhaBanco, origem: Origem): LinhaPrazo {
  const holdDias = calcularHoldDias(row.hold_inicio, row.hold_fim);
  const estaEmHold = emHold(row.hold_inicio, row.hold_fim);
  const holdAbertoDesde = estaEmHold ? row.hold_inicio : null;
  const statusAnalise = (row.status_analise || "").trim().toUpperCase();

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
  };
}

/** KPIs de Prazo dos Analistas — base combinada de Prestadores e
 * Cessionários (CANCELADO excluído, concluídos incluídos — necessários
 * para a classificação antes/no dia/atraso). Mesma base de
 * views/kpis_analistas_prazo.py::_base_combinada. */
export async function buscarLinhasPrazo(): Promise<LinhaPrazo[]> {
  const pool = obterPool();
  const [prestadores, cessionarios] = await Promise.all([
    pool.query<LinhaBanco>(
      `SELECT id, responsavel, disciplina, revisao, num_at, status_analise,
              data_solicitacao, data_limite, data_analise, hold_inicio, hold_fim, sla_dias, NULL AS tipo
       FROM prestadores WHERE status_analise != $1 AND arquivado_em IS NULL`,
      [STATUS_CANCELADO],
    ),
    pool.query<LinhaBanco>(
      `SELECT id, responsavel, disciplina, revisao, num_at, status_analise,
              data_solicitacao, data_limite, data_analise, hold_inicio, hold_fim, sla_dias, tipo
       FROM cessionarios WHERE status_analise != $1 AND arquivado_em IS NULL`,
      [STATUS_CANCELADO],
    ),
  ]);

  return [
    ...prestadores.rows.map((r) => enriquecerLinha(r, "prestadores")),
    ...cessionarios.rows.map((r) => enriquecerLinha(r, "cessionarios")),
  ];
}
