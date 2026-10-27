"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BIBLIOTECA_KPIS,
  KPI_ORDEM,
  LABEL_STATUS,
  SAUDE_AMARELO,
  SAUDE_VERDE,
  SAUDE_VERMELHO,
  STATUS_PROJETO_OPCOES,
  TIPOS_CONTRATO_PMO,
  formatarDataBr,
  formatarMoeda,
  type AlertaPmo,
  type ProjetoPmo,
} from "@/lib/pmo-calculo";

const COR_SAUDE: Record<string, string> = { [SAUDE_VERDE]: "var(--color-green)", [SAUDE_AMARELO]: "var(--color-gold)", [SAUDE_VERMELHO]: "var(--color-red)" };
const ICONE_SAUDE: Record<string, string> = { [SAUDE_VERDE]: "🟢", [SAUDE_AMARELO]: "🟡", [SAUDE_VERMELHO]: "🔴" };

const inputClasse = "mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)";
const labelClasse = "text-xs text-(--color-text-weak)";

type RespostaProjeto = {
  projeto: ProjetoPmo;
  alertas: AlertaPmo[];
  alertaCronograma: { status: string } | null;
  kpisHabilitados: string[];
};

function CartaoMetrica({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-4 py-4">
      <p className="break-words text-xl font-semibold tabular-nums" style={cor ? { color: cor } : undefined}>{valor}</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">{titulo}</p>
    </div>
  );
}

