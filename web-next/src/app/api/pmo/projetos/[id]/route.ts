import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import {
  atualizarProjeto,
  kpisHabilitadosProjeto,
  listarAlertasProjeto,
  obterAlertaCronograma,
  obterProjeto,
  type DadosProjetoPmo,
} from "@/lib/pmo";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "pmo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao PMO." }, { status: 403 });
  }

  const { id } = await params;
  const projetoId = Number(id);
  const projeto = await obterProjeto(projetoId);
  if (!projeto) {
    return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });
  }

  const [kpisHabilitados, alertas, alertaCronograma] = await Promise.all([
    kpisHabilitadosProjeto(projetoId),
    listarAlertasProjeto(projetoId),
    obterAlertaCronograma(projetoId),
  ]);

  return NextResponse.json({
    projeto, alertas, alertaCronograma,
    kpisHabilitados: Array.from(kpisHabilitados),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "pmo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao PMO." }, { status: 403 });
  }

  const { id } = await params;
  const dados = (await req.json()) as DadosProjetoPmo;
  if (!dados.nome?.trim() || !dados.cliente?.trim() || !dados.contratada?.trim() || !dados.gerente?.trim()) {
    return NextResponse.json({ erro: "Preencha Nome, Cliente, Contratada e Gerente do projeto." }, { status: 400 });
  }

  await atualizarProjeto(Number(id), dados, sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "PMO_PROJETO_ATUALIZADO", "pmo", `#${id}`);
  return NextResponse.json({ ok: true });
}
