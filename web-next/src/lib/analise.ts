import { obterPool } from "@/lib/db";
import { calcularDataLimite } from "@/lib/dias-uteis";
import { SLA_PRESTADORES_DIAS_UTEIS } from "@/lib/analise-validacao-calculo";

/** Grava uma linha de histórico por campo alterado — mesma regra de
 * gat/database.py::_registrar_historico, reaproveitada aqui pelo CRUD de
 * análises (Prestadores/Cessionários). */
async function registrarHistorico(
  tabela: string, registroId: number, antigo: Record<string, unknown>, novo: Record<string, unknown>, usuario: string,
): Promise<void> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  for (const [campo, valorNovo] of Object.entries(novo)) {
    const valorAntigo = antigo[campo] ?? null;
    if (String(valorAntigo) === String(valorNovo)) continue;
    await pool.query(
      "INSERT INTO historico_edicoes (tabela, registro_id, campo, valor_anterior, valor_novo, usuario, data_hora) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [tabela, registroId, campo, valorAntigo != null ? String(valorAntigo) : null, valorNovo != null ? String(valorNovo) : null, usuario, agora],
    );
  }
}

// ---------------------------------------------------------------------------
// Prestadores
// ---------------------------------------------------------------------------

export type DadosPrestador = {
  codigo: string | null;
  prestador: string;
  disciplina: string | null;
  disciplina_sla: string | null;
  peps: string | null;
  obra_referencia: string | null;
  obra_id: number | null;
  revisao: number;
  num_documentos: number;
  data_solicitacao: string;
  data_limite: string | null;
  data_analise: string | null;
  hold_inicio: string | null;
  hold_fim: string | null;
  num_at: string | null;
  revisao_at: number | null;
  responsavel: string | null;
  status_analise: string;
  observacoes: string | null;
  natureza_revisao: string | null;
  num_erros: number | null;
  etg: string;
};

export const COLUNAS_PRESTADOR = [
  "codigo", "prestador", "disciplina", "disciplina_sla", "peps", "obra_referencia", "obra_id", "revisao", "num_documentos",
  "data_solicitacao", "data_limite", "data_analise", "hold_inicio", "hold_fim", "num_at", "revisao_at",
  "responsavel", "status_analise", "observacoes", "natureza_revisao", "num_erros", "etg",
] as const;

export async function obterPrestadorCompleto(id: number): Promise<(DadosPrestador & { id: number; item: number | null }) | null> {
  const pool = obterPool();
  const { rows } = await pool.query("SELECT * FROM prestadores WHERE id = $1 AND arquivado_em IS NULL", [id]);
  return rows[0] ?? null;
}

/** Cadastra uma nova análise de prestador — mesma regra de
 * gat/database.py::inserir_prestador (incl. item sequencial automático
 * quando não informado). Escopo deste primeiro incremento: só os campos
 * essenciais (COLUNAS_PRESTADOR) — vínculo a Cadastro de Prestador, Obra
 * vinculada, nível de prioridade/SLA reduzido com justificativa e
 * repactuação de prazo ficam para um próximo incremento. */
