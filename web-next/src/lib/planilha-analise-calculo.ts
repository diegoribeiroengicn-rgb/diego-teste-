/** Importação incremental da planilha oficial "Controle GAT Projetos"
 * (abas PROJ_PREST/PROJ_CESS) para prestadores/cessionarios — porta exata
 * da lógica de correspondência/diff de gat/planilha_import.py. Mesmas
 * garantias do original: nunca apaga/duplica registros, um valor
 * vazio/nulo na planilha nunca sobrescreve um valor já preenchido no
 * banco, e um registro já arquivado nunca é modificado — só sinalizado.
 *
 * Escopo deste primeiro incremento (ver lib/planilha-analise.ts):
 * mantém a chave de correspondência (código+disciplina+revisão+N° AT, com
 * o mesmo fallback "ainda sem AT" e o mesmo cuidado de nunca descartar o
 * ano do N° AT) e o diff preenchimentos/conflitos fiel ao original.
 * `preferencias_conflito_planilha` (lembrar a escolha entre importações)
 * e a "sugestão de continuação" de `registros_nao_encontrados` ficam para
 * um próximo incremento — sem elas, o usuário só resolve o conflito/decide
 * o registro "preso" de novo a cada importação, em vez de uma vez só. */

import { STATUS_ANALISE_OPCOES } from "@/lib/administracao-calculo";
import { STATUS_ATIVO_ANALISE } from "@/lib/visao-gestor-calculo";

export type TabelaPlanilha = "prestadores" | "cessionarios";

/** Cabeçalho real das abas PROJ_PREST/PROJ_CESS na planilha oficial — a
 * mesma linha 5 (1-indexada) de gat/planilha_import.py::_LINHA_CABECALHO. */
export const LINHA_CABECALHO = 5;

export const MAPA_COLUNAS_PRESTADORES: Record<string, string> = {
  Item: "item", Código: "codigo", "Prestador de Serviço": "prestador",
  Disciplina: "disciplina", "Disciplina (SLA)": "disciplina_sla", "PEP'S": "peps",
  "Obra de Referência": "obra_referencia", Revisão: "revisao", "N° de Doc.": "num_documentos",
  "Data de Solicitação": "data_solicitacao", "Data Limite": "data_limite", "Data Análise": "data_analise",
  "Hold (Início)": "hold_inicio", "Hold (Fim)": "hold_fim", "N° AT": "num_at", "REV. AT": "revisao_at",
  Responsável: "responsavel", "Status Análise": "status_analise", Observações: "observacoes",
  "Natureza da Revisão": "natureza_revisao", "N° de erros encontrados": "num_erros", ETG: "etg",
};

export const MAPA_COLUNAS_CESSIONARIOS: Record<string, string> = {
  Item: "item", Código: "codigo", Cessionário: "cessionario",
  Disciplina: "disciplina", "Disciplina (SLA)": "disciplina_sla",
  Revisão: "revisao", "N° de Doc.": "num_documentos", "Data de Solicitação": "data_solicitacao",
  "SLA (Dias úteis)": "sla_dias", "Data Limite": "data_limite", "Data Análise": "data_analise",
  "Hold (início)": "hold_inicio", "Hold (fim)": "hold_fim", "N° AT": "num_at", "REV. AT": "revisao_at",
  Responsável: "responsavel", "Status Análise": "status_analise", Observações: "observacoes",
  Tipo: "tipo", "Natureza da Revisão": "natureza_revisao", "N° de erros encontrados": "num_erros", ETG: "etg",
};

export const CAMPOS_DATA = new Set(["data_solicitacao", "data_limite", "data_analise", "hold_inicio", "hold_fim"]);
export const CAMPOS_INTEIROS = new Set(["item", "revisao", "num_documentos", "revisao_at", "num_erros", "sla_dias"]);
export const CAMPOS_TEXTO_MAIUSCULO = new Set(["status_analise", "etg"]);

/** Colunas sem default no banco — uma linha nova sem esse dado é
 * inconsistência real da planilha, não algo para preencher com um valor
 * inventado. Mesma regra de _CAMPOS_OBRIGATORIOS_PARA_NOVO. */
export const CAMPOS_OBRIGATORIOS_PARA_NOVO = ["data_solicitacao"];

