import { buscarLinhasPrazo } from "@/lib/kpis-prazo";
import { obterSessao } from "@/lib/session";
import { PainelKpisPrazo } from "@/components/painel-kpis-prazo";

export default async function PaginaKpisPrazo() {
  const sessao = await obterSessao();
  const linhas = await buscarLinhasPrazo();
  return <PainelKpisPrazo linhas={linhas} perfil={sessao?.perfil ?? ""} analistaVinculado={sessao?.analistaVinculado ?? null} />;
}
