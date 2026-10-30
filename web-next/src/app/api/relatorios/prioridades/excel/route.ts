import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { gerarExcelPrioridades } from "@/lib/relatorios-prioridades";
import type { ItemPrioridade } from "@/lib/lista-prioridades";

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "lista_prioridades.relatorios"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a gerar relatórios de prioridades." }, { status: 403 });
  }

  const { itens } = (await req.json()) as { itens: ItemPrioridade[] };
  const { buffer, nomeArquivo } = await gerarExcelPrioridades(itens ?? []);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
