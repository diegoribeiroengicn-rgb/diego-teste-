import { listarCadastro } from "@/lib/cadastro";
import { obterSessao } from "@/lib/session";
import { TabelaCadastro } from "@/components/tabela-cadastro";

export default async function PaginaCadastroPrestadores() {
  const sessao = await obterSessao();
  const registros = await listarCadastro("prestadores");
  const podeEditar = sessao?.perfil === "ADMIN" || sessao?.perfil === "GESTOR";

  return (
    <TabelaCadastro
      tabela="prestadores"
      titulo="Cadastro de Prestadores"
      subtitulo="Cadastro mestre dos prestadores — empresa, PEP e responsável. O módulo Projetos continua sendo usado para cadastrar e acompanhar as análises técnicas."
      registros={registros}
      podeEditar={podeEditar}
    />
  );
}
