import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { atualizarAvaliacaoChecklist, type DadosAvaliacaoChecklist } from "@/lib/avaliacao-checklist";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }

  const { id } = await params;
  const dados = (await req.json()) as DadosAvaliacaoChecklist;
  if (!dados.nomeEntidade?.trim()) {
    return NextResponse.json({ erro: "Preencha ao menos o nome da entidade avaliada." }, { status: 400 });
  }
  if (dados.tipoEntidade === "CESSIONARIO" && !dados.nomeProjetista?.trim()) {
    return NextResponse.json({ erro: "Informe o Nome do Projetista antes de salvar." }, { status: 400 });
  }

  try {
    await atualizarAvaliacaoChecklist(Number(id), dados);
    void registrarAtividade(sessao.username, sessao.perfil, "AVALIACAO_EDITADA", dados.tipoEntidade, dados.nomeEntidade);
    return NextResponse.json({ ok: true });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao salvar avaliação." }, { status: 500 });
  }
}
