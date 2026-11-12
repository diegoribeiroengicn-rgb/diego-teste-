import { paraData } from "@/lib/dias-uteis";

const DISCIPLINA_ART = "ART/RRT";
const STATUS_CONCLUIDOS = new Set(["LIBERADO", "LIBERADO C/ REST."]);
const STATUS_EM_ANALISE = "EM ANÁLISE";

export type ModuloProdutividade = "prestadores" | "cessionarios";

export type LinhaProdutividade = {
  id: number;
  origem: ModuloProdutividade;
  item: number | null;
  codigo: string | null;
  nomeEntidade: string | null;
  disciplina: string;
  revisao: number | null;
  numAt: string | null;
  responsavel: string;
  statusAnalise: string;
  numDocumentos: number;
  dataSolicitacao: string | null;
  dataAnalise: string | null;
  statusEntregaCalc: "ANTES DO PRAZO" | "NO PRAZO" | "ATRASADO" | null;
  tempoAnalise: number | null;
};

export type IndicadoresMensais = {
  recebidos: number;
  concluidos: number;
  emAnalise: number;
  documentos: number;
  slaPercentual: number;
  backlog: number;
};

export type AcumuladoAno = { recebidos: number; concluidos: number; documentos: number };

export type ProdutividadeAnalista = {
  responsavel: string;
  projetosAnalisados: number;
  documentos: number;
  atsEmitidas: number;
  tempoMedioAnalise: number;
  slaAtendidoPct: number;
  backlog: number;
  concluidos: number;
  emAndamento: number;
};

function ehArt(disciplina: string): boolean {
  return disciplina.trim().toUpperCase() === DISCIPLINA_ART;
}

function noMes(data: string | null, mes: number | null, ano: number | null): boolean {
  if (mes == null && ano == null) return true;
  const d = paraData(data);
  if (!d) return false;
  if (mes != null && d.getUTCMonth() + 1 !== mes) return false;
  if (ano != null && d.getUTCFullYear() !== ano) return false;
  return true;
}

function fimDoMesUTC(mes: number, ano: number): number {
  return Date.UTC(ano, mes, 0, 23, 59, 59);
}

/** Indicadores de um módulo (Prestadores, Cessionários, ou os dois juntos
 * para o Consolidado) numa competência — mesma regra de
 * gat/relatorios_mensais.py::indicadores_mensais_modulo. Observação sobre
 * "backlog": o esquema não guarda histórico de mudança de status por
 * data, então o backlog de uma competência passada é uma aproximação
 * (projetos ainda "EM ANÁLISE" hoje que já haviam sido solicitados até o
 * fim daquele mês), não uma reconstrução exata do backlog real na época. */
export function indicadoresMensaisModulo(linhas: LinhaProdutividade[], mes: number, ano: number): IndicadoresMensais {
  if (linhas.length === 0) {
    return { recebidos: 0, concluidos: 0, emAnalise: 0, documentos: 0, slaPercentual: 0, backlog: 0 };
  }
  const semArt = linhas.filter((l) => !ehArt(l.disciplina));

  const recebidosCompleto = linhas.filter((l) => noMes(l.dataSolicitacao, mes, ano));
  const documentos = recebidosCompleto.reduce((s, l) => s + l.numDocumentos, 0);
  const recebidos = recebidosCompleto.filter((l) => !ehArt(l.disciplina));

  const concluidos = semArt.filter((l) => noMes(l.dataAnalise, mes, ano) && STATUS_CONCLUIDOS.has(l.statusAnalise));
  const emAnalise = recebidos.filter((l) => l.statusAnalise === STATUS_EM_ANALISE);

  const fimMes = fimDoMesUTC(mes, ano);
  const backlog = semArt.filter((l) => {
    if (l.statusAnalise !== STATUS_EM_ANALISE) return false;
    const d = paraData(l.dataSolicitacao);
    return !!d && d.getTime() <= fimMes;
  });

  const slaCumprido = concluidos.filter((l) => l.statusEntregaCalc !== "ATRASADO").length;
  const slaPercentual = concluidos.length ? Math.round((1000 * slaCumprido) / concluidos.length) / 10 : 0;

  return {
    recebidos: recebidos.length,
    concluidos: concluidos.length,
    emAnalise: emAnalise.length,
    documentos,
    slaPercentual,
    backlog: backlog.length,
  };
}

/** Linhas cuja `coluna` de data cai na competência informada — mesmo
 * filtro usado internamente por `indicadoresMensaisModulo`, exportado à
 * parte para montar a lista de projetos da exportação (Excel/PDF). */
