import { connection } from "next/server";
import { buscarLinhasRevisao } from "@/lib/revisoes";
import { PainelLinhaTempo } from "@/components/painel-linha-tempo";

export default async function PaginaLinhaTempo() {
  // Renderização por requisição: a página lê o banco, nunca no build.
  await connection();
  const [linhasPrestadores, linhasCessionarios] = await Promise.all([
    buscarLinhasRevisao("prestadores"),
    buscarLinhasRevisao("cessionarios"),
  ]);

  return <PainelLinhaTempo linhasPrestadores={linhasPrestadores} linhasCessionarios={linhasCessionarios} />;
}
