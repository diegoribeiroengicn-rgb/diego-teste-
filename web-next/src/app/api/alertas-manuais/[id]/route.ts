import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { registrarAtividade } from "@/lib/atividades";
import { validarAlertaManual, type DadosAlertaManual } from "@/lib/alerta-manual-calculo";
import { atualizarAlertaManual, obterAlertaManual } from "@/lib/alerta-manual";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  const { id } = await params;
  const alerta = await obterAlertaManual(Number(id));
  if (!alerta) {
    return NextResponse.json({ erro: "Alerta não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ alerta });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "alertas.manual"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a editar alertas manuais." }, { status: 403 });
  }
  const { id } = await params;
  const registroId = Number(id);
  const atual = await obterAlertaManual(registroId);
  if (!atual) {
    return NextResponse.json({ erro: "Alerta não encontrado." }, { status: 404 });
  }

  const dados = (await req.json()) as DadosAlertaManual;
  const erro = validarAlertaManual(dados);
  if (erro) {
    return NextResponse.json({ erro }, { status: 400 });
  }

  await atualizarAlertaManual(registroId, dados, sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "EDICAO_ALERTA_MANUAL", dados.modulo, `Alerta manual #${registroId} editado.`);
  return NextResponse.json({ ok: true });
}
