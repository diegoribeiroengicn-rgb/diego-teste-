import { NextRequest, NextResponse } from "next/server";
import { criarSessao, obterSessao } from "@/lib/session";
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

  // Sem isso, o token da sessão continuaria com deveTrocarSenha = true e o
  // proxy mandaria de volta para /primeiro-acesso mesmo após a troca.
  await criarSessao({ ...sessao, deveTrocarSenha: false });

  return NextResponse.json({ ok: true });
}
