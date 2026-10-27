import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import type { GrupoNav } from "@/components/nav-sidebar";

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
    itens: [
      { rotulo: "Registrar Avaliação", href: "/avaliacoes/nova" },
      { rotulo: "Histórico de Avaliações", href: "/avaliacoes/historico" },
      { rotulo: "Ranking", href: "/avaliacoes/ranking" },
      { rotulo: "Avaliação dos Analistas", href: "/analistas/notas" },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      { rotulo: "Visão do Gestor", href: "/visao-gestor" },
      { rotulo: "Linha do Tempo", href: "/linha-tempo" },
      { rotulo: "Localização de ATs", href: "/localizacao-ats" },
      { rotulo: "Central de Alertas", href: "/alertas" },
      { rotulo: "Meus Alertas", href: "/meus-alertas" },
      { rotulo: "Painel Consolidado", href: "/consolidado" },
      { rotulo: "Lista de Prioridades", href: "/prioridades" },
      { rotulo: "Lembretes (Sem PEP)", href: "/lembretes-pep" },
      { rotulo: "Painel de Analistas", href: "/analistas" },
      { rotulo: "KPIs de Prazo dos Analistas", href: "/analistas/prazo" },
      { rotulo: "Histórico de Atividades", href: "/atividades" },
    ],
  },
  {
    titulo: "Sistema",
    itens: [
      { rotulo: "Manual do Sistema", href: "/manual-sistema" },
      { rotulo: "Administração", href: "/administracao" },
      { rotulo: "Arquivo", href: "/arquivo" },
    ],
  },
];

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sessao = await obterSessao();
  if (!sessao) {
    redirect("/");
  }

  return (
    <AppShell grupos={GRUPOS_NAV} nome={sessao.nomeCompleto || sessao.username} perfil={sessao.perfil}>
      {children}
    </AppShell>
  );
}
