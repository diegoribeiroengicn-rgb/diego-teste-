/** Gráficos vetoriais desenhados diretamente com pdfkit, para o One Page
 * Report (infográfico) em PDF — gat/opr_cessionarios_infografico.py usa
 * Plotly rasterizado via Kaleido (imagem PNG embutida no PDF); não há
 * equivalente Node para isso sem adicionar um navegador/canvas ao
 * ambiente de produção (serverless), então aqui os mesmos gráficos
 * (donut, barras agrupadas, barras empilhadas) são desenhados como
 * vetores nativos do PDF — mais leve e sem dependências novas. */

const RADIAN = Math.PI / 180;

export type FatiaDonut = { rotulo: string; valor: number; cor: string };

function pontoArco(cx: number, cy: number, raio: number, anguloGraus: number): [number, number] {
  const rad = (anguloGraus - 90) * RADIAN;
  return [cx + raio * Math.cos(rad), cy + raio * Math.sin(rad)];
}

/** Desenha um donut chart (anel) com rótulos de percentual dentro de cada
 * fatia e legenda abaixo — equivalente visual de GraficoDisciplinas/
 * GraficoLiberadoDonut em opr-cessionarios-charts.tsx. */
export function desenharDonut(
  doc: PDFKit.PDFDocument,
  opts: { x: number; y: number; largura: number; altura: number; titulo?: string; fatias: FatiaDonut[]; valorAbsoluto?: boolean },
): void {
  const { x, y, largura, altura } = opts;
  const NAVY = "#1B3A8A";
  let topo = y;
  if (opts.titulo) {
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(NAVY).text(opts.titulo, x, topo, { width: largura });
    topo += 16;
  }

  const total = opts.fatias.reduce((s, f) => s + f.valor, 0);
  const alturaLegenda = 10 * opts.fatias.length + 4;
  const alturaDonut = altura - (topo - y) - alturaLegenda;
  const cx = x + largura / 2;
  const cy = topo + alturaDonut / 2;
  const raioExterno = Math.min(largura, alturaDonut) / 2 - 4;
  const raioInterno = raioExterno * 0.52;

  if (total <= 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#64748B")
      .text("Sem dados no período.", x, cy - 5, { width: largura, align: "center" });
    return;
  }

  let anguloAtual = 0;
  const PASSOS = 48;
  for (const fatia of opts.fatias) {
    if (fatia.valor <= 0) continue;
    const anguloFatia = (fatia.valor / total) * 360;
    const inicio = anguloAtual;
    const fim = anguloAtual + anguloFatia;
    anguloAtual = fim;

    const passos = Math.max(2, Math.round((anguloFatia / 360) * PASSOS));
    doc.save();
    const [ox0, oy0] = pontoArco(cx, cy, raioExterno, inicio);
    doc.moveTo(ox0, oy0);
    for (let i = 1; i <= passos; i++) {
      const ang = inicio + (anguloFatia * i) / passos;
      const [ox, oy] = pontoArco(cx, cy, raioExterno, ang);
      doc.lineTo(ox, oy);
    }
    for (let i = 0; i <= passos; i++) {
      const ang = fim - (anguloFatia * i) / passos;
      const [ix, iy] = pontoArco(cx, cy, raioInterno, ang);
      doc.lineTo(ix, iy);
    }
    doc.closePath().fillColor(fatia.cor).fill();
    doc.restore();

    const meio = (inicio + fim) / 2;
    const percentual = Math.round((1000 * fatia.valor) / total) / 10;
    const rotulo = opts.valorAbsoluto ? String(fatia.valor) : percentual >= 5 ? `${percentual}%` : null;
    if (rotulo) {
      const [lx, ly] = pontoArco(cx, cy, (raioExterno + raioInterno) / 2, meio);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF")
        .text(rotulo, lx - 14, ly - 4, { width: 28, align: "center" });
    }
  }

  let ly = cy + alturaDonut / 2 + 6;
  for (const fatia of opts.fatias) {
    doc.fillColor(fatia.cor).rect(x + 2, ly + 1, 7, 7).fill();
    doc.font("Helvetica").fontSize(7.5).fillColor("#334155").text(fatia.rotulo, x + 13, ly, { width: largura - 15 });
    ly += 10;
  }
}

export type SerieBarra = { rotulo: string; cor: string };
export type GrupoBarras = { rotulo: string; valores: number[] };

/** Barras agrupadas (uma barra por série, lado a lado, dentro de cada
 * categoria do eixo X) — equivalente visual de GraficoRevisao. */
