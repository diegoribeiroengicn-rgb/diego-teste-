import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import {
  atualizarAvaliacaoChecklist,
  buscarAvaliacaoExistentePorRevisao,
  inserirAvaliacaoChecklist,
  type DadosAvaliacaoChecklist,
} from "@/lib/avaliacao-checklist";

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }

  const dados = (await req.json()) as DadosAvaliacaoChecklist;
  if (!dados.nomeEntidade?.trim()) {
    return NextResponse.json({ erro: "Preencha ao menos o nome da entidade avaliada." }, { status: 400 });
  }
  if (dados.tipoEntidade === "CESSIONARIO" && !dados.nomeProjetista?.trim()) {
    return NextResponse.json({ erro: "Informe o Nome do Projetista antes de salvar." }, { status: 400 });
  }

  try {
    const existente = await buscarAvaliacaoExistentePorRevisao(
      dados.tipoEntidade, dados.atReferencia, dados.disciplina, dados.revisao, dados.analistaResponsavel,
    );
    if (existente) {
      await atualizarAvaliacaoChecklist(existente.id, dados);
      void registrarAtividade(sessao.username, sessao.perfil, "AVALIACAO_EDITADA", dados.tipoEntidade, dados.nomeEntidade);
      return NextResponse.json({ id: existente.id, atualizado: true });
    }
    const id = await inserirAvaliacaoChecklist(dados, sessao.username);
    void registrarAtividade(sessao.username, sessao.perfil, "AVALIACAO_REALIZADA", dados.tipoEntidade, dados.nomeEntidade);
    return NextResponse.json({ id, atualizado: false });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao salvar avaliação." }, { status: 500 });
  }
}