/** Só para completar um registro NOVO — nunca sobrescrevem um existente.
 * Mesma regra de _PADROES_SO_PARA_INSERCAO (reduzida às colunas deste
 * incremento). */
export const PADROES_SO_PARA_INSERCAO: Record<string, string | number> = {
  etg: "NÃO", revisao: 0, num_documentos: 0, status_analise: "EM ANÁLISE",
};

const CAMPOS_IGNORADOS_NA_COMPARACAO = new Set(["item"]);

const STATUS_ANALISE_VALIDOS = new Set(STATUS_ANALISE_OPCOES.map((s) => s.trim().toUpperCase()));

export function vazio(valor: unknown): boolean {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === "string") return !valor.trim();
  if (typeof valor === "number") return Number.isNaN(valor);
  return false;
}

export function texto(valor: unknown, maiusculo = false): string | null {
  if (vazio(valor)) return null;
  const t = String(valor).trim();
  return maiusculo ? t.toUpperCase() : t;
}

export function inteiro(valor: unknown): number | null {
  if (vazio(valor)) return null;
  const n = Number(valor);
  return Number.isNaN(n) ? null : Math.trunc(n);
}

/** Converte célula do Excel (Date, serial numérico ou texto dd/mm/aaaa)
 * para "YYYY-MM-DD" — mesmo parser já usado em pmo-cronograma-import.ts. */
export function dataIso(valor: unknown): string | null {
  if (vazio(valor)) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
  const texto = String(valor).trim();
  const match = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const [, d, m, a] = match;
    const ano = a.length === 2 ? `20${a}` : a;
    const data = new Date(Number(ano), Number(m) - 1, Number(d));
    return Number.isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10);
  }
  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10);
}

export type LinhaPlanilha = Record<string, unknown> & { _linha_excel?: number };

export function normalizarLinha(bruta: Record<string, unknown>): LinhaPlanilha {
  const linha: LinhaPlanilha = {};
  for (const [campo, valor] of Object.entries(bruta)) {
    if (campo === "_linha_excel") linha[campo] = valor as number;
    else if (CAMPOS_DATA.has(campo)) linha[campo] = dataIso(valor);
    else if (CAMPOS_INTEIROS.has(campo)) linha[campo] = inteiro(valor);
    else if (CAMPOS_TEXTO_MAIUSCULO.has(campo)) linha[campo] = texto(valor, true);
    else linha[campo] = texto(valor);
  }
  return linha;
}

/** Normaliza o cabeçalho de uma coluna da planilha para comparação
 * tolerante a variações de digitação (maiúscula/minúscula, acentuação,
 * aspas retas × curvas, "N°" × "Nº") — mesma regra de
 * _normalizar_nome_coluna. */
