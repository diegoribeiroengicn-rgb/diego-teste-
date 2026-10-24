import { buscarProjetos } from "@/lib/projetos";
import { obterSessao } from "@/lib/session";
import { TabelaProjetos } from "@/components/tabela-projetos";

export default async function PaginaProjetosPrestadores({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sessao = await obterSessao();
  const { q } = await searchParams;
  const busca = (q || "").trim();

  // Sem busca explícita e com analista vinculado ao próprio login: mostra
  // só as análises do próprio analista (filtro padrão, não só ordenação) —
  // quem não tem analista vinculado (ex.: ADMIN/GESTOR) vê tudo por padrão.
  const filtrandoPorMim = !busca && !!sessao?.analistaVinculado;
  const termoResponsavel = busca || sessao?.analistaVinculado || "";

  const projetos = await buscarProjetos("prestadores", { termoResponsavel });

  return (
    <TabelaProjetos
      titulo="Prestadores — Projetos"
      colunaEntidade="Prestador"
      projetos={projetos}
      busca={busca}
      filtrandoPorMim={filtrandoPorMim}
      analistaProprio={sessao?.analistaVinculado}
      temAnalistaProprio={!!sessao?.analistaVinculado}
    />
  );
}
