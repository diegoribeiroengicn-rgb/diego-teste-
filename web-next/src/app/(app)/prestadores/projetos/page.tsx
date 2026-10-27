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
  const analistaProprio = sessao?.analistaVinculado || null;

  const projetos = await buscarProjetos("prestadores", { termoResponsavel: busca, analistaProprio });

  return (
    <TabelaProjetos
      titulo="Prestadores — Projetos"
      colunaEntidade="Prestador"
      tabela="prestadores"
      projetos={projetos}
      busca={busca}
      analistaProprio={analistaProprio}
      temAnalistaProprio={!!analistaProprio}
    />
  );
}
