import { buscarProjetos } from "@/lib/projetos";
import { obterSessao } from "@/lib/session";
import { PainelAnalisesMobile } from "@/components/mobile/painel-analises-mobile";

export default async function PaginaMobilePrestadores() {
  const sessao = await obterSessao();
  const analistaProprio = sessao?.analistaVinculado || null;

  const projetos = await buscarProjetos("prestadores", {
    termoResponsavel: "", analistaProprio, statusEntre: ["EM ANÁLISE", "EM HOLD"],
  });

  return (
    <PainelAnalisesMobile
      titulo="Análise — Prestadores"
      subtitulo="Análises em andamento — toque em Dar baixa para concluir"
      projetos={projetos.map((p) => ({ ...p, origem: "prestadores" as const }))}
      mostrarBaixa
    />
  );
}
