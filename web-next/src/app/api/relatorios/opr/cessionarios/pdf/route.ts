import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { registrarAtividade } from "@/lib/atividades";
import { buscarDadosOprCessionarios } from "@/lib/opr-cessionarios";
import { listarCessionariosAtivos } from "@/lib/cessionarios-ativos";
import { gerarOprCessionariosPdf } from "@/lib/relatorio-opr";

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "opr.exportar"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a exportar o OPR." }, { status: 403 });
  }

  const { mes, ano } = (await req.json()) as { mes: number; ano: number };
  if (!mes || !ano) {
    return NextResponse.json({ erro: "Mês e ano são obrigatórios." }, { status: 400 });
  }

  const [dados, cessionariosAtivos] = await Promise.all([
    buscarDadosOprCessionarios(mes, ano),
    listarCessionariosAtivos(),
  ]);
  const { buffer, nomeArquivo } = await gerarOprCessionariosPdf(mes, ano, dados, cessionariosAtivos);
  void registrarAtividade(sessao.username, sessao.perfil, "OPR_GERADO", "cessionarios", `${mes}/${ano}`);

  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nomeArquivo}"` },
  });
}
