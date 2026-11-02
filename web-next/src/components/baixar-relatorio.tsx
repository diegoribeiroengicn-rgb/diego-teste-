"use client";

import { useState } from "react";

/** Baixa um relatório gerado por uma API de exportação (POST com corpo
 * JSON, resposta binária com Content-Disposition) — mesmo padrão usado em
 * tabela-prioridades.tsx, extraído aqui para reutilização pelos painéis
 * de OPR (Cessionários/Prestadores). */
export async function baixarRelatorio(url: string, corpo: unknown): Promise<string | null> {
  const resposta = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  if (!resposta.ok) {
    const erro = await resposta.json().catch(() => ({}));
    return erro?.erro || "Erro ao gerar o relatório.";
  }
  const nomeArquivo = resposta.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || "relatorio";
  const blob = await resposta.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(link.href);
  return null;
}

export function BotaoRelatorio({ rotulo, url, corpo }: { rotulo: string; url: string; corpo: unknown }) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    setGerando(true);
    setErro(null);
    try {
      const resultado = await baixarRelatorio(url, corpo);
      if (resultado) setErro(resultado);
    } catch {
      setErro("Não foi possível conectar ao sistema.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div>
      <button
        onClick={gerar} disabled={gerando}
        className="w-full rounded-full bg-(--color-navy) px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {gerando ? "Gerando…" : rotulo}
      </button>
      {erro && <p className="mt-1 text-xs text-(--color-red)">{erro}</p>}
    </div>
  );
}
