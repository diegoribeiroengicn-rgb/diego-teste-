import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { criarProjeto, listarAlertasPmo, listarProjetos, verificarEGerarLembretesCronograma, type DadosProjetoPmo } from "@/lib/pmo";

export async function GET() {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "pmo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao PMO." }, { status: 403 });
  }

  await verificarEGerarLembretesCronograma();
  const [projetos, alertas] = await Promise.all([listarProjetos(), listarAlertasPmo()]);
  return NextResponse.json({ projetos, alertas });
}

type CorpoNovoProjeto = DadosProjetoPmo & { kpisHabilitados?: string[] };

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "pmo.cadastrar"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a cadastrar projetos no PMO." }, { status: 403 });
  }

  const dados = (await req.json()) as CorpoNovoProjeto;
  if (!dados.nome?.trim() || !dados.cliente?.trim() || !dados.contratada?.trim() || !dados.gerente?.trim()) {
    return NextResponse.json({ erro: "Preencha Nome, Cliente, Contratada e Gerente do projeto." }, { status: 400 });
  }

  const projetoId = await criarProjeto(dados, dados.kpisHabilitados ?? null, sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "PMO_PROJETO_CRIADO", "pmo", `#${projetoId}`);
  return NextResponse.json({ ok: true, projetoId });
}
