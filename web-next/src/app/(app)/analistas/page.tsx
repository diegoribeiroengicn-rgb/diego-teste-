import { buscarLinhasProdutividade } from "@/lib/relatorios-mensais";
import { hojeBr } from "@/lib/dias-uteis";
import { obterConfiguracao } from "@/lib/administracao";
import { buscarLinhasCargaAnalistas } from "@/lib/analistas-sobrecarga";
import { calcularCargaAnalistas, LIMIARES_SOBRECARGA_PADRAO } from "@/lib/analistas-sobrecarga-calculo";
import { PainelProdutividadeAnalistas } from "@/components/painel-produtividade-analistas";
import { PainelCargaAnalistas } from "@/components/painel-carga-analistas";

export default async function PaginaPainelAnalistas({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; ano?: string }>;
}) {
  const { mes: mesParam, ano: anoParam } = await searchParams;
  const hoje = hojeBr();
  const mes = Number(mesParam) || hoje.getUTCMonth() + 1;
  const ano = Number(anoParam) || hoje.getUTCFullYear();

  const [linhas, linhasCarga, limiarElevada, limiarSobrecarregada] = await Promise.all([
    buscarLinhasProdutividade(["prestadores", "cessionarios"]),
    buscarLinhasCargaAnalistas(),
    obterConfiguracao("carga_limiar_elevada", String(LIMIARES_SOBRECARGA_PADRAO.elevada)),
    obterConfiguracao("carga_limiar_sobrecarregada", String(LIMIARES_SOBRECARGA_PADRAO.sobrecarregada)),
  ]);

  const cargas = calcularCargaAnalistas(linhasCarga, { elevada: Number(limiarElevada), sobrecarregada: Number(limiarSobrecarregada) });

  return (
    <>
      <div className="mx-auto max-w-6xl border-b border-(--color-border) px-8 pb-8 pt-10">
        <PainelCargaAnalistas cargas={cargas} />
      </div>
      <PainelProdutividadeAnalistas linhas={linhas} mes={mes} ano={ano} />
    </>
  );
}
