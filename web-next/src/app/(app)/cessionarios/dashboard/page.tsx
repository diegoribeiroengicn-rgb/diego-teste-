import { contarProjetos } from "@/lib/projetos";
import { PainelResumo } from "@/components/painel-resumo";

export default async function PaginaDashboardCessionarios({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const busca = (q || "").trim();

  const contagens = await contarProjetos("cessionarios", busca);

  return <PainelResumo titulo="Cessionários — Dashboard" contagens={contagens} busca={busca} />;
}
