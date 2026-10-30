import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { validarObraPrestador, type DadosObraPrestador } from "@/lib/obra-calculo";
import { inserirObraPrestador, listarObrasPorCodigoPrestador } from "@/lib/obra";

const PERFIS_PODEM_EDITAR = ["ADMIN", "GESTOR"];

/** GET ?codigo=P245 — obras do prestador com este código no Cadastro,
 * usado pelo seletor de Obra no formulário de análise (qualquer usuário
 * autenticado pode consultar; só criar/editar exige Cadastro). */
export async function GET(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  const codigo = req.nextUrl.searchParams.get("codigo");
  if (!codigo?.trim()) {
    return NextResponse.json({ obras: [] });
  }
  const obras = await listarObrasPorCodigoPrestador(codigo.trim());
  return NextResponse.json({ obras });
}

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao || !PERFIS_PODEM_EDITAR.includes(sessao.perfil)) {
    return NextResponse.json({ erro: "Você não tem permissão para cadastrar obras." }, { status: 403 });
  }

  const dados = (await req.json()) as DadosObraPrestador;
  if (!dados.prestador_id) {
    return NextResponse.json({ erro: "Prestador é obrigatório para cadastrar uma obra." }, { status: 400 });
  }
  const erro = validarObraPrestador(dados);
  if (erro) {
    return NextResponse.json({ erro }, { status: 400 });
  }

  const id = await inserirObraPrestador(dados, sessao.username);
  return NextResponse.json({ ok: true, id });
}
