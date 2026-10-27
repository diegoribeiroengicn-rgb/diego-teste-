import { diasCorridosEntre, diasUteisEntre } from "@/lib/dias-uteis";

const SLA_RETORNO_EXTERNO_DIAS_UTEIS = 10;
const LIMIAR_PROXIMO_LIMITE = SLA_RETORNO_EXTERNO_DIAS_UTEIS - 2; // 8 e 9 dias
const AT_PLACEHOLDERS = new Set(["", "***", "-", "--", "N/A", "NA"]);

export type SituacaoSlaExterno =
  | "DENTRO DO SLA" | "PRÓXIMO DO LIMITE" | "NO LIMITE" | "FORA DO SLA"
  | "AGUARDANDO NOVA REVISÃO" | "DATA INCONSISTENTE";

export function atValido(numAt: string | null): boolean {
  if (!numAt) return false;
  return !AT_PLACEHOLDERS.has(numAt.trim().toUpperCase());
}

/** Classifica o tempo de retorno externo (dias úteis) contra o SLA de 10
 * dias úteis — mesma regra de gat/revisoes.py::situacao_sla_externo. */
export function situacaoSlaExterno(diasUteis: number | null): SituacaoSlaExterno {
  if (diasUteis == null) return "AGUARDANDO NOVA REVISÃO";
  if (diasUteis < 0) return "DATA INCONSISTENTE";
  if (diasUteis > SLA_RETORNO_EXTERNO_DIAS_UTEIS) return "FORA DO SLA";
  if (diasUteis === SLA_RETORNO_EXTERNO_DIAS_UTEIS) return "NO LIMITE";
  if (diasUteis >= LIMIAR_PROXIMO_LIMITE) return "PRÓXIMO DO LIMITE";
  return "DENTRO DO SLA";
}

/** Maiúsculas e sem acentos — só para CHAVE de agrupamento/comparação
 * (nunca para exibição), já que a mesma disciplina pode ter sido gravada
 * com grafias diferentes ao longo do tempo. */
