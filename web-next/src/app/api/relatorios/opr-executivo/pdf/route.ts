import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { registrarAtividade } from "@/lib/atividades";
import { buscarLinhasProdutividade } from "@/lib/relatorios-mensais";
import { buscarLembretesPep } from "@/lib/lembretes-pep";
import { comparativoResumoExecutivo, mesAnterior, resumoExecutivoMensal } from "@/lib/produtividade";
import { obterObservacaoMensal } from "@/lib/observacao-mensal";
import { rotuloCompetencia } from "@/lib/meses";
import { gerarOnePageReportPdf } from "@/lib/relatorio-mensal-export";

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "relatorios"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a gerar relatórios." }, { status: 403 });
  }

  const { mes, ano } = (await req.json()) as { mes: number; ano: number };
  if (!mes || !ano) {
    return NextResponse.json({ erro: "Mês e ano são obrigatórios." }, { status: 400 });
  }

  const [todas, lembretesPep, observacoes] = await Promise.all([
    buscarLinhasProdutividade(["prestadores", "cessionarios"]),
    buscarLembretesPep(),
    obterObservacaoMensal(mes, ano),
  ]);
  const linhasPrest = todas.filter((l) => l.origem === "prestadores");
  const linhasCess = todas.filter((l) => l.origem === "cessionarios");

  const resumo = resumoExecutivoMensal(linhasPrest, linhasCess, mes, ano, lembretesPep.length);
  const [mesAnt, anoAnt] = mesAnterior(mes, ano);
  const resumoAnterior = resumoExecutivoMensal(linhasPrest, linhasCess, mesAnt, anoAnt, lembretesPep.length);
  const comparativo = comparativoResumoExecutivo(resumo, resumoAnterior);

  const competenciaLabel = rotuloCompetencia(mes, ano);
  const { buffer, nomeArquivo } = await gerarOnePageReportPdf(competenciaLabel, resumo, comparativo, observacoes);
  void registrarAtividade(sessao.username, sessao.perfil, "OPR_GERADO", "consolidado", competenciaLabel);

  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nomeArquivo}"` },
  });
}
