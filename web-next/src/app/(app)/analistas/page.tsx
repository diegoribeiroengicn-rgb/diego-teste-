import { buscarLinhasProdutividade } from "@/lib/relatorios-mensais";
import { hojeBr } from "@/lib/dias-uteis";
import { PainelProdutividadeAnalistas } from "@/components/painel-produtividade-analistas";

export default async function PaginaPainelAnalistas({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; ano?: string }>;
}) {
  const { mes: mesParam, ano: anoParam } = await searchParams;
  const hoje = hojeBr();
  const mes = Number(mesParam) || hoje.getUTCMonth() + 1;
  const ano = Number(anoParam) || hoje.getUTCFullYear();

  const linhas = await buscarLinhasProdutividade(["prestadores", "cessionarios"]);

  return <PainelProdutividadeAnalistas linhas={linhas} mes={mes} ano={ano} />;
}
