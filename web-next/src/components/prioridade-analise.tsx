"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { calcularDataLimite, diasUteisEntre } from "@/lib/dias-uteis";

type Dados = {
  analise: { codigo: string | null; entidade: string; disciplina: string | null; revisao: number | null; dataSolicitacao: string | null; dataLimite: string | null; status: string };
  prioridade: { vencimento_operacional: string | null; sla_operacional_dias: number | null; justificativa: string | null; origem: string; criado_por: string; criado_em: string } | null;
  historico: { valor_anterior: string | null; valor_novo: string | null; usuario: string; data_hora: string }[];
  marcadores: { documento: boolean; prestador: boolean };
  podeVerContratual: boolean;
  contratual?: { sla: number; vencimento: string | null };
};

const dataBr = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const botao = "rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-text) hover:bg-(--color-surface-2) disabled:opacity-50";
const botaoPrimario = "rounded-full bg-(--color-navy) px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50";
const campo = "w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-2.5 py-1.5 text-sm text-(--color-text)";

/** Botão + pop-up de prioridade na listagem de Projetos. Três tipos
 * independentes: da ANÁLISE (projeto + disciplina + revisão, com data/SLA
 * operacional), do PROJETO/DOCUMENTO e do PRESTADOR (marcadores — não
 * criam prioridade nas análises). O prazo contratual só aparece para
 * Gestor/Admin (o servidor nem o envia aos demais). */
