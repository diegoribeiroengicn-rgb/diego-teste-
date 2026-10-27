import { obterPool } from "@/lib/db";
import { hojeBr } from "@/lib/dias-uteis";
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

/** Busca os campos do registro necessários para montar o texto da baixa —
 * nome da entidade e "obra/tipo" vêm de colunas diferentes em
 * prestadores (prestador/obra_referencia) e cessionarios
 * (cessionario/tipo). */
export async function obterRegistroParaBaixa(tabela: TabelaBaixa, id: number): Promise<RegistroBaixa | null> {
  validarTabela(tabela);
  const pool = obterPool();
  const colunaNome = tabela === "prestadores" ? "prestador" : "cessionario";
  const colunaObra = tabela === "prestadores" ? "obra_referencia" : "tipo";
  const { rows } = await pool.query<RegistroBaixa>(
    `SELECT id, codigo, revisao, num_at, disciplina, status_analise, data_analise,
            "${colunaNome}" AS nome_entidade, "${colunaObra}" AS obra_referencia,
            resumo_mfiles, resumo_drive, resumo_email, resumo_qtd_geracoes
     FROM ${tabela} WHERE id = $1 AND arquivado_em IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export type DadosDarBaixa = { status: string; codigoDisciplina: string; mfiles: boolean; drive: boolean; email: boolean };

/** Dá baixa na análise: grava o status final escolhido (marcando a data
 * de conclusão quando ainda não havia uma, ou quando o status muda),
 * salva a seleção de canais de disponibilização e registra o evento no
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

  await pool.query(
    `UPDATE ${tabela} SET status_analise = $1, data_analise = $2, resumo_mfiles = $3, resumo_drive = $4, resumo_email = $5,
       resumo_ultima_geracao_em = $6, resumo_gerado_por = $7, resumo_qtd_geracoes = resumo_qtd_geracoes + 1,
       atualizado_em = $6, atualizado_por = $7
     WHERE id = $8`,
    [dados.status, novaDataAnalise, dados.mfiles, dados.drive, dados.email, agora, usuario, id],
  );

  const jaGeradoAntes = atual.resumo_qtd_geracoes > 0;
  await pool.query(
    `INSERT INTO resumo_conclusao_historico (tabela, registro_id, evento, mfiles, drive, email, selecao_anterior, usuario, data_hora)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      tabela, id, jaGeradoAntes ? "EDICAO_CANAIS" : "GERACAO_INICIAL",
      dados.mfiles, dados.drive, dados.email,
      jaGeradoAntes ? rotulosCanaisSelecionados(atual.resumo_mfiles, atual.resumo_drive, atual.resumo_email) : null,
      usuario, agora,
    ],
  );

  return { ...atual, status_analise: dados.status, data_analise: novaDataAnalise };
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
