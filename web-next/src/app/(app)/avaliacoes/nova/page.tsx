import { buscarPerguntasChecklist, buscarResponsaveisDistintos } from "@/lib/avaliacao-checklist";
import { FormularioAvaliacaoChecklist } from "@/components/formulario-avaliacao-checklist";

export default async function PaginaNovaAvaliacao() {
  const [perguntas, responsaveis] = await Promise.all([
    buscarPerguntasChecklist(),
    buscarResponsaveisDistintos(),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Registrar Avaliação</h1>
      <p className="mt-1 max-w-2xl text-sm text-(--color-text-weak)">
        Avaliação por checklist de Prestadores e Cessionários — alimenta o Ranking automaticamente.
      </p>
      <FormularioAvaliacaoChecklist perguntas={perguntas} responsaveis={responsaveis} />
    </div>
  );
}
