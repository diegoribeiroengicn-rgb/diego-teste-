import { connection } from "next/server";
import { contarProjetos } from "@/lib/projetos";
import { PainelResumo } from "@/components/painel-resumo";

export default async function PaginaDashboardPrestadores({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  // Renderização por requisição: a página lê o banco, nunca no build.
  await connection();
  const { q } = await searchParams;
  const busca = (q || "").trim();

  const contagens = await contarProjetos("prestadores", busca);

  return <PainelResumo titulo="Prestadores — Dashboard" contagens={contagens} busca={busca} />;
}
