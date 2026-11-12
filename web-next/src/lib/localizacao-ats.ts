import { obterPool } from "@/lib/db";
import { calcularHoldDias, diasUteisDecorridos, emHold, saldoDiasUteis } from "@/lib/dias-uteis";
import { garantirColunasBaixa } from "@/lib/esquema-baixa";
import type { LinhaLocalizacao } from "@/lib/localizacao-ats-calculo";
import type { Origem } from "@/lib/revisoes-calculo";

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
  obra: string | null;
  atualizado_em: string | null;
  resumo_mfiles: number | null;
  resumo_drive: number | null;
  resumo_email: number | null;
  num_documentos_analisados: number | null;
  num_documentos: number | null;
  nivel_prioridade: number | null;
  sla_reduzido: number | null;
};

function calcularSlaCessionario(tipo: string | null, revisao: number): number {
  if (tipo === "Quiosque") return SLA_CESSIONARIOS_REVISAO;
  if (revisao === 0 && (tipo === "Loja" || tipo === "Externo")) return SLA_CESSIONARIOS_NOVO;
  return SLA_CESSIONARIOS_REVISAO;
}

function enriquecerLinha(row: LinhaBanco, origem: Origem): LinhaLocalizacao {
  const holdDias = calcularHoldDias(row.hold_inicio, row.hold_fim);
  const estaEmHold = emHold(row.hold_inicio, row.hold_fim);
  const holdAbertoDesde = estaEmHold ? row.hold_inicio : null;

  let statusEntregaCalc: LinhaLocalizacao["statusEntregaCalc"] = null;
  let tempoAnaliseInterna: number | null = null;
  let diasRestantes: number | null = null;
  if (row.data_solicitacao) {
    if (origem === "prestadores") {
      const sla = row.sla_dias ?? SLA_PRESTADORES_DIAS_UTEIS;
      const decorridos = diasUteisDecorridos(row.data_solicitacao, row.data_analise, holdDias, holdAbertoDesde);
      statusEntregaCalc = decorridos < sla ? "ANTES DO PRAZO" : decorridos === sla ? "NO PRAZO" : "ATRASADO";
      tempoAnaliseInterna = decorridos;
      diasRestantes = sla - decorridos;
    } else {
      const sla = row.sla_dias ?? calcularSlaCessionario(row.tipo, row.revisao ?? 0);
      const saldo = saldoDiasUteis(row.data_solicitacao, sla, row.data_analise, holdDias, holdAbertoDesde);
      statusEntregaCalc = saldo > 0 ? "ANTES DO PRAZO" : saldo === 0 ? "NO PRAZO" : "ATRASADO";
      tempoAnaliseInterna = saldo;
      diasRestantes = saldo;
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
    modulo: origem,
    obra: row.obra,
    atualizadoEm: row.atualizado_em,
    resumoMfiles: !!row.resumo_mfiles,
    resumoDrive: !!row.resumo_drive,
    resumoEmail: !!row.resumo_email,
    numDocumentosAnalisados: row.num_documentos_analisados,
    numDocumentos: row.num_documentos ?? 0,
    diasRestantes,
    nivelPrioridade: row.nivel_prioridade,
    slaReduzido: !!row.sla_reduzido,
  };
}

/** Base combinada de Prestadores e Cessionários — só análises ativas
 * (CANCELADO excluído; arquivadas continuam exclusivas do módulo
 * Arquivo, ainda não portado). Mesma base de
 * views/localizacao_ats.py::_construir_base. Reaproveitada como fonte de
 * dados da busca avançada do módulo Projetos (ver `/projetos`), que
 * incorporou a finalidade do antigo módulo independente "Localização de
 * ATs" (hoje só um redirecionamento, ver `/localizacao-ats`). */
export async function buscarLinhasLocalizacao(): Promise<LinhaLocalizacao[]> {
  await garantirColunasBaixa();
  const pool = obterPool();
  const [prestadores, cessionarios] = await Promise.all([
    pool.query<LinhaBanco>(
      `SELECT id, item, codigo, prestador AS nome_entidade, disciplina, num_at, revisao, responsavel, status_analise,
              data_solicitacao, data_analise, data_limite, hold_inicio, hold_fim, observacoes, sla_dias, NULL AS tipo,
              obra_referencia AS obra, atualizado_em, resumo_mfiles, resumo_drive, resumo_email,
              num_documentos_analisados, num_documentos, nivel_prioridade, sla_reduzido
       FROM prestadores WHERE status_analise != $1 AND arquivado_em IS NULL`,
      [STATUS_CANCELADO],
    ),
    pool.query<LinhaBanco>(
      `SELECT id, item, codigo, cessionario AS nome_entidade, disciplina, num_at, revisao, responsavel, status_analise,
              data_solicitacao, data_analise, data_limite, hold_inicio, hold_fim, observacoes, sla_dias, tipo,
              tipo AS obra, atualizado_em, resumo_mfiles, resumo_drive, resumo_email,
              num_documentos_analisados, num_documentos, NULL::int AS nivel_prioridade, sla_reduzido
       FROM cessionarios WHERE status_analise != $1 AND arquivado_em IS NULL`,
      [STATUS_CANCELADO],
    ),
  ]);

  return [
    ...prestadores.rows.map((r) => enriquecerLinha(r, "prestadores")),
    ...cessionarios.rows.map((r) => enriquecerLinha(r, "cessionarios")),
  ];
}
