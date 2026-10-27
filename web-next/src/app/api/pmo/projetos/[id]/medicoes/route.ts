import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { inserirMedicao, listarMedicoes, type DadosMedicao } from "@/lib/pmo";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "pmo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao PMO." }, { status: 403 });
  }

  const { id } = await params;
  const medicoes = await listarMedicoes(Number(id));
  return NextResponse.json({ medicoes });
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
  const dados = (await req.json()) as DadosMedicao;
  const medicaoId = await inserirMedicao(Number(id), dados, sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "PMO_MEDICAO_REGISTRADA", "pmo", `#${id}`);
  return NextResponse.json({ ok: true, medicaoId });
}
