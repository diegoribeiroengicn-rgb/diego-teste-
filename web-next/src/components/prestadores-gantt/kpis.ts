import { CLOSED_NEG, type AgregadoGantt, type ItemGantt, weekKey } from "@/lib/prestadores-gantt/motor";

export function estaAberto(it: ItemGantt): boolean {
  return !it.closed && !CLOSED_NEG.has(it.state);
}

export type KpisGantt = {
  abertos: number;
  simulados: number;
  criticas: number;
  vencidos: number;
  proximos: number;
  projSimultaneosHoje: number;
  picoProjetos: { v: number; d: number | null };
  picoSemanal: { v: number; semana: number | null };
  conclusaoMediana: number | null;
  conclusaoSemNovasReprovacoes: number | null;
};

export function calcularKpis(itens: ItemGantt[], agregado: AgregadoGantt): KpisGantt {
  const abertosItens = itens.filter((it) => !it.sim && estaAberto(it));
  const simulados = itens.filter((it) => it.sim).length;
  const criticas = abertosItens.filter((it) => it.crit).length;
  const vencidos = abertosItens.filter((it) => it.prazo === "Vencido").length;
  const proximosCount = abertosItens.filter((it) => it.prazo === "Próximo do vencimento").length;

  let picoProjetos = { v: 0, d: null as number | null };
  agregado.days.forEach((d, i) => {
    if (agregado.projCount[i] > picoProjetos.v) picoProjetos = { v: agregado.projCount[i], d };
  });

  const porSemana = new Map<number, number>();
  agregado.days.forEach((d, i) => {
    const total = agregado.cats.reduce((t, c) => t + agregado.load[c][i], 0);
    const sem = weekKey(d);
    porSemana.set(sem, (porSemana.get(sem) ?? 0) + total);
  });
  let picoSemanal = { v: 0, semana: null as number | null };
  porSemana.forEach((v, sem) => { if (v > picoSemanal.v) picoSemanal = { v, semana: sem }; });

  const medianas = abertosItens.map((it) => it.d.libMed?.v).filter((v): v is number => v != null);
  const semReprovacoes = abertosItens.map((it) => it.d.libBest?.v).filter((v): v is number => v != null);

  return {
    abertos: abertosItens.length,
    simulados,
    criticas,
    vencidos,
    proximos: proximosCount,
    projSimultaneosHoje: agregado.projCount[0] ?? 0,
    picoProjetos,
    picoSemanal,
    conclusaoMediana: medianas.length ? Math.max(...medianas) : null,
    conclusaoSemNovasReprovacoes: semReprovacoes.length ? Math.max(...semReprovacoes) : null,
  };
}
