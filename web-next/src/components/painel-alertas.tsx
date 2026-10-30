"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { DISCIPLINAS, RESPONSAVEIS } from "@/lib/administracao-calculo";
import { PRIORIDADE_ALERTA_MANUAL_OPCOES, type DadosAlertaManual } from "@/lib/alerta-manual-calculo";
import type { AlertaManualCompleto } from "@/lib/alerta-manual";
import { gerarMinutaCobranca, type DevolutivaPendente } from "@/lib/devolutiva-calculo";

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

const inputClasse = "mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)";
const labelClasse = "text-xs text-(--color-text-weak)";

const ICONE_PRIORIDADE: Record<string, string> = { Baixa: "⚪", Média: "🔵", Alta: "🟠", Urgente: "🔴" };

function dadosVazios(modulo: "prestadores" | "cessionarios"): DadosAlertaManual {
  return {
    modulo, projeto_id: null, titulo: "", descricao: null, num_at: null, codigo_projeto: null,
    nome_entidade: "", disciplina: null, revisao: null, especialista: null, prioridade: "Média",
    vencimento: null, observacoes: null, destinatarios: null,
  };
}

/** Pop-up de criação/edição de um alerta manual — mesmos campos de
 * gat/ui/modals_alerta_manual.py::dialog_alerta_manual. */
