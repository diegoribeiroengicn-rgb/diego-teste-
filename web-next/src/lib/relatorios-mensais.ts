import { obterPool } from "@/lib/db";
import { calcularHoldDias, emHold, diasUteisDecorridos, saldoDiasUteis } from "@/lib/dias-uteis";
import type { LinhaProdutividade, ModuloProdutividade } from "@/lib/produtividade";

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
  revisao: number | null;
  num_documentos: number | null;
  data_solicitacao: string | null;
  data_analise: string | null;
  hold_inicio: string | null;
  hold_fim: string | null;
  sla_dias: number | null;
  tipo: string | null;
  num_at: string | null;
  responsavel: string | null;
  status_analise: string | null;
};

function calcularSlaCessionario(tipo: string | null, revisao: number): number {
  if (tipo === "Quiosque") return SLA_CESSIONARIOS_REVISAO;
  if (revisao === 0 && (tipo === "Loja" || tipo === "Externo")) return SLA_CESSIONARIOS_NOVO;
  return SLA_CESSIONARIOS_REVISAO;
}

function enriquecerLinha(row: LinhaBanco, origem: ModuloProdutividade): LinhaProdutividade {
  const holdDias = calcularHoldDias(row.hold_inicio, row.hold_fim);
  const holdAberto = emHold(row.hold_inicio, row.hold_fim);
  const holdAbertoDesde = holdAberto ? row.hold_inicio : null;

  let statusEntregaCalc: LinhaProdutividade["statusEntregaCalc"] = null;
  let tempoAnalise: number | null = null;

  if (row.data_solicitacao) {
    if (origem === "prestadores") {
      const sla = row.sla_dias ?? SLA_PRESTADORES_DIAS_UTEIS;
      const decorridos = diasUteisDecorridos(row.data_solicitacao, row.data_analise, holdDias, holdAbertoDesde);
      let status: LinhaProdutividade["statusEntregaCalc"] = decorridos < sla ? "ANTES DO PRAZO" : decorridos === sla ? "NO PRAZO" : "ATRASADO";
      if (holdAbertoDesde != null && status === "ATRASADO") status = "NO PRAZO";
      statusEntregaCalc = status;
      tempoAnalise = decorridos;
    } else {
      const sla = row.sla_dias ?? calcularSlaCessionario(row.tipo, row.revisao ?? 0);
      const saldo = saldoDiasUteis(row.data_solicitacao, sla, row.data_analise, holdDias, holdAbertoDesde);
      let status: LinhaProdutividade["statusEntregaCalc"] = saldo > 0 ? "ANTES DO PRAZO" : saldo === 0 ? "NO PRAZO" : "ATRASADO";
      if (holdAbertoDesde != null && status === "ATRASADO") status = "NO PRAZO";
      statusEntregaCalc = status;
      tempoAnalise = saldo;
    }
  }

  return {
    id: row.id,
    origem,
    item: row.item,
    codigo: row.codigo,
    nomeEntidade: row.nome_entidade,
    disciplina: row.disciplina || "SEM DISCIPLINA",
    revisao: row.revisao,
    numAt: row.num_at,
    responsavel: (row.responsavel || "").trim().toUpperCase() || "SEM RESPONSÁVEL",
    statusAnalise: (row.status_analise || "").trim().toUpperCase(),
    numDocumentos: row.num_documentos ?? 0,
    dataSolicitacao: row.data_solicitacao,
    dataAnalise: row.data_analise,
    statusEntregaCalc,
    tempoAnalise,
  };
}

export async function buscarLinhasProdutividade(modulos: ModuloProdutividade[]): Promise<LinhaProdutividade[]> {
  const pool = obterPool();
  const resultados: LinhaProdutividade[] = [];

  if (modulos.includes("prestadores")) {
    const { rows } = await pool.query<LinhaBanco>(
      `SELECT id, item, codigo, prestador AS nome_entidade, disciplina, revisao, num_documentos,
              data_solicitacao, data_analise, hold_inicio, hold_fim, sla_dias, NULL AS tipo,
              num_at, responsavel, status_analise
       FROM prestadores WHERE status_analise != $1 AND arquivado_em IS NULL`,
      [STATUS_CANCELADO],
    );
    rows.forEach((r) => resultados.push(enriquecerLinha(r, "prestadores")));
  }
  if (modulos.includes("cessionarios")) {
    const { rows } = await pool.query<LinhaBanco>(
      `SELECT id, item, codigo, cessionario AS nome_entidade, disciplina, revisao, num_documentos,
              data_solicitacao, data_analise, hold_inicio, hold_fim, sla_dias, tipo,
              num_at, responsavel, status_analise
       FROM cessionarios WHERE status_analise != $1 AND arquivado_em IS NULL`,
      [STATUS_CANCELADO],
    );
    rows.forEach((r) => resultados.push(enriquecerLinha(r, "cessionarios")));
  }
  return resultados;
}