export function desenharBarrasAgrupadas(
  doc: PDFKit.PDFDocument,
  opts: { x: number; y: number; largura: number; altura: number; titulo?: string; series: SerieBarra[]; grupos: GrupoBarras[] },
): void {
  const { x, y, largura, altura, series, grupos } = opts;
  const NAVY = "#1B3A8A";
  let topo = y;
  if (opts.titulo) {
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(NAVY).text(opts.titulo, x, topo, { width: largura });
    topo += 16;
  }
  const alturaLegenda = 12;
  const alturaEixo = 12;
  const alturaGrafico = altura - (topo - y) - alturaLegenda - alturaEixo;
  const baseY = topo + alturaGrafico;

  const maiorValor = Math.max(1, ...grupos.flatMap((g) => g.valores));
  const escala = (alturaGrafico - 14) / maiorValor;

  doc.strokeColor("#CBD5E1").lineWidth(0.6).moveTo(x, baseY).lineTo(x + largura, baseY).stroke();

  if (grupos.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#64748B").text("Sem dados no período.", x, baseY - 20, { width: largura, align: "center" });
  } else {
    const larguraGrupo = largura / grupos.length;
    const larguraBarra = Math.min(16, (larguraGrupo * 0.6) / series.length);
    const espacoEntreBarras = 3;

    grupos.forEach((grupo, i) => {
      const centroGrupo = x + larguraGrupo * i + larguraGrupo / 2;
      const larguraTotalBarras = series.length * larguraBarra + (series.length - 1) * espacoEntreBarras;
      let bx = centroGrupo - larguraTotalBarras / 2;
      grupo.valores.forEach((valor, s) => {
        const h = Math.max(0, valor * escala);
        const by = baseY - h;
        doc.fillColor(series[s].cor).rect(bx, by, larguraBarra, h).fill();
        if (valor > 0) {
          doc.font("Helvetica").fontSize(7.5).fillColor("#0F172A").text(String(valor), bx - 2, by - 10, { width: larguraBarra + 4, align: "center" });
        }
        bx += larguraBarra + espacoEntreBarras;
      });
      doc.font("Helvetica").fontSize(8).fillColor("#334155").text(grupo.rotulo, x + larguraGrupo * i, baseY + 2, { width: larguraGrupo, align: "center" });
    });
  }

  let lx = x;
  const ly = topo + alturaGrafico + alturaEixo;
  for (const serie of series) {
    doc.fillColor(serie.cor).rect(lx, ly + 1, 7, 7).fill();
    doc.font("Helvetica").fontSize(7.5).fillColor("#334155").text(serie.rotulo, lx + 10, ly, { width: 90 });
    lx += 10 + doc.widthOfString(serie.rotulo) + 18;
  }
}

export type PontoEmpilhado = { rotulo: string; segmentos: number[]; total: number };

/** Barras empilhadas (uma barra por categoria, dividida em segmentos
 * coloridos) com rótulo do total no topo — equivalente visual de
 * GraficoAcumulado. */
export function desenharBarrasEmpilhadas(
  doc: PDFKit.PDFDocument,
  opts: { x: number; y: number; largura: number; altura: number; titulo?: string; cores: string[]; pontos: PontoEmpilhado[] },
): void {
  const { x, y, largura, altura, cores, pontos } = opts;
  const NAVY = "#1B3A8A";
  let topo = y;
  if (opts.titulo) {
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(NAVY).text(opts.titulo, x, topo, { width: largura });
    topo += 16;
  }
  const alturaEixo = 12;
  const alturaRotuloTotal = 12;
  const alturaGrafico = altura - (topo - y) - alturaEixo - alturaRotuloTotal;
  const baseY = topo + alturaRotuloTotal + alturaGrafico;

  const maiorTotal = Math.max(1, ...pontos.map((p) => p.total));
  const escala = (alturaGrafico - 4) / maiorTotal;

  doc.strokeColor("#CBD5E1").lineWidth(0.6).moveTo(x, baseY).lineTo(x + largura, baseY).stroke();

  const larguraGrupo = largura / Math.max(1, pontos.length);
  const larguraBarra = Math.min(22, larguraGrupo * 0.6);

  pontos.forEach((ponto, i) => {
    const centroGrupo = x + larguraGrupo * i + larguraGrupo / 2;
    const bx = centroGrupo - larguraBarra / 2;
    let by = baseY;
    ponto.segmentos.forEach((valor, s) => {
      const h = valor * escala;
      if (h > 0) {
        doc.fillColor(cores[s]).rect(bx, by - h, larguraBarra, h).fill();
        const percentual = ponto.total ? Math.round((100 * valor) / ponto.total) : 0;
        if (h > 18) {
          doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#FFFFFF").text(String(valor), bx - 2, by - h / 2 - 7, { width: larguraBarra + 4, align: "center" });
          doc.font("Helvetica").fontSize(5.5).fillColor("#FFFFFF").text(`${percentual}%`, bx - 2, by - h / 2 + 1, { width: larguraBarra + 4, align: "center" });
        } else if (h > 9) {
          doc.font("Helvetica").fontSize(6.5).fillColor("#FFFFFF").text(String(valor), bx - 2, by - h / 2 - 4, { width: larguraBarra + 4, align: "center" });
        }
      }
      by -= h;
    });
    if (ponto.total > 0) {
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(NAVY).text(String(ponto.total), bx - 6, by - 11, { width: larguraBarra + 12, align: "center" });
    }
    doc.font("Helvetica").fontSize(7).fillColor("#334155").text(ponto.rotulo, x + larguraGrupo * i, baseY + 2, { width: larguraGrupo, align: "center" });
  });
}
