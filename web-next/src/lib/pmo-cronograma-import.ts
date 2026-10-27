import ExcelJS from "exceljs";
import { calcularCaminhoCritico, type AtividadeComCpm, type AtividadeInterpretada } from "@/lib/pmo-calculo";

/** Interpretação automática de cronogramas anexados ao PMO — mesma
 * lógica de gat/pmo_cronograma_import.py. Módulo server-only: usa
 * `exceljs` para ler planilhas, nunca é importado por um componente
 * client. O caminho crítico é calculado depois, em
 * `calcularCaminhoCritico` (pmo-calculo.ts), sobre o resultado destas
 * funções — mesma separação do Python (interpretação vs. CPM). */

const ALIAS_COLUNAS_EXCEL: Record<string, string[]> = {
  identificador_origem: ["id", "identificador", "codigo", "código", "cod", "wbs"],
  nome: ["atividade", "nome", "tarefa", "descricao", "descrição", "task"],
  data_inicio: ["inicio", "início", "data inicio", "data início", "data de inicio", "data de início", "start"],
  data_fim: ["termino", "término", "data termino", "data término", "data de termino", "data de término", "fim", "finish"],
  duracao_dias: ["duracao", "duração", "duracao (dias)", "duração (dias)", "dias", "duration"],
  percentual_concluido: ["% concluido", "% concluído", "percentual", "percentual concluido", "percentual concluído", "avanco", "avanço", "% complete"],
  e_marco: ["marco", "e marco", "é marco", "milestone"],
  predecessoras: ["predecessoras", "predecessora", "dependencias", "dependências", "predecessors"],
};

function normalizar(texto: unknown): string {
  return String(texto ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

function resolverColuna(colunasNormalizadas: Map<string, number>, chave: string): number | null {
  for (const alias of ALIAS_COLUNAS_EXCEL[chave]) {
    const indice = colunasNormalizadas.get(normalizar(alias));
    if (indice != null) return indice;
  }
  return null;
}

function parsearDataExcel(valor: unknown): string | null {
  if (valor == null || valor === "") return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
  const texto = String(valor).trim();
  const match = texto.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    const [, d, m, a] = match;
    const ano = a.length === 2 ? `20${a}` : a;
    const data = new Date(Number(ano), Number(m) - 1, Number(d));
    return Number.isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10);
  }
  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10);
}

/** Lê a primeira planilha do arquivo e reconhece automaticamente as
 * colunas de atividade, datas, duração, percentual concluído, marco e
 * predecessoras — independente da ordem das colunas e tolerante a
 * variações comuns de nome de coluna em português. Lança `Error` com uma
 * mensagem clara quando a coluna de nome da atividade não é encontrada. */
