import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { buscarDetalhamento, type TipoEntidadeAvaliacao } from "@/lib/ranking";

const TIPOS_VALIDOS: TipoEntidadeAvaliacao[] = ["PRESTADOR", "CESSIONARIO"];

export async function GET(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }

  const tipo = req.nextUrl.searchParams.get("tipo");
  const chave = req.nextUrl.searchParams.get("chave");
  if (!tipo || !chave || !TIPOS_VALIDOS.includes(tipo as TipoEntidadeAvaliacao)) {
    return NextResponse.json({ erro: "Parâmetros inválidos." }, { status: 400 });
  }

  const detalhe = await buscarDetalhamento(tipo as TipoEntidadeAvaliacao, chave);
  return NextResponse.json({ detalhe });
}
