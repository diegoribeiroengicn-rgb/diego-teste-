import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { criarCadastro, type TabelaCadastro } from "@/lib/cadastro";

const TABELAS_VALIDAS: TabelaCadastro[] = ["prestadores", "cessionarios"];
const PERFIS_PODEM_EDITAR = ["ADMIN", "GESTOR"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ tabela: string }> }) {
  const { tabela } = await params;
  if (!TABELAS_VALIDAS.includes(tabela as TabelaCadastro)) {
    return NextResponse.json({ erro: "Tabela inválida." }, { status: 400 });
  }

  const sessao = await obterSessao();
  if (!sessao || !PERFIS_PODEM_EDITAR.includes(sessao.perfil)) {
    return NextResponse.json({ erro: "Você não tem permissão para cadastrar." }, { status: 403 });
  }

  const dados = await req.json();
  if (!dados.codigo?.trim() || !dados.nome_empresa?.trim()) {
    return NextResponse.json({ erro: "Código e nome da empresa são obrigatórios." }, { status: 400 });
  }

  try {
    const id = await criarCadastro(tabela as TabelaCadastro, dados, sessao.username);
    return NextResponse.json({ id });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao criar cadastro." }, { status: 400 });
  }
}
