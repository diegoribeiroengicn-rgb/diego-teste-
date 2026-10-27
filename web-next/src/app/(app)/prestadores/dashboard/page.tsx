import { buscarProjetos } from "@/lib/projetos";
import { PainelResumo } from "@/components/painel-resumo";

export default async function PaginaDashboardPrestadores({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const busca = (q || "").trim();

  const projetos = await buscarProjetos("prestadores", { termoResponsavel: busca });

  return <PainelResumo titulo="Prestadores — Dashboard" projetos={projetos} busca={busca} />;
}
