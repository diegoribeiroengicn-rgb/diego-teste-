import { buscarProjetosCombinados } from "@/lib/projetos";
import { obterSessao } from "@/lib/session";
import { PainelAnalisesMobile } from "@/components/mobile/painel-analises-mobile";

export default async function PaginaMobileAnalises() {
  const sessao = await obterSessao();
  const analistaProprio = sessao?.analistaVinculado || null;

  const projetos = await buscarProjetosCombinados({ termoResponsavel: "", analistaProprio });

  return (
    <PainelAnalisesMobile
      titulo="Análises"
      subtitulo={analistaProprio ? `Suas análises (${analistaProprio}) aparecem primeiro` : "Todas as análises"}
      projetos={projetos}
      mostrarBaixa={false}
    />
  );
}
