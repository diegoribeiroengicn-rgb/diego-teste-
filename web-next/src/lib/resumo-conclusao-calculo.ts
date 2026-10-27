/** Regras puras da "Baixa da Análise" (Prestadores/Cessionários) — mesmo
 * espírito de gat/resumo_conclusao.py, mas simplificado por pedido
 * explícito: em vez de um card em imagem/PDF com o código da disciplina
 * buscado automaticamente na Central de Codificação (removida do sistema
 * por estar gerando códigos errados), a baixa agora gera apenas um texto
 * para copiar e colar, e o código da disciplina (segmento DDD do número
 * da AT) é digitado pelo próprio analista no momento da baixa. */

export const STATUS_FINAIS_BAIXA = ["LIBERADO", "LIBERADO C/ REST.", "NÃO LIBERADO"] as const;
export type StatusFinalBaixa = (typeof STATUS_FINAIS_BAIXA)[number];

const STATUS_POR_EXTENSO: Record<string, string> = {
  LIBERADO: "Liberado",
  "LIBERADO C/ REST.": "Liberado Com Restrição",
  "NÃO LIBERADO": "Não Liberado",
};

export function statusPorExtenso(status: string | null): string {
  if (!status) return "-";
  return STATUS_POR_EXTENSO[status.trim().toUpperCase()] ?? status.trim();
}

/** Número completo da AT, no padrão AT-NNN-AA-PPP-DDD-RR:
 * AT-{nº AT}-{código do prestador/cessionário}-{código da disciplina,
 * digitado na baixa}-{revisão de 2 dígitos}, ex.: AT-0303-26-P256-400-01.
 * O nº AT já cadastrado (ex. "0303/26") contém NNN e AA juntos — a barra
 * é só normalizada para hífen. Mesmo formato de
 * gat/resumo_conclusao.py::montar_numero_at, mas `codigoDisciplina`
 * agora é sempre um valor digitado pelo analista, nunca uma busca
 * automática. */
export function montarNumeroAt(numAt: string | null, codigo: string | null, revisao: number | null, codigoDisciplina: string | null): string {
  const partes = ["AT"];
  if (numAt) partes.push(numAt.trim().replace(/\//g, "-"));
  if (codigo) partes.push(codigo.trim());
  if (codigoDisciplina) partes.push(codigoDisciplina.trim());
  if (revisao != null && Number.isFinite(revisao)) partes.push(String(revisao).padStart(2, "0"));
  if (partes.length === 1) return "-";
  return partes.join("-");
}

/** Frase automática conforme os canais marcados — mesma regra de
 * gat/resumo_conclusao.py::montar_texto_disponibilizacao. */
export function montarTextoDisponibilizacao(mfiles: boolean, drive: boolean, email: boolean): string {
  const postados: string[] = [];
  if (mfiles) postados.push("Mfiles");
  if (drive) postados.push("Drive");

  if (postados.length && email) return `Postada no ${postados.join(" e ")} e enviada por e-mail`;
  if (postados.length) return `Postada no ${postados.join(" e ")}`;
  if (email) return "Enviada por e-mail";
  return "";
}

export function montarEntidadeObra(nomeEntidade: string | null, obraReferencia: string | null): string {
  const nome = (nomeEntidade || "-").trim();
  const obra = (obraReferencia || "").trim();
  return obra ? `${nome} - ${obra}` : nome;
}

export function montarDisciplinaRevisao(disciplina: string | null, revisao: number | null): string {
  const d = (disciplina || "-").trim() || "-";
  if (revisao == null || !Number.isFinite(revisao)) return d;
  return `${d} - REV ${String(revisao).padStart(2, "0")}`;
}

export type DadosBaixa = {
  num_at: string | null;
  codigo: string | null;
  revisao: number | null;
  nome_entidade: string | null;
  obra_referencia: string | null;
  disciplina: string | null;
};

/** Monta o texto final da baixa — pronto para copiar e colar, nessa
 * ordem: número da AT, disponibilização (se algum canal foi marcado),
 * entidade/obra, disciplina/revisão e status por extenso. */
export function montarTextoBaixa(
  dados: DadosBaixa, status: string, codigoDisciplina: string | null, mfiles: boolean, drive: boolean, email: boolean,
): string {
  const linhas = [
    montarNumeroAt(dados.num_at, dados.codigo, dados.revisao, codigoDisciplina),
    montarTextoDisponibilizacao(mfiles, drive, email),
    montarEntidadeObra(dados.nome_entidade, dados.obra_referencia),
    montarDisciplinaRevisao(dados.disciplina, dados.revisao),
    statusPorExtenso(status),
  ];
  return linhas.filter((l) => l).join("\n");
}
