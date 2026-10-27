import { buscarProjetos } from "@/lib/projetos";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { TabelaProjetos } from "@/components/tabela-projetos";

export default async function PaginaEmHoldPrestadores({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sessao = await obterSessao();
  const { q } = await searchParams;
  const busca = (q || "").trim();
  const analistaProprio = sessao?.analistaVinculado || null;
  const podeCadastrar = sessao ? await areaPermitida(sessao.id, sessao.perfil, "prestadores.cadastrar") : false;
  const podeEditar = sessao ? await areaPermitida(sessao.id, sessao.perfil, "prestadores.editar") : false;

  const projetos = await buscarProjetos("prestadores", { termoResponsavel: busca, analistaProprio, statusEntre: ["EM HOLD"] });

  return (
    <TabelaProjetos
      titulo="Prestadores — Em HOLD"
      colunaEntidade="Prestador"
      tabela="prestadores"
      projetos={projetos}
      busca={busca}
      analistaProprio={analistaProprio}
      temAnalistaProprio={!!analistaProprio}
      podeCadastrar={podeCadastrar}
      podeEditar={podeEditar}
    />
  );
}
