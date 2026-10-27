import { obterPool } from "@/lib/db";
import { calcularHoldDias, emHold, paraData, saldoDiasUteis } from "@/lib/dias-uteis";

const STATUS_CANCELADO = "CANCELADO";
const DISCIPLINA_ART = "ART/RRT";
const STATUS_LIBERADOS = ["LIBERADO", "LIBERADO C/ REST."];

// SLA padrão de cessionários (dias úteis) — Quiosque sempre 5; Loja/Externo
// 10 na revisão 00, 5 a partir da revisão 01 (gat/config.py + business_rules.py).
const SLA_CESSIONARIOS_NOVO = 10;
const SLA_CESSIONARIOS_REVISAO = 5;

type LinhaBruta = {
  id: number;
  disciplina: string | null;
  revisao: number;
  status_analise: string;
  num_documentos: number;
  data_solicitacao: string | null;
  data_analise: string | null;
  hold_inicio: string | null;
  hold_fim: string | null;
  sla_dias: number | null;
  tipo: string | null;
  teve_substituicao: number | null;
};

type LinhaEnriquecida = LinhaBruta & { status_entrega_calc: string };

function calcularSlaCessionario(tipo: string | null, revisao: number): number {
  if (tipo === "Quiosque") return SLA_CESSIONARIOS_REVISAO;
  if (revisao === 0 && (tipo === "Loja" || tipo === "Externo")) return SLA_CESSIONARIOS_NOVO;
  return SLA_CESSIONARIOS_REVISAO;
}

function statusEntregaCessionario(
  dataSolicitacao: string | null,
  dataAnalise: string | null,
  holdDias: number,
  slaDias: number,
  holdAbertoDesde: string | null,
): string {
  const saldo = saldoDiasUteis(dataSolicitacao, slaDias, dataAnalise, holdDias, holdAbertoDesde);
  let status = saldo > 0 ? "ANTES DO PRAZO" : saldo === 0 ? "NO PRAZO" : "ATRASADO";
  if (holdAbertoDesde !== null && status === "ATRASADO") {
    // Hold pausa o SLA — nunca rotulado como atrasado enquanto pausado,
    // mesmo que já estivesse além do prazo quando entrou em hold.
    status = "NO PRAZO";
  }
  return status;
}

function filtrarAtivos(linhas: LinhaBruta[]): LinhaBruta[] {
  return linhas.filter((l) => (l.status_analise || "").trim().toUpperCase() !== STATUS_CANCELADO);
}

function ehArt(disciplina: string | null): boolean {
  return (disciplina || "").trim().toUpperCase() === DISCIPLINA_ART;
}

function excluirArts<T extends { disciplina: string | null }>(linhas: T[]): T[] {
  return linhas.filter((l) => !ehArt(l.disciplina));
}

function enriquecerCessionarios(linhas: LinhaBruta[]): LinhaEnriquecida[] {
  return linhas.map((linha) => {
    const hold = calcularHoldDias(linha.hold_inicio, linha.hold_fim);
    const holdAberto = emHold(linha.hold_inicio, linha.hold_fim);
    const sla = linha.sla_dias != null ? linha.sla_dias : calcularSlaCessionario(linha.tipo, linha.revisao || 0);
    const status = statusEntregaCessionario(
      linha.data_solicitacao,
      linha.data_analise,
      hold,
      sla,
      holdAberto ? linha.hold_inicio : null,
    );
    return { ...linha, status_entrega_calc: status };
  });
}

function filtrarPorCompetencia(
  linhas: LinhaEnriquecida[],
  coluna: "data_solicitacao" | "data_analise",
  mes: number,
  ano: number,
): LinhaEnriquecida[] {
  return linhas.filter((l) => {
    const data = paraData(l[coluna]);
    return !!data && data.getUTCMonth() + 1 === mes && data.getUTCFullYear() === ano;
  });
}

export type IndicadorDisciplina = { disciplina: string; documentos: number; percentual: number };

/** "Contribuição das Disciplinas": participação de cada disciplina no
 * total de documentos analisados no mês (ART não conta — não é uma
 * disciplina de análise). */
function indicadoresDisciplinas(linhas: LinhaEnriquecida[]): IndicadorDisciplina[] {
  const base = excluirArts(linhas);
  const porDisciplina = new Map<string, number>();
  for (const l of base) {
    const chave = l.disciplina || "—";
    porDisciplina.set(chave, (porDisciplina.get(chave) ?? 0) + (l.num_documentos || 0));
  }
  const entradas = [...porDisciplina.entries()].filter(([, qtd]) => qtd > 0).sort((a, b) => b[1] - a[1]);
  const total = entradas.reduce((soma, [, qtd]) => soma + qtd, 0);
  if (!total) return [];
  return entradas.map(([disciplina, documentos]) => ({
    disciplina,
    documentos,
    percentual: Math.round((100 * documentos / total) * 10) / 10,
  }));
}

export type IndicadorRevisao = { revisao: number; total: number; com_substituicao: number };

