import { buscarLembretesPep } from "@/lib/lembretes-pep";
import { TabelaLembretesPep } from "@/components/tabela-lembretes-pep";

export default async function PaginaLembretesPep() {
  const lembretes = await buscarLembretesPep();
  return <TabelaLembretesPep lembretes={lembretes} />;
}
