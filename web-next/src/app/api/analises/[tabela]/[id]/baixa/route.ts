import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { PERFIL_CONSULTA } from "@/lib/administracao-calculo";
import { STATUS_FINAIS_BAIXA, lerQuantidadeDocumentos } from "@/lib/resumo-conclusao-calculo";
import { darBaixaAnalise, desfazerBaixaAnalise, obterRegistroParaBaixa, type EstadoAnteriorBaixa, type TabelaBaixa } from "@/lib/resumo-conclusao";

function validarTabela(tabela: string): tabela is TabelaBaixa {
  return tabela === "prestadores" || tabela === "cessionarios";
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ tabela: string; id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }

  const { tabela, id } = await params;
  if (!validarTabela(tabela)) {
    return NextResponse.json({ erro: "Tabela inválida." }, { status: 400 });
  }

  const registro = await obterRegistroParaBaixa(tabela, Number(id));
  if (!registro) {
    return NextResponse.json({ erro: "Registro não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ registro });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ tabela: string; id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (sessao.perfil === PERFIL_CONSULTA) {
    return NextResponse.json({ erro: "Acesso não autorizado a dar baixa em análises." }, { status: 403 });
  }

  const { tabela, id } = await params;
  if (!validarTabela(tabela)) {
    return NextResponse.json({ erro: "Tabela inválida." }, { status: 400 });
  }

  const corpo = (await req.json()) as {
    status: string; numAt: string; codigoDisciplina: string; mfiles: boolean; drive: boolean; email: boolean;
    numDocumentosAnalisados: unknown; obraReferencia?: string;
  };
  if (!STATUS_FINAIS_BAIXA.includes(corpo.status as (typeof STATUS_FINAIS_BAIXA)[number])) {
    return NextResponse.json({ erro: "Status inválido para baixa." }, { status: 400 });
  }
  if (!corpo.numAt?.trim()) {
    return NextResponse.json({ erro: "Informe o número da AT." }, { status: 400 });
  }
  if (!corpo.codigoDisciplina?.trim()) {
    return NextResponse.json({ erro: "Informe o código da disciplina." }, { status: 400 });
  }
  const numDocumentosAnalisados = lerQuantidadeDocumentos(corpo.numDocumentosAnalisados);
  if (numDocumentosAnalisados == null) {
    return NextResponse.json({ erro: "Informe a quantidade de documentos analisados (número inteiro, zero ou mais)." }, { status: 400 });
  }

  try {
    const registro = await darBaixaAnalise(
      tabela, Number(id),
      {
        status: corpo.status, numAt: corpo.numAt.trim(), codigoDisciplina: corpo.codigoDisciplina.trim(),
        mfiles: !!corpo.mfiles, drive: !!corpo.drive, email: !!corpo.email,
        numDocumentosAnalisados, obraReferencia: String(corpo.obraReferencia ?? ""),
      },
      sessao.username,
    );
    void registrarAtividade(sessao.username, sessao.perfil, "ANALISE_BAIXA", tabela, `#${id} -> ${corpo.status} · ${numDocumentosAnalisados} doc(s) analisado(s)`);
    return NextResponse.json({ ok: true, registro });
  } catch (exc) {
    const duplicada = (exc as { code?: string })?.code === "23505";
    return NextResponse.json(
      { erro: duplicada ? "Não foi possível registrar a baixa agora (conflito no histórico). Tente novamente; se persistir, avise a Administração." : exc instanceof Error ? exc.message : "Erro ao dar baixa na análise." },
      { status: duplicada ? 409 : 400 },
    );
  }
}

/** Desfaz a baixa recém-confirmada (botão "Desfazer baixa" da confirmação). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tabela: string; id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (sessao.perfil === PERFIL_CONSULTA) return NextResponse.json({ erro: "Acesso não autorizado a desfazer baixa." }, { status: 403 });
  const { tabela, id } = await params;
  if (!validarTabela(tabela)) return NextResponse.json({ erro: "Tabela inválida." }, { status: 400 });
  const corpo = (await req.json().catch(() => null)) as { anterior?: EstadoAnteriorBaixa; baixaEm?: string } | null;
  if (!corpo?.anterior || !corpo.baixaEm) return NextResponse.json({ erro: "Dados para desfazer a baixa ausentes." }, { status: 400 });
  try {
    await desfazerBaixaAnalise(tabela, Number(id), corpo.anterior, corpo.baixaEm, sessao.username);
    void registrarAtividade(sessao.username, sessao.perfil, "ANALISE_BAIXA_DESFEITA", tabela, `#${id}`);
    return NextResponse.json({ ok: true });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao desfazer a baixa." }, { status: 409 });
  }
}
