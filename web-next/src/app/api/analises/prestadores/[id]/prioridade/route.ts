import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { registrarAtividade } from "@/lib/atividades";
import { definirPrioridadePrestador } from "@/lib/analise";

/** Define o nível de prioridade (1, 2, 3 ou null para remover) de uma
 * análise de Prestador — aparece como ★ no Gantt e na Lista de Prioridades. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!(await areaPermitida(sessao.id, sessao.perfil, "prestadores.editar"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a definir prioridades." }, { status: 403 });
  }
  const { id } = await params;
  const { nivel, justificativa, aplicarAoCodigo } = (await req.json()) as { nivel: number | null; justificativa?: string; aplicarAoCodigo?: boolean };
  if (nivel !== null && ![1, 2, 3].includes(nivel)) return NextResponse.json({ erro: "Nível inválido (use 1, 2 ou 3)." }, { status: 400 });
  try {
    const n = await definirPrioridadePrestador(Number(id), nivel, justificativa ?? null, !!aplicarAoCodigo, sessao.username);
    void registrarAtividade(sessao.username, sessao.perfil, "PRIORIDADE_DEFINIDA", "prestadores", nivel ? `Nível ${nivel} (${n} análise(s))` : `Prioridade removida (${n} análise(s))`);
    return NextResponse.json({ ok: true, atualizadas: n });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao definir a prioridade." }, { status: 400 });
  }
}
