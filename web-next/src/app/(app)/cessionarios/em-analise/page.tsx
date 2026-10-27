import { buscarProjetos } from "@/lib/projetos";
import { obterSessao } from "@/lib/session";
import { TabelaProjetos } from "@/components/tabela-projetos";

export default async function PaginaEmAnaliseCessionarios({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sessao = await obterSessao();
  const { q } = await searchParams;
  const busca = (q || "").trim();
  const analistaProprio = sessao?.analistaVinculado || null;

  const projetos = await buscarProjetos("cessionarios", { termoResponsavel: busca, analistaProprio, statusEntre: ["EM ANÁLISE"] });

  return (
    <TabelaProjetos
      titulo="Cessionários — Em Análise"
      colunaEntidade="Cessionário"
      tabela="cessionarios"
      projetos={projetos}
      busca={busca}
      analistaProprio={analistaProprio}
      temAnalistaProprio={!!analistaProprio}
    />
  );
}
