"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={sair}
      className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-(--color-text-weak) hover:bg-(--color-surface-2) hover:text-(--color-text)"
    >
      Sair
    </button>
  );
}
