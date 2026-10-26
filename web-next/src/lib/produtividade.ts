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
