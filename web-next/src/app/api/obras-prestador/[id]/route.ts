import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { validarObraPrestador, type DadosObraPrestador } from "@/lib/obra-calculo";
import { atualizarObraPrestador, obterObraPrestador } from "@/lib/obra";

const PERFIS_PODEM_EDITAR = ["ADMIN", "GESTOR"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao || !PERFIS_PODEM_EDITAR.includes(sessao.perfil)) {
    return NextResponse.json({ erro: "Você não tem permissão para editar obras." }, { status: 403 });
  }
  const { id } = await params;
  const registroId = Number(id);
  const atual = await obterObraPrestador(registroId);
  if (!atual) {
    return NextResponse.json({ erro: "Obra não encontrada." }, { status: 404 });
  }

  const dados = (await req.json()) as DadosObraPrestador;
  const erro = validarObraPrestador(dados);
  if (erro) {
    return NextResponse.json({ erro }, { status: 400 });
  }

  await atualizarObraPrestador(registroId, { ...dados, prestador_id: atual.prestador_id }, sessao.username);
  return NextResponse.json({ ok: true });
}
