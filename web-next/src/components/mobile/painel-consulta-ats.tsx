"use client";

import { useState } from "react";
import type { ResultadoAt } from "@/lib/consulta-ats";

const CORES_STATUS: Record<string, string> = {
  "EM ANÁLISE": "bg-(--color-blue-3) text-(--color-blue-2)",
  "EM HOLD": "bg-(--color-orange-bg) text-(--color-orange)",
  LIBERADO: "bg-(--color-green-bg) text-(--color-green)",
  "LIBERADO C/ REST.": "bg-(--color-green-bg) text-(--color-green)",
  "NÃO LIBERADO": "bg-(--color-red-bg) text-(--color-red)",
};

export function PainelConsultaAts() {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ResultadoAt[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function buscar() {
    if (termo.trim().length < 2) {
      setErro("Digite ao menos 2 caracteres.");
      return;
    }
    setErro(null);
    setBuscando(true);
    try {
      const resposta = await fetch(`/api/mobile/ats?q=${encodeURIComponent(termo.trim())}`);
      if (!resposta.ok) throw new Error();
      const corpo = await resposta.json();
      setResultados(corpo.resultados);
    } catch {
      setErro("Não foi possível buscar.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="px-4 py-5">
      <h1 className="text-lg font-semibold text-(--color-text)">Consulta de ATs</h1>
      <p className="mt-1 text-xs text-(--color-text-weak)">Busque por número da AT, código ou nome do prestador/cessionário.</p>

      <div className="mt-4 flex gap-2">
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && buscar()}
          placeholder="Ex.: 0210/26"
          className="flex-1 rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)"
        />
        <button onClick={buscar} disabled={buscando} className="rounded-lg bg-(--color-navy) px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {buscando ? "…" : "Buscar"}
        </button>
      </div>

      {erro && <p className="mt-3 text-sm text-(--color-red)">{erro}</p>}

      {resultados !== null && (
        <div className="mt-4 flex flex-col gap-2">
          {resultados.length === 0 ? (
            <p className="text-sm text-(--color-text-weak)">Nenhum resultado encontrado.</p>
          ) : (
            resultados.map((r) => (
              <div key={`${r.origem}-${r.id}`} className="rounded-xl border border-(--color-border) bg-(--color-surface-1) px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-(--color-text)">{r.num_at || "Sem N° AT"}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${CORES_STATUS[r.status_analise] ?? "bg-(--color-surface-2) text-(--color-text-weak)"}`}>
                    {r.status_analise}
                  </span>
                </div>
                <p className="mt-1 text-xs text-(--color-text-weak)">
                  {r.codigo} · {r.entidade} · {r.disciplina || "—"} · Rev. {String(r.revisao).padStart(2, "0")}
                </p>
                <p className="mt-1 text-[0.7rem] text-(--color-text-dim)">
                  {r.origem === "prestadores" ? "Prestador" : "Cessionário"} · Responsável: {r.responsavel || "—"}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
