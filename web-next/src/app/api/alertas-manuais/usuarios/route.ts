import { NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { listarUsuarios } from "@/lib/administracao";

/** Lista de usernames para o seletor de "Destinatários" do alerta manual
 * — qualquer usuário autenticado com acesso a alertas.manual pode abrir o
 * formulário, então basta sessão válida (não exige permissão de
 * administração de usuários). */
export async function GET() {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  const usuarios = await listarUsuarios();
  return NextResponse.json({ usernames: usuarios.map((u) => u.username) });
}
