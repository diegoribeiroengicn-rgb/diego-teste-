import { paraData } from "@/lib/dias-uteis";
import { calcularIntervalosRevisao, type LinhaRevisao } from "@/lib/revisoes-calculo";

/** Motor de indicadores do OPR (One Page Report) institucional — versões
 * Resumida e Executiva, para Prestadores, Cessionários ou Consolidado,
 * em qualquer período (mensal, anual ou personalizado). Mesma regra de
 * gat/opr.py — opera sobre linhas já filtradas (módulo, período, filtros
 * avançados do OPR), nunca decide o período ou os filtros. */

const STATUS_APROVADOS = new Set(["LIBERADO", "LIBERADO C/ REST."]);
const STATUS_CONCLUIDOS = STATUS_APROVADOS;
const STATUS_EM_ANALISE = "EM ANÁLISE";
const DISCIPLINA_ART = "ART/RRT";
const META_REVISAO_APROVACAO = 2;

/** Uma linha de prestador/cessionário já enriquecida (mesmo formato de
 * LinhaRevisao, usado para os cálculos de SLA externo/intervalos de
 * revisão) com `numDocumentos` adicional — necessário para o indicador
 * "Documentos Analisados", que LinhaRevisao não carrega. */
export type LinhaOpr = LinhaRevisao & { numDocumentos: number };

function ehArt(disciplina: string | null): boolean {
  return (disciplina || "").trim().toUpperCase() === DISCIPLINA_ART;
}

export type IndicadoresMetaRev2 = {
  aprovadosRev0: number;
  aprovadosRev1: number;
  aprovadosRev2: number;
  aprovadosAteRev2: number;
  acimaRev2: number;
  totalAprovados: number;
  percentualAtual: number;
  meta: number;
  distanciaDaMeta: number;
};

/** Acompanhamento da meta de aprovação até a REV2 — mesma regra de
 * gat/business_rules.py::indicadores_meta_rev2. */
export function indicadoresMetaRev2(
  linhas: { statusAnalise: string; revisao: number }[], metaPercentual: number,
): IndicadoresMetaRev2 {
  const aprovados = linhas.filter((l) => STATUS_APROVADOS.has(l.statusAnalise));
  const totalAprovados = aprovados.length;
  const aprovadosRev0 = aprovados.filter((l) => l.revisao === 0).length;
  const aprovadosRev1 = aprovados.filter((l) => l.revisao === 1).length;
  const aprovadosRev2 = aprovados.filter((l) => l.revisao === META_REVISAO_APROVACAO).length;
  const aprovadosAteRev2 = aprovados.filter((l) => l.revisao <= META_REVISAO_APROVACAO).length;
  const acimaRev2 = linhas.filter((l) => l.revisao > META_REVISAO_APROVACAO).length;

  const percentualAtual = totalAprovados ? Math.round((1000 * aprovadosAteRev2) / totalAprovados) / 10 : 0;
  const distanciaDaMeta = Math.round((percentualAtual - metaPercentual) * 10) / 10;

  return {
    aprovadosRev0, aprovadosRev1, aprovadosRev2, aprovadosAteRev2, acimaRev2, totalAprovados,
    percentualAtual, meta: metaPercentual, distanciaDaMeta,
  };
}

export type IndicadoresExecutivos = {
  totalProjetos: number;
  recebidos: number;
  emAnalise: number;
  concluidos: number;
  atrasados: number;
  dentroDoPrazo: number;
  acimaRev2: number;
  aprovadosAteRev2: number;
  totalAprovados: number;
  aprovadosAteRev2Pct: number;
  metaRev2Pct: number;
  distanciaDaMeta: number;
  slaInternoPct: number;
  tempoMedioAnaliseInterna: number | null;
  tempoMedioEntreRevisoes: number | null;
  slaExternoPct: number | null;
  qtdIntervalos: number;
  qtdForaSlaExterno: number;
  qtdInconsistentes: number;
  documentos: number;
};

function executivosVazio(metaRev2Pct: number, documentos = 0): IndicadoresExecutivos {
  return {
    totalProjetos: 0, recebidos: 0, emAnalise: 0, concluidos: 0, atrasados: 0, dentroDoPrazo: 0,
    acimaRev2: 0, aprovadosAteRev2: 0, totalAprovados: 0, aprovadosAteRev2Pct: 0, metaRev2Pct,
    distanciaDaMeta: 0, slaInternoPct: 0, tempoMedioAnaliseInterna: null, tempoMedioEntreRevisoes: null,
    slaExternoPct: null, qtdIntervalos: 0, qtdForaSlaExterno: 0, qtdInconsistentes: 0, documentos,
  };
}

