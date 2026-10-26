import { obterSessao } from "@/lib/session";
import { buscarUsuarioPorId } from "@/lib/perfil";
import { FormularioSenha } from "@/components/formulario-senha";

function formatarData(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleString("pt-BR");
}

export default async function PaginaMeuPerfil() {
  const sessao = await obterSessao();
  const dados = sessao ? await buscarUsuarioPorId(sessao.id) : null;

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Meu Perfil</h1>
      <p className="mt-1 text-sm text-(--color-text-weak)">Dados da conta e alteração da própria senha.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
        <div>
          <p className="text-xs text-(--color-text-dim)">Usuário</p>
          <p className="mt-0.5 text-sm text-(--color-text)">{dados?.username ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-(--color-text-dim)">Nome completo</p>
          <p className="mt-0.5 text-sm text-(--color-text)">{dados?.nome_completo || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-(--color-text-dim)">Perfil</p>
          <p className="mt-0.5 text-sm text-(--color-text)">{dados?.perfil ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-(--color-text-dim)">Último acesso</p>
          <p className="mt-0.5 text-sm text-(--color-text)">{formatarData(dados?.ultimo_acesso ?? null)}</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
        <h2 className="text-sm font-semibold text-(--color-navy)">Alterar Senha</h2>
        <p className="mt-1 text-xs text-(--color-text-weak)">Informe a senha atual e defina uma nova senha pessoal.</p>
        <FormularioSenha />
      </div>
    </div>
  );
}