export async function inserirPrestador(dados: DadosPrestador, usuario: string, itemPlanilha: number | null = null): Promise<number> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const { rows: maiorItem } = await pool.query<{ m: number }>("SELECT COALESCE(MAX(item), 0) AS m FROM prestadores");
  // Vindo da planilha, o registro guarda o Item que ela traz; cadastrado
  // pelo sistema, continua recebendo o próximo número.
  const item = itemPlanilha ?? maiorItem[0].m + 1;

  const valores = COLUNAS_PRESTADOR.map((c) => dados[c] ?? null);
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO prestadores (item, ${COLUNAS_PRESTADOR.join(", ")}, criado_em, criado_por, atualizado_em, atualizado_por) ` +
      `VALUES ($1, ${COLUNAS_PRESTADOR.map((_, i) => `$${i + 2}`).join(", ")}, $${COLUNAS_PRESTADOR.length + 2}, $${COLUNAS_PRESTADOR.length + 3}, $${COLUNAS_PRESTADOR.length + 2}, $${COLUNAS_PRESTADOR.length + 3}) ` +
      "RETURNING id",
    [item, ...valores, agora, usuario],
  );
  const id = rows[0].id;
  const campos = Object.fromEntries(COLUNAS_PRESTADOR.map((c) => [c, dados[c] ?? null]));
  await registrarHistorico("prestadores", id, {}, { item, ...campos }, usuario);
  return id;
}

export async function atualizarPrestador(id: number, dados: DadosPrestador, usuario: string): Promise<void> {
  const pool = obterPool();
  const { rows: antigas } = await pool.query("SELECT * FROM prestadores WHERE id = $1", [id]);
  const antigo = antigas[0] ?? {};
  const agora = new Date().toISOString();

  const setClause = COLUNAS_PRESTADOR.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const valores = COLUNAS_PRESTADOR.map((c) => dados[c] ?? null);
  await pool.query(
    `UPDATE prestadores SET ${setClause}, atualizado_em = $${COLUNAS_PRESTADOR.length + 1}, atualizado_por = $${COLUNAS_PRESTADOR.length + 2} WHERE id = $${COLUNAS_PRESTADOR.length + 3}`,
    [...valores, agora, usuario, id],
  );
  const campos = Object.fromEntries(COLUNAS_PRESTADOR.map((c) => [c, dados[c] ?? null]));
  await registrarHistorico("prestadores", id, antigo, campos, usuario);
}

// ---------------------------------------------------------------------------
// Cessionários
// ---------------------------------------------------------------------------

export type DadosCessionario = {
  codigo: string | null;
  cessionario: string;
  disciplina: string | null;
  disciplina_sla: string | null;
  revisao: number;
  num_documentos: number;
  data_solicitacao: string;
  tipo: string | null;
  sla_dias: number | null;
  data_limite: string | null;
  data_analise: string | null;
  hold_inicio: string | null;
  hold_fim: string | null;
  num_at: string | null;
  revisao_at: number | null;
  responsavel: string | null;
  status_analise: string;
  observacoes: string | null;
  natureza_revisao: string | null;
  num_erros: number | null;
  etg: string;
};

export const COLUNAS_CESSIONARIO = [
  "codigo", "cessionario", "disciplina", "disciplina_sla", "revisao", "num_documentos", "data_solicitacao",
  "tipo", "sla_dias", "data_limite", "data_analise", "hold_inicio", "hold_fim", "num_at", "revisao_at",
  "responsavel", "status_analise", "observacoes", "natureza_revisao", "num_erros", "etg",
] as const;

export async function obterCessionarioCompleto(id: number): Promise<(DadosCessionario & { id: number; item: number | null }) | null> {
  const pool = obterPool();
  const { rows } = await pool.query("SELECT * FROM cessionarios WHERE id = $1 AND arquivado_em IS NULL", [id]);
  return rows[0] ?? null;
}

/** Mesma regra de gat/database.py::inserir_cessionario — mesmo escopo
 * reduzido de `inserirPrestador` (vínculo a Cadastro de Cessionário, RCI/
 * RVP/LUC e repactuação de prazo ficam para um próximo incremento). */
export async function inserirCessionario(dados: DadosCessionario, usuario: string, itemPlanilha: number | null = null): Promise<number> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const { rows: maiorItem } = await pool.query<{ m: number }>("SELECT COALESCE(MAX(item), 0) AS m FROM cessionarios");
  const item = itemPlanilha ?? maiorItem[0].m + 1;

  const valores = COLUNAS_CESSIONARIO.map((c) => dados[c] ?? null);
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO cessionarios (item, ${COLUNAS_CESSIONARIO.join(", ")}, criado_em, criado_por, atualizado_em, atualizado_por) ` +
      `VALUES ($1, ${COLUNAS_CESSIONARIO.map((_, i) => `$${i + 2}`).join(", ")}, $${COLUNAS_CESSIONARIO.length + 2}, $${COLUNAS_CESSIONARIO.length + 3}, $${COLUNAS_CESSIONARIO.length + 2}, $${COLUNAS_CESSIONARIO.length + 3}) ` +
      "RETURNING id",
    [item, ...valores, agora, usuario],
  );
  const id = rows[0].id;
  const campos = Object.fromEntries(COLUNAS_CESSIONARIO.map((c) => [c, dados[c] ?? null]));
  await registrarHistorico("cessionarios", id, {}, { item, ...campos }, usuario);
  return id;
}

