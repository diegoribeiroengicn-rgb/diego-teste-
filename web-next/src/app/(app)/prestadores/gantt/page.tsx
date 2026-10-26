import { buscarLinhasGantt } from "@/lib/prestadores-gantt/dados";
import { PainelGanttPrestadores } from "@/components/prestadores-gantt/painel";

export default async function PaginaGanttPrestadores() {
  const linhasBrutas = await buscarLinhasGantt();
  return <PainelGanttPrestadores linhasBrutas={linhasBrutas} />;
}
