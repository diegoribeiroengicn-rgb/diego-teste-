import { buscarAtividades } from "@/lib/atividades";
import { TabelaAtividades } from "@/components/tabela-atividades";

export default async function PaginaHistoricoAtividades() {
  const atividades = await buscarAtividades();
  return <TabelaAtividades atividades={atividades} />;
}
