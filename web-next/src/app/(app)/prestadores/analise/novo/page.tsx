import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { FormularioAnalise } from "@/components/formulario-analise";

export default async function PaginaNovaAnalisePrestador() {
  const sessao = await obterSessao();
  if (!sessao) return null;

  const podeCadastrar = await areaPermitida(sessao.id, sessao.perfil, "prestadores.cadastrar");
  if (!podeCadastrar) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-2xl font-semibold text-(--color-text)">Nova análise — Prestador</h1>
        <p className="mt-3 rounded-xl border border-(--color-red)/30 bg-(--color-red)/10 px-4 py-3 text-sm text-(--color-red)">
          Acesso não autorizado a cadastrar análises de prestadores.
        </p>
      </div>
    );
  }

  return <FormularioAnalise tabela="prestadores" />;
}
