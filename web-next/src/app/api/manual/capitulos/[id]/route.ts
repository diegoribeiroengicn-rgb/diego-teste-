import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { atualizarManualCapitulo, excluirManualCapitulo } from "@/lib/manual-sistema";

const PERFIS_PODEM_ADMINISTRAR = ["ADMIN", "GESTOR"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao || !PERFIS_PODEM_ADMINISTRAR.includes(sessao.perfil)) {
    return NextResponse.json({ erro: "Você não tem permissão para administrar o Manual do Sistema." }, { status: 403 });
  }

  const { id } = await params;
  const { titulo, conteudo, perfisVisiveis } = await req.json();
  if (!titulo?.trim()) {
    return NextResponse.json({ erro: "O título é obrigatório." }, { status: 400 });
  }

  await atualizarManualCapitulo(Number(id), titulo.trim(), conteudo || "", perfisVisiveis || null, sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "EDICAO_MANUAL_SISTEMA", "manual_sistema", titulo.trim());
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao || !PERFIS_PODEM_ADMINISTRAR.includes(sessao.perfil)) {
    return NextResponse.json({ erro: "Você não tem permissão para administrar o Manual do Sistema." }, { status: 403 });
  }

  const { id } = await params;
  await excluirManualCapitulo(Number(id));
  void registrarAtividade(sessao.username, sessao.perfil, "EDICAO_MANUAL_SISTEMA", "manual_sistema", `Exclusão capítulo #${id}`);
  return NextResponse.json({ ok: true });
}
