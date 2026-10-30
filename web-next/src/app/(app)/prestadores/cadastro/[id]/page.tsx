import { notFound, redirect } from "next/navigation";
import { obterCadastro } from "@/lib/cadastro";
import { obterSessao } from "@/lib/session";
import { FormularioCadastro } from "@/components/formulario-cadastro";
import { SecaoObrasPrestador } from "@/components/secao-obras-prestador";
import { listarObrasPrestador } from "@/lib/obra";

export default async function PaginaEditarCadastroPrestador({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao || (sessao.perfil !== "ADMIN" && sessao.perfil !== "GESTOR")) {
    redirect("/prestadores/cadastro");
  }
  const { id } = await params;
  const registro = await obterCadastro("prestadores", Number(id));
  if (!registro) notFound();
  const obras = await listarObrasPrestador(registro.id);
  return (
    <>
      <FormularioCadastro tabela="prestadores" registro={registro} />
      <div className="mx-auto max-w-2xl px-8 pb-10">
        <SecaoObrasPrestador prestadorId={registro.id} obrasIniciais={obras} podeEditar />
      </div>
    </>
  );
}
