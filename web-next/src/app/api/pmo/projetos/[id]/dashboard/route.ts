import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import {
  kpisHabilitadosProjeto,
  listarAtividadesCronograma,
  listarComunicacoes,
  listarEntregaveis,
  listarMedicoes,
  listarRiscos,
  resumoFinanceiro,
} from "@/lib/pmo";

/** Agrega tudo que o Dashboard dinâmico precisa (um cartão por KPI
 * habilitado no projeto) em uma única chamada — mesmo escopo de dados de
 * views/pmo_projeto.py::_tab_dashboard. Enquanto o Cronograma (upload +
 * interpretação automática) não é construído, `atividades` sempre volta
 * vazio — os cartões de Cronograma/Curva S/SPI degradam graciosamente
 * para "0 atividades"/"—", do mesmo jeito que a saúde do projeto já
 * degrada no Resumo Executivo. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "pmo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao PMO." }, { status: 403 });
  }

  const { id } = await params;
  const projetoId = Number(id);
  const [kpisHabilitados, atividades, riscos, resumoFin, medicoes, entregaveis, comunicacoes] = await Promise.all([
    kpisHabilitadosProjeto(projetoId),
    listarAtividadesCronograma(projetoId),
    listarRiscos(projetoId),
    resumoFinanceiro(projetoId),
    listarMedicoes(projetoId),
    listarEntregaveis(projetoId),
    listarComunicacoes(projetoId),
  ]);

  return NextResponse.json({
    kpisHabilitados: Array.from(kpisHabilitados),
    atividades, riscos, resumoFinanceiro: resumoFin, medicoes, entregaveis, comunicacoes,
  });
}
