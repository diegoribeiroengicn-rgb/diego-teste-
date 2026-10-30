"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AlertaManual, AlertaPrazo, SituacaoPrazo } from "@/lib/meus-alertas-calculo";

const CHAVE_SESSAO = "gat_alertas_popup_fechado";

const ICONE_SITUACAO: Record<SituacaoPrazo, string> = { ATRASADO: "🔴", "VENCE HOJE": "🟠", "VENCE EM BREVE": "🟡" };
const ROTULO_SITUACAO: Record<SituacaoPrazo, string> = { ATRASADO: "VENCIDA", "VENCE HOJE": "VENCE HOJE", "VENCE EM BREVE": "VENCE EM BREVE" };
const ICONE_PRIORIDADE_MANUAL: Record<string, string> = { Baixa: "🔵", Média: "🟡", Alta: "🟠", Urgente: "🔴" };

function formatarDataBr(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleDateString("pt-BR");
}

/** Pop-up "Alertas pendentes", aberto ao entrar em Início até o usuário
 * fechá-lo explicitamente — porta de
 * gat/ui/modals_alertas_pessoais.py::dialog_alertas_pessoais. Não duplica
 * a Central de Alertas nem Meus Alertas: usa os mesmos dados (já
 * calculados no servidor) e a mesma marcação de "visto". O fechamento é
 * só para esta sessão do navegador (sessionStorage) — reaparece no
 * próximo login, igual ao `st.session_state` do Streamlit. */
export function PopupAlertasPendentes({
  prazoPendenteInicial, manuaisPendenteInicial,
}: {
  prazoPendenteInicial: AlertaPrazo[];
  manuaisPendenteInicial: AlertaManual[];
}) {
  const router = useRouter();
  const [prazoPendente, setPrazoPendente] = useState(prazoPendenteInicial);
  const [manuaisPendente, setManuaisPendente] = useState(manuaisPendenteInicial);
  const [aberto, setAberto] = useState(() => {
    if (prazoPendenteInicial.length + manuaisPendenteInicial.length === 0) return false;
    try {
      return sessionStorage.getItem(CHAVE_SESSAO) !== "1";
    } catch {
      // sessionStorage indisponível (ex.: navegação privada) — mostra o pop-up mesmo assim
      return true;
    }
  });

  function fechar() {
    setAberto(false);
    try {
      sessionStorage.setItem(CHAVE_SESSAO, "1");
    } catch {
      // ignorado — pior caso, o pop-up reaparece na próxima navegação desta sessão
    }
  }

  async function marcarVistoPrazo(chave: string) {
    await fetch("/api/alertas-pessoais/visto", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "PRAZO", chave }),
    });
    setPrazoPendente((atual) => atual.filter((a) => a.chave !== chave));
  }

  async function marcarVistoManual(chave: string) {
    await fetch("/api/alertas-pessoais/visto", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "MANUAL", chave }),
    });
    setManuaisPendente((atual) => atual.filter((a) => a.chave !== chave));
  }

  function irParaProjetos(origem: "prestadores" | "cessionarios") {
    fechar();
    router.push(`/${origem}/projetos`);
  }

  if (!aberto) return null;

  const totalPendente = prazoPendente.length + manuaisPendente.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-(--color-surface-1) p-6 shadow-xl">
        <p className="text-sm font-semibold text-(--color-text)">⚠️ Alertas pendentes</p>

        {totalPendente === 0 ? (
          <>
            <p className="mt-4 rounded-xl border border-(--color-green)/30 bg-(--color-green)/10 px-4 py-3 text-sm text-(--color-green)">
              Nenhum alerta pendente.
            </p>
            <button onClick={fechar} className="mt-4 w-full rounded-full border border-(--color-border) px-5 py-2 text-sm font-medium text-(--color-text)">
              Fechar
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-(--color-text-weak)">Você tem {totalPendente} alerta(s) ainda não visualizado(s).</p>

            <div className="mt-4 space-y-3">
              {prazoPendente.map((a) => (
                <div key={a.chave} className="rounded-xl border border-(--color-border) px-4 py-3">
                  <p className="text-sm text-(--color-text)">
                    {ICONE_SITUACAO[a.situacaoPrazo]} <span className="font-semibold">Análise {ROTULO_SITUACAO[a.situacaoPrazo]}</span> |
                    {" "}AT {a.numAt || "—"} | Projeto: {a.codigo} — {a.nomeEntidade}
                  </p>
                  <p className="mt-1 text-xs text-(--color-text-dim)">Data limite: {formatarDataBr(a.dataLimite)}</p>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => irParaProjetos(a.origem)} className="flex-1 rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-text) hover:bg-(--color-surface-2)">
                      Visualizar AT
                    </button>
                    <button onClick={() => marcarVistoPrazo(a.chave)} className="flex-1 rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-text) hover:bg-(--color-surface-2)">
                      Marcar como Visto
                    </button>
                  </div>
                </div>
              ))}

              {manuaisPendente.map((a) => (
                <div key={a.chave} className="rounded-xl border border-(--color-border) px-4 py-3">
                  <p className="text-sm text-(--color-text)">
                    {ICONE_PRIORIDADE_MANUAL[a.prioridade ?? ""] ?? ""} <span className="font-semibold">{a.titulo}</span> — {a.nomeEntidade || "—"}
                  </p>
                  {a.observacoes && <p className="mt-1 text-xs text-(--color-text-dim)">Observação: {a.observacoes}</p>}
                  <p className="mt-1 text-xs text-(--color-text-dim)">Direcionado por: {a.atualizadoPor || a.criadoPor}</p>
                  <div className="mt-2 flex gap-2">
                    {(a.numAt || a.codigoProjeto) && (
                      <button onClick={() => irParaProjetos(a.origem)} className="flex-1 rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-text) hover:bg-(--color-surface-2)">
                        Visualizar AT
                      </button>
                    )}
                    <button onClick={() => marcarVistoManual(a.chave)} className="flex-1 rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-text) hover:bg-(--color-surface-2)">
                      Marcar como Visto
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-2">
              <Link href="/meus-alertas" onClick={fechar} className="w-full rounded-full bg-(--color-navy) px-5 py-2 text-center text-sm font-medium text-white">
                Ver todos em Meus Alertas
              </Link>
              <button onClick={fechar} className="w-full rounded-full border border-(--color-border) px-5 py-2 text-sm font-medium text-(--color-text)">
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
