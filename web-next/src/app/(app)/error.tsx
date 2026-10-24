"use client";

export default function ErroAreaAutenticada({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-(--color-bg) px-6 text-center">
      <h1 className="text-xl font-semibold text-(--color-text)">Não foi possível carregar esta página</h1>
      <p className="max-w-sm text-sm text-(--color-text-weak)">
        Pode ter sido uma falha passageira de conexão com o banco de dados. Tente de novo em alguns segundos.
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-(--color-navy) px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
      >
        Tentar de novo
      </button>
    </div>
  );
}
