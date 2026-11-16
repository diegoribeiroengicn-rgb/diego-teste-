import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { perfilPodeArquivarERestaurar } from "@/lib/arquivo-calculo";
import { arquivarProjetoGat, restaurarProjetoGat } from "@/lib/arquivo";

/** Arquiva ou desarquiva um projeto (código) inteiro — lógico e reversível. */
export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!(await areaPermitida(sessao.id, sessao.perfil, "arquivo")) || !perfilPodeArquivarERestaurar(sessao.perfil)) {
    return NextResponse.json({ erro: "Acesso não autorizado a arquivar projetos." }, { status: 403 });
  }
  const { codigo, acao, motivo } = (await req.json()) as { codigo: string; acao: "arquivar" | "restaurar"; motivo?: string };
  if (!codigo?.trim() || !["arquivar", "restaurar"].includes(acao)) return NextResponse.json({ erro: "Parâmetros inválidos." }, { status: 400 });
  const total = acao === "arquivar" ? await arquivarProjetoGat(codigo.trim(), sessao.username, motivo?.trim() || null) : await restaurarProjetoGat(codigo.trim(), sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, acao === "arquivar" ? "ARQUIVAMENTO" : "RESTAURACAO", "projetos", `Projeto GAT ${codigo} (${total} análise(s))`);
  return NextResponse.json({ total });
}
