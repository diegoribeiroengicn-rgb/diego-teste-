import type { LinhaLocalizacao } from "@/lib/localizacao-ats-calculo";
import { textoSemAcentos } from "@/lib/revisoes-calculo";

/** Painel de Governança (tela inicial). Tudo aqui parte das mesmas linhas
 * já enriquecidas de `buscarLinhasLocalizacao` — o SLA (`statusEntregaCalc`,
 * `diasRestantes`, HOLD, 10/5 dias úteis) vem do cálculo que o sistema já
 * usa; este módulo só classifica e agrega, sem recalcular prazo. */

export const STATUS_PENDENTES = new Set(["EM ANÁLISE", "EM HOLD", "RIOGALEÃO"]);
export const STATUS_CONCLUIDOS = new Set(["LIBERADO", "LIBERADO C/ REST."]);
/** Mesmo limite de `analistas-sobrecarga-calculo`: vence em até 2 dias úteis. */
export const DIAS_PROXIMO_VENCIMENTO = 2;
/** Mesmo critério de "crítico" do Gantt (REV. AT > 2). */
export const REVISOES_CRITICAS = 2;
export const DIAS_SEM_MOVIMENTO = 15;

export type FiltrosPainel = {
  de: string; ate: string; codigo: string; prestador: string; disciplina: string; analista: string; status: string; modulo: string;
};

export type ChaveVer =
  | "projetos" | "recebidos" | "aguardando" | "revisao" | "concluidas" | "sla_vencido" | "sla_proximo" | "hold"
  | "liberados" | "nao_liberados" | "revisoes" | "sem_movimento" | "criticos" | "carteira";

export const ROTULO_VER: Record<ChaveVer, string> = {
  projetos: "Projetos ativos", recebidos: "Documentos recebidos", aguardando: "Aguardando análise", revisao: "Em revisão",
  concluidas: "Análises concluídas", sla_vencido: "SLA vencido", sla_proximo: "Próximos do vencimento", hold: "Em HOLD",
  liberados: "Liberados", nao_liberados: "Não liberados", revisoes: "Com mais de duas revisões", sem_movimento: "Sem movimentação recente",
  criticos: "Pendências críticas (prioritárias vencidas)", carteira: "Carteira do analista",
};

export function filtrarLinhas(linhas: LinhaLocalizacao[], f: FiltrosPainel): LinhaLocalizacao[] {
  const up = (v: string | null) => (v || "").toUpperCase();
  return linhas.filter((l) => {
    if (f.modulo && l.modulo !== f.modulo) return false;
    if (f.de || f.ate) {
      const d = (l.dataSolicitacao || "").slice(0, 10);
      if (!d || (f.de && d < f.de) || (f.ate && d > f.ate)) return false;
    }
    if (f.codigo && !up(l.codigo).includes(f.codigo.toUpperCase())) return false;
    if (f.prestador && !up(l.nome).includes(f.prestador.toUpperCase())) return false;
    if (f.disciplina && textoSemAcentos(l.disciplina) !== textoSemAcentos(f.disciplina)) return false;
    if (f.analista && up(l.responsavel).trim() !== f.analista.toUpperCase().trim()) return false;
    if (f.status && l.statusAnalise !== f.status) return false;
    return true;
  });
}

const aguardando = (l: LinhaLocalizacao) => l.statusAnalise === "EM ANÁLISE";
export const slaVencido = (l: LinhaLocalizacao) => aguardando(l) && l.statusEntregaCalc === "ATRASADO";
export const slaProximo = (l: LinhaLocalizacao) =>
  aguardando(l) && !slaVencido(l) && l.diasRestantes != null && l.diasRestantes >= 0 && l.diasRestantes <= DIAS_PROXIMO_VENCIMENTO;
const emHold = (l: LinhaLocalizacao) => l.statusAnalise === "EM HOLD";
const pendente = (l: LinhaLocalizacao) => STATUS_PENDENTES.has(l.statusAnalise);

export function semMovimento(l: LinhaLocalizacao, hoje: number): boolean {
  if (!pendente(l)) return false;
  const t = Date.parse(l.atualizadoEm || l.dataSolicitacao || "");
  return Number.isFinite(t) && hoje - t > DIAS_SEM_MOVIMENTO * 86400000;
}

