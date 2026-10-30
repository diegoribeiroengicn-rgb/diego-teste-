import type { ItemPrioridade } from "@/lib/lista-prioridades";
import {
  COLUNAS_RELATORIO_PRIORIDADES, calcularKpisPrioridades, identificadorProjeto,
  prepararLinhaRelatorio, prepararParesIndividual,
} from "@/lib/relatorios-prioridades-calculo";
import { cabecalhoInstitucional, secao, tabelaIndicadores, tabelaDados, documentoParaBuffer, nomeArquivo } from "@/lib/export-word";
import { criarDocumento, cabecalho as cabecalhoPdf, tabelaKpis, tabelaDados as tabelaDadosPdf, secao as secaoPdf, documentoParaBuffer as pdfParaBuffer, nomeArquivoPdf } from "@/lib/export-pdf";
import { gerarExcelBytes, nomeArquivoExcel } from "@/lib/export-excel-generico";

/** Relatórios de Prioridades (Word/Excel/PDF, coletivo e individual) —
 * porta de gat/relatorios_prioridades.py, reaproveitando as libs
 * genéricas de exportação (export-word.ts/export-pdf.ts/
 * export-excel-generico.ts). */

export async function gerarExcelPrioridades(itens: ItemPrioridade[]): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const linhas = itens.map(prepararLinhaRelatorio);
  const buffer = await gerarExcelBytes([...COLUNAS_RELATORIO_PRIORIDADES], linhas, "Lista de Prioridades");
  return { buffer, nomeArquivo: nomeArquivoExcel("Prioridades", "Coletivo") };
}

export async function gerarWordPrioridadesColetivo(itens: ItemPrioridade[], usuarioResponsavel: string): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const kpis = calcularKpisPrioridades(itens);
  const linhas = itens.map(prepararLinhaRelatorio);
  const children = [
    ...cabecalhoInstitucional({
      titulo: "Relatório de Prioridades — Coletivo", subtitulo: "GAT 2026 · Controle de Análises Técnicas · Tecnoplano",
      periodoLabel: "Situação atual", usuarioResponsavel,
    }),
    secao("Indicadores", 2),
    ...tabelaIndicadores(kpis),
    secao("Projetos prioritários", 2),
    ...tabelaDados([...COLUNAS_RELATORIO_PRIORIDADES], linhas),
  ];
  const buffer = await documentoParaBuffer(children);
  return { buffer, nomeArquivo: nomeArquivo("Prioridades", "Coletivo") };
}

export async function gerarWordPrioridadesIndividual(item: ItemPrioridade, usuarioResponsavel: string): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const children = [
    ...cabecalhoInstitucional({
      titulo: "Relatório de Prioridades — Individual",
      subtitulo: `GAT 2026 · Controle de Análises Técnicas · Tecnoplano · ${item.nome_entidade || "—"}`,
      periodoLabel: "Situação atual", usuarioResponsavel,
    }),
    secao("Dados do projeto prioritário", 2),
    ...tabelaIndicadores(prepararParesIndividual(item)),
  ];
  const buffer = await documentoParaBuffer(children);
  return { buffer, nomeArquivo: nomeArquivo("Prioridades", "Individual", identificadorProjeto(item)) };
}

export async function gerarPdfPrioridadesColetivo(itens: ItemPrioridade[]): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const kpis = calcularKpisPrioridades(itens).map(([r, v]) => [r, String(v)] as [string, string]);
  const linhas = itens.map(prepararLinhaRelatorio);
  const doc = criarDocumento({ paisagem: true });
  cabecalhoPdf(doc, "Relatório de Prioridades — Coletivo", "GAT 2026 · Controle de Análises Técnicas · Tecnoplano");
  secaoPdf(doc, "Indicadores");
  tabelaKpis(doc, kpis);
  secaoPdf(doc, "Projetos prioritários");
  tabelaDadosPdf(doc, [...COLUNAS_RELATORIO_PRIORIDADES], linhas);
  const buffer = await pdfParaBuffer(doc);
  return { buffer, nomeArquivo: nomeArquivoPdf("Prioridades", "Coletivo") };
}

export async function gerarPdfPrioridadesIndividual(item: ItemPrioridade): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const doc = criarDocumento();
  cabecalhoPdf(doc, "Relatório de Prioridades — Individual", "GAT 2026 · Controle de Análises Técnicas · Tecnoplano");
  secaoPdf(doc, "Dados do projeto");
  tabelaKpis(doc, prepararParesIndividual(item));
  const buffer = await pdfParaBuffer(doc);
  return { buffer, nomeArquivo: nomeArquivoPdf("Prioridades", "Individual", identificadorProjeto(item)) };
}
