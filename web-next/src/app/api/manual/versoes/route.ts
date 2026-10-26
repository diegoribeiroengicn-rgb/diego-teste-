import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { publicarNovaVersaoManual } from "@/lib/manual-sistema";

const PERFIS_PODEM_ADMINISTRAR = ["ADMIN", "GESTOR"];

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao || !PERFIS_PODEM_ADMINISTRAR.includes(sessao.perfil)) {
    return NextResponse.json({ erro: "Você não tem permissão para administrar o Manual do Sistema." }, { status: 403 });
  }

  const { notas } = await req.json();
  const numeroVersao = await publicarNovaVersaoManual((notas || "").trim() || "Atualização de conteúdo.", sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "PUBLICACAO_MANUAL_SISTEMA", "manual_sistema", `Versão ${numeroVersao}`);
  return NextResponse.json({ numeroVersao });
}
