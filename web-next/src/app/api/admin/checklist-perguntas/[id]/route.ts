import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { atualizarPerguntaChecklist, definirAtivaPerguntaChecklist } from "@/lib/administracao";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "configuracoes"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a Configurações." }, { status: 403 });
  }

  const { id } = await params;
  const dados = (await req.json()) as { categoria: string; texto: string; ordemCategoria: number; ordemPergunta: number; ativo: boolean };

  await atualizarPerguntaChecklist(Number(id), dados.categoria, dados.texto, dados.ordemCategoria, dados.ordemPergunta, sessao.username);
  await definirAtivaPerguntaChecklist(Number(id), dados.ativo, sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "CHECKLIST_PERGUNTAS_ATUALIZADO", "administracao");
  return NextResponse.json({ ok: true });
}
