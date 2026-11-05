import { redirect } from "next/navigation";

/** Módulo antigo "Localização de ATs" — eliminado como módulo
 * independente: sua finalidade (localizar ATs de Prestadores e
 * Cessionários combinadas, com histórico por grupo de revisão) foi
 * incorporada integralmente à busca avançada do módulo Projetos
 * (ver `/projetos` e `src/components/painel-projetos-busca.tsx`).
 * Mantido só como redirecionamento — mesmo padrão de `/m/baixa` →
 * `/m/cessionarios` — para não quebrar favoritos/links antigos que
 * ainda apontem para esta rota. */
export default function PaginaLocalizacaoAtsAntiga() {
  redirect("/projetos");
}
