import { notFound, redirect } from "next/navigation";
import { obterCadastro } from "@/lib/cadastro";
import { obterSessao } from "@/lib/session";
import { FormularioCadastro } from "@/components/formulario-cadastro";

export default async function PaginaEditarCadastroCessionario({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao || (sessao.perfil !== "ADMIN" && sessao.perfil !== "GESTOR")) {
    redirect("/cessionarios/cadastro");
  }
  const { id } = await params;
  const registro = await obterCadastro("cessionarios", Number(id));
  if (!registro) notFound();
  return <FormularioCadastro tabela="cessionarios" registro={registro} />;
}
