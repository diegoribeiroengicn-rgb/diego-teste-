import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { buscarAts } from "@/lib/consulta-ats";

export async function GET(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }

  const termo = (req.nextUrl.searchParams.get("q") || "").trim();
  const origemParam = req.nextUrl.searchParams.get("origem");
  const origem = origemParam === "prestadores" || origemParam === "cessionarios" ? origemParam : null;
  const dataEnvio = req.nextUrl.searchParams.get("data") || null;

  // Precisa de pelo menos um critério "forte" (texto com 2+ caracteres ou
  // data de envio) — filtrar só por origem devolveria a base inteira.
  if (termo.length < 2 && !dataEnvio) {
    return NextResponse.json({ resultados: [] });
  }

  const resultados = await buscarAts({ termo, origem, dataEnvio });
  return NextResponse.json({ resultados });
}
