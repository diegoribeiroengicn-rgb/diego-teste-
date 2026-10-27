"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { STATUS_FINAIS_BAIXA, montarTextoBaixa, type DadosBaixa } from "@/lib/resumo-conclusao-calculo";

const inputClasse = "mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)";
const labelClasse = "text-xs text-(--color-text-weak)";

type Registro = DadosBaixa & {
  id: number;
  status_analise: string;
  resumo_mfiles: boolean;
  resumo_drive: boolean;
  resumo_email: boolean;
};

export function BotaoDarBaixa({ tabela, projetoId, statusAtual }: { tabela: "prestadores" | "cessionarios"; projetoId: number; statusAtual: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [status, setStatus] = useState<string>(STATUS_FINAIS_BAIXA[0]);
  const [codigoDisciplina, setCodigoDisciplina] = useState("");
  const [mfiles, setMfiles] = useState(false);
  const [drive, setDrive] = useState(false);
  const [email, setEmail] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [textoGerado, setTextoGerado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  function abrir() {
    setAberto(true);
    setTextoGerado(null);
    setErro(null);
    fetch(`/api/analises/${tabela}/${projetoId}/baixa`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((corpo: { registro: Registro }) => {
        setRegistro(corpo.registro);
        setStatus(STATUS_FINAIS_BAIXA.includes(corpo.registro.status_analise as (typeof STATUS_FINAIS_BAIXA)[number]) ? corpo.registro.status_analise : STATUS_FINAIS_BAIXA[0]);
        setMfiles(corpo.registro.resumo_mfiles);
        setDrive(corpo.registro.resumo_drive);
        setEmail(corpo.registro.resumo_email);
      })
      .catch(() => setErro("Não foi possível carregar os dados da análise."));
  }

  function fechar() {
    setAberto(false);
    setRegistro(null);
  }

  async function confirmar() {
    if (!codigoDisciplina.trim()) {
      setErro("Informe o código da disciplina.");
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const resposta = await fetch(`/api/analises/${tabela}/${projetoId}/baixa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, codigoDisciplina: codigoDisciplina.trim(), mfiles, drive, email }),
      });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setErro(corpo?.erro || "Erro ao dar baixa na análise.");
        return;
      }
      setTextoGerado(montarTextoBaixa(corpo.registro, status, codigoDisciplina.trim(), mfiles, drive, email));
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  async function copiar() {
    if (!textoGerado) return;
    try {
      await navigator.clipboard.writeText(textoGerado);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não foi possível copiar automaticamente — selecione o texto manualmente.");
    }
  }

  const rotulo = STATUS_FINAIS_BAIXA.includes(statusAtual as (typeof STATUS_FINAIS_BAIXA)[number]) ? "Reabrir baixa" : "Dar baixa";

  if (!aberto) {
    return (
      <button onClick={abrir} className="rounded-full border border-(--color-border) px-3 py-1 text-xs font-medium text-(--color-text) hover:bg-(--color-surface-2)">
        {rotulo}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={fechar}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-(--color-surface-1) p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-(--color-text)">Baixa da Análise</p>

        {!registro && !erro && <p className="mt-4 text-sm text-(--color-text-weak)">Carregando…</p>}
        {erro && !registro && <p className="mt-4 text-sm text-(--color-red)">{erro}</p>}

        {registro && !textoGerado && (
          <>
            <p className="mt-1 text-xs text-(--color-text-weak)">
              {registro.nome_entidade} · {registro.disciplina || "—"} · Rev. {registro.revisao ?? "—"} · N° AT: {registro.num_at || "—"}
            </p>

            <label className={`mt-4 block ${labelClasse}`}>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClasse}>
                {STATUS_FINAIS_BAIXA.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>

            <label className={`mt-3 block ${labelClasse}`}>
              Código da disciplina (segmento DDD do número da AT)
              <input
                value={codigoDisciplina} onChange={(e) => setCodigoDisciplina(e.target.value)}
                placeholder="Ex.: 600" className={inputClasse}
              />
            </label>

            <p className={`mt-4 ${labelClasse}`}>Onde esta análise foi disponibilizada?</p>
            <div className="mt-2 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-(--color-text)">
                <input type="checkbox" checked={mfiles} onChange={(e) => setMfiles(e.target.checked)} /> M-Files
              </label>
              <label className="flex items-center gap-2 text-sm text-(--color-text)">
                <input type="checkbox" checked={drive} onChange={(e) => setDrive(e.target.checked)} /> Drive
              </label>
              <label className="flex items-center gap-2 text-sm text-(--color-text)">
                <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> E-mail
              </label>
            </div>

            {erro && <p className="mt-3 text-sm text-(--color-red)">{erro}</p>}
            <div className="mt-5 flex gap-3">
              <button onClick={confirmar} disabled={salvando} className="rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
                {salvando ? "Confirmando…" : "Confirmar baixa"}
              </button>
              <button onClick={fechar} className="rounded-full border border-(--color-border) px-5 py-2 text-sm font-medium text-(--color-text)">
                Cancelar
              </button>
            </div>
          </>
        )}

        {textoGerado && (
          <>
            <p className="mt-3 rounded-xl border border-(--color-green)/30 bg-(--color-green)/10 px-4 py-3 text-sm text-(--color-green)">
              Baixa confirmada — copie o texto abaixo.
            </p>
            <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-3 text-sm text-(--color-text)">{textoGerado}</pre>
            <div className="mt-4 flex gap-3">
              <button onClick={copiar} className="rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white">
                {copiado ? "Copiado!" : "Copiar texto"}
              </button>
              <button onClick={fechar} className="rounded-full border border-(--color-border) px-5 py-2 text-sm font-medium text-(--color-text)">
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
