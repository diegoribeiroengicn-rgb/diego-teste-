import { buscarProjetos } from "@/lib/projetos";
import { PainelResumo } from "@/components/painel-resumo";

export default async function PaginaDashboardCessionarios({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const busca = (q || "").trim();

  const projetos = await buscarProjetos("cessionarios", { termoResponsavel: busca });

  return <PainelResumo titulo="Cessionários — Dashboard" projetos={projetos} busca={busca} />;
}
