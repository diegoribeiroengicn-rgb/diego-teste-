import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { registrarAtividade } from "@/lib/atividades";
import { definirPrioridadePorCodigo } from "@/lib/analise";

/** Define ou remove a prioridade (nível 1/2/3) de um código de prestador
 * inteiro — alimenta as ★ do Gantt e a Lista de Prioridades. */
export async function PATCH(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!(await areaPermitida(sessao.id, sessao.perfil, "prestadores.editar"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a definir prioridades." }, { status: 403 });
  }
  const { codigo, nivel, justificativa } = (await req.json()) as { codigo: string; nivel: number | null; justificativa?: string };
  if (!codigo?.trim()) return NextResponse.json({ erro: "Informe o código." }, { status: 400 });
  if (nivel !== null && ![1, 2, 3].includes(nivel)) return NextResponse.json({ erro: "Nível inválido (use 1, 2 ou 3)." }, { status: 400 });
  try {
    const n = await definirPrioridadePorCodigo(codigo.trim().toUpperCase(), nivel, justificativa ?? null, sessao.username);
    void registrarAtividade(sessao.username, sessao.perfil, "PRIORIDADE_DEFINIDA", "prestadores", `${codigo}: ${nivel ? "Nível " + nivel : "removida"} (${n} análise(s))`);
    return NextResponse.json({ ok: true, atualizadas: n });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao definir a prioridade." }, { status: 400 });
  }
}
