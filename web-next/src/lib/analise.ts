import { obterPool } from "@/lib/db";

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
  "codigo", "prestador", "disciplina", "disciplina_sla", "peps", "obra_referencia", "revisao", "num_documentos",
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
export async function inserirPrestador(dados: DadosPrestador, usuario: string): Promise<number> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const { rows: maiorItem } = await pool.query<{ m: number }>("SELECT COALESCE(MAX(item), 0) AS m FROM prestadores");
  const item = maiorItem[0].m + 1;

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
export async function inserirCessionario(dados: DadosCessionario, usuario: string): Promise<number> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const { rows: maiorItem } = await pool.query<{ m: number }>("SELECT COALESCE(MAX(item), 0) AS m FROM cessionarios");
  const item = maiorItem[0].m + 1;

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
