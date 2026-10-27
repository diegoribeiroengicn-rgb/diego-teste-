import { obterPool } from "@/lib/db";
import { calcularHoldDias, diasUteisDecorridos, emHold, saldoDiasUteis } from "@/lib/dias-uteis";
import type { LinhaRevisao, Origem } from "@/lib/revisoes-calculo";

const STATUS_CANCELADO = "CANCELADO";
const SLA_PRESTADORES_DIAS_UTEIS = 10;
const SLA_CESSIONARIOS_NOVO = 10;
const SLA_CESSIONARIOS_REVISAO = 5;

type LinhaBanco = {
  id: number;
  item: number | null;
  codigo: string | null;
  nome_entidade: string | null;
  disciplina: string | null;
  num_at: string | null;
  revisao: number | null;
  responsavel: string | null;
  status_analise: string | null;
  data_solicitacao: string | null;
  data_analise: string | null;
  data_limite: string | null;
  hold_inicio: string | null;
  hold_fim: string | null;
  observacoes: string | null;
  sla_dias: number | null;
  tipo: string | null;
};

function calcularSlaCessionario(tipo: string | null, revisao: number): number {
  if (tipo === "Quiosque") return SLA_CESSIONARIOS_REVISAO;
  if (revisao === 0 && (tipo === "Loja" || tipo === "Externo")) return SLA_CESSIONARIOS_NOVO;
  return SLA_CESSIONARIOS_REVISAO;
}

function enriquecerLinha(row: LinhaBanco, origem: Origem): LinhaRevisao {
  const holdDias = calcularHoldDias(row.hold_inicio, row.hold_fim);
  const estaEmHold = emHold(row.hold_inicio, row.hold_fim);
  const holdAbertoDesde = estaEmHold ? row.hold_inicio : null;

  let statusEntregaCalc: LinhaRevisao["statusEntregaCalc"] = null;
  let tempoAnaliseInterna: number | null = null;
  if (row.data_solicitacao) {
    if (origem === "prestadores") {
      const sla = row.sla_dias ?? SLA_PRESTADORES_DIAS_UTEIS;
      const decorridos = diasUteisDecorridos(row.data_solicitacao, row.data_analise, holdDias, holdAbertoDesde);
      statusEntregaCalc = decorridos < sla ? "ANTES DO PRAZO" : decorridos === sla ? "NO PRAZO" : "ATRASADO";
      tempoAnaliseInterna = decorridos;
    } else {
      const sla = row.sla_dias ?? calcularSlaCessionario(row.tipo, row.revisao ?? 0);
      const saldo = saldoDiasUteis(row.data_solicitacao, sla, row.data_analise, holdDias, holdAbertoDesde);
      statusEntregaCalc = saldo > 0 ? "ANTES DO PRAZO" : saldo === 0 ? "NO PRAZO" : "ATRASADO";
      tempoAnaliseInterna = saldo;
    }
    if (estaEmHold && statusEntregaCalc === "ATRASADO") statusEntregaCalc = "NO PRAZO";
  }

  return {
    id: row.id,
    item: row.item,
    codigo: row.codigo,
    nome: row.nome_entidade,
    disciplina: row.disciplina,
    numAt: row.num_at,
    revisao: row.revisao ?? 0,
    responsavel: row.responsavel,
    statusAnalise: (row.status_analise || "").trim().toUpperCase(),
    dataSolicitacao: row.data_solicitacao,
    dataAnalise: row.data_analise,
    dataLimite: row.data_limite,
    holdInicio: row.hold_inicio,
    holdFim: row.hold_fim,
    holdDias,
    statusEntregaCalc,
    tempoAnaliseInterna,
    observacoes: row.observacoes,
  };
}

/** Base da Linha do Tempo — todas as revisões ativas (CANCELADO excluído)
 * de um módulo, já enriquecidas com status de entrega. Mesma base de
 * views/linha_tempo.py::_base. */
export async function buscarLinhasRevisao(origem: Origem): Promise<LinhaRevisao[]> {
  const pool = obterPool();
  const colunaNome = origem === "prestadores" ? "prestador" : "cessionario";
  const { rows } = await pool.query<LinhaBanco>(
    `SELECT id, item, codigo, ${colunaNome} AS nome_entidade, disciplina, num_at, revisao, responsavel, status_analise,
            data_solicitacao, data_analise, data_limite, hold_inicio, hold_fim, observacoes, sla_dias,
            ${origem === "cessionarios" ? "tipo" : "NULL AS tipo"}
     FROM ${origem} WHERE status_analise != $1 AND arquivado_em IS NULL`,
    [STATUS_CANCELADO],
  );
  return rows.map((r) => enriquecerLinha(r, origem));
}
