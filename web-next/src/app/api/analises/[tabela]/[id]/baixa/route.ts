import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { PERFIL_CONSULTA } from "@/lib/administracao-calculo";
import { STATUS_FINAIS_BAIXA } from "@/lib/resumo-conclusao-calculo";
import { darBaixaAnalise, obterRegistroParaBaixa, type TabelaBaixa } from "@/lib/resumo-conclusao";

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

  const corpo = (await req.json()) as { status: string; codigoDisciplina: string; mfiles: boolean; drive: boolean; email: boolean };
  if (!STATUS_FINAIS_BAIXA.includes(corpo.status as (typeof STATUS_FINAIS_BAIXA)[number])) {
    return NextResponse.json({ erro: "Status inválido para baixa." }, { status: 400 });
  }
  if (!corpo.codigoDisciplina?.trim()) {
    return NextResponse.json({ erro: "Informe o código da disciplina." }, { status: 400 });
  }

  try {
    const registro = await darBaixaAnalise(
      tabela, Number(id),
      { status: corpo.status, codigoDisciplina: corpo.codigoDisciplina.trim(), mfiles: !!corpo.mfiles, drive: !!corpo.drive, email: !!corpo.email },
      sessao.username,
    );
    void registrarAtividade(sessao.username, sessao.perfil, "ANALISE_BAIXA", tabela, `#${id} -> ${corpo.status}`);
    return NextResponse.json({ ok: true, registro });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao dar baixa na análise." }, { status: 400 });
  }
}
