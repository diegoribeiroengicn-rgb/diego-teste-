import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { obterPool } from "@/lib/db";
import { criarSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";

// Autenticação contra a MESMA tabela `usuarios` do GAT (Streamlit) — senha
// com hash bcrypt já existente, sem recriar nenhuma conta. Mantém a
// mesma regra: só usuário ativo (ativo = 1) pode entrar.
export async function POST(req: NextRequest) {
  const { usuario, senha } = await req.json();

  if (!usuario || !senha) {
    return NextResponse.json({ erro: "Informe usuário e senha." }, { status: 400 });
  }

  const pool = obterPool();
  const { rows } = await pool.query(
    `SELECT id, username, senha_hash, nome_completo, perfil, analista_vinculado,
            tema_preferido, deve_trocar_senha
     FROM usuarios
     WHERE username = $1 AND ativo = 1`,
    [String(usuario).trim()],
  );

  const linha = rows[0];
  if (!linha || !(await bcrypt.compare(senha, linha.senha_hash))) {
    return NextResponse.json({ erro: "Usuário ou senha incorretos." }, { status: 401 });
  }

  if (Number(linha.deve_trocar_senha) === 1) {
    return NextResponse.json(
      { erro: "Primeiro acesso — troque sua senha no sistema atual antes de usar esta versão." },
      { status: 403 },
    );
  }

  const usuarioSessao = {
    id: linha.id,
    username: linha.username,
    nomeCompleto: linha.nome_completo,
    perfil: linha.perfil,
    analistaVinculado: linha.analista_vinculado,
    temaPreferido: linha.tema_preferido,
  };

  try {
    await criarSessao(usuarioSessao);
  } catch (exc) {
    // Senha confere, mas a sessão não pôde ser criada (ex.: SESSION_SECRET
    // não configurada) — erro de configuração do servidor, não é a mesma
    // coisa que usuário/senha errados, então não reaproveita a mensagem 401.
    console.error("[login] falha ao criar sessão:", exc);
    return NextResponse.json(
      { erro: "Login confirmado, mas não foi possível iniciar a sessão. Contate o administrador." },
      { status: 500 },
    );
  }

  // Best-effort — não deve derrubar o login se falhar.
  pool
    .query("UPDATE usuarios SET ultimo_acesso = $1 WHERE username = $2", [new Date().toISOString(), linha.username])
    .catch((exc) => console.error("[login] falha ao registrar último acesso:", exc));
  void registrarAtividade(linha.username, linha.perfil, "LOGIN", "web-next");

  return NextResponse.json({ usuario: usuarioSessao });
}
