import ExcelJS from "exceljs";

/** Exportação genérica de uma única aba (.xlsx) — mesma regra de
 * gat/export_projetos.py::gerar_excel_bytes: cabeçalho opcional acima da
 * tabela, colunas com largura automática (limitada a 10–45), painel
 * congelado logo abaixo do cabeçalho de colunas. */
export async function gerarExcelBytes(
  colunas: string[], linhas: Record<string, unknown>[], nomeAba: string, cabecalho?: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const planilha = workbook.addWorksheet(nomeAba.slice(0, 31));
  const linhaInicial = cabecalho ? 3 : 1;

  if (cabecalho) {
    planilha.getCell(1, 1).value = cabecalho;
  }

  const linhaCabecalhoColunas = planilha.getRow(linhaInicial);
  colunas.forEach((c, i) => { linhaCabecalhoColunas.getCell(i + 1).value = c; });
  linhaCabecalhoColunas.font = { bold: true };

  linhas.forEach((linha, idx) => {
    const row = planilha.getRow(linhaInicial + 1 + idx);
    colunas.forEach((c, i) => {
      const valor = linha[c];
      row.getCell(i + 1).value = valor == null ? null : (valor as string | number | boolean);
    });
  });

  colunas.forEach((c, i) => {
    const maiorConteudo = Math.max(
      c.length,
      ...linhas.slice(0, 200).map((l) => String(l[c] ?? "").length),
    );
    planilha.getColumn(i + 1).width = Math.min(Math.max(maiorConteudo + 2, 10), 45);
  });

  planilha.views = [{ state: "frozen", ySplit: linhaInicial }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function nomeArquivoExcel(...partes: (string | null | undefined)[]): string {
  const limpo = partes.filter((p): p is string => !!p).map((p) => p.replace(/\s+/g, "_").replace(/[^\w-]/g, ""));
  return `${limpo.join("_")}.xlsx`;
}
