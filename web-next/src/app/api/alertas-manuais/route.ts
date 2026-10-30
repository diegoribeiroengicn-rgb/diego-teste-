import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { registrarAtividade } from "@/lib/atividades";
import { validarAlertaManual, type DadosAlertaManual } from "@/lib/alerta-manual-calculo";
import { criarAlertaManual, listarAlertasManuais } from "@/lib/alerta-manual";

export async function GET(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  const modulosParam = req.nextUrl.searchParams.getAll("modulo") as ("prestadores" | "cessionarios")[];
  const modulos = modulosParam.length ? modulosParam : (["prestadores", "cessionarios"] as const);
  const alertas = await listarAlertasManuais([...modulos]);
  return NextResponse.json({ alertas });
}

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "alertas.manual"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a criar alertas manuais." }, { status: 403 });
  }

  const dados = (await req.json()) as DadosAlertaManual;
  const erro = validarAlertaManual(dados);
  if (erro) {
    return NextResponse.json({ erro }, { status: 400 });
  }

  const id = await criarAlertaManual(dados, sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "CRIACAO_ALERTA_MANUAL", dados.modulo, `Alerta manual #${id} criado: ${dados.titulo}`);
  return NextResponse.json({ ok: true, id });
}
