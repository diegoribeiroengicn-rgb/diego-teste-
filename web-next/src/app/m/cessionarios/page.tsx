import { buscarProjetos } from "@/lib/projetos";
import { obterSessao } from "@/lib/session";
import { PainelAnalisesMobile } from "@/components/mobile/painel-analises-mobile";

export default async function PaginaMobileCessionarios() {
  const sessao = await obterSessao();
  const analistaProprio = sessao?.analistaVinculado || null;

  const projetos = await buscarProjetos("cessionarios", {
    termoResponsavel: "", analistaProprio, statusEntre: ["EM ANÁLISE", "EM HOLD"],
  });

  return (
    <PainelAnalisesMobile
      titulo="Análise — Cessionários"
      subtitulo="Análises em andamento — toque em Dar baixa para concluir"
      projetos={projetos.map((p) => ({ ...p, origem: "cessionarios" as const }))}
      mostrarBaixa
    />
  );
}