/** Conjunto completo de indicadores executivos do OPR, calculado sobre as
 * linhas já filtradas (módulo + período + filtros avançados do OPR) —
 * mesma regra de gat/opr.py::indicadores_executivos. */
export function indicadoresExecutivos(linhas: LinhaOpr[], metaRev2Percentual = 80): IndicadoresExecutivos {
  if (linhas.length === 0) return executivosVazio(metaRev2Percentual);

  // ART não é AT: conta para documentos (abaixo, com a base ainda
  // completa), nunca para a contagem de projetos/ATs/revisões.
  const documentos = linhas.reduce((s, l) => s + l.numDocumentos, 0);
  const semArt = linhas.filter((l) => !ehArt(l.disciplina));
  if (semArt.length === 0) return executivosVazio(metaRev2Percentual, documentos);

  const concluidos = semArt.filter((l) => STATUS_CONCLUIDOS.has(l.statusAnalise));
  const emAnalise = semArt.filter((l) => l.statusAnalise === STATUS_EM_ANALISE);
  const atrasados = semArt.filter((l) => l.statusEntregaCalc === "ATRASADO");
  const dentroPrazo = semArt.filter((l) => l.statusEntregaCalc !== "ATRASADO");

  const meta = indicadoresMetaRev2(semArt, metaRev2Percentual);

  const intervalos = calcularIntervalosRevisao(semArt);
  const intervalosValidos = intervalos.filter((i) => i.situacaoSla !== "DATA INCONSISTENTE");
  const temposRetorno = intervalosValidos.map((i) => i.diasUteisRetorno).filter((v): v is number => v != null);
  const tempoMedioEntreRevisoes = temposRetorno.length
    ? Math.round((10 * temposRetorno.reduce((s, v) => s + v, 0)) / temposRetorno.length) / 10
    : null;
  const dentroSlaExterno = intervalosValidos.filter((i) => i.situacaoSla === "DENTRO DO SLA").length;
  const slaExternoPct = intervalosValidos.length ? Math.round((1000 * dentroSlaExterno) / intervalosValidos.length) / 10 : null;

  const temposInternos = semArt.map((l) => l.tempoAnaliseInterna).filter((v): v is number => v != null);
  const tempoMedioAnaliseInterna = temposInternos.length
    ? Math.round((10 * temposInternos.reduce((s, v) => s + v, 0)) / temposInternos.length) / 10
    : null;

  return {
    totalProjetos: semArt.length,
    recebidos: semArt.length,
    emAnalise: emAnalise.length,
    concluidos: concluidos.length,
    atrasados: atrasados.length,
    dentroDoPrazo: dentroPrazo.length,
    acimaRev2: meta.acimaRev2,
    aprovadosAteRev2: meta.aprovadosAteRev2,
    totalAprovados: meta.totalAprovados,
    aprovadosAteRev2Pct: meta.percentualAtual,
    metaRev2Pct: meta.meta,
    distanciaDaMeta: meta.distanciaDaMeta,
    slaInternoPct: semArt.length ? Math.round((1000 * dentroPrazo.length) / semArt.length) / 10 : 0,
    tempoMedioAnaliseInterna,
    tempoMedioEntreRevisoes,
    slaExternoPct,
    qtdIntervalos: intervalos.length,
    qtdForaSlaExterno: intervalos.filter((i) => i.situacaoSla === "FORA DO SLA").length,
    qtdInconsistentes: intervalos.filter((i) => i.situacaoSla === "DATA INCONSISTENTE").length,
    documentos,
  };
}

function mediaPonderada(v1: number | null, n1: number, v2: number | null, n2: number): number | null {
  if (v1 == null && v2 == null) return null;
  if (v1 == null) return v2;
  if (v2 == null) return v1;
  const pesoTotal = n1 + n2;
  return pesoTotal ? Math.round((10 * (v1 * n1 + v2 * n2)) / pesoTotal) / 10 : Math.round((10 * (v1 + v2)) / 2) / 10;
}

/** Combina os indicadores executivos de Prestadores e Cessionários num
 * único consolidado — contagens somadas; percentuais recalculados a
 * partir das contagens (não média simples), para não distorcer quando os
 * volumes são muito diferentes. Mesma regra de
 * gat/opr.py::combinar_executivos. */
