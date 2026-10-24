import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const NOME_COOKIE = "gat_sessao";
const DURACAO_SEGUNDOS = 60 * 60 * 12; // 12 horas, mesma sessão de um dia de trabalho

export type SessaoUsuario = {
  id: number;
  username: string;
  nomeCompleto: string | null;
  perfil: string;
  analistaVinculado: string | null;
  temaPreferido: string;
};

function segredo(): Uint8Array {
  const valor = process.env.SESSION_SECRET;
  if (!valor) {
    throw new Error("SESSION_SECRET não configurada — defina nas variáveis de ambiente.");
  }
  return new TextEncoder().encode(valor);
}

export async function criarSessao(usuario: SessaoUsuario): Promise<void> {
  const token = await new SignJWT({ usuario })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_SEGUNDOS}s`)
    .sign(segredo());

  (await cookies()).set(NOME_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_SEGUNDOS,
  });
}

export async function obterSessao(): Promise<SessaoUsuario | null> {
  const token = (await cookies()).get(NOME_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, segredo());
    return (payload as { usuario: SessaoUsuario }).usuario;
  } catch {
    return null;
  }
}

export async function encerrarSessao(): Promise<void> {
  (await cookies()).delete(NOME_COOKIE);
}