/** Projetos liberados cuja Data de Análise caiu no mês, por revisão. */
function indicadoresLiberadosPorRevisao(linhas: LinhaEnriquecida[]): IndicadorRevisao[] {
  const base = excluirArts(linhas).filter((l) => STATUS_LIBERADOS.includes(l.status_analise));
  const porRevisao = new Map<number, { total: number; comSubstituicao: number }>();
  for (const l of base) {
    const atual = porRevisao.get(l.revisao) ?? { total: 0, comSubstituicao: 0 };
    atual.total += 1;
    if (Number(l.teve_substituicao) > 0) atual.comSubstituicao += 1;
    porRevisao.set(l.revisao, atual);
  }
  return [...porRevisao.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([revisao, v]) => ({ revisao, total: v.total, com_substituicao: v.comSubstituicao }));
}

export type ResumoMensal = {
  analises_emitidas: number;
  documentos: number;
  adiantados: number;
  no_prazo: number;
  atrasados: number;
  adiantados_pct: number;
  no_prazo_pct: number;
  atrasados_pct: number;
  liberados: number;
  nao_liberados: number;
};

const RESUMO_VAZIO: ResumoMensal = {
  analises_emitidas: 0, documentos: 0,
  adiantados: 0, no_prazo: 0, atrasados: 0,
  adiantados_pct: 0, no_prazo_pct: 0, atrasados_pct: 0,
  liberados: 0, nao_liberados: 0,
};

function resumoMensal(dfCompleto: LinhaEnriquecida[], mes: number, ano: number): ResumoMensal {
  if (dfCompleto.length === 0) return RESUMO_VAZIO;
  const recebidosCompleto = filtrarPorCompetencia(dfCompleto, "data_solicitacao", mes, ano);
  if (recebidosCompleto.length === 0) return RESUMO_VAZIO;

  const documentos = recebidosCompleto.reduce((soma, l) => soma + (l.num_documentos || 0), 0);
  const recebidos = excluirArts(recebidosCompleto);
  const analisesEmitidas = recebidos.length;
  const liberados = recebidos.filter((l) => STATUS_LIBERADOS.includes(l.status_analise)).length;
  const naoLiberados = recebidos.length - liberados;

  let adiantados = 0, noPrazo = 0, atrasados = 0;
  for (const l of recebidosCompleto) {
    const docs = l.num_documentos || 0;
    if (l.status_entrega_calc === "ANTES DO PRAZO") adiantados += docs;
    else if (l.status_entrega_calc === "NO PRAZO") noPrazo += docs;
    else if (l.status_entrega_calc === "ATRASADO") atrasados += docs;
  }
  const basePct = adiantados + noPrazo + atrasados;

  return {
    analises_emitidas: analisesEmitidas,
    documentos,
    adiantados, no_prazo: noPrazo, atrasados,
    adiantados_pct: basePct ? Math.round((1000 * adiantados) / basePct) / 10 : 0,
    no_prazo_pct: basePct ? Math.round((1000 * noPrazo) / basePct) / 10 : 0,
    atrasados_pct: basePct ? Math.round((1000 * atrasados) / basePct) / 10 : 0,
    liberados, nao_liberados: naoLiberados,
  };
}

export type AcumuladoMes = { mes: number; adiantado: number; no_prazo: number; atrasado: number; total: number };

function acumuladoDocumentosPorMes(dfCompleto: LinhaEnriquecida[], ano: number): AcumuladoMes[] {
  const linhas: AcumuladoMes[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    const recebidosMes = filtrarPorCompetencia(dfCompleto, "data_solicitacao", mes, ano);
    let adiantado = 0, noPrazo = 0, atrasado = 0;
    for (const l of recebidosMes) {
      const docs = l.num_documentos || 0;
      if (l.status_entrega_calc === "ANTES DO PRAZO") adiantado += docs;
      else if (l.status_entrega_calc === "NO PRAZO") noPrazo += docs;
      else if (l.status_entrega_calc === "ATRASADO") atrasado += docs;
    }
    linhas.push({ mes, adiantado, no_prazo: noPrazo, atrasado, total: adiantado + noPrazo + atrasado });
  }
  return linhas;
}

export type DadosOprCessionarios = {
  disciplinas: IndicadorDisciplina[];
  porRevisao: IndicadorRevisao[];
  resumo: ResumoMensal;
  acumuladoAtual: AcumuladoMes[];
  acumuladoAnterior: AcumuladoMes[];
};

/** Monta todos os indicadores do One Page Report de Cessionários para um
 * mês/ano — mesma lógica de gat/opr_cessionarios_infografico.py, incluindo
 * o cálculo dinâmico de status_entrega_calc (gat/business_rules.py +
 * gat/calendario.py). */
export async function buscarDadosOprCessionarios(mes: number, ano: number): Promise<DadosOprCessionarios> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaBruta>(
    `SELECT id, disciplina, revisao, status_analise, num_documentos,
            data_solicitacao, data_analise, hold_inicio, hold_fim,
            sla_dias, tipo, teve_substituicao
     FROM cessionarios WHERE arquivado_em IS NULL`,
  );

  const completo = enriquecerCessionarios(filtrarAtivos(rows));
  const mesSolicitado = filtrarPorCompetencia(completo, "data_solicitacao", mes, ano);
  const mesConcluido = filtrarPorCompetencia(completo, "data_analise", mes, ano);

  return {
    disciplinas: indicadoresDisciplinas(mesSolicitado),
    porRevisao: indicadoresLiberadosPorRevisao(mesConcluido),
    resumo: resumoMensal(completo, mes, ano),
    acumuladoAtual: acumuladoDocumentosPorMes(completo, ano),
    acumuladoAnterior: acumuladoDocumentosPorMes(completo, ano - 1),
  };
}
