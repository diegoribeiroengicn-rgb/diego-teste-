import { buscarProjetos } from "@/lib/projetos";
import { obterSessao } from "@/lib/session";
import { PainelResumo } from "@/components/painel-resumo";

export default async function PaginaDashboardPrestadores({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sessao = await obterSessao();
  const { q } = await searchParams;
  const busca = (q || "").trim();
  const filtrandoPorMim = !busca && !!sessao?.analistaVinculado;
  const termoResponsavel = busca || sessao?.analistaVinculado || "";

  const projetos = await buscarProjetos("prestadores", { termoResponsavel });

  return (
    <PainelResumo
      titulo="Prestadores — Dashboard"
      projetos={projetos}
      busca={busca}
      filtrandoPorMim={filtrandoPorMim}
      analistaProprio={sessao?.analistaVinculado}
      temAnalistaProprio={!!sessao?.analistaVinculado}
    />
  );
}
