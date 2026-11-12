import { obterPool } from "@/lib/db";
import { hojeBr } from "@/lib/dias-uteis";
import { STATUS_ANALISE_OPCOES } from "@/lib/administracao-calculo";
import { garantirColunasBaixa } from "@/lib/esquema-baixa";
import type { DadosBaixa } from "@/lib/resumo-conclusao-calculo";

export type TabelaBaixa = "prestadores" | "cessionarios";

const TABELAS_BAIXA = new Set<string>(["prestadores", "cessionarios"]);

const STATUS_VALIDOS = new Set(STATUS_ANALISE_OPCOES);

function validarTabela(tabela: string): asserts tabela is TabelaBaixa {
  if (!TABELAS_BAIXA.has(tabela)) throw new Error(`Tabela inválida para baixa de análise: ${tabela}`);
}

type RegistroBaixa = DadosBaixa & {
  id: number;
  status_analise: string;
  data_analise: string | null;
  resumo_mfiles: boolean;
  resumo_drive: boolean;
  resumo_email: boolean;
  resumo_qtd_geracoes: number;
};

/** Busca os campos do registro necessários para montar o texto da baixa.
 * O nome da entidade vem de colunas diferentes em prestadores
 * (prestador) e cessionarios (cessionario). A referência da obra é a
 * coluna `obra_referencia` das duas tabelas; em cessionários, enquanto
 * ela não for preenchida, a sugestão é o `tipo` (Loja/Quiosque/Externo),
 * que era o que o texto da baixa já mostrava nessa posição. */
