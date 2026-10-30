import fs from "node:fs";
import path from "node:path";
import {
  Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, ImageRun, Packer,
  AlignmentType, WidthType, BorderStyle, Footer,
} from "docx";

/** Geração de relatórios em Word (.docx) totalmente editável — mesma
 * filosofia de gat/export_word.py: títulos, tabelas e indicadores são
 * conteúdo real do documento (parágrafos e tabelas nativas do Word),
 * nunca uma imagem/captura de tela. Diferente do Python, que mantém um
 * `Document` mutável e vai inserindo elemento a elemento, a biblioteca
 * `docx` do Node é declarativa: cada helper aqui devolve os elementos
 * prontos, que o chamador acumula num array e passa de uma vez para
 * `documentoParaBuffer`. */

const NAVY = "1B3A8A";
const TEXTO_FRACO = "64748B";
const BORDA_CLARA = "D9D9D9";
const FUNDO_LISTRADO = "F1F5F9";

function logoBuffer(): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", "tecnoplano_logo.png"));
  } catch {
    return null;
  }
}

function bordaFina() {
  const estilo = { style: BorderStyle.SINGLE, size: 2, color: BORDA_CLARA };
  return { top: estilo, bottom: estilo, left: estilo, right: estilo };
}

/** Cabeçalho institucional do relatório: logo, título, subtítulo, período
 * selecionado, filtros aplicados, data/hora de geração e responsável.
 * Mesma regra de gat/export_word.py::cabecalho_institucional. */
export function cabecalhoInstitucional(opts: {
  titulo: string;
  subtitulo: string;
  periodoLabel: string;
  filtrosAplicados?: Record<string, string | null | undefined> | null;
  usuarioResponsavel: string;
  compacto?: boolean;
}): Paragraph[] {
  const { titulo, subtitulo, periodoLabel, filtrosAplicados, usuarioResponsavel, compacto } = opts;
  const paragrafos: Paragraph[] = [];

  const logo = logoBuffer();
  if (logo) {
    const largura = compacto ? 121 : 159;
    paragrafos.push(new Paragraph({
      children: [new ImageRun({ data: logo, type: "jpg", transformation: { width: largura, height: Math.round(largura * (65 / 179)) } })],
    }));
  }

  paragrafos.push(new Paragraph({
    children: [new TextRun({ text: titulo, bold: true, color: NAVY, size: compacto ? 28 : 36 })],
  }));
  paragrafos.push(new Paragraph({
    children: [new TextRun({ text: subtitulo, color: TEXTO_FRACO, size: compacto ? 18 : 21 })],
  }));

  const tamanhoMeta = compacto ? 17 : 20;
  const texto_filtros = Object.entries(filtrosAplicados || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");

  paragrafos.push(new Paragraph({
    children: [
      new TextRun({ text: "Período selecionado: ", bold: true, size: tamanhoMeta }),
      new TextRun({ text: periodoLabel || "Todos os períodos", size: tamanhoMeta }),
    ],
  }));
  paragrafos.push(new Paragraph({
    children: [
      new TextRun({ text: "Filtros aplicados: ", bold: true, size: tamanhoMeta }),
      new TextRun({ text: texto_filtros || "Nenhum filtro adicional aplicado.", size: tamanhoMeta }),
    ],
  }));
  paragrafos.push(new Paragraph({
    children: [
      new TextRun({ text: "Gerado em: ", bold: true, size: tamanhoMeta }),
      new TextRun({ text: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), size: tamanhoMeta }),
      new TextRun({ text: "    ·    Responsável: ", bold: true, size: tamanhoMeta }),
      new TextRun({ text: usuarioResponsavel || "—", size: tamanhoMeta }),
    ],
  }));

  if (!compacto) paragrafos.push(new Paragraph({ text: "" }));
  return paragrafos;
}

export function secao(titulo: string, nivel: 1 | 2 | 3 = 1): Paragraph {
  return new Paragraph({
    heading: nivel === 1 ? HeadingLevel.HEADING_1 : nivel === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
    children: [new TextRun({ text: titulo, color: NAVY })],
  });
}

