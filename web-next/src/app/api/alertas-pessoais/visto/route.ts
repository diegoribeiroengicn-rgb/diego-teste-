import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { marcarAlertaPessoalVisto } from "@/lib/meus-alertas";

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }

  const { tipo, chave } = await req.json();
  if ((tipo !== "PRAZO" && tipo !== "MANUAL") || !chave) {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }

  await marcarAlertaPessoalVisto(sessao.username, tipo, String(chave));
  return NextResponse.json({ ok: true });
}
