import bcrypt from "bcryptjs";
import { obterPool } from "@/lib/db";

export type UsuarioPerfil = {
  id: number;
  username: string;
  nome_completo: string | null;
  perfil: string;
  ultimo_acesso: string | null;
};

export async function buscarUsuarioPorId(id: number): Promise<UsuarioPerfil | null> {
  const pool = obterPool();
  const { rows } = await pool.query<UsuarioPerfil>(
    "SELECT id, username, nome_completo, perfil, ultimo_acesso FROM usuarios WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

/** Troca a senha do próprio usuário — retorna false sem alterar nada se a
 * senha atual informada não confere (mesma regra de
 * gat/database.py::alterar_senha_usuario). */
export async function alterarSenhaUsuario(username: string, senhaAtual: string, novaSenha: string): Promise<boolean> {
  const pool = obterPool();
  const { rows } = await pool.query<{ senha_hash: string }>(
    "SELECT senha_hash FROM usuarios WHERE username = $1",
    [username],
  );
  const linha = rows[0];
  if (!linha) return false;

  const confere = await bcrypt.compare(senhaAtual, linha.senha_hash);
  if (!confere) return false;

  const novoHash = await bcrypt.hash(novaSenha, 10);
  await pool.query(
    "UPDATE usuarios SET senha_hash = $1, deve_trocar_senha = 0 WHERE username = $2",
    [novoHash, username],
  );
  return true;
}

export async function registrarUltimoAcesso(username: string): Promise<void> {
  const pool = obterPool();
  await pool.query("UPDATE usuarios SET ultimo_acesso = $1 WHERE username = $2", [new Date().toISOString(), username]);
}

/** Salva a preferência de tema (Claro/Escuro) do próprio usuário —
 * individual por conta, persistida no banco (sobrevive a logout/login) —
 * mesma regra de gat/database.py::definir_tema_usuario. */
export async function definirTemaUsuario(username: string, tema: "claro" | "escuro"): Promise<void> {
  const pool = obterPool();
  await pool.query("UPDATE usuarios SET tema_preferido = $1 WHERE username = $2", [tema, username]);
}
