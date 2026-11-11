import { obterPool } from "@/lib/db";
import { hojeBr } from "@/lib/dias-uteis";
import { garantirColunasBaixa } from "@/lib/esquema-baixa";
import type { DadosBaixa } from "@/lib/resumo-conclusao-calculo";

export type TabelaBaixa = "prestadores" | "cessionarios";

const TABELAS_BAIXA = new Set<string>(["prestadores", "cessionarios"]);

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
export async function darBaixaAnalise(tabela: TabelaBaixa, id: number, dados: DadosDarBaixa, usuario: string): Promise<RegistroBaixa> {
  validarTabela(tabela);
  const pool = obterPool();
  const atual = await obterRegistroParaBaixa(tabela, id);
  if (!atual) throw new Error("Registro não encontrado.");

  const agora = new Date().toISOString();
  const mudouStatus = atual.status_analise !== dados.status;
  const novaDataAnalise = atual.data_analise && !mudouStatus ? atual.data_analise : hojeBr().toISOString().slice(0, 10);
  const obraReferencia = dados.obraReferencia.trim() || null;

  await pool.query(
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
  await pool.query(
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
  };
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
