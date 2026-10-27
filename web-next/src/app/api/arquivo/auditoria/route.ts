import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { listarAuditoriaArquivo } from "@/lib/arquivo";

export async function GET(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "arquivo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao módulo Arquivo." }, { status: 403 });
  }

  const tipo = req.nextUrl.searchParams.get("tipo");
  const origem = req.nextUrl.searchParams.get("origem");
  const registros = await listarAuditoriaArquivo(tipo, origem);
  return NextResponse.json({ registros });
}
