import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { buscarBaseVisaoGestor } from "@/lib/visao-gestor";
import { buscarListaPrioridades } from "@/lib/lista-prioridades";
import { buscarAlertasModulo } from "@/lib/alertas-engine";
import { statusRadarAtivo, TIPO_AVALIACAO_OBRIGATORIA } from "@/lib/alertas-engine-calculo";
import { PainelVisaoGestor } from "@/components/painel-visao-gestor";

const PERFIS_PERMITIDOS = ["ADMIN", "GESTOR"];

export default async function PaginaVisaoGestor() {
  const sessao = await obterSessao();
  if (!sessao) return null;

  const podeAcessar = PERFIS_PERMITIDOS.includes(sessao.perfil) && (await areaPermitida(sessao.id, sessao.perfil, "visao_gestor"));
  if (!podeAcessar) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-2xl font-semibold text-(--color-text)">Visão do Gestor</h1>
        <p className="mt-3 rounded-xl border border-(--color-red)/30 bg-(--color-red)/10 px-4 py-3 text-sm text-(--color-red)">
          Acesso restrito a Gestor e Administrador. Solicite liberação ao administrador do sistema.
        </p>
      </div>
    );
  }

  const [base, listaPrioridades, alertasPrest, alertasCess] = await Promise.all([
    buscarBaseVisaoGestor(),
    buscarListaPrioridades(),
    buscarAlertasModulo("prestadores"),
    buscarAlertasModulo("cessionarios"),
  ]);

  const todosAlertas = [...alertasPrest, ...alertasCess];
  const alertasAtivos = todosAlertas.filter((a) => statusRadarAtivo(a.status));
  const pendenciasAvaliacao = todosAlertas.filter((a) => a.tipoAlerta === TIPO_AVALIACAO_OBRIGATORIA);

  return <PainelVisaoGestor base={base} listaPrioridades={listaPrioridades} alertasAtivos={alertasAtivos} pendenciasAvaliacao={pendenciasAvaliacao} />;
}