export async function interpretarCronogramaExcel(conteudo: Buffer): Promise<AtividadeInterpretada[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs declara seu próprio tipo `Buffer` (gerado contra uma versão de
  // @types/node diferente da deste projeto) — o valor é um Buffer real em
  // tempo de execução, só a estrutura do tipo não bate.
  await workbook.xlsx.load(conteudo as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const planilha = workbook.worksheets[0];
  if (!planilha) throw new Error("A planilha enviada está vazia.");

  const cabecalho = planilha.getRow(1);
  const colunasNormalizadas = new Map<string, number>();
  cabecalho.eachCell((celula, indiceColuna) => {
    colunasNormalizadas.set(normalizar(celula.value), indiceColuna);
  });

  const colunaNome = resolverColuna(colunasNormalizadas, "nome");
  if (colunaNome == null) {
    throw new Error(
      "Não foi possível identificar a coluna com o nome da atividade na planilha. " +
        "Use um cabeçalho como 'Atividade', 'Nome' ou 'Tarefa'.",
    );
  }
  const colunaId = resolverColuna(colunasNormalizadas, "identificador_origem");
  const colunaInicio = resolverColuna(colunasNormalizadas, "data_inicio");
  const colunaFim = resolverColuna(colunasNormalizadas, "data_fim");
  const colunaDuracao = resolverColuna(colunasNormalizadas, "duracao_dias");
  const colunaPct = resolverColuna(colunasNormalizadas, "percentual_concluido");
  const colunaMarco = resolverColuna(colunasNormalizadas, "e_marco");
  const colunaPred = resolverColuna(colunasNormalizadas, "predecessoras");

  const atividades: AtividadeInterpretada[] = [];
  let linhaIndice = 0;
  planilha.eachRow((linha, numeroLinha) => {
    if (numeroLinha === 1) return;
    const nome = String(linha.getCell(colunaNome).value ?? "").trim();
    if (!nome) return;
    linhaIndice += 1;

    const dataInicio = colunaInicio != null ? parsearDataExcel(linha.getCell(colunaInicio).value) : null;
    const dataFim = colunaFim != null ? parsearDataExcel(linha.getCell(colunaFim).value) : null;

    let duracaoDias: number;
    if (colunaDuracao != null) {
      duracaoDias = Number(linha.getCell(colunaDuracao).value) || 0;
    } else if (dataInicio && dataFim) {
      duracaoDias = Math.round((new Date(dataFim).getTime() - new Date(dataInicio).getTime()) / 86400000);
    } else {
      duracaoDias = 0;
    }

    let percentualConcluido = 0;
    if (colunaPct != null) {
      const bruto = String(linha.getCell(colunaPct).value ?? "0").replace("%", "").replace(",", ".");
      percentualConcluido = Number(bruto) || 0;
    }
    percentualConcluido = Math.min(100, Math.max(0, percentualConcluido));

    let eMarco = 0;
    if (colunaMarco != null) {
      const valor = normalizar(linha.getCell(colunaMarco).value);
      eMarco = ["sim", "s", "1", "true", "yes", "x"].includes(valor) ? 1 : 0;
    } else {
      eMarco = duracaoDias === 0 ? 1 : 0;
    }

    const predecessoras = colunaPred != null ? String(linha.getCell(colunaPred).value ?? "").trim() || null : null;
    const identificadorOrigem = colunaId != null ? String(linha.getCell(colunaId).value ?? "").trim() : String(linhaIndice);

    atividades.push({
      identificador_origem: identificadorOrigem, nome, data_inicio: dataInicio, data_fim: dataFim,
      duracao_dias: duracaoDias, percentual_concluido: percentualConcluido, e_marco: eMarco, predecessoras,
    });
  });

  return atividades;
}

/** Estrutura genérica de um arquivo XER: cada tabela começa em uma linha
 * `%T\tNOME_TABELA`, seguida de `%F\tcampo1\tcampo2...` e de N linhas
 * `%R\tvalor1\tvalor2...` até a próxima `%T` ou o fim do arquivo. */
function parsearTabelasXer(texto: string): Map<string, Record<string, string>[]> {
  const tabelas = new Map<string, Record<string, string>[]>();
  let tabelaAtual: string | null = null;
  let campos: string[] = [];
  let linhas: Record<string, string>[] = [];

  function fecharTabela() {
    if (tabelaAtual && campos.length) tabelas.set(tabelaAtual, linhas);
  }

  for (const linhaBruta of texto.split(/\r?\n/)) {
    if (!linhaBruta) continue;
    const partes = linhaBruta.split("\t");
    const marcador = partes[0];
    if (marcador === "%T") {
      fecharTabela();
      tabelaAtual = partes[1] ?? null;
      campos = [];
      linhas = [];
    } else if (marcador === "%F") {
      campos = partes.slice(1);
    } else if (marcador === "%R") {
      const valores = partes.slice(1);
      const linha: Record<string, string> = {};
      campos.forEach((campo, i) => { linha[campo] = valores[i] ?? ""; });
      linhas.push(linha);
    }
  }
  fecharTabela();
  return tabelas;
}

const TIPOS_MARCO = new Set(["TT_Mile", "TT_FinMile"]);

/** Interpreta as tabelas `TASK` (atividades) e `TASKPRED` (predecessoras)
 * de um arquivo Primavera XER (formato texto plano). Marcos são
 * identificados pelo `task_type` (`TT_Mile`/`TT_FinMile`) do Primavera. */
export function interpretarCronogramaXer(conteudo: Buffer): AtividadeInterpretada[] {
  const texto = conteudo.toString("utf-8");
  const tabelas = parsearTabelasXer(texto);
  const tarefas = tabelas.get("TASK");
  if (!tarefas || !tarefas.length) {
    throw new Error("Não foi encontrada a tabela TASK no arquivo XER — verifique se é uma exportação válida do Primavera.");
  }

  const predsPorTarefa = new Map<string, string[]>();
  const taskpred = tabelas.get("TASKPRED");
  if (taskpred?.length && "task_id" in taskpred[0] && "pred_task_id" in taskpred[0]) {
    for (const linha of taskpred) {
      const lista = predsPorTarefa.get(linha.task_id) ?? [];
      lista.push(linha.pred_task_id);
      predsPorTarefa.set(linha.task_id, lista);
    }
  }

  return tarefas.map((t) => {
    const identificadorOrigem = t.task_id ?? null;
    const horas = Number(t.target_drtn_hr_cnt) || 0;
    return {
      identificador_origem: identificadorOrigem,
      nome: (t.task_name || t.task_code || "").trim(),
      data_inicio: parsearDataExcel(t.target_start_date),
      data_fim: parsearDataExcel(t.target_end_date),
      duracao_dias: Math.round((horas / 8) * 100) / 100,
      percentual_concluido: Math.min(100, Math.max(0, Number(t.phys_complete_pct) || 0)),
      e_marco: TIPOS_MARCO.has(t.task_type) ? 1 : 0,
      predecessoras: identificadorOrigem ? predsPorTarefa.get(identificadorOrigem)?.join(",") || null : null,
    };
  });
}

/** Ponto único de entrada usado pela API de upload do Cronograma do PMO.
 * Retorna `null` para `.mpp` (sem interpretação automática — arquivo
 * apenas anexado como referência). */
export async function interpretarCronograma(formato: string, conteudo: Buffer): Promise<AtividadeInterpretada[] | null> {
  if (formato === "excel") return interpretarCronogramaExcel(conteudo);
  if (formato === "xer") return interpretarCronogramaXer(conteudo);
  return null;
}

export function aplicarCpm(atividades: AtividadeInterpretada[]): AtividadeComCpm[] {
  return calcularCaminhoCritico(atividades);
}
