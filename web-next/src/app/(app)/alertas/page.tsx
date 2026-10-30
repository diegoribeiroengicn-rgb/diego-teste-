import { buscarAlertasModulo } from "@/lib/alertas-engine";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { PainelAlertas } from "@/components/painel-alertas";

export default async function PaginaAlertas() {
  const sessao = await obterSessao();
  const [prestadores, cessionarios, podeGerenciarAlertaManual] = await Promise.all([
    buscarAlertasModulo("prestadores"),
    buscarAlertasModulo("cessionarios"),
    sessao ? areaPermitida(sessao.id, sessao.perfil, "alertas.manual") : Promise.resolve(false),
  ]);

  return <PainelAlertas alertasIniciais={[...prestadores, ...cessionarios]} podeGerenciarAlertaManual={podeGerenciarAlertaManual} />;
}
