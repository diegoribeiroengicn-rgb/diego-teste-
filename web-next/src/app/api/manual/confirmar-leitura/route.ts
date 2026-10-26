import { NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { confirmarLeituraManual, versaoAtivaManual } from "@/lib/manual-sistema";

export async function POST() {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }

  const versao = await versaoAtivaManual();
  if (!versao) {
    return NextResponse.json({ erro: "Nenhuma versão publicada." }, { status: 400 });
  }

  await confirmarLeituraManual(sessao.username, versao.numeroVersao);
  void registrarAtividade(sessao.username, sessao.perfil, "CONFIRMACAO_LEITURA_MANUAL", "manual_sistema", `Versão ${versao.numeroVersao}`);
  return NextResponse.json({ ok: true, numeroVersao: versao.numeroVersao });
}
