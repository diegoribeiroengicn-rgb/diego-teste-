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
  "LIBERADO C/ REST.": "Liberado com Restrição",
  "NÃO LIBERADO": "Não Liberado",
};

export function statusPorExtenso(status: string | null): string {
  if (!status) return "-";
  return STATUS_POR_EXTENSO[status.trim().toUpperCase()] ?? status.trim();
}

/** Segmento NNN-AA do número da AT. O nº AT cadastrado já traz número e
 * ano juntos ("0303/26"): a barra vira hífen e um ano de 4 dígitos é
 * reduzido para 2 ("0303/2026" → "0303-26"). Quando só o número foi
 * digitado ("0303"), o ano entra pelos 2 dígitos de `anoPadrao`. */
export function normalizarNumAt(numAt: string | null, anoPadrao: number | null = null): string {
  const texto = (numAt || "").trim().replace(/^AT[\s-]*/i, "");
  if (!texto) return "";
  const partes = texto.split(/[\/-]/).map((p) => p.trim()).filter((p) => p);
  if (partes.length >= 2) {
    const ano = partes[partes.length - 1];
    if (/^\d{4}$/.test(ano)) partes[partes.length - 1] = ano.slice(2);
    return partes.join("-");
  }
  if (anoPadrao != null && /^\d+$/.test(partes[0])) return `${partes[0]}-${String(anoPadrao).slice(-2)}`;
  return partes[0];
}

/** Número completo da AT, no padrão AT-NNN-AA-PPP-DDD-RR:
 * AT-{nº AT}-{ano}-{código do prestador/cessionário}-{código da
 * disciplina, digitado na baixa}-{revisão de 2 dígitos}, ex.:
 * AT-0303-26-P256-400-01. Mesmo formato de
 * gat/resumo_conclusao.py::montar_numero_at, mas `codigoDisciplina` é
 * sempre um valor digitado pelo analista, nunca uma busca automática. */
export function montarNumeroAt(
  numAt: string | null, codigo: string | null, revisao: number | null, codigoDisciplina: string | null, anoPadrao: number | null = null,
): string {
  const partes = ["AT"];
  const numero = normalizarNumAt(numAt, anoPadrao);
  if (numero) partes.push(numero);
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
  /** Quantidade recebida na AT (coluna "N° de Doc." da planilha). */
  num_documentos: number | null;
  /** Quantidade efetivamente analisada, informada pelo analista na baixa. */
  num_documentos_analisados: number | null;
  data_solicitacao: string | null;
};

function anoDaSolicitacao(dataSolicitacao: string | null): number {
  const ano = Number((dataSolicitacao || "").slice(0, 4));
  return ano >= 2000 ? ano : new Date().getFullYear();
}

function caixa(marcada: boolean): string {
  return marcada ? "[X]" : "[ ]";
}

/** "Código – Nome – Referência da obra", omitindo o que estiver vazio. */
export function montarIdentificacaoEntidade(codigo: string | null, nomeEntidade: string | null, obraReferencia: string | null): string {
  return [codigo, nomeEntidade, obraReferencia].map((p) => (p || "").trim()).filter((p) => p).join(" – ") || "-";
}

/** Aceita só inteiro ≥ 0 — devolve `null` para vazio, negativo, decimal
 * ou texto. Usada na pop-up e na API da baixa. */
export function lerQuantidadeDocumentos(valor: unknown): number | null {
  const texto = String(valor ?? "").trim();
  if (!/^\d+$/.test(texto)) return null;
  return Number(texto);
}

/** Texto de confirmação da baixa, pronto para copiar e colar:
 *
 *   AT-NNN-AA-código-disciplina-revisão
 *
 *   Inserida no M-Files: [X]
 *   Inserida no Drive: [ ]
 *
 *   Código – Nome – Referência da obra
 *
 *   Disciplina – REV NN
 *
 *   Status: Liberado
 *
 * A linha de e-mail só aparece quando esse canal foi marcado. */
export function montarTextoBaixa(
  dados: DadosBaixa, status: string, codigoDisciplina: string | null, mfiles: boolean, drive: boolean, email: boolean,
): string {
  const canais = [`Inserida no M-Files: ${caixa(mfiles)}`, `Inserida no Drive: ${caixa(drive)}`];
  if (email) canais.push(`Enviada por e-mail: ${caixa(true)}`);
  const blocos = [
    montarNumeroAt(dados.num_at, dados.codigo, dados.revisao, codigoDisciplina, anoDaSolicitacao(dados.data_solicitacao)),
    canais.join("\n"),
    montarIdentificacaoEntidade(dados.codigo, dados.nome_entidade, dados.obra_referencia),
    montarDisciplinaRevisao(dados.disciplina, dados.revisao).replace(" - REV ", " – REV "),
    `Status: ${statusPorExtenso(status)}`,
  ];
  return blocos.join("\n\n");
}

/** Resumo escrito da baixa: quantidade de documentos analisados e
 * resultado primeiro, depois as informações que o resumo já trazia. */
export function montarResumoBaixa(
  dados: DadosBaixa, status: string, codigoDisciplina: string | null, mfiles: boolean, drive: boolean, email: boolean,
): string {
  const linhas = [
    `Quantidade de documentos analisados: ${dados.num_documentos_analisados ?? "não informada"}`,
    `Resultado da análise: ${statusPorExtenso(status)}`,
    `AT: ${montarNumeroAt(dados.num_at, dados.codigo, dados.revisao, codigoDisciplina, anoDaSolicitacao(dados.data_solicitacao))}`,
    montarEntidadeObra(dados.nome_entidade, dados.obra_referencia),
    montarDisciplinaRevisao(dados.disciplina, dados.revisao),
    montarTextoDisponibilizacao(mfiles, drive, email) || "Disponibilização ainda não informada",
  ];
  return linhas.join("\n");
}
