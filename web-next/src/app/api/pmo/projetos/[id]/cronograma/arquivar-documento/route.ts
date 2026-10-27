import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { perfilPodeArquivarERestaurar } from "@/lib/arquivo-calculo";
import { arquivarRegistro } from "@/lib/arquivo";

/** Arquivar um documento de cronograma individual (aba Cronograma, lista
 * de documentos anexados) reusa o mesmo mecanismo do módulo Arquivo —
 * mesma chamada de views/pmo_projeto.py::_tab_cronograma a
 * dialog_arquivar("pmo_cronograma_arquivos", ...). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "pmo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao PMO." }, { status: 403 });
  }
  if (!perfilPodeArquivarERestaurar(sessao.perfil)) {
    return NextResponse.json({ erro: "Acesso não autorizado a arquivar documentos." }, { status: 403 });
  }

  const { id } = await params;
  const { arquivoId, motivo } = (await req.json()) as { arquivoId: number; motivo?: string | null };
  await arquivarRegistro("pmo_cronograma_arquivos", arquivoId, sessao.username, motivo?.trim() || null);
  void registrarAtividade(sessao.username, sessao.perfil, "PMO_CRONOGRAMA_DOCUMENTO_ARQUIVADO", "pmo", `#${id}/${arquivoId}`);
  return NextResponse.json({ ok: true });
}
