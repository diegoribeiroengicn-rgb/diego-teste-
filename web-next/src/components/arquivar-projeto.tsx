"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Arquivar / desarquivar um PROJETO (código) inteiro. Lógico e reversível:
 * nada é excluído; documentos, revisões, datas, responsáveis e históricos
 * permanecem. Pede confirmação antes de arquivar. */
export function BotaoArquivarProjeto({ codigo, arquivado }: { codigo: string; arquivado: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function executar() {
    let motivo: string | undefined;
    if (!arquivado) {
      if (!window.confirm(`Arquivar o projeto ${codigo}?\n\nTodas as análises dele saem dos indicadores e dos Gantts ativos. Nada é excluído e você pode desarquivar depois.`)) return;
      motivo = window.prompt("Motivo do arquivamento (opcional):") ?? undefined;
    } else if (!window.confirm(`Desarquivar o projeto ${codigo}? Ele volta aos indicadores e Gantts.`)) return;
    setOcupado(true); setErro(null);
    const r = await fetch("/api/projetos/arquivar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo, acao: arquivado ? "restaurar" : "arquivar", motivo }) });
    const c = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) { setErro(c.erro ?? "Não foi possível concluir."); return; }
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={executar} disabled={ocupado} title={arquivado ? "Voltar o projeto aos indicadores e Gantts" : "Tirar o projeto dos indicadores e Gantts (reversível)"}
        className="whitespace-nowrap rounded-full border border-(--color-border) px-3 py-1 text-xs font-medium text-(--color-text-weak) hover:bg-(--color-surface-2) disabled:opacity-50">
        {arquivado ? "Desarquivar projeto" : "Arquivar projeto"}
      </button>
      {erro && <span className="text-xs text-(--color-red)">{erro}</span>}
    </>
  );
}
