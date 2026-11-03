import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { registrarAtividade } from "@/lib/atividades";
import { buscarLinhasProdutividade } from "@/lib/relatorios-mensais";
import { calcularProdutividadeAnalistas, indicadoresMensaisModulo, type ModuloProdutividade } from "@/lib/produtividade";
import { rotuloCompetencia } from "@/lib/meses";
import { gerarRelatorioMensalPdf } from "@/lib/relatorio-mensal-export";

const ROTULO_MODULO: Record<ModuloProdutividade | "consolidado", string> = {
  consolidado: "Consolidado", prestadores: "Prestadores", cessionarios: "Cessionários",
};

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "relatorios"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a gerar relatórios." }, { status: 403 });
  }

  const { modulo, mes, ano } = (await req.json()) as { modulo: ModuloProdutividade | "consolidado"; mes: number; ano: number };
  if (!modulo || !mes || !ano) {
    return NextResponse.json({ erro: "Módulo, mês e ano são obrigatórios." }, { status: 400 });
  }

  const todas = await buscarLinhasProdutividade(["prestadores", "cessionarios"]);
  const base = modulo === "consolidado" ? todas : todas.filter((l) => l.origem === modulo);
  const indicadores = indicadoresMensaisModulo(base, mes, ano);
  const produtividade = calcularProdutividadeAnalistas(base, mes, ano);

  const competenciaLabel = rotuloCompetencia(mes, ano);
  const moduloLabel = ROTULO_MODULO[modulo];
  const { buffer, nomeArquivo } = await gerarRelatorioMensalPdf(moduloLabel, competenciaLabel, indicadores, produtividade);
  void registrarAtividade(sessao.username, sessao.perfil, "EXPORTACAO", moduloLabel, `PDF ${competenciaLabel}`);

  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nomeArquivo}"` },
  });
}
