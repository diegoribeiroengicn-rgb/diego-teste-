import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { inserirRisco, listarRiscos, type DadosRisco } from "@/lib/pmo";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "pmo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao PMO." }, { status: 403 });
  }

  const { id } = await params;
  const riscos = await listarRiscos(Number(id));
  return NextResponse.json({ riscos });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "pmo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao PMO." }, { status: 403 });
  }

  const { id } = await params;
  const dados = (await req.json()) as DadosRisco;
  if (!dados.descricao?.trim()) {
    return NextResponse.json({ erro: "Descreva o risco." }, { status: 400 });
  }

  const riscoId = await inserirRisco(Number(id), dados, sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "PMO_RISCO_REGISTRADO", "pmo", `#${id}`);
  return NextResponse.json({ ok: true, riscoId });
}
