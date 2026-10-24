import { buscarRanking, type TipoEntidadeAvaliacao } from "@/lib/ranking";
import { PainelRanking } from "@/components/painel-ranking";

export default async function PaginaRankingAvaliacoes({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  const tipoEntidade: TipoEntidadeAvaliacao = tipo === "CESSIONARIO" ? "CESSIONARIO" : "PRESTADOR";
  const ranking = await buscarRanking(tipoEntidade);

  return <PainelRanking key={tipoEntidade} tipoEntidade={tipoEntidade} ranking={ranking} />;
}
