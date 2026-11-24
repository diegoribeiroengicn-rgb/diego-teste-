import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { obterObservacaoMensal, salvarObservacaoMensal } from "@/lib/observacao-mensal";

export async function GET(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  const mesParam = req.nextUrl.searchParams.get("mes");
  const mes = mesParam === null || mesParam === "" ? NaN : Number(mesParam);
  const ano = Number(req.nextUrl.searchParams.get("ano"));
  if (Number.isNaN(mes) || mes < 0 || mes > 12 || !ano) {
    return NextResponse.json({ erro: "Mês e ano são obrigatórios." }, { status: 400 });
  }
  const texto = await obterObservacaoMensal(mes, ano);
  return NextResponse.json({ texto });
}

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "relatorios"))) {
    return NextResponse.json({ erro: "Acesso não autorizado." }, { status: 403 });
  }
  const { mes, ano, texto } = (await req.json()) as { mes: number; ano: number; texto: string };
  if (typeof mes !== "number" || mes < 0 || mes > 12 || !ano) {
    return NextResponse.json({ erro: "Mês e ano são obrigatórios." }, { status: 400 });
  }
  await salvarObservacaoMensal(mes, ano, texto || "");
  return NextResponse.json({ ok: true });
}
