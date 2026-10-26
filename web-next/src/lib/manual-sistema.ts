import { obterPool } from "@/lib/db";

export type ManualCapitulo = {
  id: number;
  ordem: number;
  titulo: string;
  conteudo: string | null;
  perfisVisiveis: string | null;
  criadoEm: string;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
};

export type ManualVersao = {
  id: number;
  numeroVersao: number;
  notas: string | null;
  publicadoEm: string;
  publicadoPor: string;
  ativa: boolean;
};

export type ConfirmacaoLeitura = {
  id: number;
  usuario: string;
  versao: number;
  confirmadoEm: string;
};

type LinhaCapitulo = {
  id: number;
  ordem: number;
  titulo: string;
  conteudo: string | null;
  perfis_visiveis: string | null;
  criado_em: string;
  atualizado_em: string | null;
  atualizado_por: string | null;
};

function mapCapitulo(row: LinhaCapitulo): ManualCapitulo {
  return {
    id: row.id,
    ordem: row.ordem,
    titulo: row.titulo,
    conteudo: row.conteudo,
    perfisVisiveis: row.perfis_visiveis,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    atualizadoPor: row.atualizado_por,
  };
}

function capituloVisivel(perfisVisiveis: string | null, perfil: string | null): boolean {
  if (!perfil || perfil === "ADMIN") return true;
  if (!perfisVisiveis || !perfisVisiveis.trim()) return true;
  return perfisVisiveis.split(",").map((p) => p.trim()).includes(perfil);
}

/** Capítulos na ordem de exibição. Quando `perfil` é informado e não é
 * ADMIN, filtra para capítulos sem restrição de perfil (perfisVisiveis
 * vazio = visível a todos) ou que incluam o perfil na lista — mesma
 * regra de gat/database.py::listar_manual_capitulos. */
export async function listarManualCapitulos(perfil?: string | null): Promise<ManualCapitulo[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaCapitulo>(`SELECT * FROM manual_capitulos ORDER BY ordem`);
  const capitulos = rows.map(mapCapitulo);
  if (!perfil || perfil === "ADMIN") return capitulos;
  return capitulos.filter((c) => capituloVisivel(c.perfisVisiveis, perfil));
}

export async function criarManualCapitulo(titulo: string, conteudo: string, perfisVisiveis: string | null, usuario: string): Promise<number> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const { rows: maior } = await pool.query<{ m: number }>(`SELECT COALESCE(MAX(ordem), 0) AS m FROM manual_capitulos`);
  const novaOrdem = (maior[0]?.m ?? 0) + 1;
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO manual_capitulos (ordem, titulo, conteudo, perfis_visiveis, criado_em, atualizado_por)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [novaOrdem, titulo, conteudo, perfisVisiveis, agora, usuario],
  );
  return rows[0].id;
}

export async function atualizarManualCapitulo(id: number, titulo: string, conteudo: string, perfisVisiveis: string | null, usuario: string): Promise<void> {
  const pool = obterPool();
  await pool.query(
    `UPDATE manual_capitulos SET titulo = $1, conteudo = $2, perfis_visiveis = $3, atualizado_em = $4, atualizado_por = $5 WHERE id = $6`,
    [titulo, conteudo, perfisVisiveis, new Date().toISOString(), usuario, id],
  );
}

export async function excluirManualCapitulo(id: number): Promise<void> {
  const pool = obterPool();
  await pool.query(`DELETE FROM manual_anexos WHERE capitulo_id = $1`, [id]);
  await pool.query(`DELETE FROM manual_capitulos WHERE id = $1`, [id]);
}

/** `ordemIds` já na nova ordem desejada — a posição na lista define a
 * nova `ordem` (1, 2, 3...). */
export async function reordenarManualCapitulos(ordemIds: number[], usuario: string): Promise<void> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  await Promise.all(
    ordemIds.map((id, indice) =>
      pool.query(`UPDATE manual_capitulos SET ordem = $1, atualizado_em = $2, atualizado_por = $3 WHERE id = $4`, [indice + 1, agora, usuario, id]),
    ),
  );
}

export async function versaoAtivaManual(): Promise<ManualVersao | null> {
  const pool = obterPool();
  const { rows } = await pool.query<{ id: number; numero_versao: number; notas: string | null; publicado_em: string; publicado_por: string; ativa: number }>(
    `SELECT * FROM manual_versoes WHERE ativa = 1 ORDER BY numero_versao DESC LIMIT 1`,
  );
  if (!rows.length) return null;
  const r = rows[0];
  return { id: r.id, numeroVersao: r.numero_versao, notas: r.notas, publicadoEm: r.publicado_em, publicadoPor: r.publicado_por, ativa: !!r.ativa };
}

export async function listarManualVersoes(): Promise<ManualVersao[]> {
  const pool = obterPool();
  const { rows } = await pool.query<{ id: number; numero_versao: number; notas: string | null; publicado_em: string; publicado_por: string; ativa: number }>(
    `SELECT * FROM manual_versoes ORDER BY numero_versao DESC`,
  );
  return rows.map((r) => ({ id: r.id, numeroVersao: r.numero_versao, notas: r.notas, publicadoEm: r.publicado_em, publicadoPor: r.publicado_por, ativa: !!r.ativa }));
}

/** Arquiva a versão ativa atual e publica uma nova — o conteúdo dos
 * capítulos já é o vigente no momento da publicação; a versão serve para
 * marcar marcos de publicação e disparar a confirmação de leitura. */
export async function publicarNovaVersaoManual(notas: string, usuario: string): Promise<number> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const { rows } = await pool.query<{ m: number | null }>(`SELECT MAX(numero_versao) AS m FROM manual_versoes`);
  const novaVersao = (rows[0]?.m ?? 0) + 1;
  await pool.query(`UPDATE manual_versoes SET ativa = 0`);
  await pool.query(
    `INSERT INTO manual_versoes (numero_versao, notas, publicado_em, publicado_por, ativa) VALUES ($1, $2, $3, $4, 1)`,
    [novaVersao, notas, agora, usuario],
  );
  return novaVersao;
}

export async function usuarioConfirmouLeituraManual(usuario: string, versao: number): Promise<boolean> {
  const pool = obterPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM manual_confirmacoes_leitura WHERE usuario = $1 AND versao = $2`,
    [usuario, versao],
  );
  return rows.length > 0;
}

export async function confirmarLeituraManual(usuario: string, versao: number): Promise<void> {
  const pool = obterPool();
  await pool.query(
    `INSERT INTO manual_confirmacoes_leitura (usuario, versao, confirmado_em) VALUES ($1, $2, $3)
     ON CONFLICT (usuario, versao) DO NOTHING`,
    [usuario, versao, new Date().toISOString()],
  );
}

export async function listarConfirmacoesLeituraManual(versao?: number): Promise<ConfirmacaoLeitura[]> {
  const pool = obterPool();
  const { rows } = versao != null
    ? await pool.query<{ id: number; usuario: string; versao: number; confirmado_em: string }>(
        `SELECT * FROM manual_confirmacoes_leitura WHERE versao = $1 ORDER BY confirmado_em DESC`,
        [versao],
      )
    : await pool.query<{ id: number; usuario: string; versao: number; confirmado_em: string }>(
        `SELECT * FROM manual_confirmacoes_leitura ORDER BY confirmado_em DESC`,
      );
  return rows.map((r) => ({ id: r.id, usuario: r.usuario, versao: r.versao, confirmadoEm: r.confirmado_em }));
}