export function textoSemAcentos(valor: string | null): string {
  if (!valor) return "";
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

export type Origem = "prestadores" | "cessionarios";

export type LinhaRevisao = {
  id: number;
  item: number | null;
  codigo: string | null;
  nome: string | null;
  disciplina: string | null;
  numAt: string | null;
  revisao: number;
  responsavel: string | null;
  statusAnalise: string;
  dataSolicitacao: string | null;
  dataAnalise: string | null;
  dataLimite: string | null;
  holdInicio: string | null;
  holdFim: string | null;
  holdDias: number;
  statusEntregaCalc: "ANTES DO PRAZO" | "NO PRAZO" | "ATRASADO" | null;
  tempoAnaliseInterna: number | null;
  observacoes: string | null;
};

export function chaveEntidade(linha: Pick<LinhaRevisao, "codigo" | "nome">): string {
  return linha.codigo && linha.codigo.trim() ? linha.codigo : linha.nome || "";
}

/** Chave de um projeto (código/nome + N° AT + disciplina, sem acentos) —
 * mesmo critério de gat.revisoes.projetos_por_entidade, reaproveitado
 * fora deste módulo (ex.: Localização de ATs) para marcar a revisão mais
 * recente de cada projeto sem duplicar a lógica de agrupamento. */
export function chaveProjeto(linha: LinhaRevisao): string {
  const entidade = chaveEntidade(linha);
  if (atValido(linha.numAt)) {
    return `${entidade}||${linha.numAt}||${textoSemAcentos(linha.disciplina)}`;
  }
  return `${entidade}||SEMAT||${linha.id}`;
}

export type IntervaloRevisao = {
  chaveGrupo: string;
  chaveEntidade: string;
  nome: string | null;
  codigo: string | null;
  numAt: string | null;
  disciplina: string | null;
  item: number | null;
  id: number;
  responsavel: string | null;
  revisaoAnterior: number;
  revisaoAtual: number;
  dataEntradaAnterior: string | null;
  dataEntradaAtual: string | null;
  diasUteisRetorno: number | null;
  diasCorridosRetorno: number | null;
  situacaoSla: SituacaoSlaExterno;
  sequencial: boolean;
};

/** Uma linha por revisão (exceto a primeira de cada grupo), com o tempo
 * em dias úteis/corridos entre a entrada da revisão anterior e a atual —
 * sempre a revisão IMEDIATAMENTE anterior. Mesma regra de
 * gat/revisoes.py::calcular_intervalos_revisao. */
export function calcularIntervalosRevisao(linhas: LinhaRevisao[]): IntervaloRevisao[] {
  const comAt = linhas.filter((l) => atValido(l.numAt));
  const grupos = new Map<string, LinhaRevisao[]>();
  for (const linha of comAt) {
    const entidade = chaveEntidade(linha);
    const chave = `${entidade}||${linha.numAt}||${textoSemAcentos(linha.disciplina)}`;
    const lista = grupos.get(chave) ?? [];
    lista.push(linha);
    grupos.set(chave, lista);
  }

  const intervalos: IntervaloRevisao[] = [];
  for (const [chave, grupo] of grupos) {
    const ordenado = [...grupo].sort((a, b) => a.revisao - b.revisao);
    let anterior: LinhaRevisao | null = null;
    for (const linha of ordenado) {
      if (anterior && linha.dataSolicitacao && anterior.dataSolicitacao) {
        const dias = diasUteisEntre(anterior.dataSolicitacao, linha.dataSolicitacao);
        intervalos.push({
          chaveGrupo: chave,
          chaveEntidade: chaveEntidade(linha),
          nome: linha.nome,
          codigo: linha.codigo,
          numAt: linha.numAt,
          disciplina: linha.disciplina,
          item: linha.item,
          id: linha.id,
          responsavel: linha.responsavel,
          revisaoAnterior: anterior.revisao,
          revisaoAtual: linha.revisao,
          dataEntradaAnterior: anterior.dataSolicitacao,
          dataEntradaAtual: linha.dataSolicitacao,
          diasUteisRetorno: dias,
          diasCorridosRetorno: diasCorridosEntre(anterior.dataSolicitacao, linha.dataSolicitacao),
          situacaoSla: situacaoSlaExterno(dias),
          sequencial: linha.revisao === anterior.revisao + 1,
        });
      }
      anterior = linha;
    }
  }
  return intervalos;
}

export type ProjetoEntidade = {
  chaveEntidade: string;
  nome: string | null;
  codigo: string | null;
  numAt: string | null;
  disciplina: string | null;
  atValido: boolean;
  qtdRevisoes: number;
  revisaoAtual: number;
  dataUltimaEntrada: string | null;
  responsavelAtual: string | null;
  statusAnaliseAtual: string;
  statusEntregaAtual: LinhaRevisao["statusEntregaCalc"];
  ids: number[];
};

/** Uma linha por projeto (código/nome + N° AT + disciplina) — inclui
 * também projetos sem N° AT utilizável. Mesma regra de
 * gat/revisoes.py::projetos_por_entidade. */
export function projetosPorEntidade(linhas: LinhaRevisao[]): ProjetoEntidade[] {
  const grupos = new Map<string, LinhaRevisao[]>();
  for (const linha of linhas) {
    const chave = chaveProjeto(linha);
    const lista = grupos.get(chave) ?? [];
    lista.push(linha);
    grupos.set(chave, lista);
  }

  const projetos: ProjetoEntidade[] = [];
  for (const grupo of grupos.values()) {
    const ordenado = [...grupo].sort((a, b) => a.revisao - b.revisao);
    const ultima = ordenado[ordenado.length - 1];
    projetos.push({
      chaveEntidade: chaveEntidade(ultima),
      nome: ultima.nome,
      codigo: ultima.codigo,
      numAt: ultima.numAt,
      disciplina: ultima.disciplina,
      atValido: atValido(ultima.numAt),
      qtdRevisoes: ordenado.length,
      revisaoAtual: ultima.revisao,
      dataUltimaEntrada: ultima.dataSolicitacao,
      responsavelAtual: ultima.responsavel,
      statusAnaliseAtual: ultima.statusAnalise,
      statusEntregaAtual: ultima.statusEntregaCalc,
      ids: ordenado.map((l) => l.id),
    });
  }
  return projetos;
}

export type ConsolidadoEntidade = {
  chaveEntidade: string;
  nome: string | null;
  codigo: string | null;
  qtdProjetos: number;
  qtdAts: number;
  qtdDisciplinas: number;
  qtdAtrasadosAtual: number;
  qtdProjetosSemAtValido: number;
  qtdIntervalos: number;
  mediaDias: number | null;
  maiorDias: number | null;
  menorDias: number | null;
  qtdDentroSla: number;
  qtdForaSla: number;
  qtdNoLimite: number;
  qtdProximoLimite: number;
  qtdInconsistentes: number;
  pctDentroSla: number;
};

/** Visão principal da Linha do Tempo: uma linha por código/nome,
 * consolidando todos os projetos com métricas agregadas de tempo de
 * retorno externo e status atual. Mesma regra de
 * gat/revisoes.py::consolidado_por_entidade. */
export function consolidadoPorEntidade(linhas: LinhaRevisao[]): ConsolidadoEntidade[] {
  const projetos = projetosPorEntidade(linhas);
  const intervalos = calcularIntervalosRevisao(linhas);

  const porEntidade = new Map<string, ProjetoEntidade[]>();
  for (const p of projetos) {
    const lista = porEntidade.get(p.chaveEntidade) ?? [];
    lista.push(p);
    porEntidade.set(p.chaveEntidade, lista);
  }

  const intervalosPorEntidade = new Map<string, IntervaloRevisao[]>();
  for (const i of intervalos) {
    const lista = intervalosPorEntidade.get(i.chaveEntidade) ?? [];
    lista.push(i);
    intervalosPorEntidade.set(i.chaveEntidade, lista);
  }

  const resultado: ConsolidadoEntidade[] = [];
  for (const [chaveEnt, grupoProjetos] of porEntidade) {
    const ats = new Set(grupoProjetos.map((p) => p.numAt));
    const disciplinas = new Set(grupoProjetos.map((p) => p.disciplina));
    const grupoIntervalos = intervalosPorEntidade.get(chaveEnt) ?? [];
    const validos = grupoIntervalos.filter((i) => i.situacaoSla !== "DATA INCONSISTENTE");
    const diasValidos = validos.map((i) => i.diasUteisRetorno).filter((d): d is number => d != null);
    const dentro = grupoIntervalos.filter((i) => i.situacaoSla === "DENTRO DO SLA").length;

    resultado.push({
      chaveEntidade: chaveEnt,
      nome: grupoProjetos[0].nome,
      codigo: grupoProjetos[0].codigo,
      qtdProjetos: grupoProjetos.length,
      qtdAts: ats.size,
      qtdDisciplinas: disciplinas.size,
      qtdAtrasadosAtual: grupoProjetos.filter((p) => p.statusEntregaAtual === "ATRASADO").length,
      qtdProjetosSemAtValido: grupoProjetos.filter((p) => !p.atValido).length,
      qtdIntervalos: grupoIntervalos.length,
      mediaDias: diasValidos.length ? Math.round((diasValidos.reduce((s, d) => s + d, 0) / diasValidos.length) * 10) / 10 : null,
      maiorDias: diasValidos.length ? Math.max(...diasValidos) : null,
      menorDias: diasValidos.length ? Math.min(...diasValidos) : null,
      qtdDentroSla: dentro,
      qtdForaSla: grupoIntervalos.filter((i) => i.situacaoSla === "FORA DO SLA").length,
      qtdNoLimite: grupoIntervalos.filter((i) => i.situacaoSla === "NO LIMITE").length,
      qtdProximoLimite: grupoIntervalos.filter((i) => i.situacaoSla === "PRÓXIMO DO LIMITE").length,
      qtdInconsistentes: grupoIntervalos.filter((i) => i.situacaoSla === "DATA INCONSISTENTE").length,
      pctDentroSla: validos.length ? Math.round((1000 * dentro) / validos.length) / 10 : 0,
    });
  }
  return resultado;
}