export function paragrafo(texto: string, opts: { negrito?: boolean; italico?: boolean } = {}): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: texto, bold: opts.negrito, italics: opts.italico })] });
}

/** Tabela de duas colunas (indicador/valor) — mesma regra de
 * gat/export_word.py::tabela_indicadores. */
export function tabelaIndicadores(pares: [string, unknown][], titulo?: string): (Paragraph | Table)[] {
  const elementos: (Paragraph | Table)[] = [];
  if (titulo) elementos.push(secao(titulo, 2));
  if (!pares.length) {
    elementos.push(paragrafo("Nenhum indicador disponível para os filtros aplicados.", { italico: true }));
    return elementos;
  }
  const linhas = pares.map(([rotulo, valor]) => new TableRow({
    children: [
      new TableCell({ borders: bordaFina(), children: [new Paragraph({ children: [new TextRun({ text: String(rotulo), bold: true })] })] }),
      new TableCell({ borders: bordaFina(), children: [new Paragraph(valor == null ? "—" : String(valor))] }),
    ],
  }));
  elementos.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: linhas }));
  elementos.push(new Paragraph({ text: "" }));
  return elementos;
}

/** Tabela nativa a partir de uma lista de linhas já com as colunas na
 * ordem/rótulo finais (equivalente ao DataFrame já renomeado em
 * gat/export_word.py::tabela_dataframe). */
export function tabelaDados(colunas: string[], linhas: Record<string, unknown>[], titulo?: string, maxLinhas?: number): (Paragraph | Table)[] {
  const elementos: (Paragraph | Table)[] = [];
  if (titulo) elementos.push(secao(titulo, 2));
  if (!linhas.length) {
    elementos.push(paragrafo("Nenhum registro encontrado para os filtros aplicados.", { italico: true }));
    return elementos;
  }
  const dados = maxLinhas ? linhas.slice(0, maxLinhas) : linhas;
  const cabecalho = new TableRow({
    children: colunas.map((c) => new TableCell({
      borders: bordaFina(), shading: { fill: NAVY },
      children: [new Paragraph({ children: [new TextRun({ text: c, bold: true, color: "FFFFFF", size: 18 })] })],
    })),
  });
  const linhasTabela = dados.map((linha, i) => new TableRow({
    children: colunas.map((c) => new TableCell({
      borders: bordaFina(), shading: i % 2 === 1 ? { fill: FUNDO_LISTRADO } : undefined,
      children: [new Paragraph({ children: [new TextRun({ text: linha[c] == null || linha[c] === "" ? "—" : String(linha[c]), size: 18 })] })],
    })),
  }));
  elementos.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [cabecalho, ...linhasTabela] }));
  if (maxLinhas && linhas.length > maxLinhas) {
    elementos.push(paragrafo(`Exibindo ${maxLinhas} de ${linhas.length} registros — a base completa está disponível na tela de origem.`, { italico: true }));
  }
  elementos.push(new Paragraph({ text: "" }));
  return elementos;
}

function rodapeInstitucional(): Footer {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: "GAT 2026 · Controle de Análises Técnicas · Tecnoplano — documento gerado automaticamente pelo sistema; totalmente editável.",
        color: TEXTO_FRACO, size: 16,
      })],
    })],
  });
}

/** Monta o documento final e devolve os bytes (.docx) — mesma regra de
 * gat/export_word.py::novo_documento + documento_para_bytes, já com o
 * rodapé institucional aplicado. */
export async function documentoParaBuffer(children: (Paragraph | Table)[]): Promise<Buffer> {
  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Calibri", size: 20 } } },
    },
    sections: [{
      properties: { page: { margin: { top: 737, bottom: 737, left: 1021, right: 1021 } } },
      footers: { default: rodapeInstitucional() },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}

/** Nome de arquivo seguro a partir das partes informadas — mesma regra de
 * gat/export_word.py::nome_arquivo. */
export function nomeArquivo(...partes: (string | null | undefined)[]): string {
  const limpo = partes
    .filter((p): p is string => !!p)
    .map((p) => p.replace(/\s+/g, "_").replace(/[^\w-]/g, ""));
  return `${limpo.join("_")}.docx`;
}
