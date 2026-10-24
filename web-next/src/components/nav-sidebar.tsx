"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type GrupoNav = { titulo: string; itens: { rotulo: string; href: string }[] };

function ItemNav({ href, rotulo }: { href: string; rotulo: string }) {
  const pathname = usePathname();
  const ativo = pathname === href;
  return (
    <Link
      href={href}
      className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        ativo
          ? "bg-(--color-blue-3) text-(--color-navy)"
          : "text-(--color-text-weak) hover:bg-(--color-surface-2) hover:text-(--color-text)"
      }`}
    >
      {rotulo}
    </Link>
  );
}

export function NavSidebar({ grupos }: { grupos: GrupoNav[] }) {
  return (
    <nav className="flex-1 space-y-5">
      <ItemNav href="/inicio" rotulo="Início" />
      {grupos.map((grupo) => (
        <div key={grupo.titulo}>
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-(--color-text-dim)">{grupo.titulo}</p>
          <div className="mt-1 space-y-0.5">
            {grupo.itens.map((item) => (
              <ItemNav key={item.href} href={item.href} rotulo={item.rotulo} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
