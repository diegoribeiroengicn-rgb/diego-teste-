import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/session";
import { LogoutButton } from "@/components/logout-button";
import { NavSidebar, type GrupoNav } from "@/components/nav-sidebar";

// Toda a área autenticada depende de sessão (cookie) — nunca é candidata
// a página estática/prerenderizada.
export const instant = false;

const GRUPOS_NAV: GrupoNav[] = [
  {
    titulo: "Prestadores",
    itens: [
      { rotulo: "Dashboard", href: "/prestadores/dashboard" },
      { rotulo: "Projetos", href: "/prestadores/projetos" },
      { rotulo: "Em Análise", href: "/prestadores/em-analise" },
      { rotulo: "Em HOLD", href: "/prestadores/em-hold" },
      { rotulo: "Cadastro", href: "/prestadores/cadastro" },
      { rotulo: "Gantt", href: "/prestadores/gantt" },
    ],
  },
  {
    titulo: "Cessionários",
    itens: [
      { rotulo: "Dashboard", href: "/cessionarios/dashboard" },
      { rotulo: "Projetos", href: "/cessionarios/projetos" },
      { rotulo: "Em Análise", href: "/cessionarios/em-analise" },
      { rotulo: "Em HOLD", href: "/cessionarios/em-hold" },
      { rotulo: "Cadastro", href: "/cessionarios/cadastro" },
      { rotulo: "Cessionários Ativos", href: "/cessionarios/ativos" },
      { rotulo: "One Page Report", href: "/cessionarios/opr" },
    ],
  },
  {
    titulo: "Avaliações",
    itens: [{ rotulo: "Ranking", href: "/avaliacoes/ranking" }],
  },
  {
    titulo: "Gestão",
    itens: [
      { rotulo: "Lista de Prioridades", href: "/prioridades" },
      { rotulo: "Painel de Analistas", href: "/analistas" },
      { rotulo: "Histórico de Atividades", href: "/atividades" },
    ],
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

        <NavSidebar grupos={GRUPOS_NAV} />

        <div className="border-t border-(--color-border) pt-4">
          <Link href="/perfil" className="block rounded-lg px-2 py-1 hover:bg-(--color-surface-2)">
            <p className="truncate text-sm font-medium text-(--color-text)">
              {sessao.nomeCompleto || sessao.username}
            </p>
            <p className="text-xs text-(--color-text-weak)">{sessao.perfil}</p>
          </Link>
          <LogoutButton />
        </div>
      </aside>

      <main className="flex-1 bg-(--color-bg)">{children}</main>
    </div>
  );
}
