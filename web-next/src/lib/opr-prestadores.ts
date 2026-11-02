import { obterPool } from "@/lib/db";
import { calcularHoldDias, diasUteisDecorridos, emHold, paraData } from "@/lib/dias-uteis";
import { SLA_PRESTADORES_DIAS_UTEIS } from "@/lib/analise-validacao-calculo";
import type { AcumuladoMes, IndicadorDisciplina, IndicadorRevisao, ResumoMensal } from "@/lib/opr-cessionarios";

const STATUS_CANCELADO = "CANCELADO";
const DISCIPLINA_ART = "ART/RRT";
const STATUS_LIBERADOS = ["LIBERADO", "LIBERADO C/ REST."];

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
  teve_substituicao: number | null;
};

type LinhaEnriquecida = LinhaBruta & { status_entrega_calc: string };

function statusEntregaPrestador(
  dataSolicitacao: string | null,
  dataAnalise: string | null,
  holdDias: number,
  slaDias: number,
  holdAbertoDesde: string | null,
): string {
  const decorridos = diasUteisDecorridos(dataSolicitacao, dataAnalise, holdDias, holdAbertoDesde);
  let status = decorridos < slaDias ? "ANTES DO PRAZO" : decorridos === slaDias ? "NO PRAZO" : "ATRASADO";
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

function enriquecerPrestadores(linhas: LinhaBruta[]): LinhaEnriquecida[] {
  return linhas.map((linha) => {
    const hold = calcularHoldDias(linha.hold_inicio, linha.hold_fim);
    const holdAberto = emHold(linha.hold_inicio, linha.hold_fim);
    const sla = linha.sla_dias != null ? linha.sla_dias : SLA_PRESTADORES_DIAS_UTEIS;
    const status = statusEntregaPrestador(
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

export type DadosOprPrestadores = {
  disciplinas: IndicadorDisciplina[];
  porRevisao: IndicadorRevisao[];
  resumo: ResumoMensal;
  acumuladoAtual: AcumuladoMes[];
  acumuladoAnterior: AcumuladoMes[];
};

/** Monta todos os indicadores do One Page Report de Prestadores para um
 * mês/ano — mesma lógica de gat/opr_cessionarios_infografico.py aplicada
 * à tabela de prestadores, incluindo o cálculo dinâmico de
 * status_entrega_calc via `status_entrega_prestador`
 * (gat/business_rules.py), que usa dias úteis decorridos (não saldo) e o
 * SLA fixo de 10 dias úteis quando não houver `sla_dias` específico. */
export async function buscarDadosOprPrestadores(mes: number, ano: number): Promise<DadosOprPrestadores> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaBruta>(
    `SELECT id, disciplina, revisao, status_analise, num_documentos,
            data_solicitacao, data_analise, hold_inicio, hold_fim,
            sla_dias, teve_substituicao
     FROM prestadores WHERE arquivado_em IS NULL`,
  );

  const completo = enriquecerPrestadores(filtrarAtivos(rows));
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
