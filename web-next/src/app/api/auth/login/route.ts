import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { obterPool } from "@/lib/db";

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

  // TODO (próxima etapa): emitir sessão (cookie assinado/JWT) em vez de só
  // confirmar a credencial — por ora isto valida a autenticação contra o
  // Supabase já migrado, sem ainda manter o usuário logado entre páginas.
  return NextResponse.json({
    usuario: {
      id: linha.id,
      username: linha.username,
      nomeCompleto: linha.nome_completo,
      perfil: linha.perfil,
      analistaVinculado: linha.analista_vinculado,
      temaPreferido: linha.tema_preferido,
    },
  });
}
