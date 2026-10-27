import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida, definirPermissaoArea, definirPermissaoModulo, permissoesUsuario } from "@/lib/permissoes";

export async function GET(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "administrar_usuarios"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a Administrar usuários." }, { status: 403 });
  }

  const usuarioId = Number(req.nextUrl.searchParams.get("usuarioId"));
  if (!usuarioId) {
    return NextResponse.json({ erro: "Informe usuarioId." }, { status: 400 });
  }
  const permissoes = await permissoesUsuario(usuarioId);
  return NextResponse.json(permissoes);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "administrar_usuarios"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a Administrar usuários." }, { status: 403 });
  }

  const { username } = await params;
  const dados = (await req.json()) as { usuarioId: number; modulos: Record<string, boolean>; areas: Record<string, boolean> };

  try {
    for (const [modulo, permitido] of Object.entries(dados.modulos)) {
      await definirPermissaoModulo(dados.usuarioId, modulo, permitido);
    }
    for (const [area, permitido] of Object.entries(dados.areas)) {
      await definirPermissaoArea(dados.usuarioId, area, permitido);
    }
    void registrarAtividade(sessao.username, sessao.perfil, "ALTERACAO_PERMISSOES", "administracao", username);
    return NextResponse.json({ ok: true });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao salvar permissões." }, { status: 500 });
  }
}
