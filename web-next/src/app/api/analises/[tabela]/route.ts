import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { validarAtDataStatus, mensagemErros } from "@/lib/analise-validacao-calculo";
import { inserirCessionario, inserirPrestador, type DadosCessionario, type DadosPrestador } from "@/lib/analise";

function validarTabela(tabela: string): tabela is "prestadores" | "cessionarios" {
  return tabela === "prestadores" || tabela === "cessionarios";
}

/** Cadastra uma nova análise — primeiro incremento do formulário de
 * Prestadores/Cessionários (mesma validação de AT/status/data de
 * gat/ui/validacao_campos.py). Vínculo a Cadastro, Obra vinculada,
 * prioridade/SLA reduzido e repactuação de prazo ficam para um próximo
 * incremento (ver lib/analise.ts). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ tabela: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  const { tabela } = await params;
  if (!validarTabela(tabela)) {
    return NextResponse.json({ erro: "Tabela inválida." }, { status: 400 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, `${tabela}.cadastrar`))) {
    return NextResponse.json({ erro: "Acesso não autorizado a cadastrar esta análise." }, { status: 403 });
  }

  if (tabela === "prestadores") {
    const dados = (await req.json()) as DadosPrestador;
    if (!dados.prestador?.trim() || !dados.data_solicitacao) {
      return NextResponse.json({ erro: "Preencha ao menos Prestador de Serviço e Data de Solicitação." }, { status: 400 });
    }
    const erros = validarAtDataStatus(dados.num_at, dados.data_analise, dados.status_analise, dados.hold_inicio, dados.hold_fim, null);
    if (Object.keys(erros).length) {
      return NextResponse.json({ erro: mensagemErros(erros) }, { status: 400 });
    }
    const id = await inserirPrestador(dados, sessao.username);
    void registrarAtividade(sessao.username, sessao.perfil, "PROJETO_CRIADO", "prestadores", dados.prestador);
    return NextResponse.json({ ok: true, id });
  }

  const dados = (await req.json()) as DadosCessionario;
  if (!dados.cessionario?.trim() || !dados.data_solicitacao) {
    return NextResponse.json({ erro: "Preencha ao menos Cessionário e Data de Solicitação." }, { status: 400 });
  }
  const erros = validarAtDataStatus(dados.num_at, dados.data_analise, dados.status_analise, dados.hold_inicio, dados.hold_fim, null);
  if (Object.keys(erros).length) {
    return NextResponse.json({ erro: mensagemErros(erros) }, { status: 400 });
  }
  const id = await inserirCessionario(dados, sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "PROJETO_CRIADO", "cessionarios", dados.cessionario);
  return NextResponse.json({ ok: true, id });
}
