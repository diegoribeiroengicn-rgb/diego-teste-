import { paraData } from "@/lib/dias-uteis";

const STATUS_ATIVO_ANALISE = new Set(["EM ANÁLISE", "EM HOLD", "RIOGALEÃO"]);
const STATUS_CONCLUIDO_ENTREGA = new Set(["LIBERADO", "LIBERADO C/ REST.", "NÃO LIBERADO"]);
const DISCIPLINA_ART = "ART/RRT";
const JANELA_ATRASO_KPI_DASHBOARD_DIAS = 90;
const LIMIAR_VENCE_EM_BREVE = 2;

export type Origem = "prestadores" | "cessionarios";
export type StatusEntrega = "ANTES DO PRAZO" | "NO PRAZO" | "ATRASADO";
export type Classificacao = "ATIVO_ATRASADO" | "ATIVO_OK" | "CONCLUIDO_COM_ATRASO" | "CONCLUIDO_NO_PRAZO" | "FORA_DA_CONTAGEM";
export type NivelAlerta = "DENTRO_DO_PRAZO" | "PROXIMO_VENCIMENTO" | "ALERTA_MAXIMO";

export type LinhaConsolidada = {
  id: number;
  origem: Origem;
  responsavel: string;
  statusAnalise: string;
  disciplina: string;
  dataSolicitacao: string | null;
  dataAnalise: string | null;
  dataLimite: string | null;
  statusEntregaCalc: StatusEntrega | null;
  emHold: boolean;
  diasRestantes: number | null;
  temPep: boolean | null;
};

export function ehArt(disciplina: string): boolean {
  return disciplina.trim().toUpperCase() === DISCIPLINA_ART;
}

export function excluirArts(linhas: LinhaConsolidada[]): LinhaConsolidada[] {
  return linhas.filter((l) => !ehArt(l.disciplina));
}

export type ContagemCategoria = { categoria: string; quantidade: number };

export function contagemPorStatus(linhas: LinhaConsolidada[]): ContagemCategoria[] {
  const mapa = new Map<string, number>();
  for (const l of linhas) {
    const chave = l.statusAnalise || "SEM STATUS";
    mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
  }
  return [...mapa.entries()].map(([categoria, quantidade]) => ({ categoria, quantidade })).sort((a, b) => b.quantidade - a.quantidade);
}

