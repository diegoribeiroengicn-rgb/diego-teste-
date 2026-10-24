import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { salvarCessionariosAtivos, type ItemCessionarioAtivo } from "@/lib/cessionarios-ativos";

const PERFIS_PODEM_EDITAR = ["ADMIN", "GESTOR"];

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao || !PERFIS_PODEM_EDITAR.includes(sessao.perfil)) {
    return NextResponse.json({ erro: "Você não tem permissão para editar esta lista." }, { status: 403 });
  }

  const corpo = await req.json();
  const itens: ItemCessionarioAtivo[] = Array.isArray(corpo.itens) ? corpo.itens : [];

  try {
    await salvarCessionariosAtivos(itens, sessao.username);
    return NextResponse.json({ ok: true });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao salvar a lista." }, { status: 400 });
  }
}
