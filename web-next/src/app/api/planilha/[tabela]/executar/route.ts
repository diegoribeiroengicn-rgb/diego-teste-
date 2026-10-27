import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { registrarAtividade } from "@/lib/atividades";
import { executarImportacao, registrarImportacaoPlanilha, type ResolucoesConflito } from "@/lib/planilha-analise";
import type { PlanoImportacao, TabelaPlanilha } from "@/lib/planilha-analise-calculo";

function validarTabela(tabela: string): tabela is TabelaPlanilha {
  return tabela === "prestadores" || tabela === "cessionarios";
}

/** Fase 2 — aplica um plano já revisado e confirmado pelo usuário
 * (devolvido por /planejar, com as resoluções de conflito escolhidas, se
 * houver). Nada é gravado antes desta chamada. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ tabela: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  const { tabela } = await params;
  if (!validarTabela(tabela)) {
    return NextResponse.json({ erro: "Tabela inválida." }, { status: 400 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "configuracoes"))) {
    return NextResponse.json({ erro: "Acesso não autorizado à Atualização por Planilha." }, { status: 403 });
  }

  const corpo = (await req.json()) as { plano?: PlanoImportacao; resolucoesConflito?: ResolucoesConflito; nomeArquivo?: string };
  if (!corpo.plano) {
    return NextResponse.json({ erro: "Plano de importação ausente — refaça o envio da planilha." }, { status: 400 });
  }

  const relatorio = await executarImportacao(tabela, corpo.plano, corpo.resolucoesConflito ?? {}, sessao.username);
  await registrarImportacaoPlanilha(sessao.username, corpo.nomeArquivo || "planilha.xlsx", relatorio);
  void registrarAtividade(sessao.username, sessao.perfil, "IMPORTACAO_PLANILHA", tabela, `${relatorio.novos} novos, ${relatorio.atualizados} atualizados`);

  return NextResponse.json({ relatorio });
}
