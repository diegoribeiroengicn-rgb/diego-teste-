import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { atualizarUsuario, definirUsuarioAtivo } from "@/lib/administracao";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "administrar_usuarios"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a Administrar usuários." }, { status: 403 });
  }

  const { username } = await params;
  const dados = (await req.json()) as { nomeCompleto: string; perfil: string; analistaVinculado: string | null; ativo: boolean };

  try {
    await atualizarUsuario(username, dados.nomeCompleto, dados.perfil, dados.analistaVinculado);
    await definirUsuarioAtivo(username, dados.ativo);
    void registrarAtividade(sessao.username, sessao.perfil, "EDICAO_USUARIO", "administracao", username);
    return NextResponse.json({ atualizado: true });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao atualizar usuário." }, { status: 500 });
  }
}
