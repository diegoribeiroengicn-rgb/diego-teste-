import ExcelJS from "exceljs";
import { obterPool } from "@/lib/db";
import {
  atualizarCessionario, atualizarPrestador, inserirCessionario, inserirPrestador,
  COLUNAS_CESSIONARIO, COLUNAS_PRESTADOR, type DadosCessionario, type DadosPrestador,
} from "@/lib/analise";
import {
  normalizarLinha, normalizarNomeColuna, planejarLinhas, serializarChave, vazio,
  LINHA_CABECALHO, MAPA_COLUNAS_CESSIONARIOS, MAPA_COLUNAS_PRESTADORES,
  PADROES_SO_PARA_INSERCAO,
  type ItemPlanoImportacao, type LinhaPlanilha, type PlanoImportacao, type TabelaPlanilha,
} from "@/lib/planilha-analise-calculo";

/** Importação por planilha — camada de servidor (leitura do .xlsx com
 * `exceljs`, consultas ao banco e gravação). A classificação/diff em si
 * (o que é novo, atualização, conflito etc.) é pura e fica em
 * planilha-analise-calculo.ts; aqui só entram E/S: ler o arquivo, buscar
 * os registros atuais e aplicar o plano já confirmado pelo usuário.
 * Mesma divisão de responsabilidades de gat/planilha_import.py
 * (`_ler_aba`/`_planejar` vs. `executar_plano`). */

const NOME_ABA: Record<TabelaPlanilha, string> = { prestadores: "PROJ_PREST", cessionarios: "PROJ_CESS" };
const MAPA_COLUNAS: Record<TabelaPlanilha, Record<string, string>> = {
  prestadores: MAPA_COLUNAS_PRESTADORES, cessionarios: MAPA_COLUNAS_CESSIONARIOS,
};
const CAMPO_NOME_ENTIDADE: Record<TabelaPlanilha, string> = { prestadores: "prestador", cessionarios: "cessionario" };
const CAMPO_NOME_OBRA: Record<TabelaPlanilha, string | null> = { prestadores: "obra_referencia", cessionarios: null };
const COLUNAS_TABELA: Record<TabelaPlanilha, readonly string[]> = { prestadores: COLUNAS_PRESTADOR, cessionarios: COLUNAS_CESSIONARIO };

/** Lê a aba PROJ_PREST/PROJ_CESS a partir da linha de cabeçalho real
 * (linha 5) e devolve as linhas já normalizadas, mais as colunas da
 * planilha sem correspondência conhecida (nunca descartadas em
 * silêncio). Tolerante a variações de nome de aba/coluna — mesma regra
 * de `_ler_aba`. */
