import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/session";
import { FormularioCadastro } from "@/components/formulario-cadastro";

export default async function PaginaNovoCadastroCessionario() {
  const sessao = await obterSessao();
  if (!sessao || (sessao.perfil !== "ADMIN" && sessao.perfil !== "GESTOR")) {
    redirect("/cessionarios/cadastro");
  }
  return <FormularioCadastro tabela="cessionarios" />;
}
