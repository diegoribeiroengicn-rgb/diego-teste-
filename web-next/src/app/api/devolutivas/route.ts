import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { buscarDevolutivasPendentes } from "@/lib/devolutiva";

export async function GET(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  const modulosParam = req.nextUrl.searchParams.getAll("modulo") as ("prestadores" | "cessionarios")[];
  const modulos = modulosParam.length ? modulosParam : (["prestadores", "cessionarios"] as const);
  const devolutivas = await buscarDevolutivasPendentes([...modulos]);
  return NextResponse.json({ devolutivas });
}