export async function obterRegistroParaBaixa(tabela: TabelaBaixa, id: number): Promise<RegistroBaixa | null> {
  validarTabela(tabela);
  await garantirColunasBaixa();
  const pool = obterPool();
  const colunaNome = tabela === "prestadores" ? "prestador" : "cessionario";
  const obra = tabela === "prestadores" ? "obra_referencia" : "COALESCE(NULLIF(TRIM(obra_referencia), ''), tipo)";
  const { rows } = await pool.query<RegistroBaixa>(
    `SELECT id, codigo, revisao, num_at, disciplina, num_documentos, num_documentos_analisados, data_solicitacao,
            status_analise, data_analise, "${colunaNome}" AS nome_entidade, ${obra} AS obra_referencia,
            resumo_mfiles, resumo_drive, resumo_email, resumo_qtd_geracoes
     FROM ${tabela} WHERE id = $1 AND arquivado_em IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export type DadosDarBaixa = {
  status: string; numAt: string; codigoDisciplina: string; mfiles: boolean; drive: boolean; email: boolean;
  numDocumentosAnalisados: number; obraReferencia: string;
};

/** Dá baixa na análise: grava o status final escolhido (marcando a data
 * de conclusão quando ainda não havia uma, ou quando o status muda),
 * a quantidade de documentos analisados, a referência da obra e a
 * seleção de canais de disponibilização, e registra o evento no
 * histórico de baixas — mesma infraestrutura de
 * gat/database.py::salvar_selecao_resumo, adaptada para também mudar o
 * status (aqui a baixa É a conclusão da análise, não um passo
 * posterior). Retorna o registro atualizado, pronto para montar o texto. */
export type EstadoAnteriorBaixa = {
  status_analise: string; data_analise: string | null; num_at: string | null;
  resumo_mfiles: number; resumo_drive: number; resumo_email: number; resumo_qtd_geracoes: number;
  resumo_ultima_geracao_em: string | null; resumo_gerado_por: string | null;
  num_documentos_analisados: number | null; obra_referencia: string | null;
  atualizado_em: string | null; atualizado_por: string | null;
};

const COLUNAS_ESTADO = `status_analise, data_analise, num_at, resumo_mfiles, resumo_drive, resumo_email, resumo_qtd_geracoes,
  resumo_ultima_geracao_em, resumo_gerado_por, num_documentos_analisados, obra_referencia, atualizado_em, atualizado_por`;

export async function darBaixaAnalise(
  tabela: TabelaBaixa, id: number, dados: DadosDarBaixa, usuario: string,
): Promise<RegistroBaixa & { anterior: EstadoAnteriorBaixa; baixaEm: string }> {
  validarTabela(tabela);
  const pool = obterPool();
  const atual = await obterRegistroParaBaixa(tabela, id);
  if (!atual) throw new Error("Registro não encontrado.");
  const { rows: bruto } = await pool.query<EstadoAnteriorBaixa>(`SELECT ${COLUNAS_ESTADO} FROM ${tabela} WHERE id = $1`, [id]);
  const anterior = bruto[0];

  const agora = new Date().toISOString();
  const mudouStatus = atual.status_analise !== dados.status;
  const novaDataAnalise = atual.data_analise && !mudouStatus ? atual.data_analise : hojeBr().toISOString().slice(0, 10);
  const obraReferencia = dados.obraReferencia.trim() || null;

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query(
      `UPDATE ${tabela} SET status_analise = $1, data_analise = $2, num_at = $3, resumo_mfiles = $4, resumo_drive = $5, resumo_email = $6,
         resumo_ultima_geracao_em = $7, resumo_gerado_por = $8, resumo_qtd_geracoes = resumo_qtd_geracoes + 1,
         atualizado_em = $7, atualizado_por = $8, num_documentos_analisados = $10, obra_referencia = $11
       WHERE id = $9`,
      [
        dados.status, novaDataAnalise, dados.numAt.trim(), dados.mfiles ? 1 : 0, dados.drive ? 1 : 0, dados.email ? 1 : 0, agora, usuario, id,
        dados.numDocumentosAnalisados, obraReferencia,
      ],
    );

    const jaGeradoAntes = atual.resumo_qtd_geracoes > 0;
    await cliente.query(
      `INSERT INTO resumo_conclusao_historico
         (tabela, registro_id, evento, mfiles, drive, email, selecao_anterior, usuario, data_hora, num_documentos_analisados, obra_referencia)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        tabela, id, jaGeradoAntes ? "EDICAO_CANAIS" : "GERACAO_INICIAL",
        dados.mfiles ? 1 : 0, dados.drive ? 1 : 0, dados.email ? 1 : 0,
        jaGeradoAntes ? rotulosCanaisSelecionados(atual.resumo_mfiles, atual.resumo_drive, atual.resumo_email) : null,
        usuario, agora, dados.numDocumentosAnalisados, obraReferencia,
      ],
    );

    await cliente.query("COMMIT");
  } catch (exc) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw exc;
  } finally {
    cliente.release();
  }

  // Histórico de edições da própria AT (o mesmo consultado em
  // Administração → Histórico), uma linha por campo que mudou.
  const alterados: [string, unknown, unknown][] = [
    ["num_documentos_analisados", atual.num_documentos_analisados, dados.numDocumentosAnalisados],
    ["obra_referencia", atual.obra_referencia, obraReferencia],
  ];
  for (const [campo, anterior, novo] of alterados) {
    if (String(anterior ?? "") === String(novo ?? "")) continue;
    await pool.query(
      "INSERT INTO historico_edicoes (tabela, registro_id, campo, valor_anterior, valor_novo, usuario, data_hora) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [tabela, id, campo, anterior != null ? String(anterior) : null, novo != null ? String(novo) : null, usuario, agora],
    );
  }

  return {
    ...atual, status_analise: dados.status, data_analise: novaDataAnalise, num_at: dados.numAt.trim(),
    num_documentos_analisados: dados.numDocumentosAnalisados, obra_referencia: obraReferencia,
    anterior, baixaEm: agora,
  };
}

