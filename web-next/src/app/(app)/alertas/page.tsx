import { buscarAlertasModulo } from "@/lib/alertas-engine";
import { PainelAlertas } from "@/components/painel-alertas";

export default async function PaginaAlertas() {
  const [prestadores, cessionarios] = await Promise.all([
    buscarAlertasModulo("prestadores"),
    buscarAlertasModulo("cessionarios"),
  ]);

  return <PainelAlertas alertasIniciais={[...prestadores, ...cessionarios]} />;
}
