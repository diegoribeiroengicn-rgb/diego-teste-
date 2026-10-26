import { obterSessao } from "@/lib/session";
import { buscarAlertasPessoais } from "@/lib/meus-alertas";
import { PainelMeusAlertas } from "@/components/painel-meus-alertas";

export default async function PaginaMeusAlertas() {
  const sessao = await obterSessao();
  const { prazoPendente, manuaisPendente } = await buscarAlertasPessoais(sessao?.username ?? "", sessao?.analistaVinculado ?? null);

  return (
    <PainelMeusAlertas
      prazoPendente={prazoPendente}
      manuaisPendente={manuaisPendente}
      temAnalistaVinculado={!!sessao?.analistaVinculado}
    />
  );
}
