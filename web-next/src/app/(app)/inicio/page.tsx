import { obterSessao } from "@/lib/session";
import { buscarAlertasPessoais } from "@/lib/meus-alertas";
import { buscarLinhasLocalizacao } from "@/lib/localizacao-ats";
import { buscarAtividades } from "@/lib/atividades";
import { hojeBr } from "@/lib/dias-uteis";
import { PopupAlertasPendentesLazy as PopupAlertasPendentes } from "@/components/popup-alertas-pendentes-lazy";
import { PainelGovernanca } from "@/components/painel-governanca";
import type { ChaveVer, FiltrosPainel } from "@/lib/painel-governanca-calculo";
import { ROTULO_VER } from "@/lib/painel-governanca-calculo";

type Params = Partial<Record<keyof FiltrosPainel | "ver" | "busca" | "valor", string>>;

/** Tela inicial = Painel de Governança: indicadores, SLA, equipe, alertas e
 * movimentações calculados na hora sobre as tabelas de Prestadores e
 * Cessionários (mesma base e mesma regra de SLA das demais telas). */
export default async function PaginaInicio({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const sessao = await obterSessao();
  const primeiroNome = (sessao?.nomeCompleto || sessao?.username || "").split(" ")[0];
  const filtros: FiltrosPainel = {
    de: sp.de || "", ate: sp.ate || "", codigo: (sp.codigo || "").trim(), prestador: (sp.prestador || "").trim(),
    disciplina: sp.disciplina || "", analista: sp.analista || "", status: sp.status || "", modulo: sp.modulo === "prestadores" || sp.modulo === "cessionarios" ? sp.modulo : "",
  };
  const ver = sp.ver && sp.ver in ROTULO_VER ? (sp.ver as ChaveVer) : null;

  const [linhas, atividades, pendentes] = await Promise.all([
    buscarLinhasLocalizacao(),
    buscarAtividades().catch(() => []),
    sessao ? buscarAlertasPessoais(sessao.username, sessao.analistaVinculado) : Promise.resolve({ prazoPendente: [], manuaisPendente: [] }),
  ]);

  return (
    <>
      <PainelGovernanca
        primeiroNome={primeiroNome} linhas={linhas} filtros={filtros} ver={ver} busca={(sp.busca || "").trim()}
        atividades={atividades.slice(0, 12)} agora={hojeBr().getTime()}
      />
      <PopupAlertasPendentes prazoPendenteInicial={pendentes.prazoPendente} manuaisPendenteInicial={pendentes.manuaisPendente} />
    </>
  );
}
