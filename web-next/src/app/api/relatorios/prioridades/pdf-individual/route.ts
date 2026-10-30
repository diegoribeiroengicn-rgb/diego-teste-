import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { registrarAtividade } from "@/lib/atividades";
import { gerarPdfPrioridadesIndividual } from "@/lib/relatorios-prioridades";
import type { ItemPrioridade } from "@/lib/lista-prioridades";

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "lista_prioridades.relatorios"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a gerar relatórios de prioridades." }, { status: 403 });
  }

  const { item } = (await req.json()) as { item: ItemPrioridade };
  if (!item) {
    return NextResponse.json({ erro: "Projeto não informado." }, { status: 400 });
  }
  const { buffer, nomeArquivo } = await gerarPdfPrioridadesIndividual(item);
  void registrarAtividade(sessao.username, sessao.perfil, "RELATORIO_PRIORIDADES_INDIVIDUAL", "gestao", item.nome_entidade || undefined);

  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nomeArquivo}"` },
  });
}
