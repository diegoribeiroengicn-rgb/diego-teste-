import { listarCessionariosAtivos } from "@/lib/cessionarios-ativos";
import { obterSessao } from "@/lib/session";
import { PainelCessionariosAtivos } from "@/components/painel-cessionarios-ativos";

export default async function PaginaCessionariosAtivos() {
  const sessao = await obterSessao();
  const registros = await listarCessionariosAtivos();
  const podeEditar = sessao?.perfil === "ADMIN" || sessao?.perfil === "GESTOR";

  return <PainelCessionariosAtivos registros={registros} podeEditar={podeEditar} />;
}
