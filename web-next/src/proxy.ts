import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const NOME_COOKIE = "gat_sessao";

async function lerSessao(request: NextRequest): Promise<{ deveTrocarSenha?: boolean } | null> {
  const token = request.cookies.get(NOME_COOKIE)?.value;
  const segredo = process.env.SESSION_SECRET;
  if (!token || !segredo) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(segredo));
    return (payload as { usuario?: { deveTrocarSenha?: boolean } }).usuario ?? null;
  } catch {
    return null;
  }
}

// Bloqueia acesso a qualquer rota do sistema sem sessão válida — mesmo
// comportamento do `st.stop()` no Streamlit (tela de login bloqueia tudo
// até autenticação válida). "/" é a própria página de login: só ela
// verifica o sentido inverso (usuário já logado é mandado para /inicio,
// em vez de ver o formulário de novo).
//
// Usuário com senha temporária (deve_trocar_senha) é mandado direto para
// /primeiro-acesso e não consegue navegar para mais nada até trocar a
// senha — as chamadas de API continuam liberadas (exceção /api/) porque
// a própria tela de troca depende de uma delas (/api/perfil/senha).
export async function proxy(request: NextRequest) {
  const sessao = await lerSessao(request);
  const { pathname } = request.nextUrl;

  if (!sessao) {
    return pathname === "/" ? NextResponse.next() : NextResponse.redirect(new URL("/", request.url));
  }

  if (sessao.deveTrocarSenha && pathname !== "/primeiro-acesso" && !pathname.startsWith("/api/")) {
    return NextResponse.redirect(new URL("/primeiro-acesso", request.url));
  }
  if (!sessao.deveTrocarSenha && pathname === "/primeiro-acesso") {
    return NextResponse.redirect(new URL("/inicio", request.url));
  }
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/inicio", request.url));
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
