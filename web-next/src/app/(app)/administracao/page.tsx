import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import {
  listarPerguntasChecklistAdmin,
  listarUsuarios,
  obterConfiguracao,
  relatorioValidacaoImportacao,
} from "@/lib/administracao";
import { LIMIARES_SOBRECARGA_PADRAO } from "@/lib/analistas-sobrecarga-calculo";
import { PainelAdministracao } from "@/components/painel-administracao";

export default async function PaginaAdministracao() {
  const sessao = await obterSessao();
  if (!sessao) return null;

  const [podeAdministrarUsuarios, podeAuditoria, podeConfigurar] = await Promise.all([
    areaPermitida(sessao.id, sessao.perfil, "administrar_usuarios"),
    areaPermitida(sessao.id, sessao.perfil, "auditoria"),
    areaPermitida(sessao.id, sessao.perfil, "configuracoes"),
  ]);

  const [usuarios, validacao, metaRev2, limiarCargaElevada, limiarCargaSobrecarregada, perguntasChecklist] = await Promise.all([
    podeAdministrarUsuarios ? listarUsuarios() : Promise.resolve([]),
    relatorioValidacaoImportacao(),
    podeConfigurar ? obterConfiguracao("meta_aprovacao_rev2", "80") : Promise.resolve("80"),
    podeConfigurar ? obterConfiguracao("carga_limiar_elevada", String(LIMIARES_SOBRECARGA_PADRAO.elevada)) : Promise.resolve(String(LIMIARES_SOBRECARGA_PADRAO.elevada)),
    podeConfigurar
      ? obterConfiguracao("carga_limiar_sobrecarregada", String(LIMIARES_SOBRECARGA_PADRAO.sobrecarregada))
      : Promise.resolve(String(LIMIARES_SOBRECARGA_PADRAO.sobrecarregada)),
    podeConfigurar ? listarPerguntasChecklistAdmin(false) : Promise.resolve([]),
  ]);

  return (
    <PainelAdministracao
      usuarios={usuarios}
      validacao={validacao}
      perguntasChecklist={perguntasChecklist}
      podeAdministrarUsuarios={podeAdministrarUsuarios}
      podeAuditoria={podeAuditoria}
      podeConfigurar={podeConfigurar}
      metaRev2Inicial={Number(metaRev2)}
      limiarCargaElevadaInicial={Number(limiarCargaElevada)}
      limiarCargaSobrecarregadaInicial={Number(limiarCargaSobrecarregada)}
    />
  );
}
