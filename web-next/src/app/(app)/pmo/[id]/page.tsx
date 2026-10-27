import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { PainelPmoProjeto } from "@/components/painel-pmo-projeto";

export default async function PaginaPmoProjeto({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) return null;

  const podeAcessar = await areaPermitida(sessao.id, sessao.perfil, "pmo");
  if (!podeAcessar) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-2xl font-semibold text-(--color-text)">PMO — Projeto</h1>
        <p className="mt-3 rounded-xl border border-(--color-red)/30 bg-(--color-red)/10 px-4 py-3 text-sm text-(--color-red)">
          Acesso não autorizado ao módulo PMO. Solicite liberação ao administrador do sistema.
        </p>
      </div>
    );
  }

  const { id } = await params;
  return <PainelPmoProjeto projetoId={Number(id)} />;
}