export function combinarExecutivos(execPrest: IndicadoresExecutivos, execCess: IndicadoresExecutivos): IndicadoresExecutivos {
  const totalProjetos = execPrest.totalProjetos + execCess.totalProjetos;
  const dentroPrazo = execPrest.dentroDoPrazo + execCess.dentroDoPrazo;
  const totalAprovados = execPrest.totalAprovados + execCess.totalAprovados;
  const aprovadosAteRev2 = execPrest.aprovadosAteRev2 + execCess.aprovadosAteRev2;
  const qtdIntervalos = execPrest.qtdIntervalos + execCess.qtdIntervalos;
  const qtdForaSla = execPrest.qtdForaSlaExterno + execCess.qtdForaSlaExterno;
  const qtdValidos = qtdIntervalos - execPrest.qtdInconsistentes - execCess.qtdInconsistentes;

  const metaRev2Pct = execPrest.metaRev2Pct || execCess.metaRev2Pct;
  const aprovadosPct = totalAprovados ? Math.round((1000 * aprovadosAteRev2) / totalAprovados) / 10 : 0;

  return {
    totalProjetos,
    recebidos: totalProjetos,
    emAnalise: execPrest.emAnalise + execCess.emAnalise,
    concluidos: execPrest.concluidos + execCess.concluidos,
    atrasados: execPrest.atrasados + execCess.atrasados,
    dentroDoPrazo: dentroPrazo,
    acimaRev2: execPrest.acimaRev2 + execCess.acimaRev2,
    aprovadosAteRev2,
    totalAprovados,
    aprovadosAteRev2Pct: aprovadosPct,
    metaRev2Pct,
    distanciaDaMeta: Math.round((aprovadosPct - metaRev2Pct) * 10) / 10,
    slaInternoPct: totalProjetos ? Math.round((1000 * dentroPrazo) / totalProjetos) / 10 : 0,
    tempoMedioAnaliseInterna: mediaPonderada(execPrest.tempoMedioAnaliseInterna, execPrest.totalProjetos, execCess.tempoMedioAnaliseInterna, execCess.totalProjetos),
    tempoMedioEntreRevisoes: mediaPonderada(execPrest.tempoMedioEntreRevisoes, execPrest.qtdIntervalos, execCess.tempoMedioEntreRevisoes, execCess.qtdIntervalos),
    slaExternoPct: qtdValidos ? Math.round((1000 * (qtdValidos - qtdForaSla)) / qtdValidos) / 10 : null,
    qtdIntervalos,
    qtdForaSlaExterno: qtdForaSla,
    qtdInconsistentes: execPrest.qtdInconsistentes + execCess.qtdInconsistentes,
    documentos: execPrest.documentos + execCess.documentos,
  };
}

/** Subconjunto de indicadores para o OPR Resumido — mesma regra de
 * gat/opr.py::indicadores_resumidos. */
export function indicadoresResumidos(exec: IndicadoresExecutivos): [string, string][] {
  return [
    ["Total de projetos", String(exec.totalProjetos)],
    ["Concluídos", String(exec.concluidos)],
    ["Em análise", String(exec.emAnalise)],
    ["Atrasados", String(exec.atrasados)],
    ["% dentro do prazo (SLA interno)", `${exec.slaInternoPct}%`],
    ["Aprovados até a REV2", `${exec.aprovadosAteRev2Pct}%`],
  ];
}

function fmt(valor: number | null, sufixo = ""): string {
  return valor == null ? "—" : `${valor}${sufixo}`;
}

export type PeriodoOpr =
  | { tipo: "mensal"; mes: number; ano: number }
  | { tipo: "anual"; ano: number }
  | { tipo: "personalizado"; dataInicio: string; dataFim: string };

/** Filtra pela Data de Solicitação, conforme o tipo de período escolhido
 * no OPR institucional — mesma regra do trecho de período em
 * views/relatorios_mensais.py::_filtrar_opr. */
