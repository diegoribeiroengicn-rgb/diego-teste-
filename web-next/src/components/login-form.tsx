"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const resposta = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, senha }),
      });
      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => ({}));
        // Erro de servidor (sem corpo com "erro" — ex.: SESSION_SECRET não
        // configurada) não é a mesma coisa que usuário/senha errados; dizer
        // isso induziria a tentar de novo achando que digitou errado.
        setErro(dados.erro ?? "Erro no servidor ao processar o login. Tente novamente em instantes.");
        return;
      }
      router.push("/inicio");
    } catch {
      setErro("Não foi possível conectar ao sistema. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
      <div className="space-y-1.5">
        <label
          htmlFor="usuario"
          className="text-sm font-medium text-(--color-text)"
        >
          Usuário
        </label>
        <input
          id="usuario"
          name="usuario"
          autoComplete="username"
          required
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          className="w-full rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3.5 py-2.5 text-(--color-text) outline-none transition-colors focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/20"
          placeholder="seu.usuario"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="senha"
          className="text-sm font-medium text-(--color-text)"
        >
          Senha
        </label>
        <div className="relative">
          <input
            id="senha"
            name="senha"
            type={mostrarSenha ? "text" : "password"}
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3.5 py-2.5 pr-11 text-(--color-text) outline-none transition-colors focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/20"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-(--color-text-weak) hover:text-(--color-text)"
            aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
          >
            {mostrarSenha ? <IconeOlhoFechado /> : <IconeOlho />}
          </button>
        </div>
      </div>

      {erro && (
        <p className="rounded-lg bg-(--color-red-bg) px-3.5 py-2.5 text-sm text-(--color-red)">
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={carregando}
        className="w-full rounded-lg bg-(--color-navy) py-2.5 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {carregando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

function IconeOlho() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconeOlhoFechado() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.88 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a13.6 13.6 0 0 1-3.17 4.24M6.6 6.6C4.2 8.2 2 12 2 12a13.6 13.6 0 0 0 5.17 5.24A10.6 10.6 0 0 0 12 19"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
