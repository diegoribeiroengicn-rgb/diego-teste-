import { buscarDadosOprCessionarios } from "@/lib/opr-cessionarios";
import { listarCessionariosAtivos } from "@/lib/cessionarios-ativos";
import { hojeBr } from "@/lib/dias-uteis";
import { PainelOprCessionarios } from "@/components/painel-opr-cessionarios";

export default async function PaginaOprCessionarios({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; ano?: string }>;
}) {
  const { mes: mesParam, ano: anoParam } = await searchParams;
  const hoje = hojeBr();
  const mes = Number(mesParam) || hoje.getUTCMonth() + 1;
  const ano = Number(anoParam) || hoje.getUTCFullYear();

  const [dados, cessionariosAtivos] = await Promise.all([
    buscarDadosOprCessionarios(mes, ano),
    listarCessionariosAtivos(),
  ]);

  return <PainelOprCessionarios mes={mes} ano={ano} dados={dados} cessionariosAtivos={cessionariosAtivos} />;
}
