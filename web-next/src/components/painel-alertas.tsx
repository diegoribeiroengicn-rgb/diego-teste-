"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  STATUS_ADIADO,
  STATUS_EM_TRATAMENTO,
  STATUS_PENDENTE,
  STATUS_RADAR_LABELS,
  STATUS_REABERTO,
  STATUS_RETIRADO,
  STATUS_TRATADO,
  TIPO_ALERTA_LABELS,
  TIPO_ALERTA_MAXIMO,
  TIPO_AVALIACAO_OBRIGATORIA,
  statusRadarAtivo,
  type StatusRadar,
  type TipoAlerta,
} from "@/lib/alertas-engine-calculo";
import type { AlertaItem } from "@/lib/alertas-engine";

const COR_TIPO: Record<TipoAlerta, string> = {
  PENDENTE_REUNIAO: "var(--color-purple)",
  ATRASO_ANALISE: "var(--color-orange)",
  AVALIACAO_CRITICA: "var(--color-red)",
  AVALIACAO_OBRIGATORIA: "var(--color-sky)",
  PRAZO_PRIORITARIO: "var(--color-gold)",
  ALERTA_MAXIMO: "var(--color-red)",
  ACOMPANHAMENTO_HOLD: "var(--color-sky)",
  ATRASO_REENVIO: "var(--color-orange)",
};

const COR_STATUS: Record<StatusRadar, string> = {
  PENDENTE: "var(--color-text-weak)",
  EM_TRATAMENTO: "var(--color-gold)",
  TRATADO: "var(--color-green)",
  ADIADO: "var(--color-sky)",
  RETIRADO: "var(--color-text-dim)",
  REABERTO: "var(--color-orange)",
};

function Badge({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: cor }}>
      {children}
    </span>
  );
}

function PainelAcao({
  acoes,
  alerta,
  onFeito,
}: {
  acoes: ("tratar" | "concluir" | "adiar" | "retirar" | "reabrir")[];
  alerta: AlertaItem;
  onFeito: (atualizacao: Partial<AlertaItem>) => void;
}) {
  const [formAberto, setFormAberto] = useState<"concluir" | "adiar" | "retirar" | null>(null);
  const [providencia, setProvidencia] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [observacao, setObservacao] = useState("");
  const [adiadoPara, setAdiadoPara] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(acao: string, corpoExtra: Record<string, unknown>, atualizacao: Partial<AlertaItem>) {
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/alertas/radar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, modulo: alerta.modulo, projetoId: alerta.projetoId, tipoAlerta: alerta.tipoAlerta, ...corpoExtra }),
      });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setErro(dados?.erro || "Erro ao atualizar o alerta.");
        return;
      }
      setFormAberto(null);
      onFeito(atualizacao);
    } catch {
      setErro("Erro ao atualizar o alerta.");
    } finally {
      setEnviando(false);
    }
  }

  const botaoClasse = "rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-text-weak) hover:bg-(--color-surface-2)";

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        {acoes.includes("tratar") && (
          <button className={botaoClasse} disabled={enviando} onClick={() => enviar("tratar", {}, { status: STATUS_EM_TRATAMENTO })}>
            Tratar
          </button>
        )}
        {acoes.includes("concluir") && (
          <button className={botaoClasse} onClick={() => setFormAberto(formAberto === "concluir" ? null : "concluir")}>
            Concluir
          </button>
        )}
        {acoes.includes("adiar") && (
          <button className={botaoClasse} onClick={() => setFormAberto(formAberto === "adiar" ? null : "adiar")}>
            Adiar
          </button>
        )}
        {acoes.includes("retirar") && (
          <button className={botaoClasse} onClick={() => setFormAberto(formAberto === "retirar" ? null : "retirar")}>
            Retirar do radar
          </button>
        )}
        {acoes.includes("reabrir") && (
          <button className={botaoClasse} disabled={enviando} onClick={() => enviar("reabrir", {}, { status: STATUS_REABERTO })}>
            Reabrir
          </button>
        )}
      </div>

      {formAberto === "concluir" && (
        <div className="mt-2 space-y-2 rounded-xl border border-(--color-border) bg-(--color-bg) p-3">
          <input value={providencia} onChange={(e) => setProvidencia(e.target.value)} placeholder="Providência tomada *" className="w-full rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3 py-1.5 text-xs outline-none focus:border-(--color-navy)" />
          <input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Responsável *" className="w-full rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3 py-1.5 text-xs outline-none focus:border-(--color-navy)" />
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observação (opcional)" className="w-full rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3 py-1.5 text-xs outline-none focus:border-(--color-navy)" />
          <button
            disabled={enviando}
            onClick={() => enviar("concluir", { providencia, responsavel, observacao }, { status: STATUS_TRATADO, providencia, responsavelTratamento: responsavel, observacao })}
            className="rounded-full bg-(--color-navy) px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {enviando ? "Salvando…" : "Confirmar conclusão"}
          </button>
        </div>
      )}
      {formAberto === "adiar" && (
        <div className="mt-2 space-y-2 rounded-xl border border-(--color-border) bg-(--color-bg) p-3">
          <input type="date" value={adiadoPara} onChange={(e) => setAdiadoPara(e.target.value)} className="w-full rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3 py-1.5 text-xs outline-none focus:border-(--color-navy)" />
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observação (opcional)" className="w-full rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3 py-1.5 text-xs outline-none focus:border-(--color-navy)" />
          <button
            disabled={enviando}
            onClick={() => enviar("adiar", { adiadoPara, observacao }, { status: STATUS_ADIADO, adiadoPara, observacao })}
            className="rounded-full bg-(--color-navy) px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {enviando ? "Salvando…" : "Confirmar adiamento"}
          </button>
        </div>
      )}
      {formAberto === "retirar" && (
        <div className="mt-2 space-y-2 rounded-xl border border-(--color-border) bg-(--color-bg) p-3">
          <input value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Justificativa *" className="w-full rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3 py-1.5 text-xs outline-none focus:border-(--color-navy)" />
          <button
            disabled={enviando}
            onClick={() => enviar("retirar", { justificativa }, { status: STATUS_RETIRADO, justificativa })}
            className="rounded-full bg-(--color-navy) px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {enviando ? "Salvando…" : "Confirmar retirada"}
          </button>
        </div>
      )}
      {erro && <p className="mt-1 text-xs text-(--color-red)">{erro}</p>}
    </div>
  );
}

