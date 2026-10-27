import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { definirCodigoDisciplina } from "@/lib/administracao";

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "configuracoes"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a Configurações." }, { status: 403 });
  }

  const { codigos } = (await req.json()) as { codigos: { disciplina: string; codigo: string | null; descricao: string | null }[] };
  try {
    for (const c of codigos) {
      await definirCodigoDisciplina(c.disciplina, c.codigo, c.descricao, sessao.username);
    }
    void registrarAtividade(sessao.username, sessao.perfil, "CENTRAL_CODIFICACAO_ATUALIZADA", "administracao");
    return NextResponse.json({ ok: true });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao salvar códigos de disciplina." }, { status: 500 });
  }
}