export function normalizarNomeColuna(nome: string): string {
  return String(nome)
    .split(/\s+/).join(" ")
    .replace(/[’‘]/g, "'")
    .replace(/º/g, "°")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Número + ano do N° AT ("0468/26" → "468/26"), só como chave de
 * comparação — o valor original nunca é alterado ao gravar. O ano faz
 * parte da identidade da AT (duas ATs com o mesmo número em anos
 * diferentes são análises diferentes) — mesma regra de
 * _num_at_normalizado. */
export function numAtNormalizado(numAt: unknown): string | null {
  if (!numAt) return null;
  const partes = String(numAt).split("/");
  if (partes.length !== 2) return null;
  const numero = partes[0].trim();
  const ano = partes[1].trim();
  if (!/^\d+$/.test(numero) || !/^\d+$/.test(ano)) return null;
  return `${parseInt(numero, 10)}/${ano}`;
}

export type Chave = (string | number | null)[];

/** Chave de identificação única de uma análise: código (ou nome da
 * entidade, se ainda sem código) + disciplina + revisão + N° AT. Quando o
 * N° AT não é um identificador confiável (ausente ou valor de rascunho),
 * a Data de Solicitação entra como critério adicional — e, para
 * Prestadores, também a Obra de Referência. Mesma regra de
 * chave_registro. */
export function chaveRegistro(linha: LinhaPlanilha, campoNomeEntidade: string, campoExtra: string | null = null): Chave {
  const codigo = texto(linha.codigo, true);
  const identificador = codigo || texto(linha[campoNomeEntidade], true);
  const disciplina = texto(linha.disciplina, true);
  const revisao = (linha.revisao as number | null) ?? null;
  const numAt = numAtNormalizado(linha.num_at);
  if (numAt !== null) return [identificador, disciplina, revisao, numAt];
  const extras: (string | null)[] = [texto(linha.data_solicitacao)];
  if (campoExtra) extras.push(texto(linha[campoExtra], true));
  return [identificador, disciplina, revisao, numAt, ...extras];
}

/** A chave que `chaveRegistro` devolveria para `linha` se ela NÃO
 * tivesse N° AT — critério de correspondência de reserva para quando o AT
 * é atribuído depois de a análise já estar cadastrada (sem isso, a
 * importação duplicaria a análise ao atribuir o AT). Mesma regra de
 * `_chave_sem_at`. */
export function chaveSemAt(linha: LinhaPlanilha, campoNomeEntidade: string, campoExtra: string | null = null): Chave {
  const codigo = texto(linha.codigo, true);
  const identificador = codigo || texto(linha[campoNomeEntidade], true);
  const disciplina = texto(linha.disciplina, true);
  const revisao = (linha.revisao as number | null) ?? null;
  const extras: (string | null)[] = [texto(linha.data_solicitacao)];
  if (campoExtra) extras.push(texto(linha[campoExtra], true));
  return [identificador, disciplina, revisao, null, ...extras];
}

export function serializarChave(chave: Chave): string {
  return JSON.stringify(chave);
}

function valoresEquivalentes(valorExistente: unknown, valorNovo: unknown, campo: string): boolean {
  if (CAMPOS_INTEIROS.has(campo)) {
    const a = Number(valorExistente);
    const b = Number(valorNovo);
    if (!Number.isNaN(a) && !Number.isNaN(b)) return a === b;
  }
  return String(valorExistente).trim() === String(valorNovo).trim();
}

/** Compara os campos vindos da planilha com o registro já cadastrado:
 * `preenchimentos` (campos vazios no banco que a planilha preenche —
 * aplicados automaticamente) e `conflitos` (valor diferente e não vazio
 * dos dois lados — sempre listados na prévia, mesmo a planilha sendo a
 * referência). Mesma regra de `_diff_campos`. */
export function diffCampos(
  existente: Record<string, unknown>, novo: Record<string, unknown>,
): { preenchimentos: Record<string, unknown>; conflitos: Record<string, [unknown, unknown]> } {
  const preenchimentos: Record<string, unknown> = {};
  const conflitos: Record<string, [unknown, unknown]> = {};
  for (const [campo, valorNovo] of Object.entries(novo)) {
    if (CAMPOS_IGNORADOS_NA_COMPARACAO.has(campo) || vazio(valorNovo)) continue;
    const valorExistente = existente[campo];
    if (vazio(valorExistente)) preenchimentos[campo] = valorNovo;
    else if (!valoresEquivalentes(valorExistente, valorNovo, campo)) conflitos[campo] = [valorExistente, valorNovo];
  }
  return { preenchimentos, conflitos };
}

export type TipoItemPlano = "novo" | "atualizacao" | "sem_mudanca" | "arquivado" | "inconsistente";

export type ItemPlanoImportacao = {
  itemOrigem: unknown;
  identificacao: string;
  chave: Chave;
  tipo: TipoItemPlano;
  linhaPlanilha: number | null;
  dadosNovos: Record<string, unknown>;
  existenteId: number | null;
  existente: Record<string, unknown>;
  preenchimentos: Record<string, unknown>;
  conflitos: Record<string, [unknown, unknown]>;
  motivoInconsistencia: string | null;
};

export type RegistroNaoEncontrado = {
  id: number;
  identificacao: string | null;
  disciplina: string | null;
  num_at: string | null;
  revisao: number | null;
  status_analise: string | null;
  data_solicitacao: string | null;
};

export type PlanoImportacao = {
  origem: string;
  itens: ItemPlanoImportacao[];
  colunasNaoMapeadas: string[];
  registrosNaoEncontrados: RegistroNaoEncontrado[];
};

export function resumoPlano(plano: PlanoImportacao) {
  const novos = plano.itens.filter((i) => i.tipo === "novo").length;
  const atualizados = plano.itens.filter((i) => i.tipo === "atualizacao").length;
  const semMudanca = plano.itens.filter((i) => i.tipo === "sem_mudanca").length;
  const arquivados = plano.itens.filter((i) => i.tipo === "arquivado").length;
  const inconsistentes = plano.itens.filter((i) => i.tipo === "inconsistente").length;
  const comConflito = plano.itens.filter((i) => Object.keys(i.conflitos).length > 0);
  return { lidos: plano.itens.length, novos, atualizados, semMudanca, arquivados, inconsistentes, totalConflitos: comConflito.length };
}

/** Classifica cada linha já normalizada (novo/atualização/sem
 * mudança/arquivado/inconsistente) sem gravar nada — fase 1 (prévia).
 * Mesma regra de `_planejar`, reduzida ao escopo deste incremento
 * (sem `preferencias_conflito_planilha` nem a fusão de linhas repetidas
 * na mesma leva — planilhas com duas linhas para a mesma chave geram dois
 * itens de plano em vez de se mesclarem automaticamente; raro na prática
 * e sinalizado ao usuário pela prévia). */
export function planejarLinhas(
  linhas: LinhaPlanilha[], colunasNaoMapeadas: string[], origem: string,
  campoCodigo: string, campoNomeEntidade: string, campoNomeObra: string | null,
  ativos: Record<string, unknown>[], arquivados: Record<string, unknown>[],
  colunasTabela: readonly string[],
): PlanoImportacao {
  const plano: PlanoImportacao = { origem, itens: [], colunasNaoMapeadas, registrosNaoEncontrados: [] };

  const indiceAtivos = new Map<string, Record<string, unknown>>();
  for (const linha of ativos) {
    indiceAtivos.set(serializarChave(chaveRegistro(linha, campoNomeEntidade, campoNomeObra)), linha);
  }
  const chavesArquivadas = new Set(
    arquivados.map((linha) => serializarChave(chaveRegistro(linha, campoNomeEntidade, campoNomeObra))),
  );

  for (const linha of linhas) {
    const itemOrigem = linha.item;
    const linhaPlanilha = linha._linha_excel ?? null;

    if (!linha[campoNomeEntidade] || !linha.disciplina) {
      plano.itens.push({
        itemOrigem, identificacao: String(linha[campoCodigo] ?? "?"), chave: [], tipo: "inconsistente",
        linhaPlanilha, dadosNovos: {}, existenteId: null, existente: {}, preenchimentos: {}, conflitos: {},
        motivoInconsistencia: `sem ${campoNomeEntidade === "prestador" ? "Prestador de Serviço" : "Cessionário"} ou disciplina`,
      });
      continue;
    }

    const chave = chaveRegistro(linha, campoNomeEntidade, campoNomeObra);
    const identificacao = String(linha[campoCodigo] ?? linha[campoNomeEntidade]);
    const camposPlanilha: Record<string, unknown> = {};
    for (const c of colunasTabela) if (c in linha) camposPlanilha[c] = linha[c];

    const statusPlanilha = String(camposPlanilha.status_analise ?? "").trim().toUpperCase();
    if (statusPlanilha && !STATUS_ANALISE_VALIDOS.has(statusPlanilha)) {
      plano.itens.push({
        itemOrigem, identificacao, chave, tipo: "inconsistente", linhaPlanilha,
        dadosNovos: {}, existenteId: null, existente: {}, preenchimentos: {}, conflitos: {},
        motivoInconsistencia: `Status Análise "${camposPlanilha.status_analise}" não é um valor válido (esperado um de: ${STATUS_ANALISE_OPCOES.join(", ")}) — corrija a planilha antes de importar`,
      });
      continue;
    }

    if (camposPlanilha.data_analise && STATUS_ATIVO_ANALISE.has(statusPlanilha)) {
      plano.itens.push({
        itemOrigem, identificacao, chave, tipo: "inconsistente", linhaPlanilha,
        dadosNovos: {}, existenteId: null, existente: {}, preenchimentos: {}, conflitos: {},
        motivoInconsistencia: `Data Análise preenchida (${camposPlanilha.data_analise}) mas Status Análise ainda "${camposPlanilha.status_analise}" na planilha — corrija o status antes de importar, ou a contagem de projetos em análise não vai bater`,
      });
      continue;
    }

    const holdAbertoPlanilha = !!camposPlanilha.hold_inicio && !camposPlanilha.hold_fim;
    if (holdAbertoPlanilha && statusPlanilha === "EM ANÁLISE") {
      plano.itens.push({
        itemOrigem, identificacao, chave, tipo: "inconsistente", linhaPlanilha,
        dadosNovos: {}, existenteId: null, existente: {}, preenchimentos: {}, conflitos: {},
        motivoInconsistencia: `Hold em aberto (Início preenchido, Fim vazio) mas Status Análise "${camposPlanilha.status_analise || "(vazio)"}" na planilha — corrija para EM HOLD antes de importar, ou o registro vai aparecer como Em Análise nos filtros mesmo estando em Hold`,
      });
      continue;
    }

    let existente = indiceAtivos.get(serializarChave(chave)) ?? null;
    let chaveEfetiva = chave;
    if (existente === null) {
      const numAtPlanilha = numAtNormalizado(camposPlanilha.num_at);
      if (numAtPlanilha !== null) {
        const chaveFallback = chaveSemAt(linha, campoNomeEntidade, campoNomeObra);
        const candidato = indiceAtivos.get(serializarChave(chaveFallback));
        if (candidato && numAtNormalizado(candidato.num_at) === null) {
          existente = candidato;
          chaveEfetiva = chaveFallback;
        }
      }
    }

    if (existente === null && chavesArquivadas.has(serializarChave(chaveEfetiva))) {
      plano.itens.push({
        itemOrigem, identificacao, chave: chaveEfetiva, tipo: "arquivado", linhaPlanilha,
        dadosNovos: {}, existenteId: null, existente: {}, preenchimentos: {}, conflitos: {}, motivoInconsistencia: null,
      });
      continue;
    }

    if (existente === null) {
      const faltando = CAMPOS_OBRIGATORIOS_PARA_NOVO.filter((c) => vazio(camposPlanilha[c]));
      if (faltando.length) {
        plano.itens.push({
          itemOrigem, identificacao, chave: chaveEfetiva, tipo: "inconsistente", linhaPlanilha,
          dadosNovos: {}, existenteId: null, existente: {}, preenchimentos: {}, conflitos: {},
          motivoInconsistencia: `registro novo sem ${faltando.join(", ")}`,
        });
        continue;
      }
      plano.itens.push({
        itemOrigem, identificacao, chave: chaveEfetiva, tipo: "novo", linhaPlanilha,
        dadosNovos: camposPlanilha, existenteId: null, existente: {}, preenchimentos: {}, conflitos: {}, motivoInconsistencia: null,
      });
      continue;
    }

    const { preenchimentos, conflitos } = diffCampos(existente, camposPlanilha);
    const tipo: TipoItemPlano = Object.keys(preenchimentos).length || Object.keys(conflitos).length ? "atualizacao" : "sem_mudanca";
    plano.itens.push({
      itemOrigem, identificacao, chave: chaveEfetiva, tipo, linhaPlanilha,
      dadosNovos: camposPlanilha, existenteId: (existente.id as number) ?? null, existente,
      preenchimentos, conflitos, motivoInconsistencia: null,
    });
  }

  const chavesEncontradas = new Set(
    plano.itens.filter((i) => i.tipo === "atualizacao" || i.tipo === "sem_mudanca").map((i) => serializarChave(i.chave)),
  );
  for (const [chaveStr, registroAtivo] of indiceAtivos) {
    const statusAtivo = String(registroAtivo.status_analise ?? "").trim().toUpperCase();
    if (!chavesEncontradas.has(chaveStr) && STATUS_ATIVO_ANALISE.has(statusAtivo)) {
      plano.registrosNaoEncontrados.push({
        id: registroAtivo.id as number,
        identificacao: (registroAtivo[campoCodigo] as string) || (registroAtivo[campoNomeEntidade] as string) || null,
        disciplina: (registroAtivo.disciplina as string) ?? null,
        num_at: (registroAtivo.num_at as string) ?? null,
        revisao: (registroAtivo.revisao as number) ?? null,
        status_analise: (registroAtivo.status_analise as string) ?? null,
        data_solicitacao: (registroAtivo.data_solicitacao as string) ?? null,
      });
    }
  }

  return plano;
}
