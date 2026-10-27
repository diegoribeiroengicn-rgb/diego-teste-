import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { buscarAts } from "@/lib/consulta-ats";

export async function GET(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }

  const termo = (req.nextUrl.searchParams.get("q") || "").trim();
  if (termo.length < 2) {
    return NextResponse.json({ resultados: [] });
  }

  const resultados = await buscarAts(termo);
  return NextResponse.json({ resultados });
}