function acoesDisponiveis(status: StatusRadar): ("tratar" | "concluir" | "adiar" | "retirar" | "reabrir")[] {
  switch (status) {
    case STATUS_PENDENTE:
    case STATUS_REABERTO:
      return ["tratar", "adiar", "retirar"];
    case STATUS_EM_TRATAMENTO:
      return ["concluir", "adiar", "retirar"];
    case STATUS_TRATADO:
    case STATUS_ADIADO:
    case STATUS_RETIRADO:
      return ["reabrir"];
    default:
      return [];
  }
}

function CartaoAlerta({ alerta, onAtualizado }: { alerta: AlertaItem; onAtualizado: (id: string, atualizacao: Partial<AlertaItem>) => void }) {
  const href = alerta.modulo === "prestadores" ? "/prestadores/projetos" : "/cessionarios/projetos";
  const ehObrigatoria = alerta.tipoAlerta === TIPO_AVALIACAO_OBRIGATORIA;
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge cor={COR_TIPO[alerta.tipoAlerta]}>{alerta.motivoLabel}</Badge>
            <Badge cor={COR_STATUS[alerta.status]}>{STATUS_RADAR_LABELS[alerta.status]}</Badge>
            <p className="font-medium text-(--color-text)">AT {alerta.numAt || "—"}</p>
          </div>
          <p className="mt-1 text-sm text-(--color-text-weak)">
            {alerta.codigo} — {alerta.nome} ({alerta.disciplina || "—"}) · {alerta.modulo === "prestadores" ? "Prestador" : "Cessionário"} · Responsável: {alerta.responsavel || "—"}
          </p>
          {alerta.detalhe && <p className="mt-1 text-xs text-(--color-text-dim)">{alerta.detalhe}</p>}
          {alerta.status === "TRATADO" && alerta.providencia && (
            <p className="mt-1 text-xs text-(--color-green)">Providência: {alerta.providencia} — {alerta.responsavelTratamento}</p>
          )}
          {alerta.status === "ADIADO" && alerta.adiadoPara && (
            <p className="mt-1 text-xs text-(--color-sky)">Adiado para {new Date(alerta.adiadoPara).toLocaleDateString("pt-BR")}</p>
          )}
          {alerta.status === "RETIRADO" && alerta.justificativa && (
            <p className="mt-1 text-xs text-(--color-text-dim)">Justificativa: {alerta.justificativa}</p>
          )}
        </div>
        <Link href={href} className="shrink-0 rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-navy) hover:bg-(--color-surface-2)">
          Ver AT
        </Link>
      </div>
      {ehObrigatoria ? (
        <p className="mt-2 text-xs text-(--color-text-dim)">Fecha automaticamente assim que a avaliação for registrada — sem ação manual.</p>
      ) : (
        <PainelAcao acoes={acoesDisponiveis(alerta.status)} alerta={alerta} onFeito={(att) => onAtualizado(alerta.chaveRadar, att)} />
      )}
    </div>
  );
}

