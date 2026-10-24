import { notFound, redirect } from "next/navigation";
import { obterCadastro } from "@/lib/cadastro";
import { obterSessao } from "@/lib/session";
import { FormularioCadastro } from "@/components/formulario-cadastro";

export default async function PaginaEditarCadastroPrestador({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao || (sessao.perfil !== "ADMIN" && sessao.perfil !== "GESTOR")) {
    redirect("/prestadores/cadastro");
  }
  const { id } = await params;
  const registro = await obterCadastro("prestadores", Number(id));
  if (!registro) notFound();
  return <FormularioCadastro tabela="prestadores" registro={registro} />;
}