const PREDICADOS: Record<Exclude<ChaveVer, "carteira" | "sem_movimento">, (l: LinhaLocalizacao) => boolean> = {
  projetos: pendente,
  recebidos: () => true,
  aguardando,
  revisao: (l) => (aguardando(l) || emHold(l)) && l.revisao >= 1,
  concluidas: (l) => STATUS_CONCLUIDOS.has(l.statusAnalise),
  sla_vencido: slaVencido,
  sla_proximo: slaProximo,
  hold: emHold,
  liberados: (l) => STATUS_CONCLUIDOS.has(l.statusAnalise),
  nao_liberados: (l) => l.statusAnalise === "NÃO LIBERADO",
  revisoes: (l) => pendente(l) && l.revisao > REVISOES_CRITICAS,
  criticos: (l) => l.nivelPrioridade != null && slaVencido(l),
};

export function selecionar(linhas: LinhaLocalizacao[], ver: ChaveVer, hoje: number): LinhaLocalizacao[] {
  if (ver === "sem_movimento") return linhas.filter((l) => semMovimento(l, hoje));
  if (ver === "carteira") return linhas.filter(pendente);
  return linhas.filter(PREDICADOS[ver]);
}

const soma = (ls: LinhaLocalizacao[]) => ls.reduce((s, l) => s + l.numDocumentos, 0);

export type Indicadores = Record<Exclude<ChaveVer, "carteira">, { analises: number; documentos: number }>;

export function calcularIndicadores(linhas: LinhaLocalizacao[], hoje: number): Indicadores {
  const out = {} as Indicadores;
  (Object.keys(ROTULO_VER) as ChaveVer[]).forEach((k) => {
    if (k === "carteira") return;
    const sel = selecionar(linhas, k, hoje);
    out[k] = {
      analises: k === "projetos" ? new Set(sel.map((l) => `${l.modulo}|${l.codigo || l.nome}`)).size : sel.length,
      documentos: soma(sel),
    };
  });
  return out;
}

/** % de cumprimento: das análises concluídas, as que não foram entregues
 * atrasadas — mesma regra de `indicadoresMensaisModulo`. */
export function percentualSla(linhas: LinhaLocalizacao[]): number | null {
  const concl = linhas.filter((l) => STATUS_CONCLUIDOS.has(l.statusAnalise));
  if (!concl.length) return null;
  return Math.round((1000 * concl.filter((l) => l.statusEntregaCalc !== "ATRASADO").length) / concl.length) / 10;
}

export type LinhaDistribuicao = { chave: string; dentro: number; proximo: number; vencido: number; total: number };

/** Distribuição do SLA das análises em aberto (EM ANÁLISE) por disciplina ou analista. */
export function distribuicaoSla(linhas: LinhaLocalizacao[], por: "disciplina" | "responsavel"): LinhaDistribuicao[] {
  const m = new Map<string, LinhaDistribuicao>();
  for (const l of linhas.filter(aguardando)) {
    const chave = (por === "disciplina" ? l.disciplina : l.responsavel)?.trim().toUpperCase() || "—";
    const x = m.get(chave) ?? { chave, dentro: 0, proximo: 0, vencido: 0, total: 0 };
    if (slaVencido(l)) x.vencido++; else if (slaProximo(l)) x.proximo++; else x.dentro++;
    x.total++;
    m.set(chave, x);
  }
  return [...m.values()].sort((a, b) => b.vencido - a.vencido || b.total - a.total);
}

export type CargaEquipe = { analista: string; total: number; pendentes: number; concluidas: number; vencidas: number; documentosPendentes: number };

export function cargaPorAnalista(linhas: LinhaLocalizacao[]): CargaEquipe[] {
  const m = new Map<string, CargaEquipe>();
  for (const l of linhas) {
    const analista = l.responsavel?.trim().toUpperCase() || "SEM RESPONSÁVEL";
    const x = m.get(analista) ?? { analista, total: 0, pendentes: 0, concluidas: 0, vencidas: 0, documentosPendentes: 0 };
    x.total++;
    if (pendente(l)) { x.pendentes++; x.documentosPendentes += l.numDocumentos; }
    if (STATUS_CONCLUIDOS.has(l.statusAnalise)) x.concluidas++;
    if (slaVencido(l)) x.vencidas++;
    m.set(analista, x);
  }
  return [...m.values()].sort((a, b) => b.pendentes - a.pendentes || a.analista.localeCompare(b.analista));
}

/** Data da última movimentação da linha (atualização; senão análise/solicitação). */
export function ultimaMovimentacao(l: LinhaLocalizacao): string | null {
  return l.atualizadoEm || l.dataAnalise || l.dataSolicitacao;
}

export function recentes(linhas: LinhaLocalizacao[], limite: number): LinhaLocalizacao[] {
  return [...linhas]
    .sort((a, b) => (ultimaMovimentacao(b) || "").localeCompare(ultimaMovimentacao(a) || "") || b.id - a.id)
    .slice(0, limite);
}
