import fs from "node:fs";
import path from "node:path";
import { criarDocumento, documentoParaBuffer, nomeArquivoPdf } from "@/lib/export-pdf";
import { desenharBarrasAgrupadas, desenharBarrasEmpilhadas, desenharDonut } from "@/lib/export-pdf-graficos";
import type { DadosOprCessionarios } from "@/lib/opr-cessionarios";
import type { DadosOprPrestadores } from "@/lib/opr-prestadores";
import type { CessionarioAtivo } from "@/lib/cessionarios-ativos";
import { MESES_PT, MESES_PT_ABREV } from "@/lib/meses";

/** Mesma paleta institucional Tecnoplano usada nos gráficos em tela
 * (opr-cessionarios-charts.tsx) e no modelo de referência em Plotly. */
const COR_VERDE = "#16A34A";
const COR_DOURADO = "#D97706";
const COR_VERMELHO = "#DC2626";
const COR_AZUL_2 = "#2563EB";
const COR_ROXO = "#7C3AED";
const COR_TEXTO_DIM = "#94A3B8";
const COR_CEU = "#0284C7";
const NAVY = "#1B3A8A";

const CORES_DISCIPLINA: Record<string, string> = {
  ARQUITETURA: COR_VERDE,
  "ELÉTRICA": COR_DOURADO,
  HVAC: COR_ROXO,
  "INCÊNDIO": COR_VERMELHO,
  "COMBATE A INCÊNDIO": COR_VERMELHO,
  "COMBATE A INCENDIO": COR_VERMELHO,
  "HIDROSSANITÁRIO": COR_AZUL_2,
  "HIDROSSANTÁRIO": COR_AZUL_2,
  ESTRUTURA: COR_TEXTO_DIM,
  "ESTRUTURA (MC)": COR_TEXTO_DIM,
  ESTRUTURAS: COR_TEXTO_DIM,
  INFRAESTRUTURA: COR_TEXTO_DIM,
};

type DadosOpr = DadosOprCessionarios | DadosOprPrestadores;

function logoPath(): string | null {
  const caminho = path.join(process.cwd(), "public", "tecnoplano_logo.png");
  return fs.existsSync(caminho) ? caminho : null;
}

/** Faixa de cabeçalho no estilo do modelo de referência enviado pelo
 * usuário: banner navy de ponta a ponta, título + mês/ano em branco à
 * esquerda, logo sobre painel claro à direita. */
function cabecalhoOpr(doc: PDFKit.PDFDocument, titulo: string, mesAno: string): void {
  const larguraPagina = doc.page.width;
  const alturaBanner = 56;
  const larguraLogo = 130;

  doc.rect(0, 0, larguraPagina, alturaBanner).fill(NAVY);
  doc.rect(larguraPagina - larguraLogo, 0, larguraLogo, alturaBanner).fill("#EAF2FB");

  const logo = logoPath();
  if (logo) doc.image(logo, larguraPagina - larguraLogo + 16, 14, { width: 96 });

  doc.font("Helvetica-Bold").fontSize(19).fillColor("#FFFFFF")
    .text(titulo.toUpperCase(), doc.page.margins.left, 14, { width: larguraPagina - larguraLogo - doc.page.margins.left - 16 });
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#CBD5E1")
    .text(mesAno.toUpperCase(), doc.page.margins.left, 36, { width: larguraPagina - larguraLogo - doc.page.margins.left - 16 });

  doc.y = alturaBanner + 14;
}

/** Monta o infográfico de uma página (paisagem A4) — mesma estrutura do
 * modelo de referência enviado pelo usuário e de
 * gat/export_pdf.py::gerar_opr_infografico_cessionarios_pdf: Contribuição
 * das Disciplinas, Projetos Liberados no Mês, Liberado/Não Liberado +
 * bloco lateral de texto, Acumulado do Ano (atual × anterior). Os
 * gráficos do original (Plotly rasterizado via Kaleido) são redesenhados
 * aqui como vetores nativos do pdfkit — ver lib/export-pdf-graficos.ts. */
