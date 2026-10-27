import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { inserirPerguntaChecklist } from "@/lib/administracao";

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "configuracoes"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a Configurações." }, { status: 403 });
  }

  const dados = (await req.json()) as { categoria: string; texto: string; ordemCategoria: number; ordemPergunta: number };
  if (!dados.categoria?.trim() || !dados.texto?.trim()) {
    return NextResponse.json({ erro: "Preencha a categoria e o texto da pergunta." }, { status: 400 });
  }

  const id = await inserirPerguntaChecklist(dados.categoria, dados.texto, dados.ordemCategoria, dados.ordemPergunta, sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "CHECKLIST_PERGUNTA_CRIADA", "administracao");
  return NextResponse.json({ id });
}
