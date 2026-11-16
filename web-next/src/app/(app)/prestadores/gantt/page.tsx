import { buscarLinhasGantt } from "@/lib/prestadores-gantt/dados";
import { PainelGanttPrestadores } from "@/components/prestadores-gantt/painel";
import { marcadoresPrioridade } from "@/lib/prioridades";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";

export default async function PaginaGanttPrestadores() {
  const sessao = await obterSessao();
  const [linhasBrutas, marcadores, podeDefinirPrioridade] = await Promise.all([
    buscarLinhasGantt(),
    marcadoresPrioridade("prestadores"),
    sessao ? areaPermitida(sessao.id, sessao.perfil, "prestadores.editar") : Promise.resolve(false),
  ]);
  return <PainelGanttPrestadores linhasBrutas={linhasBrutas} marcadores={marcadores} podeDefinirPrioridade={podeDefinirPrioridade} />;
}