export async function atualizarCessionario(id: number, dados: DadosCessionario, usuario: string): Promise<void> {
  const pool = obterPool();
  const { rows: antigas } = await pool.query("SELECT * FROM cessionarios WHERE id = $1", [id]);
  const antigo = antigas[0] ?? {};
  const agora = new Date().toISOString();

  const setClause = COLUNAS_CESSIONARIO.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const valores = COLUNAS_CESSIONARIO.map((c) => dados[c] ?? null);
  await pool.query(
    `UPDATE cessionarios SET ${setClause}, atualizado_em = $${COLUNAS_CESSIONARIO.length + 1}, atualizado_por = $${COLUNAS_CESSIONARIO.length + 2} WHERE id = $${COLUNAS_CESSIONARIO.length + 3}`,
    [...valores, agora, usuario, id],
  );
  const campos = Object.fromEntries(COLUNAS_CESSIONARIO.map((c) => [c, dados[c] ?? null]));
  await registrarHistorico("cessionarios", id, antigo, campos, usuario);
}

// ---------------------------------------------------------------------------
// Prioridade (Prestadores) — nível 1/2/3 lido por Lista de Prioridades, Visão
// do Gestor, Alertas e Gantt (coluna única `prestadores.nivel_prioridade`).
// ---------------------------------------------------------------------------

export const SLA_POR_NIVEL_PRIORIDADE: Record<number, number> = { 3: 7, 2: 5, 1: 3 };
const STATUS_ABERTOS = ["EM ANÁLISE", "EM HOLD", "RIOGALEÃO"];

/** Define (ou remove, com `nivel = null`) o nível de prioridade de uma
 * análise de Prestador; com `aplicarAoCodigo`, também das demais análises
 * em aberto do mesmo código. Segue a regra do sistema anterior: nível
 * 3/2/1 = SLA de 7/5/3 dias úteis; sem prioridade volta ao SLA original.
 * A data limite só é recalculada onde não foi ajustada manualmente. Grava
 * em colunas próprias — não passa por `atualizarPrestador`, então a
 * importação de planilha nunca apaga a prioridade. */
export async function definirPrioridadePrestador(
  id: number, nivel: number | null, justificativa: string | null, aplicarAoCodigo: boolean, usuario: string,
): Promise<number> {
  const pool = obterPool();
  const { rows: base } = await pool.query("SELECT id, codigo FROM prestadores WHERE id = $1 AND arquivado_em IS NULL", [id]);
  if (!base[0]) throw new Error("Registro não encontrado.");
  const { rows: alvos } = aplicarAoCodigo && base[0].codigo
    ? await pool.query(
        "SELECT * FROM prestadores WHERE arquivado_em IS NULL AND (id = $1 OR (codigo = $2 AND status_analise = ANY($3)))",
        [id, base[0].codigo, STATUS_ABERTOS],
      )
    : await pool.query("SELECT * FROM prestadores WHERE id = $1", [id]);

  const agora = new Date().toISOString();
  for (const r of alvos) {
    const original = r.sla_original ?? r.sla_dias ?? SLA_PRESTADORES_DIAS_UTEIS;
    const sla = nivel ? SLA_POR_NIVEL_PRIORIDADE[nivel] : original;
    const limite = r.data_limite_ajustada_manualmente || !r.data_solicitacao
      ? r.data_limite
      : calcularDataLimite(r.data_solicitacao, sla)?.toISOString().slice(0, 10) ?? r.data_limite;
    await pool.query(
      `UPDATE prestadores SET nivel_prioridade = $1, sla_dias = $2, sla_original = COALESCE(sla_original, $3),
         data_limite = $4, justificativa_sla = $5, sla_alterado_por = $6, sla_alterado_em = $7,
         atualizado_em = $7, atualizado_por = $6 WHERE id = $8`,
      [nivel, sla, original, limite, nivel ? (justificativa?.trim() || null) : null, usuario, agora, r.id],
    );
    await registrarHistorico("prestadores", r.id, r, { nivel_prioridade: nivel, sla_dias: sla, data_limite: limite }, usuario);
  }
  return alvos.length;
}

/** Define (ou remove) a prioridade de TODAS as análises em aberto de um
 * código de prestador — usada pela tela de prioridades do Gantt. */
export async function definirPrioridadePorCodigo(
  codigo: string, nivel: number | null, justificativa: string | null, usuario: string,
): Promise<number> {
  const pool = obterPool();
  const { rows } = await pool.query(
    "SELECT id FROM prestadores WHERE arquivado_em IS NULL AND codigo = $1 AND status_analise = ANY($2) ORDER BY id LIMIT 1",
    [codigo, STATUS_ABERTOS],
  );
  if (!rows[0]) throw new Error(`Nenhuma análise em aberto para o código ${codigo}.`);
  return definirPrioridadePrestador(rows[0].id, nivel, justificativa, true, usuario);
}
