import { buscarProjetosCombinados } from "@/lib/projetos";
import { obterSessao } from "@/lib/session";
import { PainelAnalisesMobile } from "@/components/mobile/painel-analises-mobile";

export default async function PaginaMobileBaixa() {
  const sessao = await obterSessao();
  const analistaProprio = sessao?.analistaVinculado || null;

  const projetos = await buscarProjetosCombinados({
    termoResponsavel: "", analistaProprio, statusEntre: ["EM ANÁLISE", "EM HOLD"],
  });

  return (
    <PainelAnalisesMobile
      titulo="Baixa de Análises"
      subtitulo="Análises pendentes — toque em Dar baixa para concluir"
      projetos={projetos}
      mostrarBaixa
    />
  );
}
