import { connection } from "next/server";
import { buscarLinhasGantt } from "@/lib/prestadores-gantt/dados";
import { PainelGanttConsolidado } from "@/components/prestadores-gantt/painel-consolidado";
import { marcadoresPrioridade } from "@/lib/prioridades";

export default async function PaginaGanttConsolidado() {
  // Renderização por requisição: a página lê o banco, nunca no build.
  await connection();
  const [prestadores, cessionarios, marcPrest, marcCess] = await Promise.all([
    buscarLinhasGantt("prestadores"), buscarLinhasGantt("cessionarios"), marcadoresPrioridade("prestadores"), marcadoresPrioridade("cessionarios"),
  ]);
  return <PainelGanttConsolidado prestadores={prestadores} cessionarios={cessionarios} marcPrest={marcPrest} marcCess={marcCess} />;
}
