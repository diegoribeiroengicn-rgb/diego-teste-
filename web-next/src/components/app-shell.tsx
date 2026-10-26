"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { NavSidebar, type GrupoNav } from "@/components/nav-sidebar";
import { LogoutButton } from "@/components/logout-button";

function IconeMenu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-6 w-6">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function IconeFechar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function AppShell({
  grupos,
  nome,
  perfil,
  children,
}: {
  grupos: GrupoNav[];
  nome: string;
  perfil: string;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);

  const conteudoSidebar = (
    <>
      <div className="mb-6 flex items-center justify-between gap-2 px-2">
        <Image src="/tecnoplano_logo.png" alt="Tecnoplano" width={120} height={44} className="h-8 w-auto" />
        <button
          type="button"
          onClick={() => setAberto(false)}
          aria-label="Fechar menu"
          className="rounded-lg p-1 text-(--color-text-weak) hover:bg-(--color-surface-2) md:hidden"
        >
          <IconeFechar />
        </button>
      </div>

      <NavSidebar grupos={grupos} onNavegar={() => setAberto(false)} />

      <div className="border-t border-(--color-border) pt-4">
        <Link
          href="/perfil"
          onClick={() => setAberto(false)}
          className="block rounded-lg px-2 py-1 hover:bg-(--color-surface-2)"
        >
          <p className="truncate text-sm font-medium text-(--color-text)">{nome}</p>
          <p className="text-xs text-(--color-text-weak)">{perfil}</p>
        </Link>
        <LogoutButton />
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Barra superior — só no mobile, com o botão que abre o menu lateral. */}
      <div className="flex items-center justify-between border-b border-(--color-border) bg-(--color-surface-1) px-4 py-3 md:hidden">
        <Image src="/tecnoplano_logo.png" alt="Tecnoplano" width={100} height={36} className="h-7 w-auto" />
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Abrir menu"
          className="rounded-lg p-1.5 text-(--color-navy) hover:bg-(--color-surface-2)"
        >
          <IconeMenu />
        </button>
      </div>

      {/* Fundo escurecido atrás do menu lateral aberto no mobile. */}
      {aberto && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setAberto(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 -translate-x-full flex-col border-r border-(--color-border) bg-(--color-surface-1) px-4 py-5 transition-transform duration-200 md:static md:flex md:translate-x-0 ${
          aberto ? "translate-x-0" : ""
        }`}
      >
        {conteudoSidebar}
      </aside>

      <main className="min-w-0 flex-1 bg-(--color-bg)">{children}</main>
    </div>
  );
}
