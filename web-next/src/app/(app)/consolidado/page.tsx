import { buscarLinhasConsolidado } from "@/lib/consolidado";
import { PainelConsolidado } from "@/components/painel-consolidado";

export default async function PaginaConsolidado() {
  const linhas = await buscarLinhasConsolidado();
  return <PainelConsolidado linhas={linhas} />;
}
