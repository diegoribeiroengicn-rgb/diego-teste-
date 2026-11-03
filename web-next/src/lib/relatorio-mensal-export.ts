import ExcelJS from "exceljs";
import { cabecalho, criarDocumento, documentoParaBuffer, nomeArquivoPdf, secao, tabelaDados, tabelaKpis } from "@/lib/export-pdf";
import { nomeArquivoExcel } from "@/lib/export-excel-generico";
import type { IndicadoresMensais, LinhaProdutividade, ProdutividadeAnalista, ResumoExecutivoMensal } from "@/lib/produtividade";

/** Exportação do "Relatório Mensal" (indicadores + comparativos de um
 * módulo/competência) em Excel e PDF — mesma regra de
 * gat/export_excel.py::gerar_relatorio_mensal_excel e
 * gat/export_pdf.py::gerar_relatorio_mensal_pdf. */

function paresIndicadores(indicadores: IndicadoresMensais): [string, string][] {
  return [
    ["Projetos Recebidos", String(indicadores.recebidos)],
    ["Projetos Concluídos", String(indicadores.concluidos)],
    ["Projetos em Análise", String(indicadores.emAnalise)],
    ["Documentos", String(indicadores.documentos)],
    ["% SLA Cumprido", `${indicadores.slaPercentual}%`],
    ["Backlog do Período", String(indicadores.backlog)],
  ];
}

const COLUNAS_PROJETOS = ["Código", "Entidade", "Disciplina", "N° AT", "Revisão", "Responsável", "Status", "Documentos", "Solicitação", "Análise"];

function linhaProjetoParaExibicao(l: LinhaProdutividade): Record<string, unknown> {
  return {
    "Código": l.codigo,
    "Entidade": l.nomeEntidade,
    "Disciplina": l.disciplina,
    "N° AT": l.numAt,
    "Revisão": l.revisao,
    "Responsável": l.responsavel,
    "Status": l.statusAnalise,
    "Documentos": l.numDocumentos,
    "Solicitação": l.dataSolicitacao,
    "Análise": l.dataAnalise,
  };
}

const COLUNAS_PRODUTIVIDADE = ["Analista", "Projetos Analisados", "Documentos", "ATs Emitidas", "Tempo Médio (dias)", "% SLA Atendido", "Backlog", "Concluídos", "Em Andamento"];

function linhaProdutividadeParaExibicao(p: ProdutividadeAnalista): Record<string, unknown> {
  return {
    "Analista": p.responsavel,
    "Projetos Analisados": p.projetosAnalisados,
    "Documentos": p.documentos,
    "ATs Emitidas": p.atsEmitidas,
    "Tempo Médio (dias)": p.tempoMedioAnalise,
    "% SLA Atendido": `${p.slaAtendidoPct}%`,
    "Backlog": p.backlog,
    "Concluídos": p.concluidos,
    "Em Andamento": p.emAndamento,
  };
}

function escreverAba(workbook: ExcelJS.Workbook, nomeAba: string, titulo: string, colunas: string[], linhas: Record<string, unknown>[]): void {
  const planilha = workbook.addWorksheet(nomeAba.slice(0, 31));
  planilha.getCell(1, 1).value = titulo;
  planilha.getCell(1, 1).font = { bold: true, size: 13 };

  const linhaCabecalho = planilha.getRow(3);
  colunas.forEach((c, i) => { linhaCabecalho.getCell(i + 1).value = c; });
  linhaCabecalho.font = { bold: true };

  linhas.forEach((linha, idx) => {
    const row = planilha.getRow(4 + idx);
    colunas.forEach((c, i) => {
      const valor = linha[c];
      row.getCell(i + 1).value = valor == null ? null : (valor as string | number | boolean);
    });
  });

  colunas.forEach((c, i) => {
    const maiorConteudo = Math.max(c.length, ...linhas.slice(0, 200).map((l) => String(l[c] ?? "").length));
    planilha.getColumn(i + 1).width = Math.min(Math.max(maiorConteudo + 2, 10), 45);
  });
  planilha.views = [{ state: "frozen", ySplit: 3 }];
}

