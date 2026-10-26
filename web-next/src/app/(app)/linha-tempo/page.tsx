import { buscarLinhasRevisao } from "@/lib/revisoes";
import { PainelLinhaTempo } from "@/components/painel-linha-tempo";

export default async function PaginaLinhaTempo() {
  const [linhasPrestadores, linhasCessionarios] = await Promise.all([
    buscarLinhasRevisao("prestadores"),
    buscarLinhasRevisao("cessionarios"),
  ]);

  return <PainelLinhaTempo linhasPrestadores={linhasPrestadores} linhasCessionarios={linhasCessionarios} />;
}
