import type { ItemPrioridade } from "@/lib/lista-prioridades";

/** Relatórios de Prioridades (individual e coletivo) — porta de
 * gat/relatorios_prioridades.py. Mesmas colunas/rótulos do original;
 * `sla_alterado_por`/`sla_alterado_em` ficam de fora porque ainda não
 * existem em ItemPrioridade (nível de prioridade/SLA reduzido com
 * auditoria completa é um incremento futuro). */

const LABEL_SITUACAO: Record<string, string> = {
  "DENTRO DO PRAZO": "Dentro do prazo", "VENCE EM BREVE": "Vence em breve",
  "VENCE HOJE": "Vence hoje", ATRASADO: "Atrasado", "EM HOLD": "Em HOLD",
};

export const COLUNAS_RELATORIO_PRIORIDADES = [
  "Tipo", "Prestador/Cessionário", "Código", "N° AT", "Disciplina", "Revisão", "Responsável",
  "Motivo(s) de entrada", "Origem da prioridade", "SLA vigente (dias)", "SLA original (dias)",
  "Data prevista", "Dias úteis restantes", "Situação do prazo", "Justificativa", "Status de análise",
] as const;

function formatarDataBr(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** Mesma regra de gat/relatorios_prioridades.py::_preparar_exibicao — uma
 * linha "achatada" com os rótulos finais, prontos para a tabela do
 * Word/PDF/Excel. */
export function prepararLinhaRelatorio(item: ItemPrioridade): Record<(typeof COLUNAS_RELATORIO_PRIORIDADES)[number], string> {
  return {
    Tipo: item.tipo,
    "Prestador/Cessionário": item.nome_entidade ?? "—",
    Código: item.codigo ?? "—",
    "N° AT": item.num_at ?? "—",
    Disciplina: item.disciplina ?? "—",
    Revisão: item.revisao != null ? String(item.revisao) : "—",
    Responsável: item.responsavel ?? "—",
    "Motivo(s) de entrada": item.motivos_entrada.length ? item.motivos_entrada.join(", ") : "—",
    "Origem da prioridade": item.origem_prioridade,
    "SLA vigente (dias)": item.sla_dias != null ? String(item.sla_dias) : "—",
    "SLA original (dias)": item.sla_original != null ? String(item.sla_original) : "—",
    "Data prevista": formatarDataBr(item.data_limite),
    "Dias úteis restantes": item.dias_restantes != null ? String(item.dias_restantes) : "—",
    "Situação do prazo": LABEL_SITUACAO[item.situacao_prazo] ?? item.situacao_prazo,
    Justificativa: item.justificativa_sla ?? "—",
    "Status de análise": item.status_analise ?? "—",
  };
}

/** A mesma linha, como pares rótulo/valor na ordem de
 * COLUNAS_RELATORIO_PRIORIDADES — usado no relatório individual (tabela
 * de indicadores em vez de uma tabela de uma linha só). */
export function prepararParesIndividual(item: ItemPrioridade): [string, string][] {
  const linha = prepararLinhaRelatorio(item);
  return COLUNAS_RELATORIO_PRIORIDADES.map((c) => [c, linha[c]]);
}

/** Mesmos indicadores calculados em views/lista_prioridades.py antes de
 * chamar os geradores de relatório. */
export function calcularKpisPrioridades(itens: ItemPrioridade[]): [string, number][] {
  return [
    ["Total prioritários", itens.length],
    ["Prestadores", itens.filter((i) => i.tipo === "Prestador").length],
    ["Cessionários", itens.filter((i) => i.tipo === "Cessionário").length],
    ["Atrasados", itens.filter((i) => i.situacao_prazo === "ATRASADO").length],
  ];
}

export function identificadorProjeto(item: ItemPrioridade): string {
  return item.codigo || item.num_at || "projeto";
}
