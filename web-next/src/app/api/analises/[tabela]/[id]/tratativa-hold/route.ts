import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { registrarAtividade } from "@/lib/atividades";
import { validarTratativaHold, type DadosTratativaHold } from "@/lib/hold-calculo";
import { registrarTratativaHold } from "@/lib/hold";

function validarTabela(tabela: string): tabela is "prestadores" | "cessionarios" {
  return tabela === "prestadores" || tabela === "cessionarios";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ tabela: string; id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  const { tabela, id } = await params;
  if (!validarTabela(tabela)) {
    return NextResponse.json({ erro: "Tabela inválida." }, { status: 400 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, `${tabela}.editar`))) {
    return NextResponse.json({ erro: "Acesso não autorizado a registrar tratativa de HOLD." }, { status: 403 });
  }

  const dados = (await req.json()) as DadosTratativaHold;
  const erro = validarTratativaHold(dados);
  if (erro) {
    return NextResponse.json({ erro }, { status: 400 });
  }

  const projetoId = Number(id);
  await registrarTratativaHold(tabela, projetoId, dados, sessao.username);
  void registrarAtividade(sessao.username, sessao.perfil, "TRATATIVA_HOLD_REGISTRADA", tabela, `Tratativa de HOLD #${projetoId}: ${dados.decisao}`);
  return NextResponse.json({ ok: true });
}
