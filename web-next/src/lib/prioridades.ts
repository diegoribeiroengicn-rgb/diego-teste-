import { obterPool } from "@/lib/db";
import { garantirEsquemaPrioridades } from "@/lib/esquema-prioridades";
import { diasUteisEntre } from "@/lib/dias-uteis";
import { nivelPorSlaOperacional, slaContratual, vencimentoContratual, type TabelaPrazo } from "@/lib/prazos-calculo";
import { PERFIL_ADMIN, PERFIL_GESTOR } from "@/lib/administracao-calculo";

export type OrigemPrioridade = "IMPORTACAO" | "LISTAGEM" | "GESTAO";
export type TipoPrioridade = "ANALISE" | "DOCUMENTO" | "PRESTADOR";

export type PrioridadeAnalise = {
  id: number; tipo: TipoPrioridade; tabela: TabelaPrazo; registro_id: number | null; codigo: string | null;
  disciplina: string | null; revisao: number | null; origem: OrigemPrioridade; sla_operacional_dias: number | null;
  data_entrega_operacional: string | null; vencimento_operacional: string | null; justificativa: string | null;
  ativo: number; criado_em: string; criado_por: string; atualizado_em: string | null; atualizado_por: string | null;
  /** Só devolvidos a quem pode ver o contratual (gestor/admin). */
  vencimento_contratual?: string | null; data_planilha_original?: string | null;
};

/** Quem pode ver SLA/vencimento contratual: Admin sempre; Gestor por padrão
 * (a menos que a área 'sla.contratual' esteja negada); Analista e Consulta
 * SOMENTE com liberação explícita — o inverso do padrão das demais áreas. */
export async function podeVerContratual(usuarioId: number, perfil: string): Promise<boolean> {
  if (perfil === PERFIL_ADMIN) return true;
  const { rows } = await obterPool().query<{ permitido: number | boolean }>(
    "SELECT permitido FROM permissoes_area WHERE usuario_id = $1 AND area = 'sla.contratual'", [usuarioId],
  );
  if (rows.length) return !!rows[0].permitido;
  return perfil === PERFIL_GESTOR;
}

export const CAMPOS_CONTRATUAIS = ["sla_original", "data_limite_original", "vencimento_contratual", "data_planilha_original"];

/** Remove de um registro os campos que expõem o prazo contratual. */
export function semContratual<T extends Record<string, unknown>>(registro: T): T {
  const copia: Record<string, unknown> = { ...registro };
  for (const c of CAMPOS_CONTRATUAIS) delete copia[c];
  return copia as T;
}

async function historico(tabela: string, id: number, campo: string, antes: unknown, depois: unknown, usuario: string) {
  await obterPool().query(
    "INSERT INTO historico_edicoes (tabela, registro_id, campo, valor_anterior, valor_novo, usuario, data_hora) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [tabela, id, campo, antes != null ? String(antes) : null, depois != null ? String(depois) : null, usuario, new Date().toISOString()],
  );
}

export type EntradaPrioridade = {
  tabela: TabelaPrazo; registroId: number; origem: OrigemPrioridade;
  /** Informe a data operacional OU o SLA operacional (dias úteis). */
  dataEntregaOperacional?: string | null; slaOperacionalDias?: number | null;
  justificativa?: string | null; dataPlanilhaOriginal?: string | null;
};

/** Cria ou altera a prioridade de UMA análise (a linha). Mantém os dois
 * prazos independentes: o contratual é recalculado pela regra e nunca é
 * sobrescrito; o operacional vira `data_limite` (a referência do analista). */
