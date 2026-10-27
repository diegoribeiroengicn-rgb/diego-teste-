import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { planejarImportacao } from "@/lib/planilha-analise";
import type { TabelaPlanilha } from "@/lib/planilha-analise-calculo";

function validarTabela(tabela: string): tabela is TabelaPlanilha {
  return tabela === "prestadores" || tabela === "cessionarios";
}

/** Fase 1 (prévia) — lê a planilha enviada e devolve a classificação de
 * cada linha, sem gravar nada no banco. */
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

  const form = await req.formData();
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ erro: "Envie o arquivo da planilha (.xlsx)." }, { status: 400 });
  }

  try {
    const conteudo = Buffer.from(await arquivo.arrayBuffer());
    const plano = await planejarImportacao(tabela, conteudo);
    return NextResponse.json({ plano });
  } catch (erro) {
    return NextResponse.json({ erro: erro instanceof Error ? erro.message : "Não foi possível ler a planilha." }, { status: 400 });
  }
}