export function linhasDaCompetencia(
  linhas: LinhaProdutividade[], coluna: "dataSolicitacao" | "dataAnalise", mes: number, ano: number,
): LinhaProdutividade[] {
  return linhas.filter((l) => noMes(l[coluna], mes, ano));
}

export function mesAnterior(mes: number, ano: number): [number, number] {
  return mes === 1 ? [12, ano - 1] : [mes - 1, ano];
}

/** [valor atual, texto do delta] para comparação com outra competência —
 * mesma regra de gat/relatorios_mensais.py::comparativo_mensal. */
export function comparativoMensal(
  atual: IndicadoresMensais, anterior: IndicadoresMensais, chave: keyof IndicadoresMensais,
): [number, string | null] {
  const valorAtual = atual[chave];
  const valorAnterior = anterior[chave];
  if (!valorAnterior) return [valorAtual, null];
  const delta = valorAtual - valorAnterior;
  const sinal = delta >= 0 ? "+" : "";
  return [valorAtual, `${sinal}${delta} vs. mês anterior`];
}

/** Indicadores acumulados do ano inteiro — mesma regra de
 * gat/relatorios_mensais.py::acumulado_ano. */
export function acumuladoAno(linhas: LinhaProdutividade[], ano: number): AcumuladoAno {
  if (linhas.length === 0) return { recebidos: 0, concluidos: 0, documentos: 0 };
  const recebidosCompleto = linhas.filter((l) => noMes(l.dataSolicitacao, null, ano));
  const documentos = recebidosCompleto.reduce((s, l) => s + l.numDocumentos, 0);
  const recebidos = recebidosCompleto.filter((l) => !ehArt(l.disciplina));
  const concluidos = linhas
    .filter((l) => noMes(l.dataAnalise, null, ano) && !ehArt(l.disciplina))
    .filter((l) => STATUS_CONCLUIDOS.has(l.statusAnalise));
  return { recebidos: recebidos.length, concluidos: concluidos.length, documentos };
}

export type ResumoExecutivoMensal = {
  totalProjetos: number;
  totalPrestadores: number;
  totalCessionarios: number;
  concluidos: number;
  emAnalise: number;
  documentos: number;
  slaPercentual: number;
  backlog: number;
  produtividadeMedia: number;
};

/** Resumo consolidado (Prestadores + Cessionários) de uma competência,
 * para o One Page Report executivo — mesma regra do bloco de resumo em
 * views/relatorios_mensais.py::render. */
export function resumoExecutivoMensal(
  linhasPrest: LinhaProdutividade[], linhasCess: LinhaProdutividade[], mes: number, ano: number,
): ResumoExecutivoMensal {
  const indPrest = indicadoresMensaisModulo(linhasPrest, mes, ano);
  const indCess = indicadoresMensaisModulo(linhasCess, mes, ano);
  const prod = calcularProdutividadeAnalistas([...linhasPrest, ...linhasCess], mes, ano);
  const produtividadeMedia = prod.length
    ? Math.round((10 * prod.reduce((s, p) => s + p.projetosAnalisados, 0)) / prod.length) / 10
    : 0;

  return {
    totalProjetos: indPrest.recebidos + indCess.recebidos,
    totalPrestadores: indPrest.recebidos,
    totalCessionarios: indCess.recebidos,
    concluidos: indPrest.concluidos + indCess.concluidos,
    emAnalise: indPrest.emAnalise + indCess.emAnalise,
    documentos: indPrest.documentos + indCess.documentos,
    slaPercentual: Math.round((10 * (indPrest.slaPercentual + indCess.slaPercentual)) / 2) / 10,
    backlog: indPrest.backlog + indCess.backlog,
    produtividadeMedia,
  };
}

/** [texto do comparativo "Total de Projetos", texto do comparativo
 * "Concluídos"] entre o resumo atual e o do mês anterior — mesma regra
 * de `comparativo_opr` em views/relatorios_mensais.py::render. */
export function comparativoResumoExecutivo(
  atual: ResumoExecutivoMensal, anterior: ResumoExecutivoMensal,
): { totalProjetos: string; concluidos: string } {
  function delta(valorAtual: number, valorAnterior: number): string {
    if (!valorAnterior) return "sem variação relevante";
    const d = valorAtual - valorAnterior;
    return `${d >= 0 ? "+" : ""}${d} vs. mês anterior`;
  }
  return {
    totalProjetos: delta(atual.totalProjetos, anterior.totalProjetos),
    concluidos: delta(atual.concluidos, anterior.concluidos),
  };
}