export function topResponsaveis(linhas: LinhaConsolidada[], topN = 10): ContagemCategoria[] {
  const mapa = new Map<string, number>();
  for (const l of linhas) mapa.set(l.responsavel, (mapa.get(l.responsavel) ?? 0) + 1);
  return [...mapa.entries()]
    .map(([categoria, quantidade]) => ({ categoria, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, topN);
}

export function contagemPorDisciplina(linhas: LinhaConsolidada[]): ContagemCategoria[] {
  const mapa = new Map<string, number>();
  for (const l of linhas) mapa.set(l.disciplina, (mapa.get(l.disciplina) ?? 0) + 1);
  return [...mapa.entries()].map(([categoria, quantidade]) => ({ categoria, quantidade })).sort((a, b) => b.quantidade - a.quantidade);
}

export type PontoEvolucaoMensal = { chave: string; mes: number; ano: number; prestadores: number; cessionarios: number };

export function evolucaoMensal(prest: LinhaConsolidada[], cess: LinhaConsolidada[]): PontoEvolucaoMensal[] {
  const mapa = new Map<string, PontoEvolucaoMensal>();
  function contar(linhas: LinhaConsolidada[], campo: "prestadores" | "cessionarios") {
    for (const l of linhas) {
      const d = paraData(l.dataAnalise);
      if (!d) continue;
      const ano = d.getFullYear();
      const mes = d.getMonth() + 1;
      const chave = `${ano}-${String(mes).padStart(2, "0")}`;
      const ponto = mapa.get(chave) ?? { chave, mes, ano, prestadores: 0, cessionarios: 0 };
      ponto[campo]++;
      mapa.set(chave, ponto);
    }
  }
  contar(prest, "prestadores");
  contar(cess, "cessionarios");
  return [...mapa.values()].sort((a, b) => (a.chave < b.chave ? -1 : 1));
}

export type ResumoResponsavel = { responsavel: string; projetos: number; atrasados: number };

export function resumoPorResponsavel(linhas: LinhaConsolidada[]): ResumoResponsavel[] {
  const mapa = new Map<string, ResumoResponsavel>();
  for (const l of linhas) {
    const r = mapa.get(l.responsavel) ?? { responsavel: l.responsavel, projetos: 0, atrasados: 0 };
    r.projetos++;
    if (l.statusEntregaCalc === "ATRASADO") r.atrasados++;
    mapa.set(l.responsavel, r);
  }
  return [...mapa.values()].sort((a, b) => b.projetos - a.projetos);
}

export function classificacaoAtraso(status: string, statusEntregaCalc: StatusEntrega | null, emHold: boolean): Classificacao {
  const atrasado = statusEntregaCalc === "ATRASADO" && !emHold;
  if (STATUS_ATIVO_ANALISE.has(status)) return atrasado ? "ATIVO_ATRASADO" : "ATIVO_OK";
  if (STATUS_CONCLUIDO_ENTREGA.has(status)) return atrasado ? "CONCLUIDO_COM_ATRASO" : "CONCLUIDO_NO_PRAZO";
  return "FORA_DA_CONTAGEM";
}

export function nivelAlertaAtraso(diasRestantes: number | null): NivelAlerta {
  if (diasRestantes == null) return "DENTRO_DO_PRAZO";
  if (diasRestantes < 0) return "ALERTA_MAXIMO";
  if (diasRestantes <= LIMIAR_VENCE_EM_BREVE) return "PROXIMO_VENCIMENTO";
  return "DENTRO_DO_PRAZO";
}

/** Só para excluir da contagem do KPI "Atrasados" do painel — prazo
 * vencido há tanto tempo que deixou de ser um sinal de gestão relevante
 * (mesmo limiar de gat/business_rules.py::atraso_excede_janela_kpi_dashboard). */
export function atrasoExcedeJanelaKpiDashboard(dataLimite: string | null, hoje: Date): boolean {
  const d = paraData(dataLimite);
  if (!d) return false;
  const diasCorridos = Math.round((hoje.getTime() - d.getTime()) / 86400000);
  return diasCorridos > JANELA_ATRASO_KPI_DASHBOARD_DIAS;
}

export type ResumoIndicadoresAtraso = {
  emAnalise: number;
  dentroPrazo: number;
  proximoVencimento: number;
  atrasadosEmAnalise: number;
  concluidosNoPrazo: number;
  concluidosComAtraso: number;
  totalAtrasados: number;
};

export function resumoIndicadoresAtraso(linhas: LinhaConsolidada[], hoje: Date): ResumoIndicadoresAtraso {
  let emAnalise = 0, dentroPrazo = 0, proximoVencimento = 0, atrasadosEmAnalise = 0, concluidosNoPrazo = 0, concluidosComAtraso = 0;
  for (const l of linhas) {
    const classif = classificacaoAtraso(l.statusAnalise, l.statusEntregaCalc, l.emHold);
    if (classif === "ATIVO_ATRASADO" || classif === "ATIVO_OK") emAnalise++;
    if (classif === "ATIVO_ATRASADO" && !atrasoExcedeJanelaKpiDashboard(l.dataLimite, hoje)) atrasadosEmAnalise++;
    if (classif === "ATIVO_OK") {
      const nivel = nivelAlertaAtraso(l.diasRestantes);
      if (nivel === "DENTRO_DO_PRAZO") dentroPrazo++;
      else if (nivel === "PROXIMO_VENCIMENTO") proximoVencimento++;
    }
    if (classif === "CONCLUIDO_NO_PRAZO") concluidosNoPrazo++;
    if (classif === "CONCLUIDO_COM_ATRASO") concluidosComAtraso++;
  }
  return {
    emAnalise, dentroPrazo, proximoVencimento, atrasadosEmAnalise, concluidosNoPrazo, concluidosComAtraso,
    totalAtrasados: atrasadosEmAnalise + concluidosComAtraso,
  };
}
