import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { definirConfiguracao } from "@/lib/administracao";

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "configuracoes"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a Configurações." }, { status: 403 });
  }

  const dados = (await req.json()) as { metaRev2?: number };

  if (dados.metaRev2 != null) {
    await definirConfiguracao("meta_aprovacao_rev2", String(dados.metaRev2));
  }

  void registrarAtividade(sessao.username, sessao.perfil, "CONFIGURACOES_ATUALIZADAS", "administracao");
  return NextResponse.json({ ok: true });
}
