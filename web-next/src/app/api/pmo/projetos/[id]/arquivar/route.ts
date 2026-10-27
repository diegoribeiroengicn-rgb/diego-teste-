import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { perfilPodeArquivarERestaurar } from "@/lib/arquivo-calculo";
import { arquivarRegistro } from "@/lib/arquivo";

/** Arquivar Projeto (aba Configuração) reusa o mesmo mecanismo de
 * arquivamento do módulo Arquivo (gat/ui/modals_pmo.py não tem essa ação
 * própria — views/pmo_projeto.py::_tab_configuracao chama
 * dialog_arquivar("pmo_projetos", ...) do módulo compartilhado). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "pmo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao PMO." }, { status: 403 });
  }
  if (!perfilPodeArquivarERestaurar(sessao.perfil)) {
    return NextResponse.json({ erro: "Acesso não autorizado a arquivar projetos." }, { status: 403 });
  }

  const { id } = await params;
  const { motivo } = (await req.json().catch(() => ({ motivo: null }))) as { motivo?: string | null };
  await arquivarRegistro("pmo_projetos", Number(id), sessao.username, motivo?.trim() || null);
  void registrarAtividade(sessao.username, sessao.perfil, "PMO_PROJETO_ARQUIVADO", "pmo", `#${id}`);
  return NextResponse.json({ ok: true });
}
