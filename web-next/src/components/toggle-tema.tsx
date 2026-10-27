"use client";

import { useState } from "react";

/** Alterna entre Tema Claro e Tema Escuro — troca imediata (sem reload)
 * via atributo `data-theme` em `<html>`, com a escolha persistida por
 * usuário no banco. Mesmo controle de gat/styles.py (`st.segmented_control`
 * "Aparência" na barra lateral), agora como botão de dois estados. */
export function ToggleTema({ temaInicial }: { temaInicial: string }) {
  const [tema, setTema] = useState<"claro" | "escuro">(temaInicial === "escuro" ? "escuro" : "claro");

  function aplicar(novoTema: "claro" | "escuro") {
    document.documentElement.setAttribute("data-theme", novoTema === "escuro" ? "dark" : "light");
    setTema(novoTema);
    void fetch("/api/perfil/tema", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tema: novoTema }),
    });
  }

  return (
    <div className="mt-2 flex items-center gap-1 rounded-full border border-(--color-border) bg-(--color-surface-2) p-1 text-xs font-medium">
      <button
        type="button"
        onClick={() => aplicar("claro")}
        aria-pressed={tema === "claro"}
        className={`flex-1 rounded-full px-3 py-1.5 transition-colors ${
          tema === "claro" ? "bg-(--color-surface-1) text-(--color-text) shadow-sm" : "text-(--color-text-weak)"
        }`}
      >
        Claro
      </button>
      <button
        type="button"
        onClick={() => aplicar("escuro")}
        aria-pressed={tema === "escuro"}
        className={`flex-1 rounded-full px-3 py-1.5 transition-colors ${
          tema === "escuro" ? "bg-(--color-surface-1) text-(--color-text) shadow-sm" : "text-(--color-text-weak)"
        }`}
      >
        Escuro
      </button>
    </div>
  );
}
