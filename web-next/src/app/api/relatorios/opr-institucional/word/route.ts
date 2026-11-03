import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { registrarAtividade } from "@/lib/atividades";
import { obterConfiguracao } from "@/lib/administracao";
import { buscarLinhasOprInstitucional } from "@/lib/opr-institucional";
import {
  combinarExecutivos,
  filtrarOprAvancado,
  filtrarOprPeriodo,
  filtrarOprSituacaoSlaExterno,
  indicadoresExecutivos,
  type FiltrosOprAvancados,
  type PeriodoOpr,
} from "@/lib/opr-institucional-calculo";
import { gerarOprInstitucionalWord, type NivelOpr, type TipoOpr } from "@/lib/opr-institucional-word";
import { MESES_PT, rotuloCompetencia } from "@/lib/meses";

type Corpo = {
  tipo: TipoOpr;
  nivel: NivelOpr;
  periodo: PeriodoOpr;
  filtros: FiltrosOprAvancados & { situacaoSla?: string };
  observacoes: string;
};

function formatarDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "relatorios"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a gerar relatórios." }, { status: 403 });
  }

  const corpo = (await req.json()) as Corpo;
  const { tipo, nivel, periodo, filtros, observacoes } = corpo;
  if (!tipo || !nivel || !periodo) {
    return NextResponse.json({ erro: "Tipo, nível e período são obrigatórios." }, { status: 400 });
  }
  if (periodo.tipo === "personalizado" && (!periodo.dataInicio || !periodo.dataFim)) {
    return NextResponse.json({ erro: "Selecione a Data início e a Data fim para um OPR de período personalizado." }, { status: 400 });
  }

  const metaRev2 = Number(await obterConfiguracao("meta_aprovacao_rev2", "80")) || 80;

  function filtrarBase(linhas: Awaited<ReturnType<typeof buscarLinhasOprInstitucional>>) {
    const porPeriodo = filtrarOprPeriodo(linhas, periodo);
    const porAvancados = filtrarOprAvancado(porPeriodo, filtros);
    return filtrarOprSituacaoSlaExterno(porAvancados, filtros.situacaoSla);
  }

  let exec;
  if (tipo === "Prestadores") {
    const linhas = filtrarBase(await buscarLinhasOprInstitucional("prestadores"));
    exec = indicadoresExecutivos(linhas, metaRev2);
  } else if (tipo === "Cessionários") {
    const linhas = filtrarBase(await buscarLinhasOprInstitucional("cessionarios"));
    exec = indicadoresExecutivos(linhas, metaRev2);
  } else {
    const [linhasPrest, linhasCess] = await Promise.all([
      buscarLinhasOprInstitucional("prestadores").then(filtrarBase),
      buscarLinhasOprInstitucional("cessionarios").then(filtrarBase),
    ]);
    exec = combinarExecutivos(indicadoresExecutivos(linhasPrest, metaRev2), indicadoresExecutivos(linhasCess, metaRev2));
  }

  let periodoLabel: string;
  let partesArquivoPeriodo: string[];
  if (periodo.tipo === "mensal") {
    periodoLabel = rotuloCompetencia(periodo.mes, periodo.ano);
    const nomeMes = MESES_PT[periodo.mes - 1];
    partesArquivoPeriodo = [nomeMes.charAt(0) + nomeMes.slice(1).toLowerCase(), String(periodo.ano)];
  } else if (periodo.tipo === "anual") {
    periodoLabel = `Ano ${periodo.ano}`;
    partesArquivoPeriodo = [String(periodo.ano)];
  } else {
    periodoLabel = `${formatarDataBr(periodo.dataInicio)} a ${formatarDataBr(periodo.dataFim)}`;
    partesArquivoPeriodo = [periodo.dataInicio.split("-").reverse().join("-"), "a", periodo.dataFim.split("-").reverse().join("-")];
  }

  const filtrosDict = {
    "Código": filtros.codigo, "Nome": filtros.nome, "N° AT": filtros.numAt,
    "Disciplina": filtros.disciplina, "Analista": filtros.analista, "Revisão": filtros.revisao,
    "Status": filtros.status, "Situação SLA": filtros.situacaoSla,
  };

  const { buffer, nomeArquivo } = await gerarOprInstitucionalWord({
    tipo, nivel, periodoLabel, filtros: filtrosDict, exec, observacoes,
    autor: sessao.nomeCompleto || sessao.username, partesArquivoPeriodo,
  });
  void registrarAtividade(sessao.username, sessao.perfil, "OPR_WORD_GERADO", tipo, `${nivel} · ${periodoLabel}`);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
