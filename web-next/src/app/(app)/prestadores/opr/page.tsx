import { buscarDadosOprPrestadores } from "@/lib/opr-prestadores";
import { hojeBr } from "@/lib/dias-uteis";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { PainelOprPrestadores } from "@/components/painel-opr-prestadores";

export default async function PaginaOprPrestadores({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; ano?: string }>;
}) {
  const { mes: mesParam, ano: anoParam } = await searchParams;
  const hoje = hojeBr();
  const mes = Number(mesParam) || hoje.getUTCMonth() + 1;
  const ano = Number(anoParam) || hoje.getUTCFullYear();
  const sessao = await obterSessao();

  const [dados, podeExportar] = await Promise.all([
    buscarDadosOprPrestadores(mes, ano),
    sessao ? areaPermitida(sessao.id, sessao.perfil, "opr.exportar") : Promise.resolve(false),
  ]);

  return <PainelOprPrestadores mes={mes} ano={ano} dados={dados} podeExportar={podeExportar} />;
}
