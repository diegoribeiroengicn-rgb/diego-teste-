import { obterSessao } from "@/lib/session";
import { buscarAlertasPessoais } from "@/lib/meus-alertas";
import { PopupAlertasPendentesLazy as PopupAlertasPendentes } from "@/components/popup-alertas-pendentes-lazy";

export default async function PaginaInicio() {
  const sessao = await obterSessao();
  const primeiroNome = (sessao?.nomeCompleto || sessao?.username || "").split(" ")[0];
  const pendentes = sessao
    ? await buscarAlertasPessoais(sessao.username, sessao.analistaVinculado)
    : { prazoPendente: [], manuaisPendente: [] };

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Olá, {primeiroNome}</h1>
      <p className="mt-1.5 text-sm text-(--color-text-weak)">
        GAT 2026 — versão em migração. Use o menu à esquerda para navegar pelos módulos já disponíveis.
      </p>
      <PopupAlertasPendentes prazoPendenteInicial={pendentes.prazoPendente} manuaisPendenteInicial={pendentes.manuaisPendente} />
    </div>
  );
}
