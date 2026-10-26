import { buscarListaPrioridades } from "@/lib/lista-prioridades";
import { TabelaPrioridades } from "@/components/tabela-prioridades";

export default async function PaginaListaPrioridades() {
  const itens = await buscarListaPrioridades();
  return <TabelaPrioridades itens={itens} />;
}
