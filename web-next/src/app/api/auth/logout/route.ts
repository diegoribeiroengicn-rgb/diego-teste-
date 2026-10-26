import { NextResponse } from "next/server";
import { encerrarSessao, obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";

export async function POST() {
  const sessao = await obterSessao();
  await encerrarSessao();
  if (sessao) {
    void registrarAtividade(sessao.username, sessao.perfil, "LOGOUT", "web-next");
  }
  return NextResponse.json({ ok: true });
}
