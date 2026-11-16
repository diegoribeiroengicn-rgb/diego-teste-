import { buscarLinhasGantt, buscarVencimentosContratuais } from "@/lib/prestadores-gantt/dados";
import { PainelGanttPrestadores } from "@/components/prestadores-gantt/painel";
import { marcadoresPrioridade, podeVerContratual } from "@/lib/prioridades";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";

export default async function PaginaGanttPrestadores() {
  const sessao = await obterSessao();
  // Prazo contratual: só Gestor/Admin — para os demais o mapa nem é consultado nem enviado ao navegador.
  const verContratual = sessao ? await podeVerContratual(sessao.id, sessao.perfil) : false;
  const [linhasBrutas, marcadores, podeDefinirPrioridade, contratuais] = await Promise.all([
    buscarLinhasGantt("prestadores"),
    marcadoresPrioridade("prestadores"),
    sessao ? areaPermitida(sessao.id, sessao.perfil, "prestadores.editar") : Promise.resolve(false),
    verContratual ? buscarVencimentosContratuais("prestadores") : Promise.resolve(null),
  ]);
  return <PainelGanttPrestadores modulo="prestadores" linhasBrutas={linhasBrutas} marcadores={marcadores} podeDefinirPrioridade={podeDefinirPrioridade} contratuais={contratuais} />;
}
