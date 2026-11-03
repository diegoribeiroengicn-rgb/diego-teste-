"use client";

import { useEffect, useState } from "react";

type EventoInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Botão "Instalar aplicativo" na tela de login — oferece o GAT Mobile
 * (PWA enxuto com busca de ATs e Dar Baixa, ver src/app/m/layout.tsx)
 * para instalação na tela inicial do celular. No Chrome/Android, captura
 * o evento `beforeinstallprompt` e aciona o prompt nativo; no iOS/Safari
 * esse evento não existe, então mostra a instrução manual (Compartilhar
 * → Adicionar à Tela de Início). Não aparece se o app já está instalado
 * (rodando em modo standalone) ou em navegadores sem suporte a nenhum
 * dos dois caminhos. */
type EstadoInstalacao = { instalado: boolean; ehIos: boolean };

function estadoInicial(): EstadoInstalacao {
  if (typeof window === "undefined") return { instalado: false, ehIos: false };
  return {
    instalado: window.matchMedia("(display-mode: standalone)").matches,
    ehIos: /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window),
  };
}

export function InstalarAppMobile() {
  const [eventoInstalacao, setEventoInstalacao] = useState<EventoInstalacao | null>(null);
  const [{ instalado, ehIos }, setEstado] = useState<EstadoInstalacao>(estadoInicial);

  useEffect(() => {
    function aoFicarDisponivel(e: Event) {
      e.preventDefault();
      setEventoInstalacao(e as EventoInstalacao);
    }
    function aoInstalar() {
      setEstado((anterior) => ({ ...anterior, instalado: true }));
      setEventoInstalacao(null);
    }
    window.addEventListener("beforeinstallprompt", aoFicarDisponivel);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoFicarDisponivel);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  async function instalar() {
    if (!eventoInstalacao) return;
    await eventoInstalacao.prompt();
    await eventoInstalacao.userChoice;
    setEventoInstalacao(null);
  }

  if (instalado || (!eventoInstalacao && !ehIos)) return null;

  return (
    <div className="mt-6 rounded-xl border border-(--color-border) bg-(--color-surface-1) px-4 py-3">
      <p className="text-sm font-medium text-(--color-text)">GAT Mobile para analistas</p>
      <p className="mt-0.5 text-xs text-(--color-text-weak)">
        Busca de ATs e Dar Baixa, direto da tela inicial do celular.
      </p>
      {eventoInstalacao ? (
        <button
          onClick={instalar}
          className="mt-2 rounded-full bg-(--color-navy) px-4 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          Instalar aplicativo
        </button>
      ) : (
        <p className="mt-2 text-xs text-(--color-text-weak)">
          No iPhone: toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.
        </p>
      )}
    </div>
  );
}
