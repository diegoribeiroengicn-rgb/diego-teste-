"use client";

import dynamic from "next/dynamic";

// Renderizado só no cliente: decide se mostra o pop-up lendo sessionStorage
// (se o usuário já fechou nesta sessão do navegador) — sem isso, o HTML
// gerado no servidor nunca bateria com o primeiro render do cliente.
// `ssr: false` só é permitido a partir de um Client Component — por isso
// este arquivo existe separado de popup-alertas-pendentes.tsx.
export const PopupAlertasPendentesLazy = dynamic(
  () => import("@/components/popup-alertas-pendentes").then((m) => m.PopupAlertasPendentes),
  { ssr: false },
);