function FormularioAlertaManual({
  modulo, registro, usernames, onFechar, onSalvo,
}: {
  modulo: "prestadores" | "cessionarios";
  registro: AlertaManualCompleto | null;
  usernames: string[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [dados, setDados] = useState<DadosAlertaManual>(() => (registro ? { ...registro } : dadosVazios(modulo)));
  const [destinatariosSelecionados, setDestinatariosSelecionados] = useState<string[]>(
    () => registro?.destinatarios?.split(",").map((d) => d.trim()).filter(Boolean) ?? [],
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function campo<K extends keyof DadosAlertaManual>(chave: K, valor: DadosAlertaManual[K]) {
    setDados((atual) => ({ ...atual, [chave]: valor }));
  }

  function alternarDestinatario(username: string) {
    setDestinatariosSelecionados((atual) => (atual.includes(username) ? atual.filter((d) => d !== username) : [...atual, username]));
  }

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      const corpo: DadosAlertaManual = { ...dados, destinatarios: destinatariosSelecionados.length ? destinatariosSelecionados.join(",") : null };
      const url = registro ? `/api/alertas-manuais/${registro.id}` : "/api/alertas-manuais";
      const resposta = await fetch(url, {
        method: registro ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(resultado?.erro || "Erro ao salvar o alerta manual.");
        return;
      }
      onSalvo();
    } finally {
      setSalvando(false);
    }
  }

  const rotuloEntidade = modulo === "prestadores" ? "Prestador" : "Cessionário";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onFechar}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-(--color-surface-1) p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-(--color-text)">{registro ? "Editar alerta manual" : "Novo alerta manual"}</p>
        <p className="mt-1 text-xs text-(--color-text-weak)">
          Alerta criado manualmente para acompanhamento de um projeto específico — independente dos alertas automáticos
          de gargalo/atraso. Fica visível na Central de Alertas até ser encerrado.
        </p>

        <label className={`mt-4 block ${labelClasse}`}>
          Título *
          <input value={dados.titulo} onChange={(e) => campo("titulo", e.target.value)} className={inputClasse} />
        </label>
        <label className={`mt-3 block ${labelClasse}`}>
          Descrição
          <textarea value={dados.descricao ?? ""} onChange={(e) => campo("descricao", e.target.value || null)} rows={2} className={inputClasse} />
        </label>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className={labelClasse}>
            N° AT
            <input value={dados.num_at ?? ""} onChange={(e) => campo("num_at", e.target.value || null)} className={inputClasse} />
          </label>
          <label className={labelClasse}>
            Código do projeto
            <input value={dados.codigo_projeto ?? ""} onChange={(e) => campo("codigo_projeto", e.target.value || null)} className={inputClasse} />
          </label>
          <label className={labelClasse}>
            {rotuloEntidade} *
            <input value={dados.nome_entidade} onChange={(e) => campo("nome_entidade", e.target.value)} className={inputClasse} />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className={labelClasse}>
            Disciplina
            <select value={dados.disciplina ?? ""} onChange={(e) => campo("disciplina", e.target.value || null)} className={inputClasse}>
              <option value="">—</option>
              {DISCIPLINAS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className={labelClasse}>
            Revisão
            <input type="number" min={0} value={dados.revisao ?? 0} onChange={(e) => campo("revisao", Number(e.target.value))} className={inputClasse} />
          </label>
          <label className={labelClasse}>
            Especialista responsável
            <select value={dados.especialista ?? ""} onChange={(e) => campo("especialista", e.target.value || null)} className={inputClasse}>
              <option value="">—</option>
              {RESPONSAVEIS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className={labelClasse}>
            Prioridade
            <select value={dados.prioridade} onChange={(e) => campo("prioridade", e.target.value as DadosAlertaManual["prioridade"])} className={inputClasse}>
              {PRIORIDADE_ALERTA_MANUAL_OPCOES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className={labelClasse}>
            Vencimento
            <input type="date" value={dados.vencimento ?? ""} onChange={(e) => campo("vencimento", e.target.value || null)} className={inputClasse} />
          </label>
        </div>

        <label className={`mt-3 block ${labelClasse}`}>
          Observações
          <textarea value={dados.observacoes ?? ""} onChange={(e) => campo("observacoes", e.target.value || null)} rows={2} className={inputClasse} />
        </label>

        {usernames.length > 0 && (
          <div className="mt-3">
            <p className={labelClasse}>Destinatários (notificação/ciência)</p>
            <div className="mt-1.5 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-(--color-border) p-2">
              {usernames.map((u) => (
                <button
                  key={u} type="button" onClick={() => alternarDestinatario(u)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${destinatariosSelecionados.includes(u) ? "bg-(--color-navy) text-white" : "bg-(--color-surface-2) text-(--color-text-weak)"}`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        )}

        {erro && <p className="mt-3 text-sm text-(--color-red)">{erro}</p>}
        <div className="mt-5 flex gap-3">
          <button onClick={salvar} disabled={salvando} className="rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          <button onClick={onFechar} className="rounded-full border border-(--color-border) px-5 py-2 text-sm font-medium text-(--color-text)">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalEncerrarAlertaManual({ alerta, onFechar, onEncerrado }: { alerta: AlertaManualCompleto; onFechar: () => void; onEncerrado: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    if (!motivo.trim()) {
      setErro("O motivo do encerramento é obrigatório.");
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const resposta = await fetch(`/api/alertas-manuais/${alerta.id}/encerrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      });
      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(resultado?.erro || "Erro ao encerrar o alerta.");
        return;
      }
      onEncerrado();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onFechar}>
      <div className="w-full max-w-md rounded-2xl bg-(--color-surface-1) p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-(--color-text)">Encerrar alerta manual</p>
        <p className="mt-1 text-xs text-(--color-text-weak)">{alerta.titulo} — {alerta.nome_entidade || "—"}</p>
        <label className={`mt-4 block ${labelClasse}`}>
          Motivo do encerramento (obrigatório)
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className={inputClasse} />
        </label>
        {erro && <p className="mt-3 text-sm text-(--color-red)">{erro}</p>}
        <div className="mt-4 flex gap-3">
          <button onClick={confirmar} disabled={salvando} className="rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
            {salvando ? "Confirmando…" : "Confirmar encerramento"}
          </button>
          <button onClick={onFechar} className="rounded-full border border-(--color-border) px-5 py-2 text-sm font-medium text-(--color-text)">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function formatarDataHoraBr(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleString("pt-BR");
}

function formatarDataBr(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleDateString("pt-BR");
}

function CartaoAlertaManual({
  alerta, podeGerenciar, usernames, onMudou,
}: {
  alerta: AlertaManualCompleto;
  podeGerenciar: boolean;
  usernames: string[];
  onMudou: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);

  async function reabrir() {
    setReabrindo(true);
    try {
      await fetch(`/api/alertas-manuais/${alerta.id}/reabrir`, { method: "POST" });
      onMudou();
    } finally {
      setReabrindo(false);
    }
  }

  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-(--color-text)">{alerta.titulo} — {alerta.nome_entidade || "—"} ({alerta.disciplina || "—"})</p>
          {alerta.descricao && <p className="mt-1 text-sm text-(--color-text-weak)">{alerta.descricao}</p>}
          <p className="mt-1 text-xs text-(--color-text-dim)">
            N° AT {alerta.num_at || "—"} · Código {alerta.codigo_projeto || "—"} · Revisão {alerta.revisao ?? "—"} ·
            {" "}Especialista: {alerta.especialista || "—"} · Criado por {alerta.criado_por} em {formatarDataHoraBr(alerta.criado_em)}
          </p>
          {alerta.destinatarios && <p className="mt-1 text-xs text-(--color-text-dim)">Destinatários: {alerta.destinatarios}</p>}
          {alerta.observacoes && <p className="mt-1 text-xs text-(--color-text-dim)">Observações: {alerta.observacoes}</p>}
          {alerta.status === "ENCERRADO" && (
            <p className="mt-1 text-xs text-(--color-text-dim)">
              Encerrado em {formatarDataHoraBr(alerta.encerrado_em)} por {alerta.encerrado_por}
              {alerta.motivo_encerramento ? ` — Motivo: ${alerta.motivo_encerramento}` : ""}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-(--color-text-weak)">{ICONE_PRIORIDADE[alerta.prioridade] ?? ""} Prioridade: <span className="font-medium text-(--color-text)">{alerta.prioridade}</span></p>
          {alerta.vencimento && <p className="mt-1 text-xs text-(--color-text-dim)">Vence em {formatarDataBr(alerta.vencimento)}</p>}
        </div>
      </div>

      {podeGerenciar && (
        <div className="mt-3 flex gap-2">
          {alerta.status === "ABERTO" ? (
            <>
              <button onClick={() => setEditando(true)} className="rounded-full border border-(--color-border) px-3 py-1 text-xs font-medium text-(--color-text) hover:bg-(--color-surface-2)">Editar</button>
              <button onClick={() => setEncerrando(true)} className="rounded-full border border-(--color-border) px-3 py-1 text-xs font-medium text-(--color-text) hover:bg-(--color-surface-2)">Encerrar</button>
            </>
          ) : (
            <button onClick={reabrir} disabled={reabrindo} className="rounded-full border border-(--color-border) px-3 py-1 text-xs font-medium text-(--color-text) hover:bg-(--color-surface-2) disabled:opacity-60">
              {reabrindo ? "Reabrindo…" : "Reabrir"}
            </button>
          )}
        </div>
      )}

      {editando && (
        <FormularioAlertaManual
          modulo={alerta.modulo} registro={alerta} usernames={usernames}
          onFechar={() => setEditando(false)}
          onSalvo={() => { setEditando(false); onMudou(); }}
        />
      )}
      {encerrando && (
        <ModalEncerrarAlertaManual
          alerta={alerta}
          onFechar={() => setEncerrando(false)}
          onEncerrado={() => { setEncerrando(false); onMudou(); }}
        />
      )}
    </div>
  );
}

/** Seção "Alertas manuais" da Central de Alertas — porta de
 * views/alertas.py::_secao_alertas_manuais. `moduloCriacao` é null no
 * consolidado (sem módulo único para criar um novo alerta, igual ao
 * original). */
function SecaoAlertasManuais({ moduloCriacao, podeGerenciar }: { moduloCriacao: "prestadores" | "cessionarios" | null; podeGerenciar: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [alertas, setAlertas] = useState<AlertaManualCompleto[] | null>(null);
  const [usernames, setUsernames] = useState<string[]>([]);
  const [criando, setCriando] = useState(false);
  const [mostrarEncerrados, setMostrarEncerrados] = useState(false);
  const [filtroDestinatario, setFiltroDestinatario] = useState("");

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    if (moduloCriacao) params.set("modulo", moduloCriacao);
    else {
      params.append("modulo", "prestadores");
      params.append("modulo", "cessionarios");
    }
    fetch(`/api/alertas-manuais?${params.toString()}`)
      .then((r) => r.json())
      .then((corpo) => setAlertas(corpo.alertas ?? []))
      .catch(() => setAlertas([]));
  }, [moduloCriacao]);

  useEffect(() => {
    carregar();
    if (podeGerenciar) {
      fetch("/api/alertas-manuais/usuarios").then((r) => r.json()).then((c) => setUsernames(c.usernames ?? [])).catch(() => {});
    }
  }, [carregar, podeGerenciar]);

  const filtrados = (alertas ?? []).filter((a) => !filtroDestinatario || (a.destinatarios || "").split(",").map((d) => d.trim()).includes(filtroDestinatario));
  const opcoesDestinatario = [...new Set((alertas ?? []).flatMap((a) => (a.destinatarios || "").split(",").map((d) => d.trim()).filter(Boolean)))].sort();
  const abertosLista = filtrados.filter((a) => a.status === "ABERTO");
  const encerradosLista = filtrados.filter((a) => a.status === "ENCERRADO");

  return (
    <div className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
      <button onClick={() => setAberto((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-semibold text-(--color-text)">📣 Alertas manuais</span>
        <span className="text-xs text-(--color-text-weak)">{aberto ? "Recolher" : "Expandir"}</span>
      </button>

      {aberto && (
        <div className="mt-4">
          {podeGerenciar && (
            moduloCriacao ? (
              <button onClick={() => setCriando(true)} className="rounded-full bg-(--color-navy) px-4 py-1.5 text-xs font-medium text-white">
                + Novo alerta manual
              </button>
            ) : (
              <p className="text-xs text-(--color-text-weak)">Para criar um novo alerta manual, acesse a Central de Alertas de Prestadores ou Cessionários.</p>
            )
          )}

          {alertas === null ? (
            <p className="mt-3 text-xs text-(--color-text-dim)">Carregando…</p>
          ) : alertas.length === 0 ? (
            <p className="mt-3 text-xs text-(--color-text-weak)">Nenhum alerta manual cadastrado.</p>
          ) : (
            <>
              {opcoesDestinatario.length > 0 && (
                <select value={filtroDestinatario} onChange={(e) => setFiltroDestinatario(e.target.value)} className="mt-3 rounded-full border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-xs text-(--color-text)">
                  <option value="">Todos os destinatários</option>
                  {opcoesDestinatario.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
              <p className="mt-3 text-xs text-(--color-text-dim)">{abertosLista.length} aberto(s) · {encerradosLista.length} encerrado(s)</p>

              <div className="mt-3 space-y-3">
                {abertosLista.map((a) => (
                  <CartaoAlertaManual key={a.id} alerta={a} podeGerenciar={podeGerenciar} usernames={usernames} onMudou={carregar} />
                ))}
              </div>

              {encerradosLista.length > 0 && (
                <div className="mt-4">
                  <button onClick={() => setMostrarEncerrados((v) => !v)} className="text-xs font-medium text-(--color-text-weak) hover:text-(--color-text)">
                    {mostrarEncerrados ? "Ocultar" : "Mostrar"} encerrados ({encerradosLista.length})
                  </button>
                  {mostrarEncerrados && (
                    <div className="mt-3 space-y-3">
                      {encerradosLista.map((a) => (
                        <CartaoAlertaManual key={a.id} alerta={a} podeGerenciar={podeGerenciar} usernames={usernames} onMudou={carregar} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {criando && moduloCriacao && (
        <FormularioAlertaManual
          modulo={moduloCriacao} registro={null} usernames={usernames}
          onFechar={() => setCriando(false)}
          onSalvo={() => { setCriando(false); carregar(); }}
        />
      )}
    </div>
  );
}

const ICONE_SITUACAO_DEVOLUTIVA: Record<string, string> = {
  AGUARDANDO_PRAZO_INICIAL: "⚪", EM_HOLD: "🔵", COBRANCA_REALIZADA: "🟡",
  PRIMEIRA_COBRANCA_NECESSARIA: "🟠", NOVA_COBRANCA_NECESSARIA: "🟠",
};

/** Pop-up "Gerar e-mail de cobrança" — mostra a minuta (assunto + corpo)
 * para o usuário copiar/enviar por fora do sistema, e só registra a
 * cobrança após a confirmação explícita. Mesma regra de
 * gat/ui/modals_devolutiva.py::dialog_cobranca_devolutiva. */
function ModalCobrancaDevolutiva({ devolutiva, onFechar, onConfirmado }: { devolutiva: DevolutivaPendente; onFechar: () => void; onConfirmado: () => void }) {
  const numeroCobranca = devolutiva.numeroProximaCobranca ?? devolutiva.numeroCobrancasRealizadas + 1;
  const minuta = gerarMinutaCobranca(numeroCobranca, devolutiva.codigo, devolutiva.nome, devolutiva.disciplina, devolutiva.numAt, devolutiva.dataUltimaAt, devolutiva.dataPrimeiraCobranca);
  const [corpo, setCorpo] = useState(minuta.corpo);
  const [canal, setCanal] = useState("E-mail");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`Assunto: ${minuta.assunto}\n\n${corpo}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // seleção manual continua disponível no textarea
    }
  }

  async function confirmar() {
    setErro(null);
    setSalvando(true);
    try {
      const resposta = await fetch(`/api/devolutivas/${devolutiva.modulo}/${devolutiva.projetoId}/cobranca`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numeroCobranca, canal, observacao: observacao.trim() || null }),
      });
      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(resultado?.erro || "Erro ao registrar a cobrança.");
        return;
      }
      onConfirmado();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onFechar}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-(--color-surface-1) p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-(--color-text)">Cobrança de Devolutiva Externa</p>
        <p className="mt-1 text-xs text-(--color-text-weak)">
          {devolutiva.nome || "—"} ({devolutiva.codigo || "—"}) — {devolutiva.disciplina || "—"} · N° AT {devolutiva.numAt || "—"} · {numeroCobranca}ª cobrança
        </p>

        <label className={`mt-4 block ${labelClasse}`}>
          Assunto
          <input value={minuta.assunto} disabled className={`${inputClasse} opacity-70`} />
        </label>
        <label className={`mt-3 block ${labelClasse}`}>
          Corpo do e-mail (copie e envie pelo seu canal de e-mail habitual)
          <textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={10} className={inputClasse} />
        </label>

        <p className="mt-3 text-xs text-(--color-text-dim)">
          O sistema não envia este e-mail automaticamente. Após enviá-lo pelo seu canal de e-mail, confirme abaixo
          para registrar a cobrança e iniciar a contagem dos próximos {numeroCobranca > 1 ? "5" : "5"} dias úteis.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className={labelClasse}>
            Canal utilizado
            <select value={canal} onChange={(e) => setCanal(e.target.value)} className={inputClasse}>
              {["E-mail", "Telefone", "Reunião", "Outro"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className={labelClasse}>
            Observação (opcional)
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} className={inputClasse} />
          </label>
        </div>

        {erro && <p className="mt-3 text-sm text-(--color-red)">{erro}</p>}
        <div className="mt-5 flex gap-3">
          <button onClick={copiar} className="rounded-full border border-(--color-border) px-4 py-2 text-sm font-medium text-(--color-text) hover:bg-(--color-surface-2)">
            {copiado ? "Copiado!" : "Copiar e-mail"}
          </button>
          <button onClick={confirmar} disabled={salvando} className="rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
            {salvando ? "Confirmando…" : "Confirmar cobrança realizada"}
          </button>
          <button onClick={onFechar} className="rounded-full border border-(--color-border) px-5 py-2 text-sm font-medium text-(--color-text)">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function CartaoDevolutiva({ devolutiva, onMudou }: { devolutiva: DevolutivaPendente; onMudou: () => void }) {
  const [gerando, setGerando] = useState(false);
  const icone = ICONE_SITUACAO_DEVOLUTIVA[devolutiva.situacao ?? ""] ?? (devolutiva.acaoNecessaria ? "🟠" : "🟡");

  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-(--color-text)">{devolutiva.nome || "—"} ({devolutiva.codigo || "—"}) — {devolutiva.disciplina || "—"}</p>
          <p className="mt-1 text-xs text-(--color-text-dim)">
            N° AT {devolutiva.numAt || "—"} · Revisão {devolutiva.revisao} · Responsável: {devolutiva.responsavel || "—"} ·
            {" "}Última AT em {formatarDataBr(devolutiva.dataUltimaAt)} · {devolutiva.diasUteisDecorridos} dia(s) útil(eis) sem retorno
          </p>
          <p className="mt-1 text-xs text-(--color-text-dim)">
            Cobranças realizadas: {devolutiva.numeroCobrancasRealizadas}
            {devolutiva.dataUltimaCobranca && ` · Última cobrança: ${formatarDataBr(devolutiva.dataUltimaCobranca)}`}
            {devolutiva.dataPrevistaProximaVerificacao && ` · Próxima verificação prevista: ${formatarDataBr(devolutiva.dataPrevistaProximaVerificacao)}`}
          </p>
        </div>
        <p className="shrink-0 text-xs text-(--color-text-weak)">{icone} <span className="font-medium text-(--color-text)">{devolutiva.situacaoLabel}</span></p>
      </div>

      {devolutiva.acaoNecessaria && (
        <button onClick={() => setGerando(true)} className="mt-3 rounded-full bg-(--color-navy) px-4 py-1.5 text-xs font-medium text-white">
          Gerar e-mail de cobrança
        </button>
      )}

      {gerando && (
        <ModalCobrancaDevolutiva devolutiva={devolutiva} onFechar={() => setGerando(false)} onConfirmado={() => { setGerando(false); onMudou(); }} />
      )}
    </div>
  );
}

/** Central de Alertas > Devolutivas Pendentes — porta de
 * views/alertas.py::_secao_devolutivas_pendentes. 100% dinâmica (nunca um
 * alerta persistido): recalculada a cada carregamento a partir da
 * revisão mais recente de cada projeto e do histórico de cobranças já
 * confirmadas. */
function SecaoDevolutivasPendentes({ modulosIncluidos }: { modulosIncluidos: ("prestadores" | "cessionarios")[] }) {
  const [aberto, setAberto] = useState(false);
  const [devolutivas, setDevolutivas] = useState<DevolutivaPendente[] | null>(null);

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    for (const m of modulosIncluidos) params.append("modulo", m);
    fetch(`/api/devolutivas?${params.toString()}`)
      .then((r) => r.json())
      .then((corpo) => setDevolutivas(corpo.devolutivas ?? []))
      .catch(() => setDevolutivas([]));
  }, [modulosIncluidos]);

  useEffect(() => {
    if (aberto) carregar();
  }, [aberto, carregar]);

  const ordenadas = [...(devolutivas ?? [])].sort((a, b) => Number(b.acaoNecessaria) - Number(a.acaoNecessaria));
  const prestadoresCount = ordenadas.filter((d) => d.modulo === "prestadores").length;
  const cessionariosCount = ordenadas.filter((d) => d.modulo === "cessionarios").length;
  const acaoCount = ordenadas.filter((d) => d.acaoNecessaria).length;

  return (
    <div className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
      <button onClick={() => setAberto((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-semibold text-(--color-text)">📧 Devolutivas Pendentes</span>
        <span className="text-xs text-(--color-text-weak)">{aberto ? "Recolher" : "Expandir"}</span>
      </button>

      {aberto && (
        <div className="mt-4">
          <p className="text-xs text-(--color-text-weak)">
            Projetos com a última AT emitida, aguardando nova revisão do Prestador/Cessionário. 10 dias úteis sem
            retorno geram a 1ª cobrança; a partir daí, uma nova cobrança a cada 5 dias úteis sem retorno, sem
            limite máximo, até o projeto voltar para Em Análise. HOLD sempre pausa a contagem e nunca gera cobrança.
          </p>

          {devolutivas === null ? (
            <p className="mt-3 text-xs text-(--color-text-dim)">Carregando…</p>
          ) : ordenadas.length === 0 ? (
            <p className="mt-3 rounded-xl border border-(--color-green)/30 bg-(--color-green)/10 px-4 py-3 text-sm text-(--color-green)">
              Nenhuma devolutiva externa pendente no momento.
            </p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-(--color-surface-2) px-3 py-1 font-medium text-(--color-text)">{prestadoresCount} prestador(es) aguardando retorno</span>
                <span className="rounded-full bg-(--color-surface-2) px-3 py-1 font-medium text-(--color-text)">{cessionariosCount} cessionário(s) aguardando retorno</span>
                <span className="rounded-full bg-(--color-orange-bg) px-3 py-1 font-medium text-(--color-orange)">{acaoCount} cobrança(s) pendente(s)</span>
              </div>
              <div className="mt-3 space-y-3">
                {ordenadas.map((d) => <CartaoDevolutiva key={`${d.modulo}_${d.projetoId}`} devolutiva={d} onMudou={carregar} />)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function PainelAlertas({ alertasIniciais, podeGerenciarAlertaManual = false }: { alertasIniciais: AlertaItem[]; podeGerenciarAlertaManual?: boolean }) {
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

      <SecaoAlertasManuais moduloCriacao={modulo === "TODOS" ? null : modulo} podeGerenciar={podeGerenciarAlertaManual} />
      <SecaoDevolutivasPendentes modulosIncluidos={modulo === "TODOS" ? ["prestadores", "cessionarios"] : [modulo]} />

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
