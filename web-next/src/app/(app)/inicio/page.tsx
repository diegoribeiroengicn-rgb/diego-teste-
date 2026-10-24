import { obterSessao } from "@/lib/session";

export default async function PaginaInicio() {
  const sessao = await obterSessao();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-(--color-text)">
        Olá, {sessao?.nomeCompleto || sessao?.username}
      </h1>
      <p className="mt-2 text-(--color-text-weak)">
        GAT 2026 — versão em migração. Use o menu à esquerda para navegar pelos módulos já
        disponíveis; o restante continua sendo construído.
      </p>
    </div>
  );
}
