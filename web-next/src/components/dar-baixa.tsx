"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STATUS_FINAIS_BAIXA, lerQuantidadeDocumentos, montarResumoBaixa, montarTextoBaixa, type DadosBaixa } from "@/lib/resumo-conclusao-calculo";

const inputClasse = "mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)";
const labelClasse = "text-xs text-(--color-text-weak)";

/** Mesma paleta usada na busca de ATs (painel-consulta-ats.tsx) e nas
 * telas de análise do GAT Mobile (painel-analises-mobile.tsx) — azul
 * para Prestador, roxo para Cessionário — para que o tipo do registro
 * fique claro já no título do popup de baixa, não só no texto corrido. */
const CORES_ORIGEM: Record<"prestadores" | "cessionarios", { rotulo: string; cor: string }> = {
  prestadores: { rotulo: "Prestador", cor: "bg-(--color-blue-3) text-(--color-blue-2)" },
  cessionarios: { rotulo: "Cessionário", cor: "bg-(--color-purple-bg) text-(--color-purple)" },
};

type Registro = DadosBaixa & {
  id: number;
  status_analise: string;
  resumo_mfiles: boolean | number;
  resumo_drive: boolean | number;
  resumo_email: boolean | number;
};

export function BotaoDarBaixa({ tabela, projetoId, statusAtual }: { tabela: "prestadores" | "cessionarios"; projetoId: number; statusAtual: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [status, setStatus] = useState<string>(STATUS_FINAIS_BAIXA[0]);
  const [numAt, setNumAt] = useState("");
  const [codigoDisciplina, setCodigoDisciplina] = useState("");
  const [mfiles, setMfiles] = useState(false);
  const [drive, setDrive] = useState(false);
  const [email, setEmail] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [qtdAnalisados, setQtdAnalisados] = useState("");
  const [obraReferencia, setObraReferencia] = useState("");
  const [textoGerado, setTextoGerado] = useState<string | null>(null);
  const [resumoGerado, setResumoGerado] = useState("");
  const [copiado, setCopiado] = useState(false);
  const campoTexto = useRef<HTMLTextAreaElement>(null);

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
        setNumAt(corpo.registro.num_at || "");
        setQtdAnalisados(corpo.registro.num_documentos_analisados != null ? String(corpo.registro.num_documentos_analisados) : "");
        setObraReferencia(corpo.registro.obra_referencia || "");
        setMfiles(!!corpo.registro.resumo_mfiles);
        setDrive(!!corpo.registro.resumo_drive);
        setEmail(!!corpo.registro.resumo_email);
      })
      .catch(() => setErro("Não foi possível carregar os dados da análise."));
  }

  /** A lista só é recarregada ao fechar: em Em Análise e no GAT Mobile a
   * AT concluída sai da lista, e recarregar logo após confirmar levaria
   * junto esta pop-up, antes de o analista copiar o texto. */
  function fechar() {
    setAberto(false);
    setRegistro(null);
    if (textoGerado != null) router.refresh();
  }

  async function confirmar() {
    if (!numAt.trim()) {
      setErro("Informe o número da AT.");
      return;
    }
    if (!codigoDisciplina.trim()) {
      setErro("Informe o código da disciplina.");
      return;
    }
    const numDocumentosAnalisados = lerQuantidadeDocumentos(qtdAnalisados);
    if (numDocumentosAnalisados == null) {
      setErro("Informe a quantidade de documentos analisados (número inteiro, zero ou mais).");
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const resposta = await fetch(`/api/analises/${tabela}/${projetoId}/baixa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status, numAt: numAt.trim(), codigoDisciplina: codigoDisciplina.trim(), mfiles, drive, email,
          numDocumentosAnalisados, obraReferencia: obraReferencia.trim(),
        }),
      });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setErro(corpo?.erro || "Erro ao dar baixa na análise.");
        return;
      }
      setTextoGerado(montarTextoBaixa(corpo.registro, status, codigoDisciplina.trim(), mfiles, drive, email));
      setResumoGerado(montarResumoBaixa(corpo.registro, status, codigoDisciplina.trim(), mfiles, drive, email));
    } finally {
      setSalvando(false);
    }
  }

  /** Copia o texto como está no campo (inclusive se o analista editou).
   * Sem a API de área de transferência (navegador antigo ou página fora
   * de HTTPS), cai na seleção do próprio campo + comando de cópia. */
  async function copiar() {
    if (!textoGerado) return;
    let copiou = false;
    try {
      await navigator.clipboard.writeText(textoGerado);
      copiou = true;
    } catch {
      const campo = campoTexto.current;
      if (campo) {
        campo.focus();
        campo.setSelectionRange(0, campo.value.length);
        copiou = document.execCommand("copy");
      }
    }
    if (!copiou) {
      setErro("Não foi possível copiar automaticamente — selecione o texto e copie manualmente.");
      return;
    }
    setErro(null);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  const rotulo = STATUS_FINAIS_BAIXA.includes(statusAtual as (typeof STATUS_FINAIS_BAIXA)[number]) ? "Reabrir baixa" : "Dar baixa";

  if (!aberto) {
    return (
      <button onClick={abrir} className="whitespace-nowrap rounded-full border border-(--color-border) px-3 py-1 text-xs font-medium text-(--color-text) hover:bg-(--color-surface-2)">
        {rotulo}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={fechar}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-(--color-surface-1) p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-(--color-text)">Baixa da Análise</p>
          <span className={`rounded-full px-2.5 py-0.5 text-[0.7rem] font-medium ${CORES_ORIGEM[tabela].cor}`}>
            {CORES_ORIGEM[tabela].rotulo}
          </span>
        </div>

        {!registro && !erro && <p className="mt-4 text-sm text-(--color-text-weak)">Carregando…</p>}
        {erro && !registro && <p className="mt-4 text-sm text-(--color-red)">{erro}</p>}

        {registro && textoGerado == null && (
          <>
            <p className="mt-1 text-xs text-(--color-text-weak)">
              {registro.nome_entidade} · {registro.disciplina || "—"} · Rev. {registro.revisao ?? "—"} ·
              Documentos: {registro.num_documentos ?? "—"} · Status atual: {registro.status_analise}
            </p>

            <label className={`mt-4 block ${labelClasse}`}>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClasse}>
                {STATUS_FINAIS_BAIXA.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>

            <label className={`mt-3 block ${labelClasse}`}>
              Número da AT
              <input
                value={numAt} onChange={(e) => setNumAt(e.target.value)}
                placeholder="Ex.: 0303/26" className={inputClasse}
              />
            </label>

            <label className={`mt-3 block ${labelClasse}`}>
              Código da disciplina (segmento DDD do número da AT)
              <input
                value={codigoDisciplina} onChange={(e) => setCodigoDisciplina(e.target.value)}
                placeholder="Ex.: 600" className={inputClasse}
              />
            </label>

            <label className={`mt-3 block ${labelClasse}`}>
              Quantidade de documentos analisados
              <input
                type="number" min={0} step={1} inputMode="numeric" required
                value={qtdAnalisados} onChange={(e) => setQtdAnalisados(e.target.value)}
                placeholder={`Recebidos nesta AT: ${registro.num_documentos ?? "—"}`} className={inputClasse}
              />
            </label>

            <label className={`mt-3 block ${labelClasse}`}>
              Referência da obra
              <input
                value={obraReferencia} onChange={(e) => setObraReferencia(e.target.value)}
                placeholder="Obra ou área a que a AT se refere" className={inputClasse}
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

        {textoGerado != null && (
          <>
            <p className="mt-3 rounded-xl border border-(--color-green)/30 bg-(--color-green)/10 px-4 py-3 text-sm text-(--color-green)">
              Baixa confirmada.
            </p>

            <p className={`mt-4 ${labelClasse}`}>Resumo da baixa</p>
            <p className="mt-1 whitespace-pre-line rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-3 text-sm text-(--color-text)">
              {resumoGerado}
            </p>

            <div className="mt-4 rounded-xl border border-(--color-border) bg-(--color-bg) focus-within:border-(--color-navy)">
              <div className="flex items-center justify-between gap-2 pl-4 pr-1 pt-1">
                <label htmlFor={`texto-baixa-${tabela}-${projetoId}`} className={labelClasse}>Texto de confirmação</label>
                <div className="flex items-center gap-1">
                  <span aria-live="polite" className="text-xs font-medium text-(--color-green)">{copiado ? "Texto copiado!" : ""}</span>
                  <button
                    type="button" onClick={copiar} aria-label="Copiar texto" title="Copiar texto"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-(--color-text-weak) hover:bg-(--color-surface-2) hover:text-(--color-navy) active:bg-(--color-surface-2)"
                  >
                    {copiado ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="m5 12.5 4.5 4.5L19 7.5" stroke="var(--color-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M5 15H4a1 1 0 0 1-1-1V5a2 2 0 0 1 2-2h9a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <textarea
                id={`texto-baixa-${tabela}-${projetoId}`} ref={campoTexto} spellCheck={false}
                value={textoGerado} onChange={(e) => setTextoGerado(e.target.value)}
                rows={textoGerado.split("\n").length + 1}
                className="block w-full resize-y bg-transparent px-4 pb-3 pt-1 text-base text-(--color-text) outline-none sm:text-sm"
              />
            </div>

            {erro && <p className="mt-3 text-sm text-(--color-red)">{erro}</p>}
            <div className="mt-4 flex gap-3">
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
