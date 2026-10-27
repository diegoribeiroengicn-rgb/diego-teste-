import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { inserirEntregavel, listarEntregaveis, type DadosEntregavel } from "@/lib/pmo";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "pmo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao PMO." }, { status: 403 });
  }

  const { id } = await params;
  const entregaveis = await listarEntregaveis(Number(id));
  return NextResponse.json({ entregaveis });
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
  const dados = (await req.json()) as { nome: string; data_prevista: string | null; percentual_documental: number; observacoes: string | null };
  if (!dados.nome?.trim()) {
    return NextResponse.json({ erro: "Informe o nome do entregável." }, { status: 400 });
  }

  const completo: DadosEntregavel = {
    nome: dados.nome.trim(), previsto: 1, entregue: 0, data_prevista: dados.data_prevista,
    data_entrega: null, percentual_documental: dados.percentual_documental, observacoes: dados.observacoes,
  };
  const entregavelId = await inserirEntregavel(Number(id), completo, sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "PMO_ENTREGAVEL_CRIADO", "pmo", `#${id}`);
  return NextResponse.json({ ok: true, entregavelId });
}
