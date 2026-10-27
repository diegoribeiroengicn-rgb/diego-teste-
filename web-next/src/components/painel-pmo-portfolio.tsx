"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BIBLIOTECA_KPIS,
  KPI_ORDEM,
  KPI_PADRAO_HABILITADO,
  LABEL_STATUS,
  SAUDE_AMARELO,
  SAUDE_VERDE,
  SAUDE_VERMELHO,
  STATUS_PROJETO_OPCOES,
  TIPOS_CONTRATO_PMO,
  aplicarFiltrosPortfolioPmo,
  formatarDataBr,
  type AlertaPmo,
  type ProjetoPmo,
} from "@/lib/pmo-calculo";

const COR_SAUDE: Record<string, string> = { [SAUDE_VERDE]: "var(--color-green)", [SAUDE_AMARELO]: "var(--color-gold)", [SAUDE_VERMELHO]: "var(--color-red)" };
const ICONE_SAUDE: Record<string, string> = { [SAUDE_VERDE]: "🟢", [SAUDE_AMARELO]: "🟡", [SAUDE_VERMELHO]: "🔴" };

const inputClasse = "mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)";
const labelClasse = "text-xs text-(--color-text-weak)";

function CartaoMetrica({ titulo, valor }: { titulo: string; valor: string | number }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-4 py-4">
      <p className="break-words text-xl font-semibold tabular-nums text-(--color-text)">{valor}</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">{titulo}</p>
    </div>
  );
}

function CartaoProjetoPmo({ projeto, qtdAlertas }: { projeto: ProjetoPmo; qtdAlertas: number }) {
  const router = useRouter();
  const saude = projeto.saude || SAUDE_VERDE;
  return (
    <div className="flex flex-col rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
      <p className="text-sm font-semibold text-(--color-text)">{projeto.nome}</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">{projeto.cliente || "—"} · Contratada: {projeto.contratada || "—"}</p>
      <p className="mt-2 text-sm text-(--color-text)">
        <span className="text-(--color-text-weak)">Gerente: </span>{projeto.gerente || "—"}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-(--color-text-weak)">Status</p>
          <p className="mt-0.5 text-sm font-medium text-(--color-text)">{LABEL_STATUS[projeto.status] ?? projeto.status}</p>
        </div>
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-(--color-text-weak)">Saúde</p>
          <p className="mt-0.5 text-sm font-bold" style={{ color: COR_SAUDE[saude] }}>
            {ICONE_SAUDE[saude] ?? "⚪"} {saude.charAt(0) + saude.slice(1).toLowerCase()}
          </p>
        </div>
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-(--color-text-weak)">% Execução</p>
          <p className="mt-0.5 text-sm font-medium tabular-nums text-(--color-text)">{(projeto.percentual_execucao ?? 0).toFixed(0)}%</p>
        </div>
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-(--color-text-weak)">Alertas</p>
          <p className="mt-0.5 text-sm font-medium tabular-nums text-(--color-text)">{qtdAlertas}</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-(--color-text-weak)">Próximo marco: {projeto.proximo_marco || "Nenhum marco pendente"}</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">Término previsto: {formatarDataBr(projeto.data_prevista_termino)}</p>

      <button
        onClick={() => router.push(`/pmo/${projeto.id}`)}
        className="mt-4 rounded-full bg-(--color-navy) px-4 py-2 text-xs font-medium text-white"
      >
        Abrir projeto
      </button>
    </div>
  );
}

