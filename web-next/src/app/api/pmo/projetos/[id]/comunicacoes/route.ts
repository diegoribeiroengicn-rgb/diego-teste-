import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { inserirComunicacao, listarComunicacoes, type DadosComunicacao } from "@/lib/pmo";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "pmo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao PMO." }, { status: 403 });
  }

  const { id } = await params;
  const comunicacoes = await listarComunicacoes(Number(id));
  return NextResponse.json({ comunicacoes });
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
  const dados = (await req.json()) as DadosComunicacao;
  if (!dados.descricao?.trim()) {
    return NextResponse.json({ erro: "Descreva a comunicação." }, { status: 400 });
  }

  const comunicacaoId = await inserirComunicacao(Number(id), dados, sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "PMO_COMUNICACAO_REGISTRADA", "pmo", `#${id}`);
  return NextResponse.json({ ok: true, comunicacaoId });
}
