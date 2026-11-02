import { buscarDadosOprCessionarios } from "@/lib/opr-cessionarios";
import { listarCessionariosAtivos } from "@/lib/cessionarios-ativos";
import { hojeBr } from "@/lib/dias-uteis";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
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
  const sessao = await obterSessao();

  const [dados, cessionariosAtivos, podeExportar] = await Promise.all([
    buscarDadosOprCessionarios(mes, ano),
    listarCessionariosAtivos(),
    sessao ? areaPermitida(sessao.id, sessao.perfil, "opr.exportar") : Promise.resolve(false),
  ]);

  return (
    <PainelOprCessionarios
      mes={mes} ano={ano} dados={dados} cessionariosAtivos={cessionariosAtivos} podeExportar={podeExportar}
    />
  );
}
