"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ItemNav = { href: string; rotulo: string; icone: string };

/** Barra inferior de abas do GAT Mobile — deliberadamente diferente do
 * menu lateral/hambúrguer do site (desktop e mobile-responsivo da área
 * autenticada usam app-shell.tsx): aqui é sempre uma barra fixa de abas
 * na base da tela, sem gaveta deslizante, com a aba atual destacada em
 * dourado — acento visual que marca "isto é o app", não "o site aberto
 * no celular". */
export function NavMobile({ itens }: { itens: ItemNav[] }) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-(--color-border) bg-(--color-navy)">
      {itens.map((item) => {
        const ativo = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[0.7rem] font-medium transition-colors ${
              ativo ? "text-(--color-gold)" : "text-white/70 hover:text-white"
            }`}
          >
            <span className="text-lg leading-none">{item.icone}</span>
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
