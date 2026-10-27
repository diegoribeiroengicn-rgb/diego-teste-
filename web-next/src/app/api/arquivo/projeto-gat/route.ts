import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { perfilPodeArquivarERestaurar } from "@/lib/arquivo-calculo";
import { restaurarProjetoGat } from "@/lib/arquivo";

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "arquivo")) || !perfilPodeArquivarERestaurar(sessao.perfil)) {
    return NextResponse.json({ erro: "Acesso não autorizado a restaurar projetos." }, { status: 403 });
  }

  const { codigo } = (await req.json()) as { codigo: string };
  const total = await restaurarProjetoGat(codigo, sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "RESTAURACAO", "arquivo", `Projeto GAT ${codigo}`);
  return NextResponse.json({ total });
}
