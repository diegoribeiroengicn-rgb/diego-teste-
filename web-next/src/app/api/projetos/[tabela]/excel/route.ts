import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { obterPool } from "@/lib/db";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { MAPA_COLUNAS_PRESTADORES, MAPA_COLUNAS_CESSIONARIOS, CAMPOS_DATA } from "@/lib/planilha-analise-calculo";

const AZUL = "FF0000FF";
const PRETO = "FF000000";

/** Exporta a planilha COMPLETA (todas as linhas não arquivadas, na ordem do
 * Item, com as colunas do layout PROJ_PREST/PROJ_CESS). Valores alterados no
 * sistema depois do cadastro/importação do registro saem em azul; os demais
 * (vindos da planilha) em preto. "Alterado no sistema" = existe linha em
 * historico_edicoes para o campo posterior à criação do registro. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ tabela: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  const { tabela } = await params;
  if (tabela !== "prestadores" && tabela !== "cessionarios") return NextResponse.json({ erro: "Tabela inválida." }, { status: 400 });

  const mapa = tabela === "prestadores" ? MAPA_COLUNAS_PRESTADORES : MAPA_COLUNAS_CESSIONARIOS;
  const entradas = Object.entries(mapa);
  const pool = obterPool();
  const { rows } = await pool.query(`SELECT * FROM ${tabela} WHERE arquivado_em IS NULL ORDER BY item ASC NULLS LAST, id ASC`);
  const { rows: hist } = await pool.query<{ registro_id: number; campo: string; data_hora: string }>(
    "SELECT registro_id, campo, data_hora FROM historico_edicoes WHERE tabela = $1", [tabela],
  );
  const porRegistro = new Map<number, { campo: string; ts: number }[]>();
  for (const h of hist) {
    const ts = Date.parse(h.data_hora);
    const lista = porRegistro.get(Number(h.registro_id)) ?? [];
    lista.push({ campo: h.campo, ts: Number.isNaN(ts) ? 0 : ts });
    porRegistro.set(Number(h.registro_id), lista);
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(tabela === "prestadores" ? "PROJ_PREST" : "PROJ_CESS");
  const cab = ws.getRow(1);
  entradas.forEach(([titulo], i) => { cab.getCell(i + 1).value = titulo; });
  cab.font = { bold: true };

  rows.forEach((r, idx) => {
    const criado = Date.parse(String(r.criado_em ?? ""));
    const editados = new Set<string>();
    for (const h of porRegistro.get(Number(r.id)) ?? []) {
      if (!Number.isNaN(criado) && h.ts - criado > 5000) editados.add(h.campo);
    }
    const row = ws.getRow(idx + 2);
    entradas.forEach(([, campo], i) => {
      const cel = row.getCell(i + 1);
      let v = r[campo] as unknown;
      if (v == null || v === "") { v = null; }
      else if (CAMPOS_DATA.has(campo) && /^\d{4}-\d{2}-\d{2}/.test(String(v))) {
        const [a, m, d] = String(v).slice(0, 10).split("-").map(Number);
        v = new Date(Date.UTC(a, m - 1, d));
        cel.numFmt = "dd/mm/yyyy";
      }
      cel.value = v as ExcelJS.CellValue;
      cel.font = { color: { argb: editados.has(campo) ? AZUL : PRETO } };
    });
  });

  entradas.forEach(([titulo, campo], i) => {
    const maior = Math.max(titulo.length, ...rows.slice(0, 200).map((r) => String(r[campo] ?? "").length));
    ws.getColumn(i + 1).width = Math.min(Math.max(maior + 2, 10), 45);
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: entradas.length } };

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  void registrarAtividade(sessao.username, sessao.perfil, "EXPORTACAO", tabela, "Excel planilha completa");
  const hoje = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="PROJ_${tabela === "prestadores" ? "PREST" : "CESS"}_${hoje}.xlsx"`,
    },
  });
}
