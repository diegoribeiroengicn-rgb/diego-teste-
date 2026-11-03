import { cabecalhoInstitucional, documentoParaBuffer, nomeArquivo, paragrafo, secao, tabelaIndicadores } from "@/lib/export-word";
import { indicadoresCompletos, indicadoresResumidos, type IndicadoresExecutivos } from "@/lib/opr-institucional-calculo";

export type NivelOpr = "Resumido" | "Executivo";
export type TipoOpr = "Prestadores" | "Cessionários" | "Consolidado";

const TIPO_ARQUIVO: Record<TipoOpr, string> = {
  "Prestadores": "Prestador", "Cessionários": "Cessionario", "Consolidado": "Consolidado",
};

/** OPR — Relatório Institucional (Word), sempre editável, nos níveis
 * Resumido e Executivo — mesma regra de views/relatorios_mensais.py
 * (bloco "OPR — Relatório Institucional (Word)"). Escopo deste
 * incremento: tabelas de indicadores + observações, sem os gráficos do
 * original (que lá são imagens Plotly rasterizadas via Kaleido — sem
 * equivalente Node sem adicionar um navegador/canvas ao ambiente de
 * produção). */
export async function gerarOprInstitucionalWord(opts: {
  tipo: TipoOpr;
  nivel: NivelOpr;
  periodoLabel: string;
  filtros: Record<string, string | null | undefined>;
  exec: IndicadoresExecutivos;
  observacoes: string;
  autor: string;
  partesArquivoPeriodo: string[];
}): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const { tipo, nivel, periodoLabel, filtros, exec, observacoes, autor, partesArquivoPeriodo } = opts;

  const elementos = [
    ...cabecalhoInstitucional({
      titulo: `OPR — ${tipo} (${nivel})`,
      subtitulo: "GAT 2026 · Controle de Análises Técnicas · Tecnoplano",
      periodoLabel,
      filtrosAplicados: filtros,
      usuarioResponsavel: autor,
      compacto: true,
    }),
    secao("Indicadores do período", 2),
    ...tabelaIndicadores(nivel === "Resumido" ? indicadoresResumidos(exec) : indicadoresCompletos(exec)),
    secao("Observações gerenciais", 2),
    paragrafo(observacoes || "Nenhuma observação registrada para este período."),
  ];

  const buffer = await documentoParaBuffer(elementos);
  return { buffer, nomeArquivo: nomeArquivo("OPR", TIPO_ARQUIVO[tipo], ...partesArquivoPeriodo) };
}
