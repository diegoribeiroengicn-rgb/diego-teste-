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

function formatarData(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString("pt-BR");
}

const inputClasse = "min-w-0 w-full rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)";

export function PainelConsultaAts() {
  const [termo, setTermo] = useState("");
  const [origem, setOrigem] = useState<"" | "prestadores" | "cessionarios">("");
  const [dataEnvio, setDataEnvio] = useState("");
  const [resultados, setResultados] = useState<ResultadoAt[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function buscar() {
    if (termo.trim().length < 2 && !dataEnvio) {
      setErro("Digite ao menos 2 caracteres ou escolha uma data de envio.");
      return;
    }
    setErro(null);
    setBuscando(true);
    try {
      const params = new URLSearchParams();
      if (termo.trim()) params.set("q", termo.trim());
      if (origem) params.set("origem", origem);
      if (dataEnvio) params.set("data", dataEnvio);
      const resposta = await fetch(`/api/mobile/ats?${params.toString()}`);
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
    <div className="min-w-0 px-4 py-5">
      <h1 className="text-lg font-semibold text-(--color-text)">Busca de ATs</h1>
      <p className="mt-1 text-xs text-(--color-text-weak)">
        Filtre por prestador/cessionário, data de envio e código ou número da AT.
      </p>

      <div className="mt-4 flex min-w-0 flex-col gap-2.5">
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && buscar()}
          placeholder="N° da AT, código ou nome"
          className={inputClasse}
        />

        <div className="grid min-w-0 grid-cols-2 gap-2.5">
          <label className="min-w-0 text-xs text-(--color-text-weak)">
            Origem
            <select value={origem} onChange={(e) => setOrigem(e.target.value as typeof origem)} className={`mt-1 ${inputClasse}`}>
              <option value="">Todas</option>
              <option value="prestadores">Prestador</option>
              <option value="cessionarios">Cessionário</option>
            </select>
          </label>
          <label className="min-w-0 text-xs text-(--color-text-weak)">
            Data de envio
            <input
              type="date"
              value={dataEnvio}
              onChange={(e) => setDataEnvio(e.target.value)}
              className={`mt-1 ${inputClasse}`}
            />
          </label>
        </div>

        <button onClick={buscar} disabled={buscando} className="w-full rounded-lg bg-(--color-navy) px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {buscando ? "Buscando…" : "Buscar"}
        </button>
      </div>

      {erro && <p className="mt-3 text-sm text-(--color-red)">{erro}</p>}

      {resultados !== null && (
        <div className="mt-4 flex min-w-0 flex-col gap-2">
          {resultados.length === 0 ? (
            <p className="text-sm text-(--color-text-weak)">Nenhum resultado encontrado.</p>
          ) : (
            resultados.map((r) => (
              <div key={`${r.origem}-${r.id}`} className="min-w-0 rounded-xl border border-(--color-border) bg-(--color-surface-1) px-4 py-3">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-(--color-text)">{r.num_at || "Sem N° AT"}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${CORES_STATUS[r.status_analise] ?? "bg-(--color-surface-2) text-(--color-text-weak)"}`}>
                    {r.status_analise}
                  </span>
                </div>
                <p className="mt-1 text-xs text-(--color-text-weak)">
                  {r.codigo} · {r.entidade} · {r.disciplina || "—"} · Rev. {String(r.revisao).padStart(2, "0")}
                </p>
                <p className="mt-1 text-[0.7rem] text-(--color-text-dim)">
                  {r.origem === "prestadores" ? "Prestador" : "Cessionário"} · Envio: {formatarData(r.data_solicitacao)} · Resp.: {r.responsavel || "—"}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
