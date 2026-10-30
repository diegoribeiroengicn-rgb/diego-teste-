import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { registrarAtividade } from "@/lib/atividades";
import { registrarCobrancaDevolutiva } from "@/lib/devolutiva";

function validarModulo(modulo: string): modulo is "prestadores" | "cessionarios" {
  return modulo === "prestadores" || modulo === "cessionarios";
}

/** Confirma uma cobrança de Devolutiva Externa já realizada pelo usuário
 * fora do sistema (o sistema nunca envia e-mails automaticamente) —
 * mesma regra de gat/ui/modals_devolutiva.py::dialog_cobranca_devolutiva. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ modulo: string; projetoId: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  const { modulo, projetoId } = await params;
  if (!validarModulo(modulo)) {
    return NextResponse.json({ erro: "Módulo inválido." }, { status: 400 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, `${modulo}.editar`))) {
    return NextResponse.json({ erro: "Acesso não autorizado a registrar cobrança de devolutiva." }, { status: 403 });
  }

  const { numeroCobranca, canal, observacao } = (await req.json()) as { numeroCobranca?: number; canal?: string; observacao?: string | null };
  if (!numeroCobranca || numeroCobranca < 1) {
    return NextResponse.json({ erro: "Número da cobrança inválido." }, { status: 400 });
  }

  const id = Number(projetoId);
  await registrarCobrancaDevolutiva(modulo, id, numeroCobranca, sessao.username, canal || "E-mail", observacao?.trim() || null);
  void registrarAtividade(sessao.username, sessao.perfil, "COBRANCA_DEVOLUTIVA_REGISTRADA", modulo, `${numeroCobranca}ª cobrança — projeto ${id}`);
  return NextResponse.json({ ok: true });
}
