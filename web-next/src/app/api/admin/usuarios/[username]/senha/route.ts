import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { exigirTrocaSenhaProximoLogin, redefinirSenhaAdmin } from "@/lib/administracao";

export async function POST(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "administrar_usuarios"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a Administrar usuários." }, { status: 403 });
  }

  const { username } = await params;
  const dados = (await req.json()) as { acao: "redefinir" | "exigir_troca"; novaSenha?: string };

  if (dados.acao === "redefinir") {
    if (!dados.novaSenha || dados.novaSenha.length < 6) {
      return NextResponse.json({ erro: "Informe uma senha com pelo menos 6 caracteres." }, { status: 400 });
    }
    await redefinirSenhaAdmin(username, dados.novaSenha);
    void registrarAtividade(sessao.username, sessao.perfil, "REDEFINICAO_SENHA_ADMIN", "administracao", username);
    return NextResponse.json({ ok: true });
  }

  await exigirTrocaSenhaProximoLogin(username);
  void registrarAtividade(sessao.username, sessao.perfil, "EXIGENCIA_TROCA_SENHA", "administracao", username);
  return NextResponse.json({ ok: true });
}