function FormularioNovoProjetoPmo({ onCriado }: { onCriado: () => void }) {
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [projetoId, setProjetoId] = useState<number | null>(null);

  const [nome, setNome] = useState("");
  const [cliente, setCliente] = useState("");
  const [contratada, setContratada] = useState("");
  const [gerente, setGerente] = useState("");
  const [tipoContrato, setTipoContrato] = useState(TIPOS_CONTRATO_PMO[0]);
  const [dataInicio, setDataInicio] = useState("");
  const [dataTermino, setDataTermino] = useState("");
  const [valorContratual, setValorContratual] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const habilitadosPadrao = useMemo(() => new Set(Object.entries(KPI_PADRAO_HABILITADO).filter(([, v]) => v).map(([k]) => k)), []);
  const [kpisEscolhidos, setKpisEscolhidos] = useState<Set<string>>(habilitadosPadrao);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function avancar() {
    if (!nome.trim() || !cliente.trim() || !contratada.trim() || !gerente.trim()) {
      setErro("Preencha Nome, Cliente, Contratada e Gerente do projeto.");
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const resposta = await fetch("/api/pmo/projetos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(), cliente: cliente.trim(), contratada: contratada.trim(), gerente: gerente.trim(),
          tipo_contrato: tipoContrato, data_inicio: dataInicio || null, data_prevista_termino: dataTermino || null,
          valor_contratual: valorContratual ? Number(valorContratual) : null, observacoes: observacoes.trim() || null,
          kpisHabilitados: null,
        }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setErro(corpo?.erro || "Não foi possível cadastrar o projeto.");
        return;
      }
      const corpo = await resposta.json();
      setProjetoId(corpo.projetoId);
      setEtapa(2);
    } finally {
      setSalvando(false);
    }
  }

  function alternarKpi(chave: string) {
    setKpisEscolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  async function concluir() {
    if (!projetoId) return;
    setSalvando(true);
    try {
      await fetch(`/api/pmo/projetos/${projetoId}/kpis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chaves: Array.from(kpisEscolhidos) }),
      });
      onCriado();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-6">
      {etapa === 1 ? (
        <>
          <p className="text-sm font-semibold text-(--color-text)">Novo Projeto PMO — Etapa 1 de 2 — Cadastro do projeto</p>
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
          <button onClick={avancar} disabled={salvando} className="mt-4 rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
            {salvando ? "Salvando…" : "Avançar para Configuração dos Indicadores"}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-(--color-text)">Novo Projeto PMO — Etapa 2 de 2 — Configuração dos Indicadores</p>
          <p className="mt-2 rounded-xl border border-(--color-border) bg-(--color-bg) px-3 py-2 text-xs text-(--color-text-weak)">
            Selecione apenas os indicadores que deseja monitorar neste projeto. Os não selecionados não aparecem no
            Dashboard nem ocupam espaço — podem ser habilitados a qualquer momento depois, sem perda de dados.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {KPI_ORDEM.map((chave) => (
              <label key={chave} title={BIBLIOTECA_KPIS[chave].objetivo} className="flex items-center gap-2 text-sm text-(--color-text)">
                <input type="checkbox" checked={kpisEscolhidos.has(chave)} onChange={() => alternarKpi(chave)} />
                {BIBLIOTECA_KPIS[chave].nome}
              </label>
            ))}
          </div>
          <button onClick={concluir} disabled={salvando} className="mt-4 rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
            {salvando ? "Concluindo…" : "Concluir cadastro"}
          </button>
        </>
      )}
    </div>
  );
}

export function PainelPmoPortfolio({ podeCadastrar }: { podeCadastrar: boolean }) {
  const router = useRouter();
  const [projetos, setProjetos] = useState<ProjetoPmo[] | null>(null);
  const [alertas, setAlertas] = useState<AlertaPmo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [recemCriado, setRecemCriado] = useState(false);

  const [fStatus, setFStatus] = useState<string[]>([]);
  const [fSaude, setFSaude] = useState<string[]>([]);
  const [fNome, setFNome] = useState("");

  function carregar() {
    fetch("/api/pmo/projetos")
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((corpo) => {
        setProjetos(corpo.projetos);
        setAlertas(corpo.alertas);
      })
      .catch(() => setErro("Não foi possível carregar o Portfólio PMO."));
  }

  useEffect(() => {
    carregar();
  }, []);

  const carregando = projetos === null && !erro;

  function alternarStatus(status: string) {
    setFStatus((atual) => (atual.includes(status) ? atual.filter((s) => s !== status) : [...atual, status]));
  }
  function alternarSaude(saude: string) {
    setFSaude((atual) => (atual.includes(saude) ? atual.filter((s) => s !== saude) : [...atual, saude]));
  }

  const filtrados = useMemo(
    () => (projetos ? aplicarFiltrosPortfolioPmo(projetos, { status: fStatus, saude: fSaude, nome: fNome }) : []),
    [projetos, fStatus, fSaude, fNome],
  );

  const alertasAtivos = useMemo(
    () => (alertas ? alertas.filter((a) => ["ABERTO", "EM_TRATAMENTO", "PENDENTE"].includes(a.status)) : []),
    [alertas],
  );

  function qtdAlertasProjeto(projetoId: number): number {
    return alertasAtivos.filter((a) => a.projeto_id === projetoId).length;
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">PMO — Portfólio de Projetos</h1>
      <p className="mt-2 text-sm text-(--color-text-weak)">
        Project Management Office — gerenciamento de contratos e projetos, independente das análises técnicas do GAT.
      </p>

      {recemCriado && (
        <p className="mt-4 rounded-xl border border-(--color-green)/30 bg-(--color-green)/10 px-4 py-3 text-sm text-(--color-green)">
          Projeto cadastrado com sucesso. O alerta &quot;Cronograma pendente de recebimento.&quot; foi gerado automaticamente e
          ficará ativo até o cronograma ser anexado.
        </p>
      )}

      {podeCadastrar && (
        <div className="mt-6">
          {!mostrarFormulario ? (
            <button onClick={() => setMostrarFormulario(true)} className="rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white">
              + Novo Projeto
            </button>
          ) : (
            <FormularioNovoProjetoPmo
              onCriado={() => {
                setMostrarFormulario(false);
                setRecemCriado(true);
                carregar();
                router.refresh();
              }}
            />
          )}
        </div>
      )}

      {erro && <p className="mt-6 text-sm text-(--color-red)">{erro}</p>}
      {carregando && <p className="mt-6 text-sm text-(--color-text-weak)">Carregando…</p>}

      {projetos && projetos.length === 0 && (
        <p className="mt-6 rounded-xl border border-(--color-border) bg-(--color-surface-1) px-4 py-3 text-sm text-(--color-text-weak)">
          Nenhum projeto PMO cadastrado ainda.
        </p>
      )}

      {projetos && projetos.length > 0 && (
        <>
          <details className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
            <summary className="cursor-pointer text-sm font-semibold text-(--color-text)">Filtros</summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <p className={labelClasse}>Status</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {STATUS_PROJETO_OPCOES.map((s) => (
                    <button
                      key={s}
                      onClick={() => alternarStatus(s)}
                      className={`rounded-full border px-3 py-1 text-xs ${fStatus.includes(s) ? "border-(--color-navy) bg-(--color-navy) text-white" : "border-(--color-border) text-(--color-text-weak)"}`}
                    >
                      {LABEL_STATUS[s]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className={labelClasse}>Saúde</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {[SAUDE_VERDE, SAUDE_AMARELO, SAUDE_VERMELHO].map((s) => (
                    <button
                      key={s}
                      onClick={() => alternarSaude(s)}
                      className={`rounded-full border px-3 py-1 text-xs ${fSaude.includes(s) ? "border-(--color-navy) bg-(--color-navy) text-white" : "border-(--color-border) text-(--color-text-weak)"}`}
                    >
                      {ICONE_SAUDE[s]} {s.charAt(0) + s.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
              <label className={labelClasse}>
                Buscar por nome/cliente/contratada
                <input value={fNome} onChange={(e) => setFNome(e.target.value)} className={inputClasse} />
              </label>
            </div>
          </details>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CartaoMetrica titulo="Total de projetos" valor={filtrados.length} />
            <CartaoMetrica titulo="Em andamento" valor={filtrados.filter((p) => p.status === "EM ANDAMENTO").length} />
            <CartaoMetrica titulo="Saúde crítica" valor={filtrados.filter((p) => p.saude === SAUDE_VERMELHO).length} />
            <CartaoMetrica titulo="Alertas ativos (PMO)" valor={alertasAtivos.length} />
          </div>

          {filtrados.length === 0 ? (
            <p className="mt-6 rounded-xl border border-(--color-border) bg-(--color-surface-1) px-4 py-3 text-sm text-(--color-text-weak)">
              Nenhum projeto encontrado com os filtros aplicados.
            </p>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...filtrados].sort((a, b) => a.nome.localeCompare(b.nome)).map((projeto) => (
                <CartaoProjetoPmo key={projeto.id} projeto={projeto} qtdAlertas={qtdAlertasProjeto(projeto.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

