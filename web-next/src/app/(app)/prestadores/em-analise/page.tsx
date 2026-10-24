import { buscarProjetos } from "@/lib/projetos";
import { obterSessao } from "@/lib/session";
import { TabelaProjetos } from "@/components/tabela-projetos";

export default async function PaginaEmAnalisePrestadores({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sessao = await obterSessao();
  const { q } = await searchParams;
  const busca = (q || "").trim();
  const filtrandoPorMim = !busca && !!sessao?.analistaVinculado;
  const termoResponsavel = busca || sessao?.analistaVinculado || "";

  const projetos = await buscarProjetos("prestadores", { termoResponsavel, statusEntre: ["EM ANÁLISE"] });

  return (
    <TabelaProjetos
      titulo="Prestadores — Em Análise"
      colunaEntidade="Prestador"
      projetos={projetos}
      busca={busca}
      filtrandoPorMim={filtrandoPorMim}
      analistaProprio={sessao?.analistaVinculado}
      temAnalistaProprio={!!sessao?.analistaVinculado}
    />
  );
}
