import { contarProjetos } from "@/lib/projetos";
import { PainelResumo } from "@/components/painel-resumo";

export default async function PaginaDashboardPrestadores({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const busca = (q || "").trim();

  const contagens = await contarProjetos("prestadores", busca);

  return <PainelResumo titulo="Prestadores — Dashboard" contagens={contagens} busca={busca} />;
}
