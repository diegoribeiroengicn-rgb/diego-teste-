import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { alterarSenhaUsuario } from "@/lib/perfil";

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }

  const { senhaAtual, novaSenha, confirmacao } = await req.json();
  if (!senhaAtual || !novaSenha) {
    return NextResponse.json({ erro: "Preencha todos os campos." }, { status: 400 });
  }
  if (String(novaSenha).length < 6) {
    return NextResponse.json({ erro: "A nova senha deve ter pelo menos 6 caracteres." }, { status: 400 });
  }
  if (novaSenha !== confirmacao) {
    return NextResponse.json({ erro: "A confirmação não corresponde à nova senha." }, { status: 400 });
  }

  const ok = await alterarSenhaUsuario(sessao.username, senhaAtual, novaSenha);
  if (!ok) {
    return NextResponse.json({ erro: "Senha atual incorreta." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
