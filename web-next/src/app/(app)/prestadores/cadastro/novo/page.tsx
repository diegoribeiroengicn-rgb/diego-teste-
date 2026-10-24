import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/session";
import { FormularioCadastro } from "@/components/formulario-cadastro";

export default async function PaginaNovoCadastroPrestador() {
  const sessao = await obterSessao();
  if (!sessao || (sessao.perfil !== "ADMIN" && sessao.perfil !== "GESTOR")) {
    redirect("/prestadores/cadastro");
  }
  return <FormularioCadastro tabela="prestadores" />;
}
