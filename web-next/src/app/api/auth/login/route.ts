import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { obterPool } from "@/lib/db";
import { criarSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";

type LinhaUsuario = {
  id: number; username: string; senha_hash: string; nome_completo: string; perfil: string;
  analista_vinculado: string | null; tema_preferido: string; deve_trocar_senha: number | boolean | null;
};

// Autenticação contra a MESMA tabela `usuarios` do GAT (Streamlit) — senha
// com hash bcrypt já existente, sem recriar nenhuma conta. Mantém a
// mesma regra: só usuário ativo (ativo = 1) pode entrar.
export async function POST(req: NextRequest) {
  const { usuario, senha } = await req.json();

  if (!usuario || !senha) {
    return NextResponse.json({ erro: "Informe usuário e senha." }, { status: 400 });
  }

  let pool: ReturnType<typeof obterPool>;
  let rows: LinhaUsuario[];
  try {
    pool = obterPool();
    ({ rows } = await pool.query<LinhaUsuario>(
      `SELECT id, username, senha_hash, nome_completo, perfil, analista_vinculado,
              tema_preferido, deve_trocar_senha
       FROM usuarios
       WHERE username = $1 AND ativo = 1`,
      [String(usuario).trim()],
    ));
  } catch (exc) {
    // Não é "senha errada": o servidor não conseguiu falar com o banco. Diz isso
    // claramente (em vez de um erro genérico) para facilitar achar a causa.
    console.error("[login] falha ao acessar o banco:", exc);
    const semConfig = exc instanceof Error && exc.message.includes("DATABASE_URL");
    return NextResponse.json(
      {
        erro: semConfig
          ? "O sistema está sem a conexão com o banco configurada (DATABASE_URL). Contate o administrador."
          : "Não foi possível acessar o banco de dados agora (ele pode estar pausado ou fora do ar). Se continuar, verifique o projeto no Supabase.",
      },
      { status: 503 },
    );
  }

  const linha = rows[0];
  if (!linha || !(await bcrypt.compare(senha, linha.senha_hash))) {
    return NextResponse.json({ erro: "Usuário ou senha incorretos." }, { status: 401 });
  }

  const usuarioSessao = {
    id: linha.id,
    username: linha.username,
    nomeCompleto: linha.nome_completo,
    perfil: linha.perfil,
    analistaVinculado: linha.analista_vinculado,
    temaPreferido: linha.tema_preferido,
    deveTrocarSenha: Number(linha.deve_trocar_senha) === 1,
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
