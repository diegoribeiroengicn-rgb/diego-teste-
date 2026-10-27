import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { criarUsuario } from "@/lib/administracao";

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "administrar_usuarios"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a Administrar usuários." }, { status: 403 });
  }

  const dados = (await req.json()) as {
    username: string; senha: string; nomeCompleto: string; perfil: string; analistaVinculado: string | null;
  };
  const username = dados.username?.trim();
  if (!username || !dados.senha) {
    return NextResponse.json({ erro: "Informe usuário e senha." }, { status: 400 });
  }
  if (dados.senha.length < 6) {
    return NextResponse.json({ erro: "A senha temporária deve ter pelo menos 6 caracteres." }, { status: 400 });
  }

  try {
    const id = await criarUsuario(username, dados.senha, dados.nomeCompleto, dados.perfil, dados.analistaVinculado);
    void registrarAtividade(sessao.username, sessao.perfil, "CRIACAO_USUARIO", "administracao", `${username} — perfil ${dados.perfil}`);
    return NextResponse.json({ id });
  } catch (exc) {
    return NextResponse.json({ erro: `Não foi possível cadastrar o usuário: ${exc instanceof Error ? exc.message : "erro desconhecido"}` }, { status: 500 });
  }
}
