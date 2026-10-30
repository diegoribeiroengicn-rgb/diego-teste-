"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DECISAO_HOLD_OPCOES, LABEL_DECISAO_HOLD, type DecisaoHold } from "@/lib/hold-calculo";

const inputClasse = "mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)";
const labelClasse = "text-xs text-(--color-text-weak)";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Pop-up "Registrar tratativa — HOLD" — porta de
 * gat/ui/modals_hold.py::dialog_tratativa_hold. Só aparece para projetos
 * com status "EM HOLD" (TabelaProjetos decide quando renderizar). */
export function BotaoTratativaHold({
  tabela, projetoId, nomeEntidade, codigo, disciplina, numAt,
}: {
  tabela: "prestadores" | "cessionarios";
  projetoId: number;
  nomeEntidade: string;
  codigo: string;
  disciplina: string;
  numAt: string | null;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [especialista, setEspecialista] = useState("");
  const [dataContato, setDataContato] = useState(hojeIso());
  const [resolucao, setResolucao] = useState("");
  const [decisao, setDecisao] = useState<DecisaoHold>("MANTER");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function fechar() {
    setAberto(false);
    setEspecialista("");
    setResolucao("");
    setDecisao("MANTER");
    setErro(null);
  }

  async function confirmar() {
    setErro(null);
    setSalvando(true);
    try {
      const resposta = await fetch(`/api/analises/${tabela}/${projetoId}/tratativa-hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ especialista, dataContato, resolucao, decisao }),
      });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setErro(corpo?.erro || "Erro ao registrar a tratativa.");
        return;
      }
      fechar();
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="rounded-full border border-(--color-border) px-3 py-1 text-xs font-medium text-(--color-text) hover:bg-(--color-surface-2)">
        Tratativa HOLD
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={fechar}>
      <div className="w-full max-w-lg rounded-2xl bg-(--color-surface-1) p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-(--color-text)">Registrar tratativa — HOLD</p>
        <p className="mt-1 text-xs text-(--color-text-weak)">
          {nomeEntidade} ({codigo}) — {disciplina} · N° AT {numAt || "—"}
        </p>

        <label className={`mt-4 block ${labelClasse}`}>
          Especialista contatado *
          <input value={especialista} onChange={(e) => setEspecialista(e.target.value)} className={inputClasse} />
        </label>
        <label className={`mt-3 block ${labelClasse}`}>
          Data do contato *
          <input type="date" value={dataContato} onChange={(e) => setDataContato(e.target.value)} className={inputClasse} />
        </label>
        <label className={`mt-3 block ${labelClasse}`}>
          O que foi resolvido *
          <textarea value={resolucao} onChange={(e) => setResolucao(e.target.value)} rows={3} className={inputClasse} placeholder="Registro obrigatório da tratativa realizada." />
        </label>

        <p className={`mt-3 ${labelClasse}`}>Decisão</p>
        <div className="mt-1.5 flex flex-col gap-1.5">
          {DECISAO_HOLD_OPCOES.map((d) => (
            <label key={d} className="flex items-center gap-2 text-sm text-(--color-text)">
              <input type="radio" checked={decisao === d} onChange={() => setDecisao(d)} />
              {LABEL_DECISAO_HOLD[d]}
            </label>
          ))}
        </div>
        {decisao === "RETIRADO" && (
          <p className="mt-2 text-xs text-(--color-orange)">
            Ao retirar do HOLD, o SLA e o prazo do projeto são recalculados automaticamente a partir de hoje.
          </p>
        )}

        {erro && <p className="mt-3 text-sm text-(--color-red)">{erro}</p>}
        <div className="mt-5 flex gap-3">
          <button onClick={confirmar} disabled={salvando} className="rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
            {salvando ? "Confirmando…" : "Confirmar tratativa"}
          </button>
          <button onClick={fechar} className="rounded-full border border-(--color-border) px-5 py-2 text-sm font-medium text-(--color-text)">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
