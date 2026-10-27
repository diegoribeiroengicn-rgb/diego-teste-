import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { validarAtDataStatus, mensagemErros } from "@/lib/analise-validacao-calculo";
import {
  atualizarCessionario, atualizarPrestador, obterCessionarioCompleto, obterPrestadorCompleto,
  type DadosCessionario, type DadosPrestador,
} from "@/lib/analise";

function validarTabela(tabela: string): tabela is "prestadores" | "cessionarios" {
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

  const registro = tabela === "prestadores" ? await obterPrestadorCompleto(Number(id)) : await obterCessionarioCompleto(Number(id));
  if (!registro) {
    return NextResponse.json({ erro: "Registro não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ registro });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tabela: string; id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  const { tabela, id } = await params;
  if (!validarTabela(tabela)) {
    return NextResponse.json({ erro: "Tabela inválida." }, { status: 400 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, `${tabela}.editar`))) {
    return NextResponse.json({ erro: "Acesso não autorizado a editar esta análise." }, { status: 403 });
  }

  const registroId = Number(id);

  if (tabela === "prestadores") {
    const atual = await obterPrestadorCompleto(registroId);
    if (!atual) return NextResponse.json({ erro: "Registro não encontrado." }, { status: 404 });
    const dados = (await req.json()) as DadosPrestador;
    if (!dados.prestador?.trim() || !dados.data_solicitacao) {
      return NextResponse.json({ erro: "Preencha ao menos Prestador de Serviço e Data de Solicitação." }, { status: 400 });
    }
    const erros = validarAtDataStatus(dados.num_at, dados.data_analise, dados.status_analise, dados.hold_inicio, dados.hold_fim, atual.status_analise);
    if (Object.keys(erros).length) {
      return NextResponse.json({ erro: mensagemErros(erros) }, { status: 400 });
    }
    await atualizarPrestador(registroId, dados, sessao.username);
    void registrarAtividade(sessao.username, sessao.perfil, "PROJETO_EDITADO", "prestadores", dados.prestador);
    return NextResponse.json({ ok: true });
  }

  const atual = await obterCessionarioCompleto(registroId);
  if (!atual) return NextResponse.json({ erro: "Registro não encontrado." }, { status: 404 });
  const dados = (await req.json()) as DadosCessionario;
  if (!dados.cessionario?.trim() || !dados.data_solicitacao) {
    return NextResponse.json({ erro: "Preencha ao menos Cessionário e Data de Solicitação." }, { status: 400 });
  }
  const erros = validarAtDataStatus(dados.num_at, dados.data_analise, dados.status_analise, dados.hold_inicio, dados.hold_fim, atual.status_analise);
  if (Object.keys(erros).length) {
    return NextResponse.json({ erro: mensagemErros(erros) }, { status: 400 });
  }
  await atualizarCessionario(registroId, dados, sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "PROJETO_EDITADO", "cessionarios", dados.cessionario);
  return NextResponse.json({ ok: true });
}
