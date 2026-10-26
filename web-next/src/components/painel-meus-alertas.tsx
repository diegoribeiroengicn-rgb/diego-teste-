"use client";

import { useState } from "react";
import Link from "next/link";
import type { AlertaManual, AlertaPrazo, SituacaoPrazo } from "@/lib/meus-alertas-calculo";

const ROTULO_SITUACAO: Record<SituacaoPrazo, string> = {
  ATRASADO: "Vencido",
  "VENCE HOJE": "Vence hoje",
  "VENCE EM BREVE": "Vence em breve",
};

const COR_SITUACAO: Record<SituacaoPrazo, string> = {
  ATRASADO: "var(--color-red)",
  "VENCE HOJE": "var(--color-orange)",
  "VENCE EM BREVE": "var(--color-gold)",
};

const COR_PRIORIDADE: Record<string, string> = {
  Alta: "var(--color-red)",
  Urgente: "var(--color-red)",
  Média: "var(--color-gold)",
  Baixa: "var(--color-sky)",
};

function formatarData(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString("pt-BR");
}

function formatarDataHora(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleString("pt-BR");
}

function Badge({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: cor }}>
      {children}
    </span>
  );
}

function BotaoMarcarVisto({ tipo, chave, onVisto }: { tipo: "PRAZO" | "MANUAL"; chave: string; onVisto: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(false);

  async function marcar() {
    setEnviando(true);
    setErro(false);
    try {
      const resposta = await fetch("/api/alertas-pessoais/visto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, chave }),
      });
      if (!resposta.ok) {
        setErro(true);
        return;
      }
      onVisto();
    } catch {
      setErro(true);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={marcar}
        disabled={enviando}
        className="rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-text-weak) hover:bg-(--color-surface-2) disabled:opacity-50"
      >
        {enviando ? "Marcando…" : "Marcar como visto"}
      </button>
      {erro && <span className="text-xs text-(--color-red)">Falha ao marcar — tente novamente.</span>}
    </div>
  );
}

function CartaoAlertaPrazo({ alerta, onVisto }: { alerta: AlertaPrazo; onVisto: () => void }) {
  const rotuloModulo = alerta.origem === "prestadores" ? "Prestador" : "Cessionário";
  const href = alerta.origem === "prestadores" ? "/prestadores/projetos" : "/cessionarios/projetos";
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge cor={COR_SITUACAO[alerta.situacaoPrazo]}>{ROTULO_SITUACAO[alerta.situacaoPrazo]}</Badge>
            <p className="font-medium text-(--color-text)">AT {alerta.numAt || "—"}</p>
          </div>
          <p className="mt-1 text-sm text-(--color-text-weak)">
            {alerta.codigo} — {alerta.nomeEntidade} ({alerta.disciplina || "—"}) · {rotuloModulo} · Data limite: {formatarData(alerta.dataLimite)}
          </p>
          <p className="mt-1 text-xs text-(--color-text-dim)">
            Prioridade: <span style={{ color: COR_PRIORIDADE[alerta.prioridade] }} className="font-semibold">{alerta.prioridade}</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href={href} className="rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-navy) hover:bg-(--color-surface-2)">
            Ver AT
          </Link>
          <BotaoMarcarVisto tipo="PRAZO" chave={alerta.chave} onVisto={onVisto} />
        </div>
      </div>
    </div>
  );
}

function CartaoAlertaManual({ alerta, onVisto }: { alerta: AlertaManual; onVisto: () => void }) {
  const href = alerta.origem === "prestadores" ? "/prestadores/projetos" : "/cessionarios/projetos";
  const quando = alerta.atualizadoEm || alerta.criadoEm;
  const quem = alerta.atualizadoPor || alerta.criadoPor;
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-(--color-text)">{alerta.titulo} — {alerta.nomeEntidade || "—"}</p>
          {alerta.descricao && <p className="mt-1 text-sm text-(--color-text-weak)">{alerta.descricao}</p>}
          {alerta.observacoes && <p className="mt-1 text-xs text-(--color-text-dim)">Observação: {alerta.observacoes}</p>}
          <p className="mt-1 text-xs text-(--color-text-dim)">
            Direcionado por: {quem} em {formatarDataHora(quando)}
            {alerta.prioridade && (
              <> · Prioridade: <span style={{ color: COR_PRIORIDADE[alerta.prioridade] ?? "var(--color-text)" }} className="font-semibold">{alerta.prioridade}</span></>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {(alerta.numAt || alerta.codigoProjeto) && (
            <Link href={href} className="rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-navy) hover:bg-(--color-surface-2)">
              Ver AT
            </Link>
          )}
          <BotaoMarcarVisto tipo="MANUAL" chave={alerta.chave} onVisto={onVisto} />
        </div>
      </div>
    </div>
  );
}

export function PainelMeusAlertas({
  prazoPendente: prazoInicial,
  manuaisPendente: manuaisInicial,
  temAnalistaVinculado,
}: {
  prazoPendente: AlertaPrazo[];
  manuaisPendente: AlertaManual[];
  temAnalistaVinculado: boolean;
}) {
  const [prazoPendente, setPrazoPendente] = useState(prazoInicial);
  const [manuaisPendente, setManuaisPendente] = useState(manuaisInicial);

  const vencidos = prazoPendente.filter((a) => a.situacaoPrazo === "ATRASADO").length;
  const venceBreve = prazoPendente.length - vencidos;

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Meus Alertas</h1>
      <p className="mt-1 max-w-2xl text-sm text-(--color-text-weak)">
        Prazos da sua carga vencidos ou vencendo em breve, e alertas direcionados a você por um gestor/administrador.
        Alertas de prazo somem sozinhos quando a análise é concluída ou o prazo deixa de estar próximo.
      </p>

      {!temAnalistaVinculado && (
        <p className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-3 text-sm text-(--color-text-weak)">
          Sua conta não tem um analista vinculado (Administração &gt; Usuários) — por isso, alertas automáticos de
          prazo da sua carga não aparecem aqui. Alertas direcionados manualmente continuam funcionando normalmente.
        </p>
      )}

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-red)">{vencidos}</p>
          <p className="text-xs text-(--color-text-weak)">vencidos</p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-gold)">{venceBreve}</p>
          <p className="text-xs text-(--color-text-weak)">vencem hoje/em breve</p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-navy)">{manuaisPendente.length}</p>
          <p className="text-xs text-(--color-text-weak)">direcionados a mim</p>
        </div>
      </div>

      {prazoPendente.length === 0 && manuaisPendente.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-6 text-center text-sm text-(--color-text-weak)">
          Nenhum alerta pendente no momento.
        </p>
      ) : (
        <>
          {prazoPendente.length > 0 && (
            <div className="mt-8">
              <p className="mb-3 text-sm font-semibold text-(--color-text)">Prazos da minha carga</p>
              <div className="space-y-3">
                {prazoPendente.map((a) => (
                  <CartaoAlertaPrazo key={a.chave} alerta={a} onVisto={() => setPrazoPendente((prev) => prev.filter((x) => x.chave !== a.chave))} />
                ))}
              </div>
            </div>
          )}

          {manuaisPendente.length > 0 && (
            <div className="mt-8">
              <p className="mb-3 text-sm font-semibold text-(--color-text)">Direcionados a mim</p>
              <div className="space-y-3">
                {manuaisPendente.map((a) => (
                  <CartaoAlertaManual key={a.chave} alerta={a} onVisto={() => setManuaisPendente((prev) => prev.filter((x) => x.chave !== a.chave))} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
