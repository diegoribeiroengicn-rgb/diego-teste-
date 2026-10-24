import Image from "next/image";
import { connection } from "next/server";
import { LoginForm } from "@/components/login-form";
import { mensagemAleatoria } from "@/lib/mensagens-motivacionais";

// Página de entrada — sempre renderizada por requisição (login não é
// candidato a cache estático, e a mensagem motivacional precisa variar a
// cada acesso).
export const instant = false;

export default async function PaginaLogin() {
  // Força renderização por requisição — a mensagem motivacional precisa
  // ser sorteada de novo a cada acesso, não fixada em build/cache.
  await connection();
  const mensagem = mensagemAleatoria();

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      {/* Painel de marca — navy institucional, com a mensagem motivacional */}
      <div className="relative flex w-full flex-col justify-between overflow-hidden bg-(--color-navy) px-8 py-10 text-white md:w-[44%] md:px-12 md:py-14">
        <PadraoDeFundo />

        <div className="relative z-10 inline-flex w-fit items-center rounded-lg bg-white px-3 py-2 shadow-sm">
          <Image
            src="/tecnoplano_logo.png"
            alt="Tecnoplano"
            width={179}
            height={65}
            className="h-7 w-auto"
            priority
          />
        </div>

        <div className="relative z-10 max-w-md">
          <p className="text-sm font-medium uppercase tracking-wider text-white/60">
            GAT 2026
          </p>
          <p className="mt-3 text-2xl font-semibold leading-snug text-balance">
            &ldquo;{mensagem}&rdquo;
          </p>
        </div>

        <p className="relative z-10 text-xs text-white/50">
          Controle de Análises Técnicas — Tecnoplano
        </p>
      </div>

      {/* Formulário de login */}
      <div className="flex w-full flex-1 flex-col items-center justify-center bg-(--color-bg) px-6 py-16">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold text-(--color-text)">
            Entrar no sistema
          </h1>
          <p className="mt-1.5 text-sm text-(--color-text-weak)">
            Use seu usuário e senha cadastrados pela Administração.
          </p>

          <div className="mt-8">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}

function PadraoDeFundo() {
  // Padrão geométrico sutil (linhas técnicas), referência discreta ao
  // universo de engenharia/plantas — não decoração genérica.
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.08]"
      viewBox="0 0 400 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <pattern id="grade" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="400" height="600" fill="url(#grade)" />
      <circle cx="340" cy="80" r="120" fill="none" stroke="white" strokeWidth="1" />
      <circle cx="40" cy="520" r="160" fill="none" stroke="white" strokeWidth="1" />
    </svg>
  );
}
