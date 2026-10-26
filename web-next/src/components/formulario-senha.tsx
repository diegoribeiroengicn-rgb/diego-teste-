"use client";

import { useState } from "react";

const classeInput =
  "w-full rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3.5 py-2.5 text-sm text-(--color-text) outline-none transition-colors focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/20";

export function FormularioSenha() {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(false);
    setCarregando(true);
    try {
      const resposta = await fetch("/api/perfil/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual, novaSenha, confirmacao }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        setErro(corpo.erro ?? "Erro ao alterar a senha.");
        return;
      }
      setSucesso(true);
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmacao("");
    } catch {
      setErro("Não foi possível conectar ao sistema.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="mt-4 max-w-sm space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-(--color-text)">Senha atual</span>
        <input type="password" required value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} className={classeInput} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-(--color-text)">Nova senha</span>
        <input type="password" required value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} className={classeInput} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-(--color-text)">Confirmar nova senha</span>
        <input type="password" required value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} className={classeInput} />
      </label>

      {erro && <p className="rounded-lg bg-(--color-red-bg) px-3.5 py-2.5 text-sm text-(--color-red)">{erro}</p>}
      {sucesso && <p className="rounded-lg bg-(--color-green-bg) px-3.5 py-2.5 text-sm text-(--color-green)">Senha alterada com sucesso.</p>}

      <button
        type="submit"
        disabled={carregando}
        className="rounded-full bg-(--color-navy) px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {carregando ? "Salvando…" : "Salvar nova senha"}
      </button>
    </form>
  );
}
