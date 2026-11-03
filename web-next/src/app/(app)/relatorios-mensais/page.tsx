import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { buscarLinhasProdutividade } from "@/lib/relatorios-mensais";
import { obterObservacaoMensal } from "@/lib/observacao-mensal";
import { hojeBr } from "@/lib/dias-uteis";
import { PainelRelatoriosMensais } from "@/components/painel-relatorios-mensais";

export default async function PaginaRelatoriosMensais({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; ano?: string }>;
}) {
  const sessao = await obterSessao();
  if (!sessao) return null;

  const podeAcessar = await areaPermitida(sessao.id, sessao.perfil, "relatorios");
  if (!podeAcessar) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-2xl font-semibold text-(--color-text)">Relatórios Mensais</h1>
        <p className="mt-3 rounded-xl border border-(--color-red)/30 bg-(--color-red)/10 px-4 py-3 text-sm text-(--color-red)">
          Acesso não autorizado ao módulo Relatórios. Solicite liberação ao administrador do sistema.
        </p>
      </div>
    );
  }

  const { mes: mesParam, ano: anoParam } = await searchParams;
  const hoje = hojeBr();
  const mes = Number(mesParam) || hoje.getUTCMonth() + 1;
  const ano = Number(anoParam) || hoje.getUTCFullYear();

  const [linhas, observacaoInicial] = await Promise.all([
    buscarLinhasProdutividade(["prestadores", "cessionarios"]),
    obterObservacaoMensal(mes, ano),
  ]);

  return <PainelRelatoriosMensais linhas={linhas} mes={mes} ano={ano} observacaoInicial={observacaoInicial} />;
}