function construirPagina(
  doc: PDFKit.PDFDocument,
  opts: {
    entidade: "Cessionários" | "Prestadores";
    mes: number;
    ano: number;
    dados: DadosOpr;
    cessionariosAtivos?: CessionarioAtivo[];
  },
): void {
  const { entidade, mes, ano, dados, cessionariosAtivos } = opts;
  const tituloMesAno = `${MESES_PT[mes - 1]} ${ano}`;
  const { resumo } = dados;

  cabecalhoOpr(doc, `GAT ${entidade}`, tituloMesAno);

  const inicioX = doc.page.margins.left;
  const larguraTotal = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const topoLinha1 = doc.y + 4;
  const alturaLinha1 = 190;

  const larguraDisciplinas = larguraTotal * 0.3;
  const larguraRevisao = larguraTotal * 0.3;
  const larguraDonut = larguraTotal * 0.18;
  const larguraTexto = larguraTotal * 0.22;

  desenharDonut(doc, {
    x: inicioX, y: topoLinha1, largura: larguraDisciplinas, altura: alturaLinha1,
    titulo: "Contribuição das Disciplinas",
    fatias: dados.disciplinas.map((d) => ({ rotulo: d.disciplina, valor: d.documentos, cor: CORES_DISCIPLINA[d.disciplina] ?? COR_CEU })),
  });

  desenharBarrasAgrupadas(doc, {
    x: inicioX + larguraDisciplinas, y: topoLinha1, largura: larguraRevisao, altura: alturaLinha1,
    titulo: "Projetos Liberados no Mês",
    series: [{ rotulo: "Total", cor: COR_VERDE }, { rotulo: "C/ Substituição", cor: COR_DOURADO }],
    grupos: dados.porRevisao.map((r) => ({
      rotulo: `R${String(r.revisao).padStart(2, "0")}`,
      valores: [r.total, r.com_substituicao],
    })),
  });

  const xDonut2 = inicioX + larguraDisciplinas + larguraRevisao;
  desenharDonut(doc, {
    x: xDonut2, y: topoLinha1, largura: larguraDonut, altura: alturaLinha1 - 56,
    valorAbsoluto: true,
    fatias: [
      { rotulo: "LIBERADO", valor: resumo.liberados, cor: COR_VERDE },
      { rotulo: "NÃO LIBERADO", valor: resumo.nao_liberados, cor: COR_VERMELHO },
    ],
  });

  const xTexto = xDonut2 + larguraDonut;
  let yTexto = topoLinha1;
  if (cessionariosAtivos !== undefined) {
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(NAVY).text("CESSIONÁRIOS ATIVOS", xTexto, yTexto, { width: larguraTexto });
    yTexto += 13;
    if (cessionariosAtivos.length === 0) {
      doc.font("Helvetica").fontSize(7.5).fillColor("#64748B").text("Nenhum cadastrado.", xTexto, yTexto, { width: larguraTexto });
      yTexto += 11;
    } else {
      for (const c of cessionariosAtivos) {
        doc.font("Helvetica").fontSize(7.5).fillColor("#334155").text(`• ${c.quantidade} ${c.categoria}`, xTexto, yTexto, { width: larguraTexto });
        yTexto += 11;
      }
    }
    yTexto += 6;
  }
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(NAVY).text("RESUMO", xTexto, yTexto, { width: larguraTexto });
  yTexto += 13;
  for (const texto of [
    `${resumo.analises_emitidas} análises emitidas`,
    `${resumo.documentos} docs analisados`,
    `${resumo.adiantados} adiantados (${resumo.adiantados_pct}%)`,
    `${resumo.no_prazo} no prazo (${resumo.no_prazo_pct}%)`,
    `${resumo.atrasados} atrasados (${resumo.atrasados_pct}%)`,
  ]) {
    doc.font("Helvetica").fontSize(7.5).fillColor("#334155").text(texto, xTexto, yTexto, { width: larguraTexto });
    yTexto += 11;
  }

  const topoLinha2 = topoLinha1 + alturaLinha1 + 14;
  const alturaLinha2 = 160;
  const larguraMetade = larguraTotal / 2 - 6;

  const coresAcumulado = [COR_VERMELHO, COR_DOURADO, COR_VERDE];
  desenharBarrasEmpilhadas(doc, {
    x: inicioX, y: topoLinha2, largura: larguraMetade, altura: alturaLinha2,
    titulo: `Acumulado do Ano de ${ano}`,
    cores: coresAcumulado,
    pontos: dados.acumuladoAtual.map((a) => ({
      rotulo: MESES_PT_ABREV[a.mes - 1], segmentos: [a.atrasado, a.no_prazo, a.adiantado], total: a.total,
    })),
  });
  desenharBarrasEmpilhadas(doc, {
    x: inicioX + larguraMetade + 12, y: topoLinha2, largura: larguraMetade, altura: alturaLinha2,
    titulo: `Acumulado do Ano de ${ano - 1}`,
    cores: coresAcumulado,
    pontos: dados.acumuladoAnterior.map((a) => ({
      rotulo: MESES_PT_ABREV[a.mes - 1], segmentos: [a.atrasado, a.no_prazo, a.adiantado], total: a.total,
    })),
  });
}

export async function gerarOprCessionariosPdf(
  mes: number, ano: number, dados: DadosOprCessionarios, cessionariosAtivos: CessionarioAtivo[],
): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const doc = criarDocumento({ paisagem: true });
  construirPagina(doc, { entidade: "Cessionários", mes, ano, dados, cessionariosAtivos });
  const buffer = await documentoParaBuffer(doc);
  return { buffer, nomeArquivo: nomeArquivoPdf("GAT_Cessionarios_OPR", String(ano), String(mes).padStart(2, "0")) };
}

export async function gerarOprPrestadoresPdf(
  mes: number, ano: number, dados: DadosOprPrestadores,
): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const doc = criarDocumento({ paisagem: true });
  construirPagina(doc, { entidade: "Prestadores", mes, ano, dados });
  const buffer = await documentoParaBuffer(doc);
  return { buffer, nomeArquivo: nomeArquivoPdf("GAT_Prestadores_OPR", String(ano), String(mes).padStart(2, "0")) };
}
