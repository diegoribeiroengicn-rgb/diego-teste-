import bcrypt from "bcryptjs";
import { obterPool } from "@/lib/db";
import { semearPermissoesPerfil } from "@/lib/permissoes";

export type Usuario = {
  id: number;
  username: string;
  nomeCompleto: string | null;
  perfil: string;
  ativo: boolean;
  deveTrocarSenha: boolean;
  ultimoAcesso: string | null;
  criadoEm: string;
  analistaVinculado: string | null;
};

type LinhaUsuarioBanco = {
  id: number;
  username: string;
  nome_completo: string | null;
  perfil: string;
  ativo: number | boolean;
  deve_trocar_senha: number | boolean;
  ultimo_acesso: string | null;
  criado_em: string;
  analista_vinculado: string | null;
};

function mapUsuario(r: LinhaUsuarioBanco): Usuario {
  return {
    id: r.id, username: r.username, nomeCompleto: r.nome_completo, perfil: r.perfil,
    ativo: !!r.ativo, deveTrocarSenha: !!r.deve_trocar_senha, ultimoAcesso: r.ultimo_acesso,
    criadoEm: r.criado_em, analistaVinculado: r.analista_vinculado,
  };
}

/** Só usuários ativos (não arquivados) — os arquivados pelo módulo
 * Arquivo (ainda não portado) ficam de fora. Mesma regra de
 * gat/database.py::listar_usuarios. */
export async function listarUsuarios(): Promise<Usuario[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaUsuarioBanco>(
    `SELECT id, username, nome_completo, perfil, ativo, deve_trocar_senha, ultimo_acesso, criado_em, analista_vinculado
     FROM usuarios WHERE arquivado_em IS NULL ORDER BY username`,
  );
  return rows.map(mapUsuario);
}

/** Cria um usuário com senha inicial temporária — obrigado a defini-la
 * novamente no primeiro acesso (deve_trocar_senha). Hash bcrypt
 * compatível com o login do sistema Streamlit (mesma tabela
 * `usuarios`). Mesma regra de gat/database.py::criar_usuario. */
export async function criarUsuario(
  username: string,
  senha: string,
  nomeCompleto: string,
  perfil: string,
  analistaVinculado: string | null,
): Promise<number> {
  const pool = obterPool();
  const senhaHash = await bcrypt.hash(senha, 10);
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO usuarios (username, senha_hash, nome_completo, perfil, ativo, deve_trocar_senha, criado_em, analista_vinculado)
     VALUES ($1,$2,$3,$4,true,true,$5,$6) RETURNING id`,
    [username, senhaHash, nomeCompleto, perfil, new Date().toISOString(), analistaVinculado],
  );
  const id = rows[0].id;
  await semearPermissoesPerfil(id, perfil);
  return id;
}

export async function atualizarUsuario(
  username: string,
  nomeCompleto: string,
  perfil: string,
  analistaVinculado: string | null,
): Promise<void> {
  const pool = obterPool();
  await pool.query(
    `UPDATE usuarios SET nome_completo = $1, perfil = $2, analista_vinculado = $3 WHERE username = $4`,
    [nomeCompleto, perfil, analistaVinculado, username],
  );
}

export async function definirUsuarioAtivo(username: string, ativo: boolean): Promise<void> {
  const pool = obterPool();
  await pool.query(`UPDATE usuarios SET ativo = $1 WHERE username = $2`, [ativo, username]);
}

/** Administrador redefine a senha de um usuário — força troca no
 * próximo login e nunca expõe a senha atual. Mesma regra de
 * gat/database.py::redefinir_senha_admin. */
export async function redefinirSenhaAdmin(username: string, novaSenha: string): Promise<void> {
  const pool = obterPool();
  const senhaHash = await bcrypt.hash(novaSenha, 10);
  await pool.query(`UPDATE usuarios SET senha_hash = $1, deve_trocar_senha = true WHERE username = $2`, [senhaHash, username]);
}

export async function exigirTrocaSenhaProximoLogin(username: string): Promise<void> {
  const pool = obterPool();
  await pool.query(`UPDATE usuarios SET deve_trocar_senha = true WHERE username = $1`, [username]);
}

export async function obterConfiguracao(chave: string, padrao: string): Promise<string> {
  const pool = obterPool();
  const { rows } = await pool.query<{ valor: string }>(`SELECT valor FROM configuracoes WHERE chave = $1`, [chave]);
  return rows[0]?.valor ?? padrao;
}

export async function definirConfiguracao(chave: string, valor: string): Promise<void> {
  const pool = obterPool();
  await pool.query(
    `INSERT INTO configuracoes (chave, valor) VALUES ($1,$2) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`,
    [chave, valor],
  );
}
