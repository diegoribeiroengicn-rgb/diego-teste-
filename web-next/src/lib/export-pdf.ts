import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

/** Geração de relatórios em PDF, com identidade visual Tecnoplano — mesma
 * regra de gat/export_pdf.py (lá com reportlab; aqui com pdfkit, que não
 * tem tabela nativa, então `desenharTabela` reimplementa o
 * comportamento de `Table`/`TableStyle` do reportlab: cabeçalho navy,
 * linhas listradas, quebra de página redesenhando o cabeçalho). */

const NAVY = "#1B3A8A";
const TEXTO_FRACO = "#64748B";
const CINZA_CLARO = "#F1F5F9";
const BORDA = "#E2E8F0";

const MARGEM = 42; // ~1.5cm em pontos

function logoPath(): string | null {
  const caminho = path.join(process.cwd(), "public", "tecnoplano_logo.png");
  return fs.existsSync(caminho) ? caminho : null;
}

export function criarDocumento(opts: { paisagem?: boolean } = {}): PDFKit.PDFDocument {
  return new PDFDocument({
    size: "A4", layout: opts.paisagem ? "landscape" : "portrait",
    margins: { top: MARGEM, bottom: MARGEM, left: MARGEM, right: MARGEM },
    bufferPages: true,
  });
}

export async function documentoParaBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pedacos: Buffer[] = [];
    doc.on("data", (p: Buffer) => pedacos.push(p));
    doc.on("end", () => resolve(Buffer.concat(pedacos)));
    doc.on("error", reject);
    doc.end();
  });
}

/** Cabeçalho institucional — logo, título, subtítulo. Mesma regra de
 * gat/export_pdf.py::_cabecalho. */
export function cabecalho(doc: PDFKit.PDFDocument, titulo: string, subtitulo: string): void {
  const logo = logoPath();
  if (logo) {
    doc.image(logo, doc.page.margins.left, doc.y, { width: 91 });
    doc.moveDown(2.2);
  }
  doc.font("Helvetica-Bold").fontSize(17).fillColor(NAVY).text(titulo);
  doc.font("Helvetica").fontSize(10).fillColor(TEXTO_FRACO).text(subtitulo);
  doc.moveDown(0.6);
}

type ColunaTabela = { titulo?: string; largura: number };

function alturaLinha(doc: PDFKit.PDFDocument, valores: string[], colunas: ColunaTabela[], tamanhoFonte: number): number {
  let maior = 0;
  for (let i = 0; i < valores.length; i++) {
    const h = doc.heightOfString(valores[i], { width: colunas[i].largura - 12 });
    maior = Math.max(maior, h);
  }
  return Math.max(maior + 8, tamanhoFonte + 10);
}

/** Desenha uma tabela genérica (cabeçalho navy opcional + linhas
 * listradas), quebrando de página e redesenhando o cabeçalho quando
 * necessário — substitui `reportlab.platypus.Table` usado no original. */
function desenharTabela(
  doc: PDFKit.PDFDocument, colunas: ColunaTabela[], linhas: string[][], opts: { comCabecalho: boolean },
): void {
  const inicioX = doc.page.margins.left;
  const alturaMaxima = doc.page.height - doc.page.margins.bottom;
  const tamanhoFonte = 9;

  function desenharCabecalho() {
    if (!opts.comCabecalho) return;
    const h = alturaLinha(doc, colunas.map((c) => c.titulo ?? ""), colunas, tamanhoFonte);
    const y = doc.y;
    let x = inicioX;
    doc.fillColor(NAVY).rect(inicioX, y, colunas.reduce((s, c) => s + c.largura, 0), h).fill();
    doc.font("Helvetica-Bold").fontSize(tamanhoFonte).fillColor("#FFFFFF");
    for (const col of colunas) {
      doc.text(col.titulo ?? "", x + 6, y + 5, { width: col.largura - 12 });
      x += col.largura;
    }
    doc.y = y + h;
  }

  desenharCabecalho();

  linhas.forEach((valores, indice) => {
    const h = alturaLinha(doc, valores, colunas, tamanhoFonte);
    if (doc.y + h > alturaMaxima) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      desenharCabecalho();
    }
    const y = doc.y;
    const largura = colunas.reduce((s, c) => s + c.largura, 0);
    if (indice % 2 === 1) {
      doc.fillColor(CINZA_CLARO).rect(inicioX, y, largura, h).fill();
    }
    doc.strokeColor(BORDA).lineWidth(0.5).rect(inicioX, y, largura, h).stroke();
    let x = inicioX;
    doc.font("Helvetica").fontSize(tamanhoFonte).fillColor("#0F172A");
    valores.forEach((valor, i) => {
      doc.text(valor, x + 6, y + 5, { width: colunas[i].largura - 12 });
      doc.strokeColor(BORDA).lineWidth(0.5).moveTo(x, y).lineTo(x, y + h).stroke();
      x += colunas[i].largura;
    });
    doc.strokeColor(BORDA).lineWidth(0.5).moveTo(x, y).lineTo(x, y + h).stroke();
    doc.y = y + h;
  });
  doc.moveDown(0.8);
}

