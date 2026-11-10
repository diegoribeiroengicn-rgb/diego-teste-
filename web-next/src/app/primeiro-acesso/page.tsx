import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/session";
import { FormularioPrimeiroAcesso } from "@/components/formulario-primeiro-acesso";

// Depende da sessão (cookie) — nunca é candidata a página estática.
export const instant = false;

export default async function PaginaPrimeiroAcesso() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/");
  if (!sessao.deveTrocarSenha) redirect("/inicio");

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-(--color-bg) px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-(--color-text)">Primeiro acesso</h1>
        <p className="mt-1.5 text-sm text-(--color-text-weak)">
          Por segurança, defina uma senha pessoal antes de continuar. Informe a senha
          temporária que a Administração passou para você.
        </p>
        <FormularioPrimeiroAcesso />
      </div>
    </div>
  );
}
