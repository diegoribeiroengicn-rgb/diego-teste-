import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { perfilPodeArquivarERestaurar, perfilPodeExcluirDefinitivamente } from "@/lib/arquivo-calculo";
import { PainelArquivo } from "@/components/painel-arquivo";

export default async function PaginaArquivo() {
  const sessao = await obterSessao();
  if (!sessao) return null;

  const podeAcessar = await areaPermitida(sessao.id, sessao.perfil, "arquivo");
  if (!podeAcessar) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-2xl font-semibold text-(--color-text)">Arquivo</h1>
        <p className="mt-3 rounded-xl border border-(--color-red)/30 bg-(--color-red)/10 px-4 py-3 text-sm text-(--color-red)">
          Acesso não autorizado ao módulo Arquivo. Solicite liberação ao administrador do sistema.
        </p>
      </div>
    );
  }

  return (
    <PainelArquivo
      podeRestaurar={perfilPodeArquivarERestaurar(sessao.perfil)}
      podeExcluirDefinitivamente={perfilPodeExcluirDefinitivamente(sessao.perfil)}
    />
  );
}
