import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { listarHistorico } from "@/lib/administracao";

const LIMITE_PADRAO = 500;

export async function GET(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "auditoria"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a Auditoria." }, { status: 403 });
  }

  const tabela = req.nextUrl.searchParams.get("tabela");
  const completo = req.nextUrl.searchParams.get("completo") === "1";
  const registros = await listarHistorico(tabela, completo ? null : LIMITE_PADRAO);
  return NextResponse.json({ registros });
}