export function BotaoPrioridade({ tabela, id, nivelAtual }: { tabela: "prestadores" | "cessionarios"; id: number; nivelAtual: number | null }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<Dados | null>(null);
  const [aba, setAba] = useState<"analise" | "projeto" | "prestador">("analise");
  const [data, setData] = useState("");
  const [sla, setSla] = useState("");
  const [just, setJust] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function carregar() {
    const r = await fetch(`/api/prioridades/analise?tabela=${tabela}&id=${id}`);
    const c = await r.json();
    if (!r.ok) { setMsg(c.erro ?? "Não foi possível carregar."); return; }
    setDados(c);
    setData(c.prioridade?.vencimento_operacional ?? c.analise.dataLimite ?? "");
    const base = c.prioridade?.vencimento_operacional ?? c.analise.dataLimite;
    setSla(c.prioridade?.sla_operacional_dias ? String(c.prioridade.sla_operacional_dias)
      : base && c.analise.dataSolicitacao && base >= c.analise.dataSolicitacao.slice(0, 10) ? String(Math.max(1, diasUteisEntre(c.analise.dataSolicitacao, base))) : "");
    setJust(c.prioridade?.justificativa ?? "");
  }
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  const solicitacao = dados?.analise.dataSolicitacao ?? null;
  function aoMudarSla(v: string) {
    setSla(v);
    const n = Number(v);
    if (n > 0 && solicitacao) { const d = calcularDataLimite(solicitacao, n); if (d) setData(d.toISOString().slice(0, 10)); }
  }
  function aoMudarData(v: string) {
    setData(v);
    if (v && solicitacao && v >= solicitacao.slice(0, 10)) setSla(String(Math.max(1, diasUteisEntre(solicitacao, v))));
  }

  async function chamar(metodo: "PUT" | "DELETE", corpo: Record<string, unknown>, ok: string) {
    setOcupado(true); setMsg(null);
    const r = await fetch("/api/prioridades/analise", { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tabela, id, ...corpo }) });
    const c = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) { setMsg(c.erro ?? "Erro."); return; }
    setMsg(ok); await carregar(); router.refresh();
  }
  async function marcador(tipo: "DOCUMENTO" | "PRESTADOR", ativo: boolean) {
    if (!dados) return;
    setOcupado(true); setMsg(null);
    const chave = tipo === "DOCUMENTO" ? dados.analise.codigo : dados.analise.entidade;
    const r = await fetch("/api/prioridades/marcador", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, tabela, chave, ativo, justificativa: just }) });
    const c = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) { setMsg(c.erro ?? "Erro."); return; }
    setMsg(ativo ? "Prioridade registrada." : "Prioridade removida."); await carregar(); router.refresh();
  }

  const slaNum = Number(sla);
  const aba2 = (k: typeof aba, t: string) => (
    <button type="button" onClick={() => setAba(k)} className={`rounded-full px-3 py-1 text-xs font-medium ${aba === k ? "bg-(--color-navy) text-white" : "text-(--color-text-weak) hover:bg-(--color-surface-2)"}`}>{t}</button>
  );

  return (
    <>
      <button type="button" onClick={() => { setAberto(true); setMsg(null); void carregar(); }} title="Prioridade desta análise"
        className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${nivelAtual ? "border-(--color-gold) bg-(--color-surface-2) text-(--color-text)" : "border-(--color-border) text-(--color-text) hover:bg-(--color-surface-2)"}`}>
        {nivelAtual ? "★ Prioridade" : "☆ Prioridade"}
      </button>
      <dialog ref={ref} onClose={() => setAberto(false)} onClick={(e) => e.target === ref.current && setAberto(false)}
        className="m-auto w-[min(680px,95vw)] rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-0 text-(--color-text) shadow-xl backdrop:bg-black/40">
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold">Prioridade</p>
              {dados && <p className="text-xs text-(--color-text-weak)">{dados.analise.codigo} — {dados.analise.entidade} · {dados.analise.disciplina ?? "—"} · Rev. {String(dados.analise.revisao ?? 0).padStart(2, "0")}</p>}
            </div>
            <button type="button" className={botao} onClick={() => setAberto(false)}>Fechar</button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1">
            {aba2("analise", "Esta análise")}{aba2("projeto", "Projeto / documento")}{aba2("prestador", "Prestador")}
          </div>
          <p className="mt-2 text-xs text-(--color-text-weak)">
            {aba === "analise" && "Vale somente para esta combinação de projeto, disciplina e revisão. Não afeta as outras análises."}
            {aba === "projeto" && "Marca o projeto/documento como prioritário. Não torna prioritárias as suas análises — cada uma é definida individualmente."}
            {aba === "prestador" && "Marca o prestador como prioritário. Não torna prioritários os seus documentos nem as suas análises."}
          </p>

          {!dados ? <p className="mt-4 text-sm text-(--color-text-weak)">{msg ?? "Carregando…"}</p> : (
            <div className="mt-3">
              {aba === "analise" && (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="text-xs text-(--color-text-weak)">Data de entrega operacional
                      <input type="date" value={data} onChange={(e) => aoMudarData(e.target.value)} className={campo} /></label>
                    <label className="text-xs text-(--color-text-weak)">SLA operacional (dias úteis)
                      <input type="number" min={1} max={120} value={sla} onChange={(e) => aoMudarSla(e.target.value)} className={campo} /></label>
                    <div className="text-xs text-(--color-text-weak)">Vencimento operacional
                      <p className="mt-1 rounded-lg bg-(--color-surface-2) px-2.5 py-1.5 text-sm font-medium text-(--color-text)">{dataBr(data)}</p></div>
                  </div>
                  {dados.podeVerContratual && dados.contratual && (
                    <p className="mt-3 rounded-lg bg-(--color-surface-2) px-3 py-2 text-xs text-(--color-text-weak)">
                      Gestão — SLA contratual: <b className="text-(--color-text)">{dados.contratual.sla} du</b> · vencimento contratual: <b className="text-(--color-text)">{dataBr(dados.contratual.vencimento)}</b>
                      {dados.contratual.vencimento && data && <> · operacional {data < dados.contratual.vencimento ? "antecede" : data > dados.contratual.vencimento ? "ultrapassa" : "coincide com"} o contratual</>}
                    </p>
                  )}
                  <label className="mt-3 block text-xs text-(--color-text-weak)">Justificativa (opcional)
                    <input value={just} onChange={(e) => setJust(e.target.value)} className={campo} placeholder="Motivo da prioridade" /></label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className={botaoPrimario} disabled={ocupado || !data} onClick={() => chamar("PUT", { dataEntregaOperacional: data, slaOperacionalDias: slaNum > 0 ? slaNum : undefined, justificativa: just }, "Prioridade salva.")}>
                      {dados.prioridade ? "Salvar alterações" : "Definir como prioridade"}</button>
                    {dados.prioridade && <button type="button" className={botao} disabled={ocupado} onClick={() => { if (window.confirm("Remover a prioridade desta análise? O prazo volta ao SLA padrão.")) void chamar("DELETE", {}, "Prioridade removida."); }}>Remover prioridade</button>}
                  </div>
                </>
              )}
              {aba !== "analise" && (() => {
                const tipo = aba === "projeto" ? "DOCUMENTO" : "PRESTADOR";
                const ativo = aba === "projeto" ? dados.marcadores.documento : dados.marcadores.prestador;
                const nome = aba === "projeto" ? dados.analise.codigo : dados.analise.entidade;
                return (
                  <>
                    <p className="text-sm">{aba === "projeto" ? "Projeto" : "Prestador"}: <b>{nome}</b> — {ativo ? "prioritário" : "sem prioridade"}</p>
                    <label className="mt-3 block text-xs text-(--color-text-weak)">Justificativa (opcional)
                      <input value={just} onChange={(e) => setJust(e.target.value)} className={campo} /></label>
                    <div className="mt-3 flex gap-2">
                      <button type="button" className={botaoPrimario} disabled={ocupado} onClick={() => marcador(tipo, true)}>{ativo ? "Atualizar" : "Marcar como prioritário"}</button>
                      {ativo && <button type="button" className={botao} disabled={ocupado} onClick={() => marcador(tipo, false)}>Remover prioridade</button>}
                    </div>
                  </>
                );
              })()}
              {msg && <p className="mt-3 text-xs text-(--color-navy)">{msg}</p>}
              <div className="mt-4">
                <p className="text-xs font-semibold text-(--color-text)">Histórico de alterações</p>
                {dados.historico.length === 0 ? <p className="mt-1 text-xs text-(--color-text-weak)">Nenhuma alteração registrada.</p> : (
                  <ul className="mt-1 max-h-32 overflow-auto text-xs text-(--color-text-weak)">
                    {dados.historico.map((h, i) => <li key={i}>{new Date(h.data_hora).toLocaleString("pt-BR")} — {h.usuario}: {dataBr(h.valor_anterior)} → {dataBr(h.valor_novo)}</li>)}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
