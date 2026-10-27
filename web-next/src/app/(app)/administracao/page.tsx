import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import {
  listarCodigosDisciplina,
  listarPerguntasChecklistAdmin,
  listarUsuarios,
  obterConfiguracao,
  relatorioValidacaoImportacao,
} from "@/lib/administracao";
import { PainelAdministracao } from "@/components/painel-administracao";

export default async function PaginaAdministracao() {
  const sessao = await obterSessao();
  if (!sessao) return null;

  const [podeAdministrarUsuarios, podeAuditoria, podeConfigurar] = await Promise.all([
    areaPermitida(sessao.id, sessao.perfil, "administrar_usuarios"),
    areaPermitida(sessao.id, sessao.perfil, "auditoria"),
    areaPermitida(sessao.id, sessao.perfil, "configuracoes"),
  ]);

  const [usuarios, validacao, diasAtencao, diasCritico, metaRev2, codigosDisciplina, perguntasChecklist] = await Promise.all([
    podeAdministrarUsuarios ? listarUsuarios() : Promise.resolve([]),
    relatorioValidacaoImportacao(),
    podeConfigurar ? obterConfiguracao("pep_dias_atencao", "3") : Promise.resolve("3"),
    podeConfigurar ? obterConfiguracao("pep_dias_critico", "6") : Promise.resolve("6"),
    podeConfigurar ? obterConfiguracao("meta_aprovacao_rev2", "80") : Promise.resolve("80"),
    podeConfigurar ? listarCodigosDisciplina() : Promise.resolve([]),
    podeConfigurar ? listarPerguntasChecklistAdmin(false) : Promise.resolve([]),
  ]);

  return (
    <PainelAdministracao
      usuarios={usuarios}
      validacao={validacao}
      codigosDisciplina={codigosDisciplina}
      perguntasChecklist={perguntasChecklist}
      podeAdministrarUsuarios={podeAdministrarUsuarios}
      podeAuditoria={podeAuditoria}
      podeConfigurar={podeConfigurar}
      diasAtencaoInicial={Number(diasAtencao)}
      diasCriticoInicial={Number(diasCritico)}
      metaRev2Inicial={Number(metaRev2)}
    />
  );
}
