import { notFound } from "next/navigation";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { obterCessionarioCompleto } from "@/lib/analise";
import { FormularioAnalise } from "@/components/formulario-analise";

export default async function PaginaEditarAnaliseCessionario({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) return null;

  const podeEditar = await areaPermitida(sessao.id, sessao.perfil, "cessionarios.editar");
  if (!podeEditar) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-2xl font-semibold text-(--color-text)">Editar análise — Cessionário</h1>
        <p className="mt-3 rounded-xl border border-(--color-red)/30 bg-(--color-red)/10 px-4 py-3 text-sm text-(--color-red)">
          Acesso não autorizado a editar análises de cessionários.
        </p>
      </div>
    );
  }

  const { id } = await params;
  const registro = await obterCessionarioCompleto(Number(id));
  if (!registro) notFound();

  return <FormularioAnalise tabela="cessionarios" registro={registro} />;
}