export function PainelAlertas({ alertasIniciais }: { alertasIniciais: AlertaItem[] }) {
  const [alertas, setAlertas] = useState(alertasIniciais);
  const [modulo, setModulo] = useState<"TODOS" | "prestadores" | "cessionarios">("TODOS");
  const [tipo, setTipo] = useState<"TODOS" | TipoAlerta>("TODOS");
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [busca, setBusca] = useState("");

  function atualizarAlerta(chave: string, atualizacao: Partial<AlertaItem>) {
    setAlertas((prev) => prev.map((a) => (a.chaveRadar === chave ? { ...a, ...atualizacao } : a)));
  }

  const filtrados = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    return alertas.filter((a) => {
      if (modulo !== "TODOS" && a.modulo !== modulo) return false;
      if (tipo !== "TODOS" && a.tipoAlerta !== tipo) return false;
      if (!mostrarTodos && !statusRadarAtivo(a.status)) return false;
      if (!termo) return true;
      return (a.nome || "").toUpperCase().includes(termo) || (a.codigo || "").toUpperCase().includes(termo) || (a.numAt || "").toUpperCase().includes(termo);
    });
  }, [alertas, modulo, tipo, mostrarTodos, busca]);

  const totalAtivos = alertas.filter((a) => statusRadarAtivo(a.status)).length;
  const totalMaximo = alertas.filter((a) => a.tipoAlerta === TIPO_ALERTA_MAXIMO && statusRadarAtivo(a.status)).length;

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Central de Alertas</h1>
      <p className="mt-1 max-w-2xl text-sm text-(--color-text-weak)">
        Motor consolidado — gargalo de revisão, atraso de análise, avaliação crítica/obrigatória, prazo prioritário
        e acompanhamento de HOLD. Cada alerta tem seu próprio ciclo de vida: tratar, adiar, retirar do radar ou
        reabrir.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-navy)">{totalAtivos}</p>
          <p className="text-xs text-(--color-text-weak)">alertas ativos</p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-red)">{totalMaximo}</p>
          <p className="text-xs text-(--color-text-weak)">alerta máximo</p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-text)">{filtrados.length}</p>
          <p className="text-xs text-(--color-text-weak)">exibidos com os filtros</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-(--color-border) bg-(--color-surface-1) p-1 text-xs font-medium">
          {(["TODOS", "prestadores", "cessionarios"] as const).map((m) => (
            <button key={m} onClick={() => setModulo(m)} className={`rounded-full px-3 py-1.5 transition-colors ${modulo === m ? "bg-(--color-navy) text-white" : "text-(--color-text-weak) hover:text-(--color-text)"}`}>
              {m === "TODOS" ? "Todos" : m === "prestadores" ? "Prestadores" : "Cessionários"}
            </button>
          ))}
        </div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium text-(--color-text) outline-none focus:border-(--color-navy)">
          <option value="TODOS">Todos os tipos</option>
          {Object.entries(TIPO_ALERTA_LABELS).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
        </select>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, código ou N° AT…"
          className="w-64 rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/15"
        />
        <label className="flex items-center gap-2 text-xs font-medium text-(--color-text-weak)">
          <input type="checkbox" checked={mostrarTodos} onChange={(e) => setMostrarTodos(e.target.checked)} />
          Mostrar tratados/adiados/retirados
        </label>
      </div>

      <div className="mt-6 space-y-3">
        {filtrados.length === 0 ? (
          <p className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-6 text-center text-sm text-(--color-text-weak)">
            Nenhum alerta encontrado com os filtros atuais.
          </p>
        ) : (
          filtrados.map((a) => <CartaoAlerta key={a.chaveRadar} alerta={a} onAtualizado={atualizarAlerta} />)
        )}
      </div>
    </div>
  );
}
