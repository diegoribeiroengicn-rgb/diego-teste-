import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { registrarAtividade } from "@/lib/atividades";
import { buscarDadosOprPrestadores } from "@/lib/opr-prestadores";
import { gerarOprPrestadoresPdf } from "@/lib/relatorio-opr";

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

  const dados = await buscarDadosOprPrestadores(mes, ano);
  const { buffer, nomeArquivo } = await gerarOprPrestadoresPdf(mes, ano, dados);
  void registrarAtividade(sessao.username, sessao.perfil, "OPR_GERADO", "prestadores", `${mes}/${ano}`);

  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nomeArquivo}"` },
  });
}
