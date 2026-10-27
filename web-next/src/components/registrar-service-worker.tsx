"use client";

import { useEffect } from "react";

/** Registra o service worker mínimo do GAT Mobile — só o necessário para
 * o navegador oferecer "Adicionar à tela inicial". Sem efeito algum fora
 * de um contexto de navegador com suporte a Service Worker. */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
