import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { reordenarManualCapitulos } from "@/lib/manual-sistema";

const PERFIS_PODEM_ADMINISTRAR = ["ADMIN", "GESTOR"];

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao || !PERFIS_PODEM_ADMINISTRAR.includes(sessao.perfil)) {
    return NextResponse.json({ erro: "Você não tem permissão para administrar o Manual do Sistema." }, { status: 403 });
  }

  const { ordemIds } = await req.json();
  if (!Array.isArray(ordemIds) || ordemIds.some((v) => typeof v !== "number")) {
    return NextResponse.json({ erro: "Lista de IDs inválida." }, { status: 400 });
  }

  await reordenarManualCapitulos(ordemIds, sessao.username);
  return NextResponse.json({ ok: true });
}
