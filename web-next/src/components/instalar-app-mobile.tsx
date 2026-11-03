"use client";

import { useEffect, useState } from "react";

type EventoInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Plataforma = "ios" | "android" | "outra";

type EstadoInstalacao = { instalado: boolean; plataforma: Plataforma };

function estadoInicial(): EstadoInstalacao {
  if (typeof window === "undefined") return { instalado: false, plataforma: "outra" };
  const ua = navigator.userAgent;
  const plataforma: Plataforma = /iphone|ipad|ipod/i.test(ua) && !("MSStream" in window)
    ? "ios"
    : /android/i.test(ua)
      ? "android"
      : "outra";
  return {
    instalado: window.matchMedia("(display-mode: standalone)").matches,
    plataforma,
  };
}

/** Botão "Instalar aplicativo" na tela de login — oferece o GAT Mobile
 * (PWA enxuto com busca de ATs e Dar Baixa, ver src/app/m/layout.tsx)
 * para instalação na tela inicial do celular. Sempre mostra alguma
 * instrução de instalação (nunca desaparece silenciosamente): usa o
 * prompt nativo quando o Chrome/Android dispara `beforeinstallprompt`,
 * e cai para instrução manual por plataforma quando esse evento não
 * chega a tempo (comum em desktop, ou quando o Chrome dispara o evento
 * antes do listener ser registrado) ou não existe (iOS/Safari nunca
 * dispara). Só some de fato quando o app já está instalado (modo
 * standalone). */
export function InstalarAppMobile() {
  const [eventoInstalacao, setEventoInstalacao] = useState<EventoInstalacao | null>(null);
  const [{ instalado, plataforma }, setEstado] = useState<EstadoInstalacao>(estadoInicial);

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

  if (instalado) return null;

  return (
    <div className="mt-6 rounded-xl border border-(--color-border) bg-(--color-surface-1) px-4 py-3">
      <p className="text-sm font-medium text-(--color-text)">GAT Mobile para analistas</p>
      <p className="mt-0.5 text-xs text-(--color-text-weak)">
        Busca de ATs e Dar Baixa, direto da tela inicial do celular.
      </p>

      {eventoInstalacao && (
        <button
          onClick={instalar}
          className="mt-2 rounded-full bg-(--color-navy) px-4 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          Instalar aplicativo
        </button>
      )}

      {!eventoInstalacao && plataforma === "ios" && (
        <p className="mt-2 text-xs text-(--color-text-weak)">
          No iPhone: toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.
        </p>
      )}

      {!eventoInstalacao && plataforma === "android" && (
        <p className="mt-2 text-xs text-(--color-text-weak)">
          No Android: toque no menu <strong>⋮</strong> do navegador e escolha <strong>Instalar aplicativo</strong> (ou
          <strong> Adicionar à tela inicial</strong>).
        </p>
      )}

      {!eventoInstalacao && plataforma === "outra" && (
        <p className="mt-2 text-xs text-(--color-text-weak)">
          No computador: clique no ícone de instalação <strong>⊕</strong> na barra de endereço do Chrome/Edge, ou abra
          esta página pelo celular para instalar na tela inicial.
        </p>
      )}
    </div>
  );
}