/** Tabela de indicadores (rótulo/valor) — primeira coluna com fundo claro
 * e negrito. Mesma regra de gat/export_pdf.py::_tabela_kpis. */
export function tabelaKpis(doc: PDFKit.PDFDocument, pares: [string, string][]): void {
  if (!pares.length) {
    doc.font("Helvetica-Oblique").fontSize(9.5).fillColor(TEXTO_FRACO)
      .text("Nenhum indicador disponível para os filtros aplicados.");
    doc.moveDown(0.6);
    return;
  }
  const larguraDisponivel = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colunas: ColunaTabela[] = [{ largura: larguraDisponivel * 0.55 }, { largura: larguraDisponivel * 0.45 }];
  const inicioX = doc.page.margins.left;
  const tamanhoFonte = 9.5;

  pares.forEach(([rotulo, valor]) => {
    const h = alturaLinha(doc, [rotulo, valor], colunas, tamanhoFonte);
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      doc.y = doc.page.margins.top;
    }
    const y = doc.y;
    doc.fillColor(CINZA_CLARO).rect(inicioX, y, colunas[0].largura, h).fill();
    doc.strokeColor(BORDA).lineWidth(0.5).rect(inicioX, y, colunas[0].largura + colunas[1].largura, h).stroke();
    doc.strokeColor(BORDA).moveTo(inicioX + colunas[0].largura, y).lineTo(inicioX + colunas[0].largura, y + h).stroke();
    doc.font("Helvetica-Bold").fontSize(tamanhoFonte).fillColor("#0F172A").text(rotulo, inicioX + 6, y + 5, { width: colunas[0].largura - 12 });
    doc.font("Helvetica").fontSize(tamanhoFonte).fillColor("#0F172A").text(valor, inicioX + colunas[0].largura + 6, y + 5, { width: colunas[1].largura - 12 });
    doc.y = y + h;
  });
  doc.moveDown(0.8);
}

/** Tabela de dados a partir de colunas já na ordem/rótulo finais — mesma
 * regra de gat/export_pdf.py::_tabela_dataframe. */
export function tabelaDados(doc: PDFKit.PDFDocument, colunas: string[], linhas: Record<string, unknown>[]): void {
  if (!linhas.length) {
    doc.font("Helvetica-Oblique").fontSize(9.5).fillColor(TEXTO_FRACO).text("Nenhum registro encontrado para os filtros aplicados.");
    doc.moveDown(0.6);
    return;
  }
  const larguraDisponivel = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const larguraColuna = larguraDisponivel / colunas.length;
  const defs: ColunaTabela[] = colunas.map((c) => ({ titulo: c, largura: larguraColuna }));
  const valores = linhas.map((linha) => colunas.map((c) => {
    const v = linha[c];
    return v == null || v === "" ? "—" : String(v);
  }));
  desenharTabela(doc, defs, valores, { comCabecalho: true });
}

export function secao(doc: PDFKit.PDFDocument, titulo: string): void {
  doc.font("Helvetica-Bold").fontSize(12).fillColor(NAVY).text(titulo);
  doc.moveDown(0.3);
}

export function nomeArquivoPdf(...partes: (string | null | undefined)[]): string {
  const limpo = partes.filter((p): p is string => !!p).map((p) => p.replace(/\s+/g, "_").replace(/[^\w-]/g, ""));
  return `${limpo.join("_")}.pdf`;
}
