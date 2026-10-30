/** Devolutiva Externa — cobrança recorrente após a emissão da última AT:
 * porta exata de gat/devolutiva_externa.py. Marco inicial: data de
 * emissão da última AT (data_analise da revisão mais recente, quando o
 * status exige devolutiva do Prestador/Cessionário). 10 dias úteis sem
 * retorno → 1ª cobrança; depois, +5 dias úteis sem retorno → próxima
 * cobrança, sem limite máximo, enquanto o projeto não voltar para Em
 * Análise. HOLD sempre pausa a contagem e nunca gera cobrança. */

import { calcularHoldDias, diasUteisDecorridos, somarDiasUteis, paraData } from "@/lib/dias-uteis";

export const SLA_PRIMEIRA_COBRANCA_DIAS_UTEIS = 10;
export const SLA_COBRANCAS_SEGUINTES_DIAS_UTEIS = 5;

/** Status da revisão mais recente que caracteriza "aguardando devolutiva
 * externa" — a análise já foi concluída e emitida (AT emitida), mas
 * depende de retorno do Prestador/Cessionário. "LIBERADO" não entra: não
 * há mais nada pendente do lado externo. */
export const STATUS_AGUARDA_DEVOLUTIVA_EXTERNA = new Set(["LIBERADO C/ REST.", "NÃO LIBERADO"]);

export const SITUACAO_AGUARDANDO_PRAZO_INICIAL = "AGUARDANDO_PRAZO_INICIAL";
export const SITUACAO_PRIMEIRA_COBRANCA_NECESSARIA = "PRIMEIRA_COBRANCA_NECESSARIA";
export const SITUACAO_COBRANCA_REALIZADA = "COBRANCA_REALIZADA";
export const SITUACAO_NOVA_COBRANCA_NECESSARIA = "NOVA_COBRANCA_NECESSARIA";
export const SITUACAO_EM_HOLD = "EM_HOLD";

const _AT_PLACEHOLDERS = new Set(["", "***", "-", "--", "N/A", "NA"]);

export function atValido(numAt: string | null | undefined): boolean {
  if (!numAt) return false;
  return !_AT_PLACEHOLDERS.has(String(numAt).trim().toUpperCase());
}

export function estaAguardandoDevolutivaExterna(statusAnalise: string | null | undefined): boolean {
  return STATUS_AGUARDA_DEVOLUTIVA_EXTERNA.has((statusAnalise || "").trim().toUpperCase());
}

/** Maiúsculas e sem acentos — só como chave de agrupamento/comparação
 * (nunca para exibição), para que grafias diferentes da mesma disciplina
 * não sejam tratadas como disciplinas diferentes. Mesma regra de
 * gat/normalizacao.py::texto_sem_acentos. */
