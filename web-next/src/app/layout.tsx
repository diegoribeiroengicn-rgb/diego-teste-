import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { RegistrarServiceWorker } from "@/components/registrar-service-worker";
import { obterSessao } from "@/lib/session";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "GAT 2026 · Tecnoplano",
  description: "Controle de Análises Técnicas — Tecnoplano",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "GAT Mobile" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#1B3A8A",
};

// O tema (claro/escuro) depende da sessão (cookie) em todo o sistema —
// mesmo motivo de (app)/layout.tsx: nunca é candidato a página estática.
export const instant = false;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const sessao = await obterSessao();
  const tema = sessao?.temaPreferido === "escuro" ? "dark" : "light";

  return (
    <html lang="pt-BR" data-theme={tema} className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <RegistrarServiceWorker />
        {children}
      </body>
    </html>
  );
}
