import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { atualizarEntregavel, type DadosEntregavel } from "@/lib/pmo";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; entId: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "pmo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao PMO." }, { status: 403 });
  }

  const { id, entId } = await params;
  const dados = (await req.json()) as DadosEntregavel;
  await atualizarEntregavel(Number(entId), dados, sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "PMO_ENTREGAVEL_ATUALIZADO", "pmo", `#${id}/${entId}`);
  return NextResponse.json({ ok: true });
}