export async function gerarRelatorioMensalExcel(
  moduloLabel: string, competenciaLabel: string, indicadores: IndicadoresMensais,
  linhasProjetos: LinhaProdutividade[], produtividade: ProdutividadeAnalista[],
): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const workbook = new ExcelJS.Workbook();

  escreverAba(
    workbook, "INDICADORES", `RELATÓRIO MENSAL — ${moduloLabel.toUpperCase()} — ${competenciaLabel}`,
    ["Indicador", "Valor"], paresIndicadores(indicadores).map(([indicador, valor]) => ({ "Indicador": indicador, "Valor": valor })),
  );
  if (linhasProjetos.length > 0) {
    escreverAba(workbook, "PROJETOS", `PROJETOS DA COMPETÊNCIA — ${competenciaLabel}`, COLUNAS_PROJETOS, linhasProjetos.map(linhaProjetoParaExibicao));
  }
  if (produtividade.length > 0) {
    escreverAba(workbook, "PRODUTIVIDADE", `PRODUTIVIDADE DOS ANALISTAS — ${competenciaLabel}`, COLUNAS_PRODUTIVIDADE, produtividade.map(linhaProdutividadeParaExibicao));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(buffer), nomeArquivo: nomeArquivoExcel("GAT_2026_Relatorio", moduloLabel, competenciaLabel) };
}

export async function gerarRelatorioMensalPdf(
  moduloLabel: string, competenciaLabel: string, indicadores: IndicadoresMensais, produtividade: ProdutividadeAnalista[],
): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const doc = criarDocumento();
  cabecalho(doc, `Relatório Mensal — ${moduloLabel}`, `GAT 2026 · Controle de Análises Técnicas · Tecnoplano · Competência: ${competenciaLabel}`);

  secao(doc, "Indicadores do período");
  tabelaKpis(doc, paresIndicadores(indicadores));

  if (produtividade.length > 0) {
    secao(doc, "Produtividade dos analistas");
    tabelaDados(doc, COLUNAS_PRODUTIVIDADE, produtividade.map(linhaProdutividadeParaExibicao));
  }

  const buffer = await documentoParaBuffer(doc);
  return { buffer, nomeArquivo: nomeArquivoPdf("GAT_2026_Relatorio", moduloLabel, competenciaLabel) };
}

/** One Page Report — resumo executivo de uma única página, consolidando
 * Prestadores + Cessionários — mesma regra de
 * gat/export_pdf.py::gerar_one_page_report_pdf. */
export async function gerarOnePageReportPdf(
  competenciaLabel: string, resumo: ResumoExecutivoMensal,
  comparativo: { totalProjetos: string; concluidos: string } | null, observacoes: string,
): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const doc = criarDocumento();
  cabecalho(doc, "One Page Report — Resumo Executivo", `GAT 2026 · Controle de Análises Técnicas · Tecnoplano · Competência: ${competenciaLabel}`);

  const linha1: [string, string][] = [
    ["Total de Projetos", String(resumo.totalProjetos)],
    ["Projetos — Prestadores", String(resumo.totalPrestadores)],
    ["Projetos — Cessionários", String(resumo.totalCessionarios)],
    ["Projetos Concluídos", String(resumo.concluidos)],
    ["Projetos em Análise", String(resumo.emAnalise)],
    ["Documentos Analisados", String(resumo.documentos)],
  ];
  const linha2: [string, string][] = [
    ["% SLA Cumprido", `${resumo.slaPercentual}%`],
    ["Backlog do Período", String(resumo.backlog)],
    ["Produtividade — Projetos/Analista", String(resumo.produtividadeMedia)],
  ];

  secao(doc, "Principais indicadores do mês");
  tabelaKpis(doc, linha1);
  tabelaKpis(doc, linha2);

  if (comparativo) {
    secao(doc, "Comparativo com o mês anterior");
    tabelaKpis(doc, [["Total de Projetos", comparativo.totalProjetos], ["Concluídos", comparativo.concluidos]]);
  }

  secao(doc, "Observações gerenciais");
  doc.font("Helvetica").fontSize(9.5).fillColor("#0F172A")
    .text(observacoes || "Nenhuma observação registrada para esta competência.");

  const buffer = await documentoParaBuffer(doc);
  return { buffer, nomeArquivo: nomeArquivoPdf("GAT_2026_OnePageReport", competenciaLabel) };
}
