import { buscarLinhasLocalizacao } from "@/lib/localizacao-ats";
import { PainelProjetosBusca } from "@/components/painel-projetos-busca";

/** Módulo Projetos — busca avançada de todas as ATs cadastradas no
 * sistema (Prestadores + Cessionários), com filtros combináveis. Absorve
 * a finalidade do antigo módulo independente "Localização de ATs", que
 * hoje é só um redirecionamento para esta rota (ver `/localizacao-ats`). */
export default async function PaginaProjetos() {
  const linhas = await buscarLinhasLocalizacao();
  return <PainelProjetosBusca linhas={linhas} />;
}
