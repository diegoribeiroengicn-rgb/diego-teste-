import { obterPool } from "@/lib/db";

export type Atividade = {
  id: number;
  usuario: string;
  perfil: string | null;
  tipo_evento: string;
  modulo: string | null;
  detalhe: string | null;
  data_hora: string;
};

export async function buscarAtividades(): Promise<Atividade[]> {
  const pool = obterPool();
  const { rows } = await pool.query<Atividade>(
    "SELECT id, usuario, perfil, tipo_evento, modulo, detalhe, data_hora FROM atividades_usuario ORDER BY data_hora DESC LIMIT 2000",
  );
  return rows;
}

/** Best-effort — nunca deve interromper o fluxo que a chama se a
 * gravação falhar (mesmo espírito de `gat.database.registrar_atividade`,
 * que também nunca é crítico para a ação em si). */
export async function registrarAtividade(
  usuario: string,
  perfil: string | null,
  tipoEvento: string,
  modulo?: string | null,
  detalhe?: string | null,
): Promise<void> {
  try {
    const pool = obterPool();
    await pool.query(
      "INSERT INTO atividades_usuario (usuario, perfil, tipo_evento, modulo, detalhe, data_hora) VALUES ($1,$2,$3,$4,$5,$6)",
      [usuario, perfil, tipoEvento, modulo ?? null, detalhe ?? null, new Date().toISOString()],
    );
  } catch (exc) {
    console.error("[atividades] falha ao registrar atividade:", exc);
  }
}