export function filtrarOprPeriodo(linhas: LinhaOpr[], periodo: PeriodoOpr): LinhaOpr[] {
  if (periodo.tipo === "mensal") {
    return linhas.filter((l) => {
      const d = paraData(l.dataSolicitacao);
      return !!d && d.getUTCMonth() + 1 === periodo.mes && d.getUTCFullYear() === periodo.ano;
    });
  }
  if (periodo.tipo === "anual") {
    return linhas.filter((l) => {
      const d = paraData(l.dataSolicitacao);
      return !!d && d.getUTCFullYear() === periodo.ano;
    });
  }
  const inicio = paraData(periodo.dataInicio);
  const fim = paraData(periodo.dataFim);
  if (!inicio || !fim) return [];
  return linhas.filter((l) => {
    const d = paraData(l.dataSolicitacao);
    return !!d && d.getTime() >= inicio.getTime() && d.getTime() <= fim.getTime();
  });
}

export type FiltrosOprAvancados = {
  codigo?: string;
  nome?: string;
  numAt?: string;
  disciplina?: string;
  analista?: string;
  revisao?: string;
  status?: string;
};

/** Filtros avançados (texto/igualdade) do OPR institucional — mesma
 * regra de views/relatorios_mensais.py::_filtrar_opr. */
export function filtrarOprAvancado(linhas: LinhaOpr[], f: FiltrosOprAvancados): LinhaOpr[] {
  let resultado = linhas;
  if (f.codigo?.trim()) {
    const q = f.codigo.trim().toLowerCase();
    resultado = resultado.filter((l) => (l.codigo || "").toLowerCase().includes(q));
  }
  if (f.nome?.trim()) {
    const q = f.nome.trim().toLowerCase();
    resultado = resultado.filter((l) => (l.nome || "").toLowerCase().includes(q));
  }
  if (f.numAt?.trim()) {
    const q = f.numAt.trim().toLowerCase();
    resultado = resultado.filter((l) => (l.numAt || "").toLowerCase().includes(q));
  }
  if (f.disciplina) resultado = resultado.filter((l) => l.disciplina === f.disciplina);
  if (f.analista) resultado = resultado.filter((l) => l.responsavel === f.analista);
  if (f.revisao?.trim()) resultado = resultado.filter((l) => String(l.revisao) === f.revisao!.trim());
  if (f.status) resultado = resultado.filter((l) => l.statusAnalise === f.status);
  return resultado;
}

/** Filtro por Situação do SLA externo (retorno entre revisões) — mesma
 * regra de views/relatorios_mensais.py::_aplicar_filtro_sla. */
export function filtrarOprSituacaoSlaExterno(linhas: LinhaOpr[], situacaoSla: string | undefined): LinhaOpr[] {
  if (!situacaoSla) return linhas;
  const intervalos = calcularIntervalosRevisao(linhas);
  const idsComSituacao = new Set(intervalos.filter((i) => i.situacaoSla === situacaoSla).map((i) => i.id));
  return linhas.filter((l) => idsComSituacao.has(l.id));
}

/** Lista completa de indicadores para o OPR Executivo — mesma regra de
 * gat/opr.py::indicadores_completos. */
export function indicadoresCompletos(exec: IndicadoresExecutivos): [string, string][] {
  return [
    ["Total de projetos no período", String(exec.totalProjetos)],
    ["Recebidos", String(exec.recebidos)],
    ["Em análise", String(exec.emAnalise)],
    ["Concluídos", String(exec.concluidos)],
    ["Atrasados", String(exec.atrasados)],
    ["Dentro do prazo", String(exec.dentroDoPrazo)],
    ["Acima da REV2", String(exec.acimaRev2)],
    ["Aprovados até a REV2", `${exec.aprovadosAteRev2} de ${exec.totalAprovados} aprovados`],
    ["% aprovação até a REV2", `${exec.aprovadosAteRev2Pct}%`],
    ["Meta de aprovação até a REV2", `${exec.metaRev2Pct}%`],
    ["Distância da meta (p.p.)", String(exec.distanciaDaMeta)],
    ["SLA interno cumprido", `${exec.slaInternoPct}%`],
    ["Tempo médio de análise interna (dias úteis)", fmt(exec.tempoMedioAnaliseInterna)],
    ["Tempo médio entre revisões — retorno externo (dias úteis)", fmt(exec.tempoMedioEntreRevisoes)],
    ["SLA externo cumprido (retorno em até 10 dias úteis)", fmt(exec.slaExternoPct, "%")],
    ["Intervalos de retorno calculados", String(exec.qtdIntervalos)],
    ["Fora do SLA externo (retorno > 10 dias úteis)", String(exec.qtdForaSlaExterno)],
    ["Datas de revisão inconsistentes (pendente de correção)", String(exec.qtdInconsistentes)],
    ["Documentos analisados", String(exec.documentos)],
  ];
}
