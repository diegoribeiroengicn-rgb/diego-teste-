import { obterPool } from "@/lib/db";
import { CAMPOS_ALERTA_MANUAL, type DadosAlertaManual } from "@/lib/alerta-manual-calculo";

/** Grava uma linha de histórico por campo alterado — mesmo padrão já
 * usado em lib/analise.ts/lib/pmo.ts (porta de
 * gat/database.py::_registrar_historico). */
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

export type AlertaManualCompleto = DadosAlertaManual & {
  id: number;
  status: "ABERTO" | "ENCERRADO";
  criado_por: string;
  criado_em: string;
  atualizado_por: string | null;
  atualizado_em: string | null;
  encerrado_por: string | null;
  encerrado_em: string | null;
  motivo_encerramento: string | null;
};

/** Mesma regra de gat/database.py::criar_alerta_manual. */
export async function criarAlertaManual(dados: DadosAlertaManual, usuario: string): Promise<number> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const valores = CAMPOS_ALERTA_MANUAL.map((c) => dados[c] ?? null);
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO alertas_manuais (${CAMPOS_ALERTA_MANUAL.join(", ")}, status, criado_por, criado_em) ` +
      `VALUES (${CAMPOS_ALERTA_MANUAL.map((_, i) => `$${i + 1}`).join(", ")}, 'ABERTO', $${CAMPOS_ALERTA_MANUAL.length + 1}, $${CAMPOS_ALERTA_MANUAL.length + 2}) ` +
      "RETURNING id",
    [...valores, usuario, agora],
  );
  const id = rows[0].id;
  const campos = Object.fromEntries(CAMPOS_ALERTA_MANUAL.map((c) => [c, dados[c] ?? null]));
  await registrarHistorico("alertas_manuais", id, {}, { status: "ABERTO", ...campos }, usuario);
  return id;
}

export async function obterAlertaManual(id: number): Promise<AlertaManualCompleto | null> {
  const pool = obterPool();
  const { rows } = await pool.query<AlertaManualCompleto>(
    "SELECT * FROM alertas_manuais WHERE id = $1 AND arquivado_em IS NULL", [id],
  );
  return rows[0] ?? null;
}

/** Mesma regra de gat/database.py::atualizar_alerta_manual. */
export async function atualizarAlertaManual(id: number, dados: DadosAlertaManual, usuario: string): Promise<void> {
  const pool = obterPool();
  const { rows: antigas } = await pool.query("SELECT * FROM alertas_manuais WHERE id = $1", [id]);
  const antigo = antigas[0] ?? {};
  const agora = new Date().toISOString();

  const setClause = CAMPOS_ALERTA_MANUAL.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const valores = CAMPOS_ALERTA_MANUAL.map((c) => dados[c] ?? null);
  await pool.query(
    `UPDATE alertas_manuais SET ${setClause}, atualizado_por = $${CAMPOS_ALERTA_MANUAL.length + 1}, atualizado_em = $${CAMPOS_ALERTA_MANUAL.length + 2} WHERE id = $${CAMPOS_ALERTA_MANUAL.length + 3}`,
    [...valores, usuario, agora, id],
  );
  const campos = Object.fromEntries(CAMPOS_ALERTA_MANUAL.map((c) => [c, dados[c] ?? null]));
  await registrarHistorico("alertas_manuais", id, antigo, campos, usuario);
}

/** Mesma regra de gat/database.py::encerrar_alerta_manual. */
export async function encerrarAlertaManual(id: number, motivo: string, usuario: string): Promise<void> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  await pool.query(
    "UPDATE alertas_manuais SET status = 'ENCERRADO', motivo_encerramento = $1, encerrado_por = $2, encerrado_em = $3 WHERE id = $4",
    [motivo, usuario, agora, id],
  );
  await registrarHistorico("alertas_manuais", id, { status: "ABERTO" }, { status: "ENCERRADO", motivo_encerramento: motivo }, usuario);
}

/** Mesma regra de gat/database.py::reabrir_alerta_manual. */
export async function reabrirAlertaManual(id: number, usuario: string): Promise<void> {
  const pool = obterPool();
  await pool.query(
    "UPDATE alertas_manuais SET status = 'ABERTO', motivo_encerramento = NULL, encerrado_por = NULL, encerrado_em = NULL WHERE id = $1",
    [id],
  );
  await registrarHistorico("alertas_manuais", id, { status: "ENCERRADO" }, { status: "ABERTO" }, usuario);
}

/** Só alertas ativos (não arquivados) — mesma regra de
 * gat/database.py::listar_alertas_manuais, aqui já filtrando pelos
 * módulos informados (Prestadores/Cessionários; o PMO usa seu próprio
 * listarAlertasPmo em lib/pmo.ts). */
export async function listarAlertasManuais(modulos: ("prestadores" | "cessionarios")[]): Promise<AlertaManualCompleto[]> {
  if (!modulos.length) return [];
  const pool = obterPool();
  const { rows } = await pool.query<AlertaManualCompleto>(
    "SELECT * FROM alertas_manuais WHERE arquivado_em IS NULL AND modulo = ANY($1) ORDER BY criado_em DESC",
    [modulos],
  );
  return rows;
}
