import { buscarListaPrioridades } from "@/lib/lista-prioridades";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { podeVerContratual } from "@/lib/prioridades";
import { TabelaPrioridades } from "@/components/tabela-prioridades";

export default async function PaginaListaPrioridades() {
  const sessao = await obterSessao();
  const [itens, podeGerarRelatorios] = await Promise.all([
    buscarListaPrioridades(sessao ? await podeVerContratual(sessao.id, sessao.perfil) : false),
    sessao ? areaPermitida(sessao.id, sessao.perfil, "lista_prioridades.relatorios") : Promise.resolve(false),
  ]);
  return <TabelaPrioridades itens={itens} podeGerarRelatorios={podeGerarRelatorios} />;
}
