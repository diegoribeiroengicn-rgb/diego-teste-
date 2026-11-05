/** Identificação de sobrecarga por analista — pedido do usuário:
 * "apresentar claramente quais profissionais estão sobrecarregados [...]
 * a classificação deverá considerar a quantidade de demandas pendentes,
 * seus respectivos prazos e prioridades, e não somente o número absoluto
 * de ATs [...] utilizar parâmetros configuráveis pelo administrador".
 * Por isso os limiares (`LimiaresSobrecarga`) vêm de fora — nada fixo
 * aqui — e a nota usada para classificar pondera atraso e prioridade em
 * vez de só contar pendências. */

export const STATUS_ATIVO = new Set(["EM ANÁLISE", "EM HOLD", "RIOGALEÃO"]);
const STATUS_CONCLUIDO = new Set(["LIBERADO", "LIBERADO C/ REST.", "NÃO LIBERADO"]);

export type LinhaCargaAnalista = {
  responsavel: string | null;
  statusAnalise: string;
  diasRestantes: number | null;
  emHold: boolean;
  nivelPrioridade: number | null;
  slaReduzido: boolean;
};

export type ClassificacaoCarga = "NORMAL" | "ELEVADA" | "SOBRECARREGADA";

export type LimiaresSobrecarga = { elevada: number; sobrecarregada: number };

export const LIMIARES_SOBRECARGA_PADRAO: LimiaresSobrecarga = { elevada: 8, sobrecarregada: 15 };

const JANELA_PROXIMO_VENCIMENTO_DIAS = 2;
const PESO_VENCIDA = 2;
const PESO_PROXIMA_VENCIMENTO = 1;
const PESO_PRIORITARIA = 1;

export type CargaAnalista = {
  responsavel: string;
  totalAtribuidas: number;
  pendentes: number;
  emAnalise: number;
  emHold: number;
  proximasVencimento: number;
  vencidas: number;
  concluidas: number;
  prioritarias: number;
  pontuacao: number;
  classificacao: ClassificacaoCarga;
};

/** Nota de carga de um analista: pendências simples valem 1, mas uma
 * vencida ou prioritária pesa mais — duas filas de 10 pendências cada
 * não representam a mesma urgência se uma tem ATs vencidas e a outra
 * não, e contar só o total absoluto esconderia isso. */
function calcularPontuacao(pendentes: LinhaCargaAnalista[]): number {
  let pontos = pendentes.length;
  for (const l of pendentes) {
    if (l.diasRestantes != null && l.diasRestantes < 0 && !l.emHold) pontos += PESO_VENCIDA;
    else if (l.diasRestantes != null && l.diasRestantes >= 0 && l.diasRestantes <= JANELA_PROXIMO_VENCIMENTO_DIAS) pontos += PESO_PROXIMA_VENCIMENTO;
    if (l.nivelPrioridade != null || l.slaReduzido) pontos += PESO_PRIORITARIA;
  }
  return pontos;
}

export function classificarCarga(pontuacao: number, limiares: LimiaresSobrecarga): ClassificacaoCarga {
  if (pontuacao >= limiares.sobrecarregada) return "SOBRECARREGADA";
  if (pontuacao >= limiares.elevada) return "ELEVADA";
  return "NORMAL";
}

/** Uma linha por analista com a distribuição de demandas e a
 * classificação de carga. Responsáveis sem nenhuma linha (vazio/"—")
 * são ignorados — não são um "analista" para fins deste indicador. */
export function calcularCargaAnalistas(linhas: LinhaCargaAnalista[], limiares: LimiaresSobrecarga): CargaAnalista[] {
  const responsaveis = [...new Set(linhas.map((l) => (l.responsavel || "").trim().toUpperCase()).filter(Boolean))].sort();

  return responsaveis.map((responsavel): CargaAnalista => {
    const doAnalista = linhas.filter((l) => (l.responsavel || "").trim().toUpperCase() === responsavel);
    const pendentes = doAnalista.filter((l) => STATUS_ATIVO.has(l.statusAnalise));
    const emAnalise = doAnalista.filter((l) => l.statusAnalise === "EM ANÁLISE");
    const emHold = doAnalista.filter((l) => l.emHold);
    const vencidas = pendentes.filter((l) => l.diasRestantes != null && l.diasRestantes < 0 && !l.emHold);
    const proximasVencimento = pendentes.filter(
      (l) => l.diasRestantes != null && l.diasRestantes >= 0 && l.diasRestantes <= JANELA_PROXIMO_VENCIMENTO_DIAS,
    );
    const concluidas = doAnalista.filter((l) => STATUS_CONCLUIDO.has(l.statusAnalise));
    const prioritarias = pendentes.filter((l) => l.nivelPrioridade != null || l.slaReduzido);
    const pontuacao = calcularPontuacao(pendentes);

    return {
      responsavel,
      totalAtribuidas: doAnalista.length,
      pendentes: pendentes.length,
      emAnalise: emAnalise.length,
      emHold: emHold.length,
      proximasVencimento: proximasVencimento.length,
      vencidas: vencidas.length,
      concluidas: concluidas.length,
      prioritarias: prioritarias.length,
      pontuacao,
      classificacao: classificarCarga(pontuacao, limiares),
    };
  });
}
