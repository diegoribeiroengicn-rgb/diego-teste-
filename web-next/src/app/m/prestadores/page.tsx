import { listarCadastro } from "@/lib/cadastro";
import { PainelConsultaPrestadores } from "@/components/mobile/painel-consulta-prestadores";

export default async function PaginaMobilePrestadores() {
  const prestadores = await listarCadastro("prestadores");
  return <PainelConsultaPrestadores prestadores={prestadores} />;
}
