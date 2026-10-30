import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { registrarAtividade } from "@/lib/atividades";
import { encerrarAlertaManual, obterAlertaManual } from "@/lib/alerta-manual";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "alertas.manual"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a encerrar alertas manuais." }, { status: 403 });
  }
  const { id } = await params;
  const registroId = Number(id);
  const atual = await obterAlertaManual(registroId);
  if (!atual) {
    return NextResponse.json({ erro: "Alerta não encontrado." }, { status: 404 });
  }

  const { motivo } = (await req.json()) as { motivo?: string };
  if (!motivo?.trim()) {
    return NextResponse.json({ erro: "O motivo do encerramento é obrigatório." }, { status: 400 });
  }

  await encerrarAlertaManual(registroId, motivo.trim(), sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "ENCERRAMENTO_ALERTA_MANUAL", atual.modulo, `Alerta manual #${registroId} encerrado.`);
  return NextResponse.json({ ok: true });
}
