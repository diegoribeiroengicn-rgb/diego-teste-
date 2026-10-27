import { NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { listarImportacoesPlanilha } from "@/lib/planilha-analise";

export async function GET() {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "configuracoes"))) {
    return NextResponse.json({ erro: "Acesso não autorizado à Atualização por Planilha." }, { status: 403 });
  }

  const historico = await listarImportacoesPlanilha(20);
  return NextResponse.json({ historico });
}