export async function definirPrioridadeAnalise(e: EntradaPrioridade, usuario: string): Promise<PrioridadeAnalise> {
  await garantirEsquemaPrioridades();
  const pool = obterPool();
  const { rows } = await pool.query(`SELECT * FROM ${e.tabela} WHERE id = $1`, [e.registroId]);
  const r = rows[0];
  if (!r) throw new Error("Análise não encontrada.");
  if (r.arquivado_em) throw new Error("Análise arquivada não pode receber prioridade.");
  if (!r.data_solicitacao) throw new Error("A análise não tem data de solicitação.");

  const slaC = slaContratual(e.tabela, r.tipo ?? null, r.revisao ?? 0);
  const vencC = vencimentoContratual(r.data_solicitacao, slaC);
  let sla = e.slaOperacionalDias ?? null;
  let data = e.dataEntregaOperacional?.slice(0, 10) ?? null;
  if (!data && sla) data = vencimentoContratual(r.data_solicitacao, sla);
  if (!data) throw new Error("Informe a data de entrega operacional ou o SLA operacional.");
  if (data < String(r.data_solicitacao).slice(0, 10)) throw new Error("A data operacional não pode ser anterior à data de solicitação.");
  if (!sla) sla = Math.max(1, diasUteisEntre(r.data_solicitacao, data));

  const agora = new Date().toISOString();
  const { rows: ativas } = await pool.query("SELECT * FROM prioridades_operacionais WHERE tipo='ANALISE' AND tabela=$1 AND registro_id=$2 AND ativo=1", [e.tabela, e.registroId]);
  let id: number;
  if (ativas[0]) {
    id = ativas[0].id;
    await pool.query(
      `UPDATE prioridades_operacionais SET sla_operacional_dias=$1, data_entrega_operacional=$2, vencimento_operacional=$2, vencimento_contratual=$3,
         justificativa=$4, atualizado_em=$5, atualizado_por=$6 WHERE id=$7`,
      [sla, data, vencC, e.justificativa ?? null, agora, usuario, id],
    );
  } else {
    const ins = await pool.query(
      `INSERT INTO prioridades_operacionais (tipo, tabela, registro_id, codigo, disciplina, revisao, origem, sla_operacional_dias, data_entrega_operacional,
         vencimento_operacional, vencimento_contratual, data_planilha_original, justificativa, criado_em, criado_por)
       VALUES ('ANALISE',$1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [e.tabela, e.registroId, r.codigo, r.disciplina, r.revisao, e.origem, sla, data, vencC, e.dataPlanilhaOriginal ?? null, e.justificativa ?? null, agora, usuario],
    );
    id = ins.rows[0].id;
  }

  // Materializa na linha (colunas já lidas por Gantt, Lista de Prioridades etc.).
  await pool.query(
    `UPDATE ${e.tabela} SET nivel_prioridade = $1, sla_reduzido = 1, sla_dias = $2, sla_original = COALESCE(sla_original, $3),
       data_limite_original = COALESCE(data_limite_original, $4), data_limite = $5, justificativa_sla = $6,
       sla_alterado_por = $7, sla_alterado_em = $8, data_limite_ajustada_manualmente = 1, atualizado_em = $8, atualizado_por = $7 WHERE id = $9`,
    [nivelPorSlaOperacional(sla), sla, slaC, vencC, data, e.justificativa ?? null, usuario, agora, e.registroId],
  );
  await historico(e.tabela, e.registroId, "prioridade_operacional", ativas[0]?.vencimento_operacional ?? null, data, usuario);
  const { rows: salva } = await pool.query("SELECT * FROM prioridades_operacionais WHERE id = $1", [id]);
  return salva[0];
}

/** Remove a prioridade (reversível pelo histórico) e devolve a linha ao prazo
 * contratual/padrão — o registro da prioridade é preservado como inativo. */
export async function removerPrioridadeAnalise(tabela: TabelaPrazo, registroId: number, usuario: string): Promise<void> {
  await garantirEsquemaPrioridades();
  const pool = obterPool();
  const { rows } = await pool.query(`SELECT * FROM ${tabela} WHERE id = $1`, [registroId]);
  const r = rows[0];
  if (!r) throw new Error("Análise não encontrada.");
  const agora = new Date().toISOString();
  const { rowCount } = await pool.query(
    "UPDATE prioridades_operacionais SET ativo=0, removido_em=$1, removido_por=$2 WHERE tipo='ANALISE' AND tabela=$3 AND registro_id=$4 AND ativo=1",
    [agora, usuario, tabela, registroId],
  );
  if (!rowCount) return;
  const slaC = slaContratual(tabela, r.tipo ?? null, r.revisao ?? 0);
  const vencC = vencimentoContratual(r.data_solicitacao, slaC);
  await pool.query(
    `UPDATE ${tabela} SET nivel_prioridade = NULL, sla_reduzido = 0, sla_dias = $1, data_limite = $2, justificativa_sla = NULL,
       data_limite_ajustada_manualmente = 0, atualizado_em = $3, atualizado_por = $4 WHERE id = $5`,
    [slaC, vencC, agora, usuario, registroId],
  );
  await historico(tabela, registroId, "prioridade_operacional", r.data_limite, vencC, usuario);
}

export async function prioridadeDaAnalise(tabela: TabelaPrazo, registroId: number, verContratual: boolean): Promise<PrioridadeAnalise | null> {
  await garantirEsquemaPrioridades();
  const { rows } = await obterPool().query("SELECT * FROM prioridades_operacionais WHERE tipo='ANALISE' AND tabela=$1 AND registro_id=$2 AND ativo=1", [tabela, registroId]);
  if (!rows[0]) return null;
  return verContratual ? rows[0] : semContratual(rows[0]);
}

export async function historicoPrioridade(tabela: TabelaPrazo, registroId: number): Promise<{ campo: string; valor_anterior: string | null; valor_novo: string | null; usuario: string; data_hora: string }[]> {
  const { rows } = await obterPool().query(
    "SELECT campo, valor_anterior, valor_novo, usuario, data_hora FROM historico_edicoes WHERE tabela=$1 AND registro_id=$2 AND campo='prioridade_operacional' ORDER BY data_hora DESC",
    [tabela, registroId],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Prioridade de PRESTADOR e de DOCUMENTO/PROJETO — marcadores independentes:
// não geram prioridade em nenhuma análise (a prioridade da análise é sempre
// registrada individualmente). Aparecem como ☆ nos Gantts e nos indicadores.
// ---------------------------------------------------------------------------

export type TipoMarcador = "PRESTADOR" | "DOCUMENTO";

export async function definirMarcadorPrioridade(
  tipo: TipoMarcador, tabela: TabelaPrazo, chave: string, justificativa: string | null, origem: OrigemPrioridade, usuario: string,
): Promise<void> {
  await garantirEsquemaPrioridades();
  const pool = obterPool();
  const k = chave.trim();
  if (!k) throw new Error("Informe o projeto ou o prestador.");
  const agora = new Date().toISOString();
  const { rows } = await pool.query("SELECT id FROM prioridades_operacionais WHERE tipo=$1 AND tabela=$2 AND codigo=$3 AND ativo=1", [tipo, tabela, k]);
  if (rows[0]) {
    await pool.query("UPDATE prioridades_operacionais SET justificativa=$1, atualizado_em=$2, atualizado_por=$3 WHERE id=$4", [justificativa, agora, usuario, rows[0].id]);
  } else {
    await pool.query(
      `INSERT INTO prioridades_operacionais (tipo, tabela, codigo, origem, justificativa, criado_em, criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [tipo, tabela, k, origem, justificativa, agora, usuario],
    );
  }
  await historico(tabela, 0, `prioridade_${tipo.toLowerCase()}`, null, `${k}: definida`, usuario);
}

export async function removerMarcadorPrioridade(tipo: TipoMarcador, tabela: TabelaPrazo, chave: string, usuario: string): Promise<void> {
  await garantirEsquemaPrioridades();
  const agora = new Date().toISOString();
  const { rowCount } = await obterPool().query(
    "UPDATE prioridades_operacionais SET ativo=0, removido_em=$1, removido_por=$2 WHERE tipo=$3 AND tabela=$4 AND codigo=$5 AND ativo=1",
    [agora, usuario, tipo, tabela, chave.trim()],
  );
  if (rowCount) await historico(tabela, 0, `prioridade_${tipo.toLowerCase()}`, `${chave}: definida`, null, usuario);
}

export type MarcadoresPrioridade = { documentos: string[]; prestadores: string[] };

export async function marcadoresPrioridade(tabela: TabelaPrazo): Promise<MarcadoresPrioridade> {
  await garantirEsquemaPrioridades();
  const { rows } = await obterPool().query("SELECT tipo, codigo FROM prioridades_operacionais WHERE tabela=$1 AND tipo IN ('DOCUMENTO','PRESTADOR') AND ativo=1", [tabela]);
  return {
    documentos: rows.filter((r) => r.tipo === "DOCUMENTO").map((r) => String(r.codigo)),
    prestadores: rows.filter((r) => r.tipo === "PRESTADOR").map((r) => String(r.codigo)),
  };
}

/** Marcadores ativos de um projeto/prestador (para o pop-up da listagem). */
export async function marcadoresDaAnalise(tabela: TabelaPrazo, codigo: string | null, entidade: string | null) {
  const m = await marcadoresPrioridade(tabela);
  return { documento: !!codigo && m.documentos.includes(codigo), prestador: !!entidade && m.prestadores.includes(entidade) };
}
