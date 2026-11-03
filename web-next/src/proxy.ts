import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const NOME_COOKIE = "gat_sessao";

async function sessaoValida(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(NOME_COOKIE)?.value;
  const segredo = process.env.SESSION_SECRET;
  if (!token || !segredo) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(segredo));
    return true;
  } catch {
    return false;
  }
}

// Bloqueia acesso a qualquer rota do sistema sem sessão válida — mesmo
// comportamento do `st.stop()` no Streamlit (tela de login bloqueia tudo
// até autenticação válida). "/" é a própria página de login: só ela
// verifica o sentido inverso (usuário já logado é mandado para /inicio,
// em vez de ver o formulário de novo).
export async function proxy(request: NextRequest) {
  const logado = await sessaoValida(request);
  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    return logado ? NextResponse.redirect(new URL("/inicio", request.url)) : NextResponse.next();
  }

  if (!logado) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

// manifest.webmanifest, sw.js e os ícones precisam ficar fora do gate de
// sessão: o navegador busca esses arquivos (e registra o service worker)
// já na própria tela de login, antes de qualquer autenticação, para
// decidir se oferece a instalação do GAT Mobile como PWA. Redirecionar
// essas requisições para "/" faz o manifest chegar como HTML em vez de
// JSON, e o Chrome nunca considera o site instalável — foi exatamente
// isso que impediu o prompt nativo de instalação de aparecer.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|tecnoplano_logo.png|manifest.webmanifest|sw.js|icon-192.png|icon-512.png|icon-maskable-512.png|apple-touch-icon.png|api/auth).*)",
  ],
};
