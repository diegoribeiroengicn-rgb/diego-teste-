import { NextRequest, NextResponse } from "next/server";
import { obterSessao, type SessaoUsuario } from "@/lib/session";
import { atualizarCadastro, alternarStatusCadastro, type TabelaCadastro } from "@/lib/cadastro";

const TABELAS_VALIDAS: TabelaCadastro[] = ["prestadores", "cessionarios"];
const PERFIS_PODEM_EDITAR = ["ADMIN", "GESTOR"];

function validar(tabela: string, sessao: SessaoUsuario | null): { status: number; erro: string } | null {
  if (!TABELAS_VALIDAS.includes(tabela as TabelaCadastro)) {
    return { status: 400, erro: "Tabela inválida." };
  }
  if (!sessao || !PERFIS_PODEM_EDITAR.includes(sessao.perfil)) {
    return { status: 403, erro: "Você não tem permissão para editar." };
  }
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tabela: string; id: string }> }) {
  const { tabela, id } = await params;
  const sessao = await obterSessao();
  const problema = validar(tabela, sessao);
  if (problema) {
    return NextResponse.json({ erro: problema.erro }, { status: problema.status });
  }

  const dados = await req.json();

  if (dados.acao === "alternar_status") {
    try {
      const novoStatus = await alternarStatusCadastro(tabela as TabelaCadastro, Number(id), sessao!.username);
      return NextResponse.json({ status: novoStatus });
    } catch (exc) {
      return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao alterar status." }, { status: 400 });
    }
  }

  if (!dados.codigo?.trim() || !dados.nome_empresa?.trim()) {
    return NextResponse.json({ erro: "Código e nome da empresa são obrigatórios." }, { status: 400 });
  }

  try {
    await atualizarCadastro(tabela as TabelaCadastro, Number(id), dados, sessao!.username);
    return NextResponse.json({ ok: true });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao atualizar cadastro." }, { status: 400 });
  }
}
