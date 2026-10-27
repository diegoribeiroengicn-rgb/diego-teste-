export const ESCALA_AVALIACAO_ANALISTA: Record<number, string> = {
  1: "Insuficiente",
  2: "Abaixo do esperado",
  3: "Dentro do esperado",
  4: "Bom",
  5: "Excelente",
};

export const CRITERIOS_AVALIACAO_ANALISTA: [string, string][] = [
  ["etg", "Apontamento de ETG"],
  ["horario", "Cumprimento de horário"],
  ["reunioes", "Comparecimento em reuniões"],
  ["disponibilidade", "Disponibilidade"],
  ["conhecimento_tecnico", "Conhecimento técnico"],
  ["produtividade", "Produtividade"],
  ["qualidade", "Qualidade das análises"],
  ["qtd_documentos", "Quantidade de documentos gerados"],
  ["qtd_ats", "Quantidade de ATs"],
  ["prazos", "Cumprimento de prazos"],
  ["organizacao", "Organização"],
  ["colaboracao", "Colaboração"],
  ["comunicacao", "Comunicação"],
];

export const CHAVES_CRITERIOS = CRITERIOS_AVALIACAO_ANALISTA.map(([chave]) => chave);

export const RESPONSAVEIS = [
  "ALLINE", "DIEGO", "FÁTIMA", "GABRIEL", "INEZ", "JEFFERSON",
  "JESSICA BANDEIRA", "JESSICA NAPOLEÃO", "LEONARDO", "LETÍCIA",
  "MATHEUS", "MAYRON", "RIOGALEÃO", "THAINÁ NOBRE", "VIRGINIA", "WESLEY",
];

/** Redução de 50% aplicada à média quando o analista teve ETG=SIM em
 * algum projeto (Prestador ou Cessionário) na mesma competência da
 * avaliação — mesma regra de views/avaliacao_analistas.py. */
export const PENALIDADE_ETG = 0.5;
export const NOTA_MAXIMA_ANALISTA = 5;
export const BONUS_AVALIACOES_OBRIGATORIAS = 1;
export const RECOMENDACAO_DESEMPENHO_MAXIMO =
  "Analista com desempenho máximo, apto para ministrar treinamentos internos e elegível para " +
  "programas de reconhecimento e premiação.";

export type CriteriosValores = Record<string, number | null>;

/** Média simples dos critérios preenchidos (ignora nulos). */
export function mediaBruta(valores: CriteriosValores): number {
  const preenchidos = CHAVES_CRITERIOS.map((c) => valores[c]).filter((v): v is number => v != null);
  if (!preenchidos.length) return 0;
  return Math.round((preenchidos.reduce((s, v) => s + v, 0) / preenchidos.length) * 100) / 100;
}

export type ResumoObrigatorias = { obrigatorias: number; pendentes: number; atPendentes: string[] };

export type ResultadoNotaFinal = {
  penalizacaoFracao: number;
  bonificacao: number;
  notaFinal: number;
  reconhecimento: string | null;
  justificativaAutomatica: string;
};

/** Ordem de processamento: nota-base (`mediaGeral`, já com a penalidade
 * de ETG aplicada) -> avaliações obrigatórias pendentes/realizadas no
 * mês -> limite máximo da nota. Penalização e bonificação nunca se
 * aplicam juntas: dependem do número de pendências no fechamento do mês
 * (1 pendência = -1/3; 2 ou mais = -1/2, nunca reduz mais que isso; zero
 * pendências = +1 ponto, se havia ao menos uma avaliação obrigatória no
 * mês). Mesma regra de views/avaliacao_analistas.py::_aplicar_avaliacoes_obrigatorias. */
export function calcularNotaFinal(mediaGeral: number, resumo: ResumoObrigatorias): ResultadoNotaFinal {
  const { pendentes, obrigatorias, atPendentes } = resumo;
  const base = mediaGeral;

  let penalizacaoFracao = 0;
  let bonificacao = 0;
  if (pendentes === 0) {
    bonificacao = obrigatorias > 0 ? BONUS_AVALIACOES_OBRIGATORIAS : 0;
  } else if (pendentes === 1) {
    penalizacaoFracao = 1 / 3;
  } else {
    penalizacaoFracao = 0.5;
  }

  const notaAntesLimite = base * (1 - penalizacaoFracao) + bonificacao;
  const notaFinal = Math.min(Math.round(notaAntesLimite * 100) / 100, NOTA_MAXIMA_ANALISTA);
  const reconhecimento = bonificacao > 0 && notaFinal >= NOTA_MAXIMA_ANALISTA ? RECOMENDACAO_DESEMPENHO_MAXIMO : null;

  let justificativaAutomatica: string;
  if (pendentes === 0 && obrigatorias > 0) {
    justificativaAutomatica =
      `Nota base ${base.toFixed(2)}: nenhuma pendência entre ${obrigatorias} avaliação(ões) ` +
      `obrigatória(s) do mês — bonificação de +${BONUS_AVALIACOES_OBRIGATORIAS} ponto aplicada.`;
  } else if (pendentes === 0) {
    justificativaAutomatica = `Nota base ${base.toFixed(2)}: nenhuma avaliação obrigatória no mês — sem ajuste.`;
  } else if (pendentes === 1) {
    justificativaAutomatica =
      `Nota base ${base.toFixed(2)}: 1 avaliação obrigatória pendente (AT ${atPendentes[0]}) — ` +
      "penalização de 1/3 aplicada.";
  } else {
    justificativaAutomatica =
      `Nota base ${base.toFixed(2)}: ${pendentes} avaliações obrigatórias pendentes ` +
      `(${atPendentes.join(", ")}) — penalização de 1/2 aplicada (nunca mais que isso).`;
  }

  return { penalizacaoFracao, bonificacao, notaFinal, reconhecimento, justificativaAutomatica };
}

export function rotuloPenalizacao(fracao: number): string {
  if (fracao === 1 / 3) return "-1/3";
  if (fracao === 0.5) return "-1/2";
  return "—";
}

export function rotuloBonificacao(valor: number): string {
  return valor ? `+${valor}` : "—";
}
