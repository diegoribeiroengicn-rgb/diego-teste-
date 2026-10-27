import { buscarLinhasLocalizacao } from "@/lib/localizacao-ats";
import { PainelLocalizacaoAts } from "@/components/painel-localizacao-ats";

export default async function PaginaLocalizacaoAts() {
  const linhas = await buscarLinhasLocalizacao();
  return <PainelLocalizacaoAts linhas={linhas} />;
}
