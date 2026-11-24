import fs from "node:fs";
import path from "node:path";
import { criarDocumento, documentoParaBuffer, nomeArquivoPdf } from "@/lib/export-pdf";
import { desenharBarrasAgrupadas, desenharBarrasEmpilhadas, desenharDonut } from "@/lib/export-pdf-graficos";
import type { DadosOprCessionarios } from "@/lib/opr-cessionarios";
import type { DadosOprPrestadores } from "@/lib/opr-prestadores";
import type { CessionarioAtivo } from "@/lib/cessionarios-ativos";
import { MESES_PT_ABREV, nomeMes } from "@/lib/meses";

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

/** Agrupa disciplinas pequenas em "Outras" para a legenda ficar legível. */
function agruparDisciplinas(dados: DadosOpr, max = 8) {
  const todas = dados.disciplinas.map((d) => ({ rotulo: d.disciplina, valor: d.documentos, cor: CORES_DISCIPLINA[d.disciplina] ?? COR_CEU }));
  if (todas.length <= max) return todas;
  const topo = todas.slice(0, max);
  const resto = todas.slice(max).reduce((soma, f) => soma + f.valor, 0);
  return [...topo, { rotulo: `Outras (${todas.length - max})`, valor: resto, cor: COR_TEXTO_DIM }];
}

/** Relatório em várias páginas (paisagem A4), gráficos grandes:
 *  1) Contribuição das Disciplinas + Resumo + Liberado/Não liberado
 *  2) Projetos liberados por revisão + Acumulado do ano
 *  3) (só se houver dados) Acumulado do ano anterior, como comparativo. */
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
  const tituloMesAno = `${nomeMes(mes)} ${ano}`;
  const periodo = mes === 0 ? "no Ano" : "no Mês";
  const { resumo } = dados;
  const inicioX = doc.page.margins.left;
  const larguraTotal = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // ---- Página 1 ----
  cabecalhoOpr(doc, `GAT ${entidade}`, tituloMesAno);
  const topo1 = doc.y + 6;
  const larguraEsq = larguraTotal * 0.58;
  desenharDonut(doc, {
    x: inicioX, y: topo1, largura: larguraEsq, altura: 400,
    titulo: "Contribuição das Disciplinas (documentos analisados)",
    legendaLateral: true,
    fatias: agruparDisciplinas(dados),
  });

  const xDir = inicioX + larguraEsq + 24;
  const larguraDir = larguraTotal - larguraEsq - 24;
  let yDir = topo1;
  if (cessionariosAtivos !== undefined) {
    doc.font("Helvetica-Bold").fontSize(11).fillColor(NAVY).text("CESSIONÁRIOS ATIVOS", xDir, yDir, { width: larguraDir });
    yDir += 17;
    if (cessionariosAtivos.length === 0) {
      doc.font("Helvetica").fontSize(10).fillColor("#64748B").text("Nenhum cadastrado.", xDir, yDir, { width: larguraDir });
      yDir += 15;
    } else {
      for (const c of cessionariosAtivos) {
        doc.font("Helvetica").fontSize(10).fillColor("#334155").text(`• ${c.quantidade} ${c.categoria}`, xDir, yDir, { width: larguraDir });
        yDir += 15;
      }
    }
    yDir += 8;
  }
  doc.font("Helvetica-Bold").fontSize(11).fillColor(NAVY).text("RESUMO", xDir, yDir, { width: larguraDir });
  yDir += 17;
  for (const texto of [
    `${resumo.analises_emitidas} análises emitidas`,
    `${resumo.documentos} docs analisados`,
    `${resumo.adiantados} adiantados (${resumo.adiantados_pct}%)`,
    `${resumo.no_prazo} no prazo (${resumo.no_prazo_pct}%)`,
    `${resumo.atrasados} atrasados (${resumo.atrasados_pct}%)`,
  ]) {
    doc.font("Helvetica").fontSize(11).fillColor("#334155").text(texto, xDir, yDir, { width: larguraDir });
    yDir += 17;
  }
  yDir += 10;
  desenharDonut(doc, {
    x: xDir, y: yDir, largura: larguraDir, altura: Math.max(180, doc.page.height - doc.page.margins.bottom - yDir - 6),
    titulo: "Liberado × Não liberado",
    valorAbsoluto: true,
    fatias: [
      { rotulo: "LIBERADO", valor: resumo.liberados, cor: COR_VERDE },
      { rotulo: "NÃO LIBERADO", valor: resumo.nao_liberados, cor: COR_VERMELHO },
    ],
  });

  // ---- Página 2 ----
  doc.addPage();
  cabecalhoOpr(doc, `GAT ${entidade}`, tituloMesAno);
  const topo2 = doc.y + 6;
  const alturaUtil = doc.page.height - doc.page.margins.bottom - topo2;
  const alturaRev = alturaUtil * 0.42;
  desenharBarrasAgrupadas(doc, {
    x: inicioX, y: topo2, largura: larguraTotal, altura: alturaRev,
    titulo: `Projetos Liberados ${periodo} (por revisão)`,
    series: [{ rotulo: "Total", cor: COR_VERDE }, { rotulo: "C/ Substituição", cor: COR_DOURADO }],
    grupos: dados.porRevisao.map((r) => ({
      rotulo: `R${String(r.revisao).padStart(2, "0")}`,
      valores: [r.total, r.com_substituicao],
    })),
  });
  const coresAcumulado = [COR_VERMELHO, COR_DOURADO, COR_VERDE];
  const pontosDe = (lista: DadosOpr["acumuladoAtual"]) =>
    lista.map((a) => ({ rotulo: MESES_PT_ABREV[a.mes - 1], segmentos: [a.atrasado, a.no_prazo, a.adiantado], total: a.total }));
  desenharBarrasEmpilhadas(doc, {
    x: inicioX, y: topo2 + alturaRev + 14, largura: larguraTotal, altura: alturaUtil - alturaRev - 14 - 16,
    titulo: `Acumulado do Ano de ${ano} — documentos por situação de prazo`,
    cores: coresAcumulado,
    pontos: pontosDe(dados.acumuladoAtual),
  });
  doc.font("Helvetica").fontSize(8).fillColor("#334155")
    .text("Legenda: verde = adiantado · laranja = no prazo · vermelho = atrasado", inicioX, doc.page.height - doc.page.margins.bottom - 10, { width: larguraTotal, lineBreak: false });

  // ---- Página 3 (comparativo, só se houver dados) ----
  if (dados.acumuladoAnterior.some((a) => a.total > 0)) {
    doc.addPage();
    cabecalhoOpr(doc, `GAT ${entidade}`, `Comparativo — ${ano - 1}`);
    const topo3 = doc.y + 6;
    desenharBarrasEmpilhadas(doc, {
      x: inicioX, y: topo3, largura: larguraTotal, altura: doc.page.height - doc.page.margins.bottom - topo3 - 20,
      titulo: `Acumulado do Ano de ${ano - 1} (ano anterior, para comparação)`,
      cores: coresAcumulado,
      pontos: pontosDe(dados.acumuladoAnterior),
    });
  }
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