export async function lerPlanilha(conteudo: Buffer, tabela: TabelaPlanilha): Promise<{ linhas: LinhaPlanilha[]; colunasNaoMapeadas: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(conteudo as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const nomeEsperado = NOME_ABA[tabela];
  const planilha =
    workbook.getWorksheet(nomeEsperado) ??
    workbook.worksheets.find((p) => p.name.trim().toLowerCase() === nomeEsperado.toLowerCase());
  if (!planilha) {
    throw new Error(`Aba "${nomeEsperado}" não encontrada no arquivo — confira se é a planilha oficial "Controle GAT Projetos".`);
  }

  const mapaColunas = MAPA_COLUNAS[tabela];
  const mapaNormalizado = new Map(Object.entries(mapaColunas).map(([coluna, campo]) => [normalizarNomeColuna(coluna), campo]));

  const linhaCabecalho = planilha.getRow(LINHA_CABECALHO);
  const colunaRealPorCampo = new Map<string, number>();
  const colunasNaoMapeadas: string[] = [];
  linhaCabecalho.eachCell({ includeEmpty: false }, (celula, numeroColuna) => {
    const nome = String(celula.value ?? "").trim();
    if (!nome) return;
    const campo = mapaNormalizado.get(normalizarNomeColuna(nome));
    if (campo) colunaRealPorCampo.set(campo, numeroColuna);
    else colunasNaoMapeadas.push(nome);
  });

  const linhas: LinhaPlanilha[] = [];
  const ultimaLinha = planilha.lastRow?.number ?? LINHA_CABECALHO;
  for (let numeroLinha = LINHA_CABECALHO + 1; numeroLinha <= ultimaLinha; numeroLinha++) {
    const linha = planilha.getRow(numeroLinha);
    const candidata: Record<string, unknown> = {};
    for (const [campo, coluna] of colunaRealPorCampo) {
      candidata[campo] = linha.getCell(coluna).value;
    }
    const temConteudo = Object.entries(candidata).some(([campo, v]) => campo !== "item" && !vazio(v));
    if (!temConteudo) continue;
    candidata._linha_excel = numeroLinha;
    linhas.push(normalizarLinha(candidata));
  }

  return { linhas, colunasNaoMapeadas: [...new Set(colunasNaoMapeadas)].sort() };
}

async function buscarAtivosEArquivados(tabela: TabelaPlanilha): Promise<{ ativos: Record<string, unknown>[]; arquivados: Record<string, unknown>[] }> {
  const pool = obterPool();
  const [{ rows: ativos }, { rows: arquivados }] = await Promise.all([
    pool.query(`SELECT * FROM ${tabela} WHERE arquivado_em IS NULL`),
    pool.query(`SELECT * FROM ${tabela} WHERE arquivado_em IS NOT NULL`),
  ]);
  return { ativos, arquivados };
}

/** Fase 1 — lê a planilha e classifica cada linha sem gravar nada no
 * banco (prévia). Mesma regra de `planejar_importacao_prestadores`/
 * `planejar_importacao_cessionarios`. */
export async function planejarImportacao(tabela: TabelaPlanilha, conteudo: Buffer): Promise<PlanoImportacao> {
  const { linhas, colunasNaoMapeadas } = await lerPlanilha(conteudo, tabela);
  const { ativos, arquivados } = await buscarAtivosEArquivados(tabela);
  const origem = tabela === "prestadores" ? "Prestadores" : "Cessionários";
  return planejarLinhas(
    linhas, colunasNaoMapeadas, origem, "codigo", CAMPO_NOME_ENTIDADE[tabela], CAMPO_NOME_OBRA[tabela],
    ativos, arquivados, COLUNAS_TABELA[tabela],
  );
}

export type ResolucoesConflito = Record<string, Record<string, "sistema" | "planilha">>;

export type RelatorioImportacao = {
  origem: string;
  lidos: number;
  novos: number;
  atualizados: number;
  conflitosTratados: number;
  ignoradosSemMudanca: number;
  ignoradosArquivados: number;
  inconsistentes: number;
  erros: string[];
};

/** Fase 2 — aplica um plano já revisado e confirmado pelo usuário. A
 * planilha é a referência: por padrão um conflito é resolvido a favor do
 * valor da planilha; `resolucoesConflito[chaveSerializada][campo] ===
 * "sistema"` mantém o valor já cadastrado para aquele campo. Mesma regra
 * de `executar_plano`.
 *
 * Diferença deliberada do original: em vez do backup/restauração de todo
 * o arquivo SQLite (sem equivalente num Postgres compartilhado), cada
 * linha é gravada isoladamente — um erro numa linha não desfaz as demais
 * já aplicadas, e fica listado em `erros` para o usuário corrigir e
 * reimportar só aquela linha. Nada é gravado antes desta fase (a prévia
 * em si nunca grava nada). */
export async function executarImportacao(
  tabela: TabelaPlanilha, plano: PlanoImportacao, resolucoesConflito: ResolucoesConflito, usuario: string,
): Promise<RelatorioImportacao> {
  const relatorio: RelatorioImportacao = {
    origem: plano.origem, lidos: plano.itens.length, novos: 0, atualizados: 0, conflitosTratados: 0,
    ignoradosSemMudanca: 0, ignoradosArquivados: 0, inconsistentes: 0, erros: [],
  };

  const colunasTabela = COLUNAS_TABELA[tabela];

  for (const item of plano.itens) {
    if (item.tipo === "inconsistente") {
      relatorio.inconsistentes++;
      continue;
    }
    if (item.tipo === "arquivado") {
      relatorio.ignoradosArquivados++;
      continue;
    }
    if (item.tipo === "sem_mudanca") {
      relatorio.ignoradosSemMudanca++;
      continue;
    }

    try {
      if (item.tipo === "novo") {
        const campos: Record<string, unknown> = { ...item.dadosNovos };
        for (const [campo, padrao] of Object.entries(PADROES_SO_PARA_INSERCAO)) {
          if (colunasTabela.includes(campo) && vazio(campos[campo])) campos[campo] = padrao;
        }
        if (tabela === "prestadores") await inserirPrestador(campos as unknown as DadosPrestador, usuario);
        else await inserirCessionario(campos as unknown as DadosCessionario, usuario);
        relatorio.novos++;
        continue;
      }

      // atualizacao: preenchimentos sempre aplicados; conflitos aplicam o
      // valor da planilha por padrão, exceto onde o usuário escolheu
      // manter o valor do sistema.
      const final: Record<string, unknown> = { ...item.existente, ...item.preenchimentos };
      const escolhas = resolucoesConflito[serializarChave(item.chave)] ?? {};
      let conflitosAqui = 0;
      for (const [campo, [valorSistema, valorPlanilha]] of Object.entries(item.conflitos)) {
        final[campo] = escolhas[campo] === "sistema" ? valorSistema : valorPlanilha;
        conflitosAqui++;
      }
      if (tabela === "prestadores") await atualizarPrestador(item.existenteId!, final as unknown as DadosPrestador, usuario);
      else await atualizarCessionario(item.existenteId!, final as unknown as DadosCessionario, usuario);
      relatorio.atualizados++;
      relatorio.conflitosTratados += conflitosAqui;
    } catch (erro) {
      relatorio.erros.push(`Linha ${item.linhaPlanilha ?? "?"} (${item.identificacao}): ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  return relatorio;
}

/** Registra uma execução da importação (sucesso ou com erros parciais)
 * para consulta em Administração > Atualização por Planilha > Histórico.
 * Mesma regra de `registrar_importacao_planilha` (sem `backup_ref` — sem
 * equivalente ao backup de arquivo único do SQLite original). */
export async function registrarImportacaoPlanilha(usuario: string, nomeArquivo: string, relatorio: RelatorioImportacao): Promise<void> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const resultado = relatorio.erros.length ? "PARCIAL" : "SUCESSO";
  await pool.query(
    `INSERT INTO importacoes_planilha_historico
      (data_hora, usuario, nome_arquivo, origem, lidos, novos, atualizados, conflitos_tratados, ignorados, inconsistencias, resultado, erro)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      agora, usuario, nomeArquivo, relatorio.origem, relatorio.lidos, relatorio.novos, relatorio.atualizados,
      relatorio.conflitosTratados, relatorio.ignoradosSemMudanca + relatorio.ignoradosArquivados, relatorio.inconsistentes,
      resultado, relatorio.erros.length ? relatorio.erros.join(" | ") : null,
    ],
  );
}

export type ImportacaoHistorico = {
  id: number; data_hora: string; usuario: string; nome_arquivo: string; origem: string;
  lidos: number; novos: number; atualizados: number; conflitos_tratados: number;
  ignorados: number; inconsistencias: number; resultado: string; erro: string | null;
};

export async function listarImportacoesPlanilha(limite = 20): Promise<ImportacaoHistorico[]> {
  const pool = obterPool();
  const { rows } = await pool.query<ImportacaoHistorico>(
    "SELECT * FROM importacoes_planilha_historico ORDER BY data_hora DESC LIMIT $1",
    [limite],
  );
  return rows;
}

export function itemPrecisaResolucao(item: ItemPlanoImportacao): boolean {
  return Object.keys(item.conflitos).length > 0;
}
