export const RESPOSTA_CHECKLIST_OPCOES = ["SIM", "NÃO", "N/A"] as const;
export type RespostaChecklist = (typeof RESPOSTA_CHECKLIST_OPCOES)[number];

export type TipoEntidadeAvaliacao = "PRESTADOR" | "CESSIONARIO";

export type RespostasChecklist = Record<string, { resposta: RespostaChecklist | null; justificativa: string }>;

/** Faixas de classificação do checklist (0 a 18 pontos, 18 perguntas
 * ativas no formulário oficial) — mesma regra de
 * gat/config.py::FAIXAS_AVALIACAO_CHECKLIST. Se a quantidade de perguntas
 * ativas mudar de fato, estes limites precisam ser revistos manualmente. */
const FAIXAS_AVALIACAO_CHECKLIST: readonly [number, number, string, string][] = [
  [17, 18, "EXCELENTE", "Projeto com alto nível de maturidade e alta probabilidade de liberação total ou parcial na revisão atual. Não demanda acompanhamento."],
  [13, 16, "BOM", "Projeto com poucas pendências e bom nível de maturidade. Boa probabilidade de liberação parcial na revisão seguinte. Não demanda acompanhamento."],
  [9, 12, "REGULAR", "Projeto em desenvolvimento. Pode demandar acompanhamento próximo para que consiga melhor aproveitamento na revisão seguinte. Demanda acompanhamento."],
  [5, 8, "BAIXO", "Projeto com baixo nível de maturidade, demanda acompanhamento semanal dos projetistas para o adequado desenvolvimento. Demanda atenção e acompanhamento."],
  [1, 4, "CRÍTICO", "Projeto com baixíssimo nível de maturidade, demanda alerta ao cessionário, além de cobrança e acompanhamento semanal dos projetistas. Pode ser considerada uma revisão perdida e indica ciclo de revisões extenso. Demanda atenção e acompanhamento."],
];

const ACOMPANHAMENTO_POR_FAIXA: Record<string, string> = {
  EXCELENTE: "Não demanda acompanhamento",
  BOM: "Não demanda acompanhamento",
  REGULAR: "Demanda acompanhamento",
  BAIXO: "Demanda acompanhamento",
  "CRÍTICO": "Demanda atenção e acompanhamento",
};

/** Soma quantas perguntas do checklist foram respondidas "SIM" (N/A e
 * "NÃO" não pontuam). */
export function pontuarChecklist(respostas: RespostasChecklist): number {
  return Object.values(respostas).filter((r) => r.resposta === "SIM").length;
}

export type ClassificacaoChecklist = { classificacao: string; interpretacao: string; acompanhamento: string };

/** Classifica a pontuação do checklist (0 pontos é tratado como CRÍTICO —
 * a escala das faixas começa em 1). Mesma regra de
 * gat/business_rules.py::classificar_checklist. */
export function classificarChecklist(pontuacao: number): ClassificacaoChecklist {
  const valor = pontuacao === 0 ? 1 : pontuacao;
  for (const [minimo, maximo, rotulo, interpretacao] of FAIXAS_AVALIACAO_CHECKLIST) {
    if (valor >= minimo && valor <= maximo) {
      return { classificacao: rotulo, interpretacao, acompanhamento: ACOMPANHAMENTO_POR_FAIXA[rotulo] ?? "" };
    }
  }
  return { classificacao: "FORA DA ESCALA", interpretacao: "Pontuação fora da escala do checklist (0 a 18).", acompanhamento: "" };
}

export type PerguntaChecklist = {
  id: number;
  categoria: string;
  texto: string;
  ordemCategoria: number;
  ordemPergunta: number;
};

export function agruparPerguntasPorCategoria(perguntas: PerguntaChecklist[]): [string, PerguntaChecklist[]][] {
  const mapa = new Map<string, PerguntaChecklist[]>();
  for (const p of perguntas) {
    const lista = mapa.get(p.categoria) ?? [];
    lista.push(p);
    mapa.set(p.categoria, lista);
  }
  return [...mapa.entries()];
}
