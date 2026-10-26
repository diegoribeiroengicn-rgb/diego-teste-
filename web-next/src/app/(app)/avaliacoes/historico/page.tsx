import { buscarAvaliacoesChecklist, buscarPerguntasChecklist, buscarResponsaveisDistintos } from "@/lib/avaliacao-checklist";
import { TabelaAvaliacoesChecklist } from "@/components/tabela-avaliacoes-checklist";

export default async function PaginaHistoricoAvaliacoes() {
  const [avaliacoes, perguntas, responsaveis] = await Promise.all([
    buscarAvaliacoesChecklist(),
    buscarPerguntasChecklist(),
    buscarResponsaveisDistintos(),
  ]);

  return <TabelaAvaliacoesChecklist avaliacoes={avaliacoes} perguntas={perguntas} responsaveis={responsaveis} />;
}