function FormularioEditarProjeto({ projeto, onSalvo, onCancelar }: { projeto: ProjetoPmo; onSalvo: () => void; onCancelar: () => void }) {
  const [nome, setNome] = useState(projeto.nome);
  const [cliente, setCliente] = useState(projeto.cliente ?? "");
  const [contratada, setContratada] = useState(projeto.contratada ?? "");
  const [gerente, setGerente] = useState(projeto.gerente ?? "");
  const [tipoContrato, setTipoContrato] = useState(projeto.tipo_contrato ?? TIPOS_CONTRATO_PMO[0]);
  const [dataInicio, setDataInicio] = useState(projeto.data_inicio?.slice(0, 10) ?? "");
  const [dataTermino, setDataTermino] = useState(projeto.data_prevista_termino?.slice(0, 10) ?? "");
  const [valorContratual, setValorContratual] = useState(projeto.valor_contratual != null ? String(projeto.valor_contratual) : "");
  const [observacoes, setObservacoes] = useState(projeto.observacoes ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!nome.trim() || !cliente.trim() || !contratada.trim() || !gerente.trim()) {
      setErro("Preencha Nome, Cliente, Contratada e Gerente do projeto.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/pmo/projetos/${projeto.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(), cliente: cliente.trim(), contratada: contratada.trim(), gerente: gerente.trim(),
          tipo_contrato: tipoContrato, data_inicio: dataInicio || null, data_prevista_termino: dataTermino || null,
          valor_contratual: valorContratual ? Number(valorContratual) : null, observacoes: observacoes.trim() || null,
        }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setErro(corpo?.erro || "Não foi possível salvar as alterações.");
        return;
      }
      onSalvo();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-6">
      <p className="text-sm font-semibold text-(--color-text)">Editar Projeto</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClasse}>Nome do projeto *<input value={nome} onChange={(e) => setNome(e.target.value)} className={inputClasse} /></label>
        <label className={labelClasse}>Tipo do contrato
          <select value={tipoContrato} onChange={(e) => setTipoContrato(e.target.value)} className={inputClasse}>
            {TIPOS_CONTRATO_PMO.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className={labelClasse}>Cliente *<input value={cliente} onChange={(e) => setCliente(e.target.value)} className={inputClasse} /></label>
        <label className={labelClasse}>Contratada *<input value={contratada} onChange={(e) => setContratada(e.target.value)} className={inputClasse} /></label>
        <label className={labelClasse}>Gerente do projeto *<input value={gerente} onChange={(e) => setGerente(e.target.value)} className={inputClasse} /></label>
        <label className={labelClasse}>Valor contratual (opcional)<input type="number" min={0} step={1000} value={valorContratual} onChange={(e) => setValorContratual(e.target.value)} className={inputClasse} /></label>
        <label className={labelClasse}>Data de início<input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className={inputClasse} /></label>
        <label className={labelClasse}>Data prevista de término<input type="date" value={dataTermino} onChange={(e) => setDataTermino(e.target.value)} className={inputClasse} /></label>
      </div>
      <label className={`mt-3 block ${labelClasse}`}>Observações<textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className={`${inputClasse} h-20`} /></label>

      {erro && <p className="mt-3 text-sm text-(--color-red)">{erro}</p>}
      <div className="mt-4 flex gap-3">
        <button onClick={salvar} disabled={salvando} className="rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
          {salvando ? "Salvando…" : "Salvar alterações"}
        </button>
        <button onClick={onCancelar} className="rounded-full border border-(--color-border) px-5 py-2 text-sm font-medium text-(--color-text)">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function FormularioConfigurarKpis({ projetoId, habilitadosIniciais, onSalvo, onCancelar }: {
  projetoId: number; habilitadosIniciais: Set<string>; onSalvo: () => void; onCancelar: () => void;
}) {
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set(habilitadosIniciais));
  const [salvando, setSalvando] = useState(false);

  function alternar(chave: string) {
    setEscolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  async function salvar() {
    setSalvando(true);
    try {
      await fetch(`/api/pmo/projetos/${projetoId}/kpis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chaves: Array.from(escolhidos) }),
      });
      onSalvo();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-6">
      <p className="text-sm font-semibold text-(--color-text)">Configuração dos Indicadores</p>
      <p className="mt-2 rounded-xl border border-(--color-border) bg-(--color-bg) px-3 py-2 text-xs text-(--color-text-weak)">
        Indicadores desabilitados somem do Dashboard mas nenhum dado lançado neles é apagado — podem ser reabilitados a
        qualquer momento.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {KPI_ORDEM.map((chave) => (
          <label key={chave} title={BIBLIOTECA_KPIS[chave].objetivo} className="flex items-center gap-2 text-sm text-(--color-text)">
            <input type="checkbox" checked={escolhidos.has(chave)} onChange={() => alternar(chave)} />
            {BIBLIOTECA_KPIS[chave].nome}
          </label>
        ))}
      </div>
      <div className="mt-4 flex gap-3">
        <button onClick={salvar} disabled={salvando} className="rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
          {salvando ? "Salvando…" : "Salvar configuração"}
        </button>
        <button onClick={onCancelar} className="rounded-full border border-(--color-border) px-5 py-2 text-sm font-medium text-(--color-text)">
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function PainelPmoProjeto({ projetoId }: { projetoId: number }) {
  const router = useRouter();
  const [dados, setDados] = useState<RespostaProjeto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [painelAberto, setPainelAberto] = useState<null | "editar" | "kpis">(null);
  const [alterandoStatus, setAlterandoStatus] = useState(false);

  function carregar() {
    fetch(`/api/pmo/projetos/${projetoId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((corpo: RespostaProjeto) => setDados(corpo))
      .catch(() => setErro("Não foi possível carregar o projeto."));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetoId]);

  const carregando = dados === null && !erro;

  const alertasAtivos = useMemo(
    () => (dados ? dados.alertas.filter((a) => ["ABERTO", "EM_TRATAMENTO", "PENDENTE"].includes(a.status)) : []),
    [dados],
  );

  async function alterarStatus(novoStatus: string) {
    if (!dados) return;
    setAlterandoStatus(true);
    try {
      await fetch(`/api/pmo/projetos/${projetoId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novoStatus }),
      });
      carregar();
      router.refresh();
    } finally {
      setAlterandoStatus(false);
    }
  }

  if (erro) {
    return (
      <div className="mx-auto max-w-5xl px-8 py-10">
        <p className="text-sm text-(--color-red)">{erro}</p>
      </div>
    );
  }

  if (carregando) {
    return (
      <div className="mx-auto max-w-5xl px-8 py-10">
        <p className="text-sm text-(--color-text-weak)">Carregando…</p>
      </div>
    );
  }

  const { projeto, kpisHabilitados, alertaCronograma } = dados!;
  const saude = projeto.saude || SAUDE_VERDE;

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <button onClick={() => router.push("/pmo")} className="text-sm text-(--color-text-weak) hover:text-(--color-text)">
        ← Voltar ao Portfólio
      </button>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-(--color-text)">{projeto.nome}</h1>
          <p className="mt-1 text-sm text-(--color-text-weak)">{projeto.cliente || "—"} · Contratada: {projeto.contratada || "—"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setPainelAberto("editar")} className="rounded-full border border-(--color-border) px-4 py-2 text-xs font-medium text-(--color-text)">
            Editar Projeto
          </button>
          <button onClick={() => setPainelAberto("kpis")} className="rounded-full border border-(--color-border) px-4 py-2 text-xs font-medium text-(--color-text)">
            Configuração dos Indicadores
          </button>
        </div>
      </div>

      {painelAberto === "editar" && (
        <div className="mt-4">
          <FormularioEditarProjeto
            projeto={projeto}
            onCancelar={() => setPainelAberto(null)}
            onSalvo={() => { setPainelAberto(null); carregar(); router.refresh(); }}
          />
        </div>
      )}
      {painelAberto === "kpis" && (
        <div className="mt-4">
          <FormularioConfigurarKpis
            projetoId={projetoId}
            habilitadosIniciais={new Set(kpisHabilitados)}
            onCancelar={() => setPainelAberto(null)}
            onSalvo={() => { setPainelAberto(null); carregar(); router.refresh(); }}
          />
        </div>
      )}

      <p className="mt-2 text-sm text-(--color-text)">
        <span className="text-(--color-text-weak)">Gerente: </span>{projeto.gerente || "—"}
        <span className="mx-2 text-(--color-text-weak)">·</span>
        <span className="text-(--color-text-weak)">Tipo de contrato: </span>{projeto.tipo_contrato || "—"}
      </p>

      <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-(--color-text-weak)">Resumo Executivo</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-4 py-4">
          <label className={labelClasse}>Status</label>
          <select
            value={projeto.status}
            disabled={alterandoStatus}
            onChange={(e) => alterarStatus(e.target.value)}
            className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-2 py-1 text-sm font-medium text-(--color-text) outline-none"
          >
            {STATUS_PROJETO_OPCOES.map((s) => <option key={s} value={s}>{LABEL_STATUS[s]}</option>)}
          </select>
        </div>
        <CartaoMetrica titulo="Saúde" valor={`${ICONE_SAUDE[saude] ?? "⚪"} ${saude.charAt(0) + saude.slice(1).toLowerCase()}`} cor={COR_SAUDE[saude]} />
        <CartaoMetrica titulo="% Execução" valor={`${(projeto.percentual_execucao ?? 0).toFixed(0)}%`} />
        <CartaoMetrica titulo="Próximo marco" valor={projeto.proximo_marco || "Nenhum marco pendente"} />
        <CartaoMetrica titulo="Alertas ativos" valor={String(alertasAtivos.length)} />
        <CartaoMetrica titulo="Valor contratual" valor={formatarMoeda(projeto.valor_contratual)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CartaoMetrica titulo="Data de início" valor={formatarDataBr(projeto.data_inicio)} />
        <CartaoMetrica titulo="Término previsto" valor={formatarDataBr(projeto.data_prevista_termino)} />
      </div>

      {projeto.observacoes && (
        <div className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-(--color-text-weak)">Observações</p>
          <p className="mt-1 text-sm text-(--color-text)">{projeto.observacoes}</p>
        </div>
      )}

      <div className="mt-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-(--color-text-weak)">Alertas do projeto</p>
        {alertaCronograma?.status === "ATIVO" && (
          <p className="mt-2 rounded-xl border border-(--color-gold)/30 bg-(--color-gold)/10 px-4 py-3 text-sm text-(--color-gold)">
            🟡 Cronograma pendente de recebimento. O projeto ainda não possui cronograma anexado.
          </p>
        )}
        {alertasAtivos.filter((a) => a.titulo !== "Cronograma pendente de recebimento.").length === 0 && alertaCronograma?.status !== "ATIVO" ? (
          <p className="mt-2 text-sm text-(--color-text-weak)">Nenhum alerta ativo.</p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {alertasAtivos.filter((a) => a.titulo !== "Cronograma pendente de recebimento.").map((a) => (
              <div key={a.id} className="rounded-xl border border-(--color-border) bg-(--color-surface-1) px-4 py-3">
                <p className="text-sm font-medium text-(--color-text)">{a.titulo}</p>
                {a.descricao && <p className="mt-1 text-xs text-(--color-text-weak)">{a.descricao}</p>}
                <p className="mt-1 text-xs text-(--color-text-dim)">Prioridade: {a.prioridade || "—"}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-10 text-xs text-(--color-text-dim)">
        Dashboard dinâmico, Cronograma, Curva S, Financeiro, Medições, Entregáveis, Riscos, Comunicações e
        Relatórios/OPR deste projeto serão disponibilizados em um próximo incremento do módulo PMO.
      </p>
    </div>
  );
}