/** Desfaz a baixa que acabou de ser confirmada, devolvendo o registro ao
 * estado de antes. Só vale enquanto o registro ainda é o da baixa
 * (`baixaEm` precisa ser a última geração) — se alguém mexeu depois, não
 * desfaz. O histórico de baixas é preservado: entra um evento
 * BAIXA_DESFEITA em vez de apagar o evento original. */
export async function desfazerBaixaAnalise(
  tabela: TabelaBaixa, id: number, anterior: EstadoAnteriorBaixa, baixaEm: string, usuario: string,
): Promise<void> {
  validarTabela(tabela);
  if (!STATUS_VALIDOS.has(anterior.status_analise)) throw new Error("Estado anterior inválido.");
  const pool = obterPool();
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const { rowCount } = await cliente.query(
      `UPDATE ${tabela} SET status_analise = $1, data_analise = $2, num_at = $3, resumo_mfiles = $4, resumo_drive = $5, resumo_email = $6,
         resumo_qtd_geracoes = $7, resumo_ultima_geracao_em = $8, resumo_gerado_por = $9, num_documentos_analisados = $10,
         obra_referencia = $11, atualizado_em = $12, atualizado_por = $13
       WHERE id = $14 AND resumo_ultima_geracao_em = $15`,
      [
        anterior.status_analise, anterior.data_analise, anterior.num_at, anterior.resumo_mfiles ? 1 : 0, anterior.resumo_drive ? 1 : 0,
        anterior.resumo_email ? 1 : 0, anterior.resumo_qtd_geracoes, anterior.resumo_ultima_geracao_em, anterior.resumo_gerado_por,
        anterior.num_documentos_analisados, anterior.obra_referencia, anterior.atualizado_em, anterior.atualizado_por, id, baixaEm,
      ],
    );
    if (!rowCount) throw new Error("Esta baixa não pode mais ser desfeita: o registro foi alterado depois dela.");
    await cliente.query(
      `INSERT INTO resumo_conclusao_historico (tabela, registro_id, evento, mfiles, drive, email, selecao_anterior, usuario, data_hora)
       VALUES ($1,$2,'BAIXA_DESFEITA',$3,$4,$5,NULL,$6,$7)`,
      [tabela, id, anterior.resumo_mfiles ? 1 : 0, anterior.resumo_drive ? 1 : 0, anterior.resumo_email ? 1 : 0, usuario, new Date().toISOString()],
    );
    await cliente.query(
      `INSERT INTO historico_edicoes (tabela, registro_id, campo, valor_anterior, valor_novo, usuario, data_hora)
       VALUES ($1,$2,'baixa','concluída','desfeita',$3,$4)`,
      [tabela, id, usuario, new Date().toISOString()],
    );
    await cliente.query("COMMIT");
  } catch (exc) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw exc;
  } finally {
    cliente.release();
  }
}

function rotulosCanaisSelecionados(mfiles: boolean, drive: boolean, email: boolean): string | null {
  const rotulos: string[] = [];
  if (mfiles) rotulos.push("M-Files");
  if (drive) rotulos.push("Drive");
  if (email) rotulos.push("E-mail");
  return rotulos.length ? rotulos.join(", ") : "Nenhum canal";
}

export type EventoHistoricoBaixa = {
  id: number;
  tabela: string;
  registro_id: number;
  evento: string;
  mfiles: boolean;
  drive: boolean;
  email: boolean;
  selecao_anterior: string | null;
  usuario: string;
  data_hora: string;
  num_documentos_analisados: number | null;
  obra_referencia: string | null;
};

export async function listarHistoricoBaixa(tabela: TabelaBaixa, id: number): Promise<EventoHistoricoBaixa[]> {
  validarTabela(tabela);
  const pool = obterPool();
  const { rows } = await pool.query<EventoHistoricoBaixa>(
    `SELECT * FROM resumo_conclusao_historico WHERE tabela = $1 AND registro_id = $2 ORDER BY data_hora DESC`,
    [tabela, id],
  );
  return rows;
}
