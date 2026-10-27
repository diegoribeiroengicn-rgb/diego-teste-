/** Calendário oficial de feriados do Rio de Janeiro e funções de dias
 * úteis equivalentes a NETWORKDAYS/WORKDAY do Excel — porta exata de
 * gat/calendario.py (mesma lista de feriados, mesmo algoritmo). Datas são
 * sempre representadas como UTC-meia-noite internamente, só para que
 * comparação/iteração de dia a dia nunca sofra de deslocamento de fuso
 * horário — não tem relação com o fuso em que o dado foi gravado. */

const FERIADOS_RJ: readonly [number, number, number][] = [
  [2025, 12, 24], [2025, 12, 25], [2025, 12, 31],
  [2026, 1, 1], [2026, 1, 20], [2026, 2, 16], [2026, 2, 17],
  [2026, 4, 3], [2026, 4, 21], [2026, 4, 23], [2026, 5, 1],
  [2026, 6, 4], [2026, 9, 7], [2026, 10, 12], [2026, 10, 19],
  [2026, 11, 2], [2026, 11, 15], [2026, 11, 20],
  [2026, 12, 25], [2026, 12, 31], [2027, 1, 1],
];

const _FERIADOS_TIMESTAMPS = new Set(
  FERIADOS_RJ.map(([ano, mes, dia]) => Date.UTC(ano, mes - 1, dia)),
);

/** Mesma lista de feriados, em "YYYY-MM-DD" — para módulos que preferem
 * trabalhar com strings ISO em vez de tuplas (ex.: o motor de projeção
 * do Gantt de Prestadores). */
export const FERIADOS_RJ_ISO: readonly string[] = FERIADOS_RJ.map(
  ([ano, mes, dia]) => `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
);

function ehFeriado(data: Date): boolean {
  return _FERIADOS_TIMESTAMPS.has(data.getTime());
}

/** Normaliza string/null para uma data UTC-meia-noite — tolera strings
 * vazias/"nan"/"None" e datas com horário (usa só a parte da data), como
 * `_to_date` em gat/calendario.py. */
export function paraData(valor: string | null | undefined): Date | null {
  if (valor == null) return null;
  const texto = String(valor).trim();
  if (!texto || texto.toLowerCase() === "nan" || texto.toLowerCase() === "none") return null;
  const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, ano, mes, dia] = m;
  return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
}

/** "Hoje" no fuso de Brasília (America/Sao_Paulo), como data UTC-meia-noite. */
export function hojeBr(): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)!.value);
  return new Date(Date.UTC(valor("year"), valor("month") - 1, valor("day")));
}

function diasUteisEntreDatas(dataInicio: Date, dataFim: Date): number {
  let a = dataInicio;
  let b = dataFim;
  let sinal = 1;
  if (b.getTime() < a.getTime()) {
    [a, b] = [b, a];
    sinal = -1;
  }
  let contador = 0;
  const cursor = new Date(a);
  while (cursor.getTime() <= b.getTime()) {
    const diaSemana = cursor.getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6 && !ehFeriado(cursor)) {
      contador++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return contador * sinal;
}

/** Equivalente a WORKDAY do Excel: soma `quantidade` dias úteis a
 * `dataBase`, pulando fins de semana e feriados do RJ (`quantidade`
 * negativo subtrai). Mesma regra de gat/calendario.py::somar_dias_uteis. */
export function somarDiasUteis(dataBase: Date | null, quantidade: number): Date | null {
  if (!dataBase) return null;
  const direcao = quantidade >= 0 ? 1 : -1;
  let restante = Math.abs(quantidade);
  const cursor = new Date(dataBase);
  while (restante > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + direcao);
    const diaSemana = cursor.getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6 && !ehFeriado(cursor)) restante--;
  }
  return cursor;
}

/** Data limite/prevista de entrega a partir da data de solicitação e do
 * SLA em dias úteis — replica a fórmula original da planilha:
 * WORKDAY(data_solicitacao - 1, sla, feriados). Mesma regra de
 * gat/calendario.py::calcular_data_limite. */
export function calcularDataLimite(dataSolicitacao: string | null, slaDiasUteis: number): Date | null {
  const base = paraData(dataSolicitacao);
  if (!base) return null;
  const menosUm = new Date(base);
  menosUm.setUTCDate(menosUm.getUTCDate() - 1);
  return somarDiasUteis(menosUm, slaDiasUteis);
}

/** Equivalente a NETWORKDAYS do Excel: dias úteis entre duas datas
 * (inclusive), descontando fins de semana e feriados do RJ. */
export function diasUteisEntre(dataInicio: string | null, dataFim: string | null): number {
  const inicio = paraData(dataInicio);
  const fim = paraData(dataFim);
  if (!inicio || !fim) return 0;
  return diasUteisEntreDatas(inicio, fim);
}

/** Dias úteis decorridos de uma análise: entre a solicitação e a data de
 * análise (se já concluída) ou hoje (se em andamento) — descontando os
 * dias em hold. `holdAbertoDesde` congela o relógio na data de início do
 * hold enquanto ele estiver aberto. */
export function diasUteisDecorridos(
  dataSolicitacao: string | null,
  dataAnalise: string | null,
  holdDias: number,
  holdAbertoDesde: string | null,
): number {
  const inicio = paraData(dataSolicitacao);
  if (!inicio) return 0;
  const fim =
    (!dataAnalise && holdAbertoDesde ? paraData(holdAbertoDesde) : paraData(dataAnalise)) ?? hojeBr();
  return Math.max(diasUteisEntreDatas(inicio, fim) - (holdDias || 0), 0);
}

/** Saldo de dias úteis (SLA restante): SLA menos os dias já decorridos —
 * negativo significa prazo estourado. */
export function saldoDiasUteis(
  dataSolicitacao: string | null,
  slaDiasUteis: number,
  dataAnalise: string | null,
  holdDias: number,
  holdAbertoDesde: string | null,
): number {
  const decorridos = diasUteisDecorridos(dataSolicitacao, dataAnalise, holdDias, holdAbertoDesde);
  return (slaDiasUteis || 0) - decorridos;
}

/** Dias úteis em hold já ENCERRADO (ambas as datas preenchidas). */
export function calcularHoldDias(holdInicio: string | null, holdFim: string | null): number {
  if (!paraData(holdInicio) || !paraData(holdFim)) return 0;
  return Math.max(diasUteisEntre(holdInicio, holdFim), 0);
}

/** True quando o projeto está em hold agora (início preenchido, fim vazio). */
export function emHold(holdInicio: string | null, holdFim: string | null): boolean {
  return paraData(holdInicio) !== null && paraData(holdFim) === null;
}

/** Dias corridos (calendário cheio, sem descontar fim de semana/feriado)
 * entre duas datas — usado onde a regra de negócio conta tempo corrido,
 * não dias úteis (ex.: dias sem PEP, janela de atraso do dashboard). */
export function diasCorridosEntre(dataInicio: string | null, dataFim: string | null): number | null {
  const inicio = paraData(dataInicio);
  const fim = paraData(dataFim);
  if (!inicio || !fim) return null;
  return Math.round((fim.getTime() - inicio.getTime()) / 86400000);
}
