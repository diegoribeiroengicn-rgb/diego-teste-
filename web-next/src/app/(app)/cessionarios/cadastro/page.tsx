import { listarCadastro } from "@/lib/cadastro";
import { obterSessao } from "@/lib/session";
import { TabelaCadastro } from "@/components/tabela-cadastro";

export default async function PaginaCadastroCessionarios() {
  const sessao = await obterSessao();
  const registros = await listarCadastro("cessionarios");
  const podeEditar = sessao?.perfil === "ADMIN" || sessao?.perfil === "GESTOR";

  return (
    <TabelaCadastro
      tabela="cessionarios"
      titulo="Cadastro de Cessionários"
      subtitulo="Cadastro mestre dos cessionários — empresa, LUC/RVP/RCI e responsável. O módulo Projetos continua sendo usado para cadastrar e acompanhar as análises técnicas."
      registros={registros}
      podeEditar={podeEditar}
    />
  );
}
