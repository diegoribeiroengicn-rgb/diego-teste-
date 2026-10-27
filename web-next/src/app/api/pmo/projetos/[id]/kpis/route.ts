import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { definirKpisProjeto } from "@/lib/pmo";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "pmo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao PMO." }, { status: 403 });
  }

  const { id } = await params;
  const { chaves } = (await req.json()) as { chaves: string[] };

  await definirKpisProjeto(Number(id), new Set(chaves), sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "PMO_KPIS_CONFIGURADOS", "pmo", `#${id}`);
  return NextResponse.json({ ok: true });
}
