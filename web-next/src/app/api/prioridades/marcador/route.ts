import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { registrarAtividade } from "@/lib/atividades";
import { definirMarcadorPrioridade, removerMarcadorPrioridade, type OrigemPrioridade, type TipoMarcador } from "@/lib/prioridades";

/** Prioridade de PRESTADOR ou de DOCUMENTO/PROJETO — marcadores
 * independentes; nunca criam prioridade nas análises. */
export async function PUT(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  const c = (await req.json()) as { tipo: TipoMarcador; tabela: "prestadores" | "cessionarios"; chave: string; ativo: boolean; justificativa?: string; origem?: OrigemPrioridade };
  if (!["PRESTADOR", "DOCUMENTO"].includes(c.tipo) || !["prestadores", "cessionarios"].includes(c.tabela)) return NextResponse.json({ erro: "Parâmetros inválidos." }, { status: 400 });
  if (!(await areaPermitida(sessao.id, sessao.perfil, `${c.tabela}.editar`))) return NextResponse.json({ erro: "Acesso não autorizado a definir prioridades." }, { status: 403 });
  try {
    if (c.ativo) await definirMarcadorPrioridade(c.tipo, c.tabela, c.chave, c.justificativa ?? null, c.origem === "GESTAO" ? "GESTAO" : "LISTAGEM", sessao.username);
    else await removerMarcadorPrioridade(c.tipo, c.tabela, c.chave, sessao.username);
    void registrarAtividade(sessao.username, sessao.perfil, c.ativo ? "PRIORIDADE_DEFINIDA" : "PRIORIDADE_REMOVIDA", c.tabela, `${c.tipo} ${c.chave}`);
    return NextResponse.json({ ok: true });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro." }, { status: 400 });
  }
}
