import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { fecharAvaliacaoAnalista, recalcularFechamentoAvaliacaoAnalista, type DadosFechamento } from "@/lib/avaliacao-analista";

type CorpoFechamento = { acao: "fechar" | "recalcular" } & DadosFechamento;

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }

  const dados = (await req.json()) as CorpoFechamento;

  if (dados.acao === "recalcular") {
    if (sessao.perfil !== "ADMIN") {
      return NextResponse.json({ erro: "Recalcular uma competência fechada requer autorização do Administrador." }, { status: 403 });
    }
    try {
      await recalcularFechamentoAvaliacaoAnalista(dados.analista, dados.mes, dados.ano, dados, sessao.username);
      void registrarAtividade(sessao.username, sessao.perfil, "RECALCULO_AVALIACAO_ANALISTA", "analistas", `${dados.analista} — ${dados.mes}/${dados.ano}`);
      return NextResponse.json({ recalculado: true });
    } catch (exc) {
      return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao recalcular fechamento." }, { status: 500 });
    }
  }

  if (!(await areaPermitida(sessao.id, sessao.perfil, "analistas.avaliar"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a Analistas — Inserir/editar avaliações." }, { status: 403 });
  }
  try {
    const id = await fecharAvaliacaoAnalista(dados, sessao.username);
    void registrarAtividade(sessao.username, sessao.perfil, "FECHAMENTO_AVALIACAO_ANALISTA", "analistas", `${dados.analista} — ${dados.mes}/${dados.ano}`);
    return NextResponse.json({ id });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Essa competência já está fechada." }, { status: 500 });
  }
}