/** Produtividade por analista — mesma regra de
 * gat/relatorios_mensais.py::produtividade_analistas. `mes`/`ano` nulos
 * consideram todo o histórico. */
export function calcularProdutividadeAnalistas(
  linhas: LinhaProdutividade[],
  mes: number | null,
  ano: number | null,
  opcoes: { disciplina?: string; analista?: string } = {},
): ProdutividadeAnalista[] {
  let base = linhas;
  if (opcoes.disciplina) base = base.filter((l) => l.disciplina === opcoes.disciplina);
  if (opcoes.analista) base = base.filter((l) => l.responsavel === opcoes.analista);

  const concluidosCompleto = base.filter((l) => noMes(l.dataAnalise, mes, ano) && STATUS_CONCLUIDOS.has(l.statusAnalise));
  const concluidos = concluidosCompleto.filter((l) => !ehArt(l.disciplina));
  const semArt = base.filter((l) => !ehArt(l.disciplina));
  const emAndamentoTodos = semArt.filter((l) => l.statusAnalise === STATUS_EM_ANALISE);

  let backlogTodos: LinhaProdutividade[];
  if (mes != null && ano != null) {
    const fimMes = fimDoMesUTC(mes, ano);
    backlogTodos = semArt.filter((l) => {
      if (l.statusAnalise !== STATUS_EM_ANALISE) return false;
      const d = paraData(l.dataSolicitacao);
      return !!d && d.getTime() <= fimMes;
    });
  } else {
    backlogTodos = emAndamentoTodos;
  }

  const responsaveis = [...new Set(base.map((l) => l.responsavel))].sort();
  return responsaveis.map((resp): ProdutividadeAnalista => {
    const grupoConcluidos = concluidos.filter((l) => l.responsavel === resp);
    const grupoConcluidosCompleto = concluidosCompleto.filter((l) => l.responsavel === resp);
    const grupoBacklog = backlogTodos.filter((l) => l.responsavel === resp);
    const grupoAndamento = emAndamentoTodos.filter((l) => l.responsavel === resp);

    const slaCumprido = grupoConcluidos.filter((l) => l.statusEntregaCalc !== "ATRASADO").length;
    const slaPct = grupoConcluidos.length ? Math.round((1000 * slaCumprido) / grupoConcluidos.length) / 10 : 0;
    const tempos = grupoConcluidos.map((l) => l.tempoAnalise).filter((v): v is number => v != null);
    const tempoMedio = tempos.length ? Math.round((10 * tempos.reduce((s, v) => s + v, 0)) / tempos.length) / 10 : 0;
    const atsEmitidas = grupoConcluidos.filter((l) => (l.numAt || "").trim()).length;

    return {
      responsavel: resp,
      projetosAnalisados: grupoConcluidos.length,
      documentos: grupoConcluidosCompleto.reduce((s, l) => s + l.numDocumentos, 0),
      atsEmitidas,
      tempoMedioAnalise: tempoMedio,
      slaAtendidoPct: slaPct,
      backlog: grupoBacklog.length,
      concluidos: grupoConcluidos.length,
      emAndamento: grupoAndamento.length,
    };
  });
}

/** Texto de metodologia do indicador, exibido junto dele (telas e One Page
 * Report). Descreve exatamente a regra de `indicadoresMensaisModulo`. */
export const METODOLOGIA_BACKLOG = {
  titulo: "Metodologia — Backlog do Período",
  paragrafos: [
    "O que é: quantidade de análises que, ao fim do mês da competência, ainda estavam em aberto (status EM ANÁLISE), independentemente de terem sido recebidas no próprio mês ou antes. Mostra a fila de trabalho acumulada, não só o que chegou no período.",
    "Como é apurado: contam-se, em Prestadores e Cessionários, as análises não arquivadas com status EM ANÁLISE e Data de Solicitação até o último dia do mês. ARTs (disciplina ART/RRT) não são AT e ficam de fora; análises em HOLD, liberadas, não liberadas, obsoletas ou canceladas também não entram.",
    "Influência das pendências: toda análise ainda pendente permanece no backlog dos meses seguintes até ser concluída; por isso, entregas atrasadas fazem o indicador crescer mesmo sem aumento de demanda. O sistema guarda só o status atual: em competências passadas o valor é uma aproximação (análises ainda em aberto hoje que já haviam sido solicitadas até aquele mês).",
    "Como interpretar: backlog estável ou em queda com SLA alto indica fila sob controle; backlog crescente indica que as entradas superam a capacidade de conclusão, devendo ser lido junto de Projetos Concluídos, % SLA Cumprido e da carga por analista.",
  ],
};
