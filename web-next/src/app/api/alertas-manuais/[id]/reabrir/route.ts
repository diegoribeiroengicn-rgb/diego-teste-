import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { registrarAtividade } from "@/lib/atividades";
import { obterAlertaManual, reabrirAlertaManual } from "@/lib/alerta-manual";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "alertas.manual"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a reabrir alertas manuais." }, { status: 403 });
  }
  const { id } = await params;
  const registroId = Number(id);
  const atual = await obterAlertaManual(registroId);
  if (!atual) {
    return NextResponse.json({ erro: "Alerta não encontrado." }, { status: 404 });
  }

  await reabrirAlertaManual(registroId, sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "REABERTURA_ALERTA_MANUAL", atual.modulo, `Alerta manual #${registroId} reaberto.`);
  return NextResponse.json({ ok: true });
}