export function textoSemAcentos(valor: string | null | undefined): string {
  const texto = (valor || "").trim().toUpperCase();
  return texto.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

export type LinhaProjetoRevisao = {
  id: number;
  codigo: string | null;
  disciplina: string | null;
  num_at: string | null;
  revisao: number;
  [campo: string]: unknown;
};

/** Uma linha por projeto (código/nome + N° AT + disciplina, ou id isolado
 * quando o AT não é utilizável), preservando todas as colunas originais
 * da revisão mais recente (maior `revisao` do grupo). Mesma regra de
 * gat/revisoes.py::linha_mais_recente_por_projeto. */
export function linhaMaisRecentePorProjeto<T extends LinhaProjetoRevisao>(linhas: T[], campoNomeEntidade: string): T[] {
  const grupos = new Map<string, T>();
  for (const linha of linhas) {
    const identificador = linha.codigo || (linha[campoNomeEntidade] as string | null) || "";
    const chave = atValido(linha.num_at)
      ? `${identificador}||${linha.num_at}||${textoSemAcentos(linha.disciplina)}`
      : `${identificador}||SEMAT||${linha.id}`;
    const atual = grupos.get(chave);
    if (!atual || (linha.revisao ?? 0) > (atual.revisao ?? 0)) grupos.set(chave, linha);
  }
  return [...grupos.values()];
}

/** Dias úteis decorridos desde `dataReferencia` (última AT ou última
 * cobrança confirmada) até hoje, descontando só o HOLD que tenha
 * começado a partir dessa referência — um HOLD anterior já pertence à
 * fase interna da análise. Mesma regra de
 * gat/devolutiva_externa.py::dias_uteis_devolutiva. */
export function diasUteisDevolutiva(
  dataReferencia: string | null, holdInicio: string | null, holdFim: string | null, emHoldAtual: boolean,
): number {
  const referencia = paraData(dataReferencia);
  if (!referencia) return 0;
  const inicioHold = paraData(holdInicio);
  const holdContaNaJanela = inicioHold !== null && inicioHold.getTime() >= referencia.getTime();
  const holdDias = holdContaNaJanela ? calcularHoldDias(holdInicio, holdFim) : 0;
  const holdAbertoDesde = emHoldAtual && holdContaNaJanela ? holdInicio : null;
  return diasUteisDecorridos(dataReferencia, null, holdDias, holdAbertoDesde);
}

export type SituacaoDevolutiva = {
  numeroCobrancasRealizadas: number;
  dataReferencia: string | null;
  dataUltimaCobranca: string | null;
  dataPrimeiraCobranca: string | null;
  situacao: string | null;
  situacaoLabel: string;
  diasUteisDecorridos: number;
  numeroProximaCobranca: number | null;
  dataPrevistaProximaVerificacao: string | null;
  acaoNecessaria: boolean;
};

/** Situação atual da devolutiva externa de um projeto — 100% dinâmica,
 * nunca persistida. Mesma regra de
 * gat/devolutiva_externa.py::situacao_devolutiva. */
export function situacaoDevolutiva(
  dataUltimaAt: string | null, holdInicio: string | null, holdFim: string | null, emHoldAtual: boolean, datasCobrancas: string[],
): SituacaoDevolutiva {
  const datasValidas = datasCobrancas.map((d) => paraData(d)).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime());
  const numeroCobrancasRealizadas = datasValidas.length;
  const dataReferenciaDate = numeroCobrancasRealizadas ? datasValidas[datasValidas.length - 1] : paraData(dataUltimaAt);
  const dataReferencia = dataReferenciaDate ? dataReferenciaDate.toISOString().slice(0, 10) : null;
  const limiar = numeroCobrancasRealizadas ? SLA_COBRANCAS_SEGUINTES_DIAS_UTEIS : SLA_PRIMEIRA_COBRANCA_DIAS_UTEIS;
  const dataUltimaCobranca = numeroCobrancasRealizadas ? datasValidas[numeroCobrancasRealizadas - 1].toISOString().slice(0, 10) : null;
  const dataPrimeiraCobranca = numeroCobrancasRealizadas ? datasValidas[0].toISOString().slice(0, 10) : null;

  const base = { numeroCobrancasRealizadas, dataReferencia, dataUltimaCobranca, dataPrimeiraCobranca };

  if (!dataReferencia) {
    return {
      ...base, situacao: null, situacaoLabel: "Sem data de referência", diasUteisDecorridos: 0,
      numeroProximaCobranca: null, dataPrevistaProximaVerificacao: null, acaoNecessaria: false,
    };
  }

  const dias = diasUteisDevolutiva(dataReferencia, holdInicio, holdFim, emHoldAtual);

  if (emHoldAtual) {
    return {
      ...base, situacao: SITUACAO_EM_HOLD, situacaoLabel: "Em HOLD", diasUteisDecorridos: dias,
      numeroProximaCobranca: null, dataPrevistaProximaVerificacao: null, acaoNecessaria: false,
    };
  }

  const dataPrevistaDate = somarDiasUteis(paraData(dataReferencia), limiar);
  const dataPrevista = dataPrevistaDate ? dataPrevistaDate.toISOString().slice(0, 10) : null;

  if (dias < limiar) {
    const situacao = numeroCobrancasRealizadas === 0 ? SITUACAO_AGUARDANDO_PRAZO_INICIAL : SITUACAO_COBRANCA_REALIZADA;
    const label = situacao === SITUACAO_AGUARDANDO_PRAZO_INICIAL
      ? "Aguardando prazo inicial"
      : `${numeroCobrancasRealizadas}ª cobrança realizada — aguardando prazo`;
    return {
      ...base, situacao, situacaoLabel: label, diasUteisDecorridos: dias,
      numeroProximaCobranca: null, dataPrevistaProximaVerificacao: dataPrevista, acaoNecessaria: false,
    };
  }

  const numeroProxima = numeroCobrancasRealizadas + 1;
  const situacao = numeroProxima === 1 ? SITUACAO_PRIMEIRA_COBRANCA_NECESSARIA : SITUACAO_NOVA_COBRANCA_NECESSARIA;
  const label = numeroProxima === 1 ? "1ª cobrança necessária" : `${numeroProxima}ª cobrança necessária`;
  return {
    ...base, situacao, situacaoLabel: label, diasUteisDecorridos: dias,
    numeroProximaCobranca: numeroProxima, dataPrevistaProximaVerificacao: dataPrevista, acaoNecessaria: true,
  };
}

