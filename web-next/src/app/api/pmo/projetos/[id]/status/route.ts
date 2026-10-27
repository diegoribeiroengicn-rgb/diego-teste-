import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { STATUS_PROJETO_OPCOES } from "@/lib/pmo-calculo";
import { definirStatusProjeto } from "@/lib/pmo";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "pmo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao PMO." }, { status: 403 });
  }

  const { id } = await params;
  const { status } = (await req.json()) as { status: string };
  if (!STATUS_PROJETO_OPCOES.includes(status as (typeof STATUS_PROJETO_OPCOES)[number])) {
    return NextResponse.json({ erro: "Status inválido." }, { status: 400 });
  }

  await definirStatusProjeto(Number(id), status, sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "PMO_PROJETO_STATUS_ALTERADO", "pmo", `#${id} -> ${status}`);
  return NextResponse.json({ ok: true });
}
