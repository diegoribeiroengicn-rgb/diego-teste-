import { NextRequest, NextResponse } from "next/server";
import { obterSessao, criarSessao } from "@/lib/session";
import { definirTemaUsuario } from "@/lib/perfil";

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }

  const { tema } = await req.json();
  if (tema !== "claro" && tema !== "escuro") {
    return NextResponse.json({ erro: "Tema inválido — use 'claro' ou 'escuro'." }, { status: 400 });
  }

  await definirTemaUsuario(sessao.username, tema);
  await criarSessao({ ...sessao, temaPreferido: tema });

  return NextResponse.json({ ok: true });
}
