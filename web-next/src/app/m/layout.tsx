import { redirect } from "next/navigation";
import Link from "next/link";
import { obterSessao } from "@/lib/session";

export const instant = false;

const ITENS_NAV = [
  { href: "/m/ats", rotulo: "ATs", icone: "🔎" },
  { href: "/m/prestadores", rotulo: "Prestadores", icone: "🏢" },
  { href: "/m/analises", rotulo: "Análises", icone: "📋" },
  { href: "/m/baixa", rotulo: "Baixa", icone: "✅" },
];

/** Layout do GAT Mobile — propositalmente enxuto (só estas 4 telas, sem
 * os grupos/menus da área desktop) para funcionar bem como PWA instalada
 * na tela inicial do celular. A sessão já é exigida globalmente por
 * src/proxy.ts; o redirect aqui é só a tela de boas-vindas quando alguém
 * abre o link sem estar logado em outra aba. */
export default async function LayoutMobile({ children }: { children: React.ReactNode }) {
  const sessao = await obterSessao();
  if (!sessao) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col bg-(--color-bg)">
      <header className="flex items-center justify-between border-b border-(--color-border) bg-(--color-surface-1) px-4 py-3">
        <p className="text-sm font-semibold text-(--color-text)">GAT Mobile</p>
        <p className="text-xs text-(--color-text-weak)">{sessao.nomeCompleto || sessao.username}</p>
      </header>

      <main className="min-w-0 flex-1 overflow-y-auto pb-20">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-(--color-border) bg-(--color-surface-1)">
        {ITENS_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[0.7rem] font-medium text-(--color-text-weak) hover:text-(--color-navy)"
          >
            <span className="text-lg leading-none">{item.icone}</span>
            {item.rotulo}
          </Link>
        ))}
      </nav>
    </div>
  );
}
