import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { listarUsuarios, obterConfiguracao } from "@/lib/administracao";
import { PainelAdministracao } from "@/components/painel-administracao";

export default async function PaginaAdministracao() {
  const sessao = await obterSessao();
  if (!sessao) return null;

  const [podeAdministrarUsuarios, podeConfigurar] = await Promise.all([
    areaPermitida(sessao.id, sessao.perfil, "administrar_usuarios"),
    areaPermitida(sessao.id, sessao.perfil, "configuracoes"),
  ]);

  if (!podeAdministrarUsuarios && !podeConfigurar) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-2xl font-semibold text-(--color-text)">Administração do Sistema</h1>
        <p className="mt-3 rounded-xl border border-(--color-red)/30 bg-(--color-red)/10 px-4 py-3 text-sm text-(--color-red)">
          Nenhuma área de Administração liberada para este usuário. Solicite liberação ao administrador do sistema.
        </p>
      </div>
    );
  }

  const usuarios = podeAdministrarUsuarios ? await listarUsuarios() : [];
  const [diasAtencao, diasCritico, metaRev2] = podeConfigurar
    ? await Promise.all([
        obterConfiguracao("pep_dias_atencao", "3"),
        obterConfiguracao("pep_dias_critico", "6"),
        obterConfiguracao("meta_aprovacao_rev2", "80"),
      ])
    : ["3", "6", "80"];

  return (
    <PainelAdministracao
      usuarios={usuarios}
      podeAdministrarUsuarios={podeAdministrarUsuarios}
      podeConfigurar={podeConfigurar}
      diasAtencaoInicial={Number(diasAtencao)}
      diasCriticoInicial={Number(diasCritico)}
      metaRev2Inicial={Number(metaRev2)}
    />
  );
}
