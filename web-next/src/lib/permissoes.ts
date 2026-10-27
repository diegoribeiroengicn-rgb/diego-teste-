import { obterPool } from "@/lib/db";

const PERFIL_ADMIN = "ADMIN";

/** Permissão por área (`permissoes_area`) — Administrador sempre tem
 * acesso; para os demais perfis, uma área sem registro próprio é
 * liberada por padrão, exceto quando uma migração já gravou
 * explicitamente `permitido = false` (ex.: áreas sensíveis como
 * analistas.notas, bloqueadas por padrão na ativação da regra). Mesma
 * regra de gat/database.py::area_permitida. */
export async function areaPermitida(usuarioId: number, perfil: string, area: string): Promise<boolean> {
  if (perfil === PERFIL_ADMIN) return true;
  const pool = obterPool();
  const { rows } = await pool.query<{ permitido: boolean }>(
    "SELECT permitido FROM permissoes_area WHERE usuario_id = $1 AND area = $2",
    [usuarioId, area],
  );
  if (rows.length === 0) return true;
  return !!rows[0].permitido;
}
