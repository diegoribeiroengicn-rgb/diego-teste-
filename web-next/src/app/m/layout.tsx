import { redirect } from "next/navigation";
import Image from "next/image";
import { obterSessao } from "@/lib/session";
import { NavMobile } from "@/components/mobile/nav-mobile";

export const instant = false;

const ITENS_NAV = [
  { href: "/m/cessionarios", rotulo: "Cessionários", icone: "🏢" },
  { href: "/m/prestadores", rotulo: "Prestadores", icone: "🛠️" },
  { href: "/m/ats", rotulo: "ATs", icone: "🔎" },
];

/** Layout do GAT Mobile — propositalmente enxuto (só estas 3 telas, sem
 * os grupos/menus da área desktop) para funcionar bem como PWA instalada
 * na tela inicial do celular: análise de Cessionários, análise de
 * Prestadores (ambas já com Dar Baixa direto no cartão) e busca de ATs
 * com filtros. Header e abas deliberadamente navy/dourado — diferente
 * do cabeçalho branco com hambúrguer do site (app-shell.tsx) — para
 * ficar claro que isto é o app, não o site aberto no navegador. A
 * sessão já é exigida globalmente por src/proxy.ts; o redirect aqui é
 * só a tela de boas-vindas quando alguém abre o link sem estar logado
 * em outra aba. */
export default async function LayoutMobile({ children }: { children: React.ReactNode }) {
  const sessao = await obterSessao();
  if (!sessao) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen min-w-0 flex-col overflow-x-hidden bg-(--color-bg)">
      <header className="flex min-w-0 items-center gap-3 bg-(--color-navy) px-4 py-3">
        <div className="shrink-0 rounded-lg bg-white px-2 py-1">
          <Image src="/tecnoplano_logo.png" alt="Tecnoplano" width={90} height={33} className="h-6 w-auto" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">GAT Mobile</p>
          <p className="truncate text-xs text-white/70">{sessao.nomeCompleto || sessao.username}</p>
        </div>
      </header>

      <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-20">{children}</main>

      <NavMobile itens={ITENS_NAV} />
    </div>
  );
}
