import { obterPool } from "@/lib/db";
import { MODULOS_CONTROLADOS, AREAS_PERMISSAO, PERFIS_PADRAO } from "@/lib/administracao-calculo";

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

export type PermissoesUsuario = { modulos: Record<string, boolean>; areas: Record<string, boolean> };

/** Permissões efetivas do usuário — módulo/área sem linha própria herda
 * o padrão liberado. Mesma regra de gat/database.py::permissoes_usuario. */
export async function permissoesUsuario(usuarioId: number): Promise<PermissoesUsuario> {
  const pool = obterPool();
  const [resModulos, resAreas] = await Promise.all([
    pool.query<{ modulo: string; permitido: boolean }>("SELECT modulo, permitido FROM permissoes_modulo WHERE usuario_id = $1", [usuarioId]),
    pool.query<{ area: string; permitido: boolean }>("SELECT area, permitido FROM permissoes_area WHERE usuario_id = $1", [usuarioId]),
  ]);

  const modulos: Record<string, boolean> = Object.fromEntries(MODULOS_CONTROLADOS.map((m) => [m, true]));
  for (const r of resModulos.rows) modulos[r.modulo] = !!r.permitido;

  const areas: Record<string, boolean> = Object.fromEntries(Object.keys(AREAS_PERMISSAO).map((a) => [a, true]));
  for (const r of resAreas.rows) areas[r.area] = !!r.permitido;

  return { modulos, areas };
}

export async function definirPermissaoModulo(usuarioId: number, modulo: string, permitido: boolean): Promise<void> {
  const pool = obterPool();
  await pool.query(
    "INSERT INTO permissoes_modulo (usuario_id, modulo, permitido) VALUES ($1,$2,$3) " +
      "ON CONFLICT (usuario_id, modulo) DO UPDATE SET permitido = excluded.permitido",
    [usuarioId, modulo, permitido],
  );
}

export async function definirPermissaoArea(usuarioId: number, area: string, permitido: boolean): Promise<void> {
  const pool = obterPool();
  await pool.query(
    "INSERT INTO permissoes_area (usuario_id, area, permitido) VALUES ($1,$2,$3) " +
      "ON CONFLICT (usuario_id, area) DO UPDATE SET permitido = excluded.permitido",
    [usuarioId, area, permitido],
  );
}

/** Materializa, para `usuarioId`, as permissões padrão de `perfil` como
 * linhas individuais — a partir daí são permissões do usuário
 * (editáveis livremente), não mais do perfil. Mesma regra de
 * gat/database.py::_semear_permissoes_perfil. */
export async function semearPermissoesPerfil(usuarioId: number, perfil: string): Promise<void> {
  const template = PERFIS_PADRAO[perfil] ?? PERFIS_PADRAO[PERFIL_ADMIN];
  for (const modulo of MODULOS_CONTROLADOS) {
    await definirPermissaoModulo(usuarioId, modulo, template.modulos[modulo] ?? true);
  }
  for (const area of Object.keys(AREAS_PERMISSAO)) {
    await definirPermissaoArea(usuarioId, area, template.areas[area] ?? true);
  }
}
