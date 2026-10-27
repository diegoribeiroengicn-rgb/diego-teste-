import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { PainelPmoPortfolio } from "@/components/painel-pmo-portfolio";

export default async function PaginaPmoPortfolio() {
  const sessao = await obterSessao();
  if (!sessao) return null;

  const podeAcessar = await areaPermitida(sessao.id, sessao.perfil, "pmo");
  if (!podeAcessar) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-2xl font-semibold text-(--color-text)">PMO — Portfólio de Projetos</h1>
        <p className="mt-3 rounded-xl border border-(--color-red)/30 bg-(--color-red)/10 px-4 py-3 text-sm text-(--color-red)">
          Acesso não autorizado ao módulo PMO. Solicite liberação ao administrador do sistema.
        </p>
      </div>
    );
  }

  const podeCadastrar = await areaPermitida(sessao.id, sessao.perfil, "pmo.cadastrar");
  return <PainelPmoPortfolio podeCadastrar={podeCadastrar} />;
}
