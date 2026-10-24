import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/session";
import { LogoutButton } from "@/components/logout-button";

// Toda a área autenticada depende de sessão (cookie) — nunca é candidata
// a página estática/prerenderizada.
export const instant = false;

const GRUPOS_NAV = [
  {
    titulo: "Prestadores",
    itens: [{ rotulo: "Projetos", href: "/prestadores/projetos" }],
  },
];

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sessao = await obterSessao();
  if (!sessao) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col border-r border-(--color-border) bg-(--color-surface-1) px-4 py-5">
        <div className="mb-6 flex items-center gap-2 px-2">
          <Image src="/tecnoplano_logo.png" alt="Tecnoplano" width={120} height={44} className="h-8 w-auto" />
        </div>

        <nav className="flex-1 space-y-5">
          <Link
            href="/inicio"
            className="block rounded-lg px-3 py-2 text-sm font-medium text-(--color-text) hover:bg-(--color-surface-2)"
          >
            Início
          </Link>
          {GRUPOS_NAV.map((grupo) => (
            <div key={grupo.titulo}>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-(--color-text-dim)">
                {grupo.titulo}
              </p>
              <div className="mt-1 space-y-0.5">
                {grupo.itens.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block rounded-lg px-3 py-2 text-sm font-medium text-(--color-text) hover:bg-(--color-surface-2)"
                  >
                    {item.rotulo}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-(--color-border) pt-4">
          <p className="truncate px-2 text-sm font-medium text-(--color-text)">
            {sessao.nomeCompleto || sessao.username}
          </p>
          <p className="px-2 text-xs text-(--color-text-weak)">{sessao.perfil}</p>
          <LogoutButton />
        </div>
      </aside>

      <main className="flex-1 bg-(--color-bg)">{children}</main>
    </div>
  );
}