function formatarDataBr(valor: string | null): string {
  const d = paraData(valor);
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
}

/** Minuta do e-mail de cobrança — nunca enviada automaticamente, só
 * gerada para o usuário copiar/enviar e depois confirmar. A partir da 2ª
 * cobrança, o texto deixa claro que se trata de uma reiteração. Mesma
 * regra de gat/devolutiva_externa.py::gerar_minuta_cobranca. */
export function gerarMinutaCobranca(
  numeroCobranca: number, codigo: string | null, nomeEntidade: string | null, disciplina: string | null,
  numAt: string | null, dataUltimaAt: string | null, dataPrimeiraCobranca: string | null = null,
): { assunto: string; corpo: string } {
  const codigoLabel = (codigo || "").trim() || "—";
  const nomeLabel = (nomeEntidade || "").trim() || "—";
  const identificacao = `${codigoLabel} – ${nomeLabel}`;
  const disciplinaLabel = (disciplina || "").trim() || "—";
  const atLabel = (numAt || "").trim() || "—";
  const dataAtLabel = formatarDataBr(dataUltimaAt);

  if (numeroCobranca <= 1) {
    return {
      assunto: `Solicitação de atualização – ${identificacao} – ${disciplinaLabel}`,
      corpo:
        "Prezados,\n\n" +
        `Solicitamos a atualização referente ao projeto ${identificacao}, disciplina ${disciplinaLabel}, ` +
        `considerando que até o momento não identificamos o recebimento de nova revisão após a emissão ` +
        `da ${atLabel}, em ${dataAtLabel}.\n\n` +
        "Solicitamos, por gentileza, informar o andamento das adequações e a previsão para reenvio da documentação.\n\n" +
        "Atenciosamente,",
    };
  }

  const dataPrimeiraLabel = formatarDataBr(dataPrimeiraCobranca);
  return {
    assunto: `Reiteração – Solicitação de atualização – ${identificacao} – ${disciplinaLabel}`,
    corpo:
      "Prezados,\n\n" +
      `Reiteramos a solicitação de atualização referente ao projeto ${identificacao}, disciplina ` +
      `${disciplinaLabel}, considerando que até o momento não identificamos o recebimento de nova revisão ` +
      `após a emissão da ${atLabel}, em ${dataAtLabel}.\n\n` +
      `A primeira solicitação de atualização foi realizada em ${dataPrimeiraLabel}.\n\n` +
      "Solicitamos, por gentileza, informar o andamento das adequações e a previsão para reenvio da documentação.\n\n" +
      "Atenciosamente,",
  };
}

export type DevolutivaPendente = SituacaoDevolutiva & {
  modulo: "prestadores" | "cessionarios";
  projetoId: number;
  codigo: string | null;
  nome: string | null;
  disciplina: string | null;
  numAt: string | null;
  revisao: number;
  dataUltimaAt: string | null;
  responsavel: string | null;
  holdInicio: string | null;
  holdFim: string | null;
  emHold: boolean;
};
