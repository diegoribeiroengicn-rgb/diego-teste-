"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  BIBLIOTECA_KPIS,
  KPI_ORDEM,
  LABEL_STATUS,
  SAUDE_AMARELO,
  SAUDE_VERDE,
  SAUDE_VERMELHO,
  SITUACOES_MEDICAO,
  STATUS_PROJETO_OPCOES,
  STATUS_RISCO_OPCOES,
  TIPOS_CONTRATO_PMO,
  TIPOS_COMUNICACAO,
  calcularPercentualExecucao,
  calcularSpi,
  curvaSPlanejada,
  formatarDataBr,
  formatarMoeda,
  percentualPlanejadoAte,
  type AlertaPmo,
  type AtividadeCronograma,
  type Comunicacao,
  type Entregavel,
  type Medicao,
  type ProjetoPmo,
  type ResumoFinanceiro,
  type Risco,
} from "@/lib/pmo-calculo";
import { perfilPodeArquivarERestaurar } from "@/lib/arquivo-calculo";
import type { ArquivoCronograma, LembreteCronograma } from "@/lib/pmo";

const COR_SAUDE: Record<string, string> = { [SAUDE_VERDE]: "var(--color-green)", [SAUDE_AMARELO]: "var(--color-gold)", [SAUDE_VERMELHO]: "var(--color-red)" };
const ICONE_SAUDE: Record<string, string> = { [SAUDE_VERDE]: "🟢", [SAUDE_AMARELO]: "🟡", [SAUDE_VERMELHO]: "🔴" };

const inputClasse = "mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)";
const labelClasse = "text-xs text-(--color-text-weak)";
const botaoPrimario = "rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white disabled:opacity-60";
const botaoSecundario = "rounded-full border border-(--color-border) px-5 py-2 text-sm font-medium text-(--color-text)";

const TABS_POR_KPI: { chave: string; rotulo: string }[] = [
  { chave: "cronograma", rotulo: "Cronograma" },
  { chave: "curva_s", rotulo: "Curva S" },
  { chave: "financeiro", rotulo: "Financeiro" },
  { chave: "medicoes", rotulo: "Medições" },
  { chave: "entregaveis", rotulo: "Entregáveis" },
  { chave: "riscos", rotulo: "Riscos" },
  { chave: "comunicacoes", rotulo: "Comunicações" },
];

type RespostaProjeto = {
  projeto: ProjetoPmo;
  alertas: AlertaPmo[];
  alertaCronograma: { status: string } | null;
  kpisHabilitados: string[];
};

type RespostaDashboard = {
  kpisHabilitados: string[];
  atividades: AtividadeCronograma[];
  riscos: Risco[];
  resumoFinanceiro: ResumoFinanceiro;
  medicoes: Medicao[];
  entregaveis: Entregavel[];
  comunicacoes: Comunicacao[];
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

function CartaoDashboard({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe: string }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-4 py-4">
      <p className="text-xs text-(--color-text-weak)">{titulo}</p>
      <p className="mt-1 break-words text-base font-semibold text-(--color-text)">{valor}</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">{detalhe}</p>
    </div>
  );
}

/** Mesma montagem de cartões de views/pmo_projeto.py::_tab_dashboard — um
 * cartão por KPI habilitado no projeto. Cronograma/Curva S/SPI degradam
 * graciosamente para "0 atividades"/"—" enquanto o Cronograma (upload +
 * interpretação automática) não é construído. */
function AbaDashboard({ projetoId, kpisHabilitados }: { projetoId: number; kpisHabilitados: Set<string> }) {
  const [dados, setDados] = useState<RespostaDashboard | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pmo/projetos/${projetoId}/dashboard`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setDados)
      .catch(() => setErro("Não foi possível carregar o Dashboard."));
  }, [projetoId]);

  if (erro) return <p className="text-sm text-(--color-red)">{erro}</p>;
  if (!dados) return <p className="text-sm text-(--color-text-weak)">Carregando…</p>;
  if (!kpisHabilitados.size) {
    return <p className="text-sm text-(--color-text-weak)">Nenhum indicador habilitado para este projeto. Habilite em &quot;Configuração dos Indicadores&quot;.</p>;
  }

  const { atividades, riscos, resumoFinanceiro: fin, medicoes, entregaveis, comunicacoes } = dados;
  const pctRealizado = calcularPercentualExecucao(atividades);
  const pctPlanejadoHoje = atividades.length ? percentualPlanejadoAte(atividades, new Date()) : 0;
  const cartoes: { titulo: string; valor: string; detalhe: string }[] = [];

  if (kpisHabilitados.has("cronograma")) {
    const criticas = atividades.filter((a) => a.caminho_critico === 1).length;
    cartoes.push({ titulo: "Cronograma", valor: `${atividades.length} atividades`, detalhe: `${criticas} no caminho crítico` });
  }
  if (kpisHabilitados.has("curva_s")) {
    cartoes.push({ titulo: "Curva S", valor: `Planejado hoje: ${pctPlanejadoHoje.toFixed(0)}%`, detalhe: `Realizado: ${pctRealizado.toFixed(0)}%` });
  }
  if (kpisHabilitados.has("financeiro")) {
    cartoes.push({ titulo: "Financeiro", valor: `Saldo: ${formatarMoeda(fin.saldo)}`, detalhe: `Pago: ${formatarMoeda(fin.valor_pago)}` });
  }
  if (kpisHabilitados.has("medicoes")) {
    const ultima = medicoes[0];
    cartoes.push({ titulo: "Medições", valor: `${medicoes.length} lançadas`, detalhe: ultima ? `Última: ${ultima.situacao}` : "Nenhuma lançada" });
  }
  if (kpisHabilitados.has("spi")) {
    const spi = calcularSpi(pctRealizado, pctPlanejadoHoje);
    cartoes.push({ titulo: "SPI", valor: spi != null ? spi.toFixed(2) : "—", detalhe: spi == null ? "Sem dados" : spi >= 1 ? "No prazo" : "Atrasado" });
  }
  if (kpisHabilitados.has("entregaveis")) {
    const entregues = entregaveis.filter((e) => e.entregue).length;
    cartoes.push({ titulo: "Entregáveis", valor: `${entregues}/${entregaveis.length} entregues`, detalhe: entregaveis.length ? `${entregaveis.length - entregues} pendentes` : "Nenhum cadastrado" });
  }
  if (kpisHabilitados.has("avanco_fisico")) {
    cartoes.push({ titulo: "Avanço Físico", valor: `${pctRealizado.toFixed(0)}%`, detalhe: "Baseado no cronograma" });
  }
  if (kpisHabilitados.has("avanco_documental")) {
    const pctDoc = entregaveis.length ? entregaveis.reduce((s, e) => s + (e.percentual_documental ?? 0), 0) / entregaveis.length : 0;
    cartoes.push({ titulo: "Avanço Documental", valor: `${pctDoc.toFixed(0)}%`, detalhe: "Média dos entregáveis" });
  }
  if (kpisHabilitados.has("riscos")) {
    const abertos = riscos.filter((r) => r.status === "ABERTO").length;
    const criticos = riscos.filter((r) => r.probabilidade * r.impacto >= 15 && r.status === "ABERTO").length;
    cartoes.push({ titulo: "Riscos", valor: `${abertos} abertos`, detalhe: `${criticos} críticos` });
  }
  if (kpisHabilitados.has("comunicacoes")) {
    cartoes.push({ titulo: "Comunicações", valor: `${comunicacoes.length} registradas`, detalhe: "—" });
  }
  if (kpisHabilitados.has("custos")) {
    cartoes.push({ titulo: "Custos", valor: `AC: ${formatarMoeda(fin.valor_pago)}`, detalhe: `EV: ${formatarMoeda(fin.valor_aprovado)}` });
  }
  if (kpisHabilitados.has("cpi")) {
    const cpi = fin.valor_pago ? fin.valor_aprovado / fin.valor_pago : null;
    cartoes.push({ titulo: "CPI", valor: cpi != null ? cpi.toFixed(2) : "—", detalhe: cpi == null ? "Sem dados" : cpi >= 1 ? "Eficiente" : "Estouro" });
  }
  if (kpisHabilitados.has("bim")) cartoes.push({ titulo: "BIM", valor: "—", detalhe: "Sem dados lançados" });
  if (kpisHabilitados.has("seguranca")) cartoes.push({ titulo: "Segurança", valor: "—", detalhe: "Sem dados lançados" });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cartoes.map((c) => <CartaoDashboard key={c.titulo} {...c} />)}
    </div>
  );
}

type RespostaCronograma = {
  cronogramaAtivo: ArquivoCronograma | null;
  atividades: AtividadeCronograma[];
  arquivos: ArquivoCronograma[];
  lembretes: LembreteCronograma[];
};

function AbaCronograma({ projetoId, perfil }: { projetoId: number; perfil: string }) {
  const [dados, setDados] = useState<RespostaCronograma | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erroUpload, setErroUpload] = useState<string | null>(null);
  const [sucessoUpload, setSucessoUpload] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState(false);

  const podeArquivar = perfilPodeArquivarERestaurar(perfil);

  function carregar() {
    fetch(`/api/pmo/projetos/${projetoId}/cronograma`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setDados)
      .catch(() => setErro("Não foi possível carregar o Cronograma."));
  }

  useEffect(carregar, [projetoId]);

  async function processarEAnexar() {
    if (!arquivo) return;
    setProcessando(true);
    setErroUpload(null);
    setSucessoUpload(null);
    try {
      const formData = new FormData();
      formData.append("arquivo", arquivo);
      const resposta = await fetch(`/api/pmo/projetos/${projetoId}/cronograma`, { method: "POST", body: formData });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setErroUpload(corpo?.erro || "Erro ao processar o cronograma.");
        return;
      }
      setSucessoUpload(
        corpo.interpretado
          ? `Cronograma anexado e interpretado automaticamente (${corpo.quantidadeAtividades} atividades).`
          : "Arquivo .mpp anexado como referência (sem interpretação automática).",
      );
      setArquivo(null);
      carregar();
    } finally {
      setProcessando(false);
    }
  }

  async function removerCronograma() {
    setRemovendo(true);
    try {
      await fetch(`/api/pmo/projetos/${projetoId}/cronograma/remover`, { method: "POST" });
      carregar();
    } finally {
      setRemovendo(false);
    }
  }

  async function arquivarDocumento(arquivoId: number) {
    await fetch(`/api/pmo/projetos/${projetoId}/cronograma/arquivar-documento`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arquivoId }),
    });
    carregar();
  }

  if (erro) return <p className="text-sm text-(--color-red)">{erro}</p>;
  if (!dados) return <p className="text-sm text-(--color-text-weak)">Carregando…</p>;

  const { cronogramaAtivo, atividades, arquivos, lembretes } = dados;

  return (
    <div>
      {cronogramaAtivo ? (
        <div className="rounded-xl border border-(--color-green)/30 bg-(--color-green)/10 px-4 py-3">
          <p className="text-sm text-(--color-green)">
            ✅ Cronograma ativo: <strong>{cronogramaAtivo.nome_arquivo}</strong> (enviado por {cronogramaAtivo.enviado_por} em {formatarDataBr(cronogramaAtivo.enviado_em)}).
          </p>
          <button onClick={removerCronograma} disabled={removendo} className={`mt-3 ${botaoSecundario}`}>
            {removendo ? "Removendo…" : "Remover cronograma"}
          </button>
        </div>
      ) : (
        <p className="rounded-xl border border-(--color-gold)/30 bg-(--color-gold)/10 px-4 py-3 text-sm text-(--color-gold)">
          🟡 Nenhum cronograma anexado — o alerta &quot;Cronograma pendente de recebimento.&quot; está ativo e o gerente
          receberá lembretes a cada 3 dias úteis até que um cronograma seja anexado.
        </p>
      )}

      {cronogramaAtivo && (
        atividades.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-(--color-border) text-xs text-(--color-text-weak)">
                  <th className="px-4 py-2">Atividade</th><th className="px-4 py-2">Início</th><th className="px-4 py-2">Término</th>
                  <th className="px-4 py-2">Duração</th><th className="px-4 py-2">% Concluído</th>
                  <th className="px-4 py-2">Marco</th><th className="px-4 py-2">Caminho Crítico</th><th className="px-4 py-2">Folga</th>
                </tr>
              </thead>
              <tbody>
                {atividades.map((a) => (
                  <tr key={a.id} className="border-b border-(--color-border) last:border-0">
                    <td className="px-4 py-2 text-(--color-text)">{a.nome}</td>
                    <td className="px-4 py-2 text-(--color-text)">{formatarDataBr(a.data_inicio)}</td>
                    <td className="px-4 py-2 text-(--color-text)">{formatarDataBr(a.data_fim)}</td>
                    <td className="px-4 py-2 tabular-nums text-(--color-text)">{a.duracao_dias ?? "—"}</td>
                    <td className="px-4 py-2 tabular-nums text-(--color-text)">{a.percentual_concluido}%</td>
                    <td className="px-4 py-2 text-(--color-text)">{a.e_marco ? "Sim" : "Não"}</td>
                    <td className="px-4 py-2 text-(--color-text)">{a.caminho_critico ? "Sim" : "Não"}</td>
                    <td className="px-4 py-2 tabular-nums text-(--color-text)">{a.folga_dias ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-(--color-text-weak)">Arquivo anexado sem interpretação automática (formato .mpp — apenas armazenado como referência).</p>
        )
      )}

      <div className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
        <p className="text-sm font-semibold text-(--color-text)">Anexar novo cronograma</p>
        <p className="mt-1 text-xs text-(--color-text-weak)">
          Interpretação automática de atividades, marcos, dependências e caminho crítico disponível para Excel
          (.xlsx) e Primavera (.xer). Arquivos MS Project (.mpp) são aceitos apenas como anexo de referência —
          exporte para Excel ou XER para ter a leitura automática.
        </p>
        <input
          type="file" accept=".xlsx,.xls,.xer,.mpp"
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          className="mt-3 block w-full text-sm text-(--color-text)"
        />
        {erroUpload && <p className="mt-2 text-sm text-(--color-red)">{erroUpload}</p>}
        {sucessoUpload && <p className="mt-2 text-sm text-(--color-green)">{sucessoUpload}</p>}
        <button onClick={processarEAnexar} disabled={!arquivo || processando} className={`mt-3 ${botaoPrimario}`}>
          {processando ? "Processando…" : "Processar e anexar"}
        </button>
      </div>

      {lembretes.length > 0 && (
        <details className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
          <summary className="cursor-pointer text-sm font-semibold text-(--color-text)">Histórico de lembretes automáticos ({lembretes.length})</summary>
          <div className="mt-3 flex flex-col gap-2">
            {lembretes.map((l) => (
              <div key={l.id} className="rounded-xl border border-(--color-border) px-3 py-2 text-sm text-(--color-text)">
                <span className="text-(--color-text-weak)">{formatarDataBr(l.enviado_em)}</span> — {l.mensagem}
              </div>
            ))}
          </div>
        </details>
      )}

      {arquivos.length > 0 && (
        <details className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
          <summary className="cursor-pointer text-sm font-semibold text-(--color-text)">Documentos de cronograma anexados ({arquivos.length})</summary>
          <div className="mt-3 flex flex-col gap-2">
            {arquivos.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-(--color-border) px-3 py-2">
                <p className="text-sm text-(--color-text)">
                  <strong>{a.nome_arquivo}</strong> ({a.formato}) — {a.ativo ? "ativo" : "removido"}, enviado por {a.enviado_por}
                </p>
                {podeArquivar && (
                  <button onClick={() => arquivarDocumento(a.id)} className={botaoSecundario}>Arquivar</button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function AbaCurvaS({ projetoId }: { projetoId: number }) {
  const [atividades, setAtividades] = useState<AtividadeCronograma[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pmo/projetos/${projetoId}/cronograma`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((c: RespostaCronograma) => setAtividades(c.atividades))
      .catch(() => setErro("Não foi possível carregar a Curva S."));
  }, [projetoId]);

  if (erro) return <p className="text-sm text-(--color-red)">{erro}</p>;
  if (!atividades) return <p className="text-sm text-(--color-text-weak)">Carregando…</p>;
  if (!atividades.length) {
    return <p className="text-sm text-(--color-text-weak)">Anexe um cronograma na aba Cronograma para gerar a Curva S automaticamente.</p>;
  }

  const curva = curvaSPlanejada(atividades);
  if (curva.length === 0) {
    return <p className="text-sm text-(--color-text-weak)">Não foi possível calcular a Curva S — verifique se as atividades têm datas de início/término.</p>;
  }

  const pctRealizado = calcularPercentualExecucao(atividades);
  const hoje = new Date();
  const pctPlanejadoHoje = percentualPlanejadoAte(atividades, hoje);
  const desvio = pctRealizado - pctPlanejadoHoje;

  const dadosGrafico = curva.map((p) => ({
    data: p.data.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
    planejado: p.pctPlanejado,
  }));

  return (
    <div>
      <div className="h-80 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dadosGrafico} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="data" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} unit="%" />
            <Tooltip formatter={(valor: number) => `${valor.toFixed(1)}%`} />
            <ReferenceLine y={pctRealizado} stroke="var(--color-green)" strokeDasharray="4 4" label={{ value: `Realizado atual: ${pctRealizado.toFixed(0)}%`, fontSize: 11, fill: "var(--color-green)", position: "insideTopRight" }} />
            <Line type="monotone" dataKey="planejado" name="Planejado" stroke="var(--color-navy)" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CartaoMetrica titulo="Planejado até hoje" valor={`${pctPlanejadoHoje.toFixed(0)}%`} />
        <CartaoMetrica titulo="Realizado atual" valor={`${pctRealizado.toFixed(0)}%`} />
        <CartaoMetrica titulo="Desvio" valor={`${desvio >= 0 ? "+" : ""}${desvio.toFixed(0)} p.p.`} />
      </div>
    </div>
  );
}

function AbaMedicoes({ projetoId }: { projetoId: number }) {
  const [medicoes, setMedicoes] = useState<Medicao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [percentual, setPercentual] = useState("");
  const [valorMedido, setValorMedido] = useState("");
  const [situacao, setSituacao] = useState(SITUACOES_MEDICAO[0]);
  const [valorAprovado, setValorAprovado] = useState("");
  const [valorPago, setValorPago] = useState("");
  const [valorGlosado, setValorGlosado] = useState("");
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    fetch(`/api/pmo/projetos/${projetoId}/medicoes`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((c) => setMedicoes(c.medicoes))
      .catch(() => setErro("Não foi possível carregar as medições."));
  }

  useEffect(carregar, [projetoId]);

  async function registrar() {
    setSalvando(true);
    try {
      await fetch(`/api/pmo/projetos/${projetoId}/medicoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competencia_mes: mes, competencia_ano: ano, percentual: percentual ? Number(percentual) : null,
          valor_medido: valorMedido ? Number(valorMedido) : null, situacao,
          valor_aprovado: valorAprovado ? Number(valorAprovado) : null, valor_pago: valorPago ? Number(valorPago) : null,
          valor_glosado: valorGlosado ? Number(valorGlosado) : 0,
        }),
      });
      setPercentual(""); setValorMedido(""); setValorAprovado(""); setValorPago(""); setValorGlosado("");
      carregar();
    } finally {
      setSalvando(false);
    }
  }

  if (erro) return <p className="text-sm text-(--color-red)">{erro}</p>;

  return (
    <div>
      <details className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
        <summary className="cursor-pointer text-sm font-semibold text-(--color-text)">+ Nova medição</summary>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={labelClasse}>Mês
            <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className={inputClasse}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className={labelClasse}>Ano<input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} className={inputClasse} /></label>
          <label className={labelClasse}>% da medição<input type="number" min={0} max={100} value={percentual} onChange={(e) => setPercentual(e.target.value)} className={inputClasse} /></label>
          <label className={labelClasse}>Valor medido (R$)<input type="number" min={0} value={valorMedido} onChange={(e) => setValorMedido(e.target.value)} className={inputClasse} /></label>
          <label className={labelClasse}>Situação
            <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className={inputClasse}>
              {SITUACOES_MEDICAO.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className={labelClasse}>Valor aprovado (R$)<input type="number" min={0} value={valorAprovado} onChange={(e) => setValorAprovado(e.target.value)} className={inputClasse} /></label>
          <label className={labelClasse}>Valor pago (R$)<input type="number" min={0} value={valorPago} onChange={(e) => setValorPago(e.target.value)} className={inputClasse} /></label>
          <label className={labelClasse}>Valor glosado (R$)<input type="number" min={0} value={valorGlosado} onChange={(e) => setValorGlosado(e.target.value)} className={inputClasse} /></label>
        </div>
        <button onClick={registrar} disabled={salvando} className={`mt-4 ${botaoPrimario}`}>{salvando ? "Registrando…" : "Registrar medição"}</button>
      </details>

      {medicoes === null ? (
        <p className="mt-4 text-sm text-(--color-text-weak)">Carregando…</p>
      ) : medicoes.length === 0 ? (
        <p className="mt-4 text-sm text-(--color-text-weak)">Nenhuma medição registrada ainda.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-(--color-border) text-xs text-(--color-text-weak)">
                <th className="px-4 py-2">Mês/Ano</th><th className="px-4 py-2">%</th><th className="px-4 py-2">Valor Medido</th>
                <th className="px-4 py-2">Situação</th><th className="px-4 py-2">Aprovado</th><th className="px-4 py-2">Pago</th><th className="px-4 py-2">Glosado</th>
              </tr>
            </thead>
            <tbody>
              {medicoes.map((m) => (
                <tr key={m.id} className="border-b border-(--color-border) last:border-0">
                  <td className="px-4 py-2 text-(--color-text)">{m.competencia_mes}/{m.competencia_ano}</td>
                  <td className="px-4 py-2 tabular-nums text-(--color-text)">{m.percentual ?? "—"}</td>
                  <td className="px-4 py-2 tabular-nums text-(--color-text)">{formatarMoeda(m.valor_medido)}</td>
                  <td className="px-4 py-2 text-(--color-text)">{m.situacao}</td>
                  <td className="px-4 py-2 tabular-nums text-(--color-text)">{formatarMoeda(m.valor_aprovado)}</td>
                  <td className="px-4 py-2 tabular-nums text-(--color-text)">{formatarMoeda(m.valor_pago)}</td>
                  <td className="px-4 py-2 tabular-nums text-(--color-text)">{formatarMoeda(m.valor_glosado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AbaEntregaveis({ projetoId }: { projetoId: number }) {
  const [entregaveis, setEntregaveis] = useState<Entregavel[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [dataPrevista, setDataPrevista] = useState("");
  const [percentualDocumental, setPercentualDocumental] = useState("0");
  const [observacoes, setObservacoes] = useState("");
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    fetch(`/api/pmo/projetos/${projetoId}/entregaveis`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((c) => setEntregaveis(c.entregaveis))
      .catch(() => setErro("Não foi possível carregar os entregáveis."));
  }

  useEffect(carregar, [projetoId]);

  async function adicionar() {
    if (!nome.trim()) {
      setErroForm("Informe o nome do entregável.");
      return;
    }
    setErroForm(null);
    setSalvando(true);
    try {
      await fetch(`/api/pmo/projetos/${projetoId}/entregaveis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), data_prevista: dataPrevista || null, percentual_documental: Number(percentualDocumental), observacoes: observacoes.trim() || null }),
      });
      setNome(""); setDataPrevista(""); setPercentualDocumental("0"); setObservacoes("");
      carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function marcarEntregue(e: Entregavel) {
    await fetch(`/api/pmo/projetos/${projetoId}/entregaveis/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: e.nome, previsto: e.previsto, entregue: 1, data_prevista: e.data_prevista,
        data_entrega: new Date().toISOString().slice(0, 10), percentual_documental: 100, observacoes: e.observacoes,
      }),
    });
    carregar();
  }

  if (erro) return <p className="text-sm text-(--color-red)">{erro}</p>;

  const total = entregaveis?.length ?? 0;
  const entregues = entregaveis?.filter((e) => e.entregue).length ?? 0;

  return (
    <div>
      <details className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
        <summary className="cursor-pointer text-sm font-semibold text-(--color-text)">+ Novo entregável</summary>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={labelClasse}>Nome do entregável<input value={nome} onChange={(e) => setNome(e.target.value)} className={inputClasse} /></label>
          <label className={labelClasse}>Data prevista<input type="date" value={dataPrevista} onChange={(e) => setDataPrevista(e.target.value)} className={inputClasse} /></label>
          <label className={labelClasse}>% documental<input type="number" min={0} max={100} value={percentualDocumental} onChange={(e) => setPercentualDocumental(e.target.value)} className={inputClasse} /></label>
        </div>
        <label className={`mt-3 block ${labelClasse}`}>Observações<textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className={`${inputClasse} h-16`} /></label>
        {erroForm && <p className="mt-2 text-sm text-(--color-red)">{erroForm}</p>}
        <button onClick={adicionar} disabled={salvando} className={`mt-4 ${botaoPrimario}`}>{salvando ? "Adicionando…" : "Adicionar entregável"}</button>
      </details>

      {entregaveis === null ? (
        <p className="mt-4 text-sm text-(--color-text-weak)">Carregando…</p>
      ) : entregaveis.length === 0 ? (
        <p className="mt-4 text-sm text-(--color-text-weak)">Nenhum entregável cadastrado ainda.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <CartaoMetrica titulo="Total previsto" valor={String(total)} />
            <CartaoMetrica titulo="Total entregue" valor={String(entregues)} />
            <CartaoMetrica titulo="Pendências" valor={String(total - entregues)} />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {entregaveis.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-(--color-border) bg-(--color-surface-1) px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-(--color-text)">{e.nome} — {e.entregue ? "✅ Entregue" : "⏳ Pendente"}</p>
                  <p className="mt-1 text-xs text-(--color-text-weak)">
                    Previsto: {formatarDataBr(e.data_prevista)} · Entregue em: {e.data_entrega ? formatarDataBr(e.data_entrega) : "—"} · % documental: {e.percentual_documental.toFixed(0)}%
                  </p>
                </div>
                {!e.entregue && (
                  <button onClick={() => marcarEntregue(e)} className={botaoSecundario}>Marcar entregue</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AbaRiscos({ projetoId }: { projetoId: number }) {
  const [riscos, setRiscos] = useState<Risco[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [descricao, setDescricao] = useState("");
  const [probabilidade, setProbabilidade] = useState(3);
  const [impacto, setImpacto] = useState(3);
  const [responsavel, setResponsavel] = useState("");
  const [status, setStatus] = useState(STATUS_RISCO_OPCOES[0]);
  const [planoMitigacao, setPlanoMitigacao] = useState("");
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    fetch(`/api/pmo/projetos/${projetoId}/riscos`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((c) => setRiscos(c.riscos))
      .catch(() => setErro("Não foi possível carregar os riscos."));
  }

  useEffect(carregar, [projetoId]);

  async function registrar() {
    if (!descricao.trim()) {
      setErroForm("Descreva o risco.");
      return;
    }
    setErroForm(null);
    setSalvando(true);
    try {
      await fetch(`/api/pmo/projetos/${projetoId}/riscos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao: descricao.trim(), probabilidade, impacto, status, responsavel: responsavel.trim() || null, plano_mitigacao: planoMitigacao.trim() || null }),
      });
      setDescricao(""); setResponsavel(""); setPlanoMitigacao("");
      carregar();
    } finally {
      setSalvando(false);
    }
  }

  if (erro) return <p className="text-sm text-(--color-red)">{erro}</p>;

  const abertos = riscos?.filter((r) => r.status === "ABERTO").length ?? 0;
  const criticos = riscos?.filter((r) => r.probabilidade * r.impacto >= 15 && r.status === "ABERTO").length ?? 0;

  return (
    <div>
      <details className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
        <summary className="cursor-pointer text-sm font-semibold text-(--color-text)">+ Novo risco</summary>
        <label className={`mt-3 block ${labelClasse}`}>Descrição do risco<textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} className={`${inputClasse} h-16`} /></label>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={labelClasse}>Probabilidade (1-5): {probabilidade}
            <input type="range" min={1} max={5} value={probabilidade} onChange={(e) => setProbabilidade(Number(e.target.value))} className="mt-2 w-full" />
          </label>
          <label className={labelClasse}>Impacto (1-5): {impacto}
            <input type="range" min={1} max={5} value={impacto} onChange={(e) => setImpacto(Number(e.target.value))} className="mt-2 w-full" />
          </label>
          <label className={labelClasse}>Responsável<input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={inputClasse} /></label>
          <label className={labelClasse}>Status
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClasse}>
              {STATUS_RISCO_OPCOES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <label className={`mt-3 block ${labelClasse}`}>Plano de mitigação<textarea value={planoMitigacao} onChange={(e) => setPlanoMitigacao(e.target.value)} className={`${inputClasse} h-16`} /></label>
        {erroForm && <p className="mt-2 text-sm text-(--color-red)">{erroForm}</p>}
        <button onClick={registrar} disabled={salvando} className={`mt-4 ${botaoPrimario}`}>{salvando ? "Registrando…" : "Registrar risco"}</button>
      </details>

      {riscos === null ? (
        <p className="mt-4 text-sm text-(--color-text-weak)">Carregando…</p>
      ) : riscos.length === 0 ? (
        <p className="mt-4 text-sm text-(--color-text-weak)">Nenhum risco cadastrado ainda.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <CartaoMetrica titulo="Total de riscos" valor={String(riscos.length)} />
            <CartaoMetrica titulo="Abertos" valor={String(abertos)} />
            <CartaoMetrica titulo="Críticos (≥15)" valor={String(criticos)} />
          </div>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-(--color-border) text-xs text-(--color-text-weak)">
                  <th className="px-4 py-2">Descrição</th><th className="px-4 py-2">Prob.</th><th className="px-4 py-2">Impacto</th>
                  <th className="px-4 py-2">Classif.</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Responsável</th>
                </tr>
              </thead>
              <tbody>
                {[...riscos].sort((a, b) => b.probabilidade * b.impacto - a.probabilidade * a.impacto).map((r) => (
                  <tr key={r.id} className="border-b border-(--color-border) last:border-0">
                    <td className="px-4 py-2 text-(--color-text)">{r.descricao}</td>
                    <td className="px-4 py-2 tabular-nums text-(--color-text)">{r.probabilidade}</td>
                    <td className="px-4 py-2 tabular-nums text-(--color-text)">{r.impacto}</td>
                    <td className="px-4 py-2 tabular-nums font-semibold text-(--color-text)">{r.probabilidade * r.impacto}</td>
                    <td className="px-4 py-2 text-(--color-text)">{r.status}</td>
                    <td className="px-4 py-2 text-(--color-text)">{r.responsavel || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function AbaComunicacoes({ projetoId }: { projetoId: number }) {
  const [comunicacoes, setComunicacoes] = useState<Comunicacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState(TIPOS_COMUNICACAO[0]);
  const [descricao, setDescricao] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    fetch(`/api/pmo/projetos/${projetoId}/comunicacoes`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((c) => setComunicacoes(c.comunicacoes))
      .catch(() => setErro("Não foi possível carregar as comunicações."));
  }

  useEffect(carregar, [projetoId]);

  async function registrar() {
    if (!descricao.trim()) {
      setErroForm("Descreva a comunicação.");
      return;
    }
    setErroForm(null);
    setSalvando(true);
    try {
      await fetch(`/api/pmo/projetos/${projetoId}/comunicacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, tipo, descricao: descricao.trim(), responsavel: responsavel.trim() || null }),
      });
      setDescricao(""); setResponsavel("");
      carregar();
    } finally {
      setSalvando(false);
    }
  }

  if (erro) return <p className="text-sm text-(--color-red)">{erro}</p>;

  return (
    <div>
      <details className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
        <summary className="cursor-pointer text-sm font-semibold text-(--color-text)">+ Nova comunicação</summary>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={labelClasse}>Data<input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputClasse} /></label>
          <label className={labelClasse}>Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputClasse}>
              {TIPOS_COMUNICACAO.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <label className={`mt-3 block ${labelClasse}`}>Descrição<textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} className={`${inputClasse} h-16`} /></label>
        <label className={`mt-3 block ${labelClasse}`}>Responsável<input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={inputClasse} /></label>
        {erroForm && <p className="mt-2 text-sm text-(--color-red)">{erroForm}</p>}
        <button onClick={registrar} disabled={salvando} className={`mt-4 ${botaoPrimario}`}>{salvando ? "Registrando…" : "Registrar comunicação"}</button>
      </details>

      {comunicacoes === null ? (
        <p className="mt-4 text-sm text-(--color-text-weak)">Carregando…</p>
      ) : comunicacoes.length === 0 ? (
        <p className="mt-4 text-sm text-(--color-text-weak)">Nenhuma comunicação registrada ainda.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {comunicacoes.map((c) => (
            <div key={c.id} className="rounded-xl border border-(--color-border) bg-(--color-surface-1) px-4 py-3">
              <p className="text-sm font-medium text-(--color-text)">{formatarDataBr(c.data)} · {c.tipo || "—"}</p>
              <p className="mt-1 text-sm text-(--color-text)">{c.descricao}</p>
              <p className="mt-1 text-xs text-(--color-text-weak)">Responsável: {c.responsavel || "—"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AbaFinanceiro({ projetoId }: { projetoId: number }) {
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pmo/projetos/${projetoId}/financeiro`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((c) => setResumo(c.resumo))
      .catch(() => setErro("Não foi possível carregar o Financeiro."));
  }, [projetoId]);

  if (erro) return <p className="text-sm text-(--color-red)">{erro}</p>;
  if (!resumo) return <p className="text-sm text-(--color-text-weak)">Carregando…</p>;

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CartaoMetrica titulo="Valor contratado" valor={formatarMoeda(resumo.valor_contratado)} />
        <CartaoMetrica titulo="Valor medido" valor={formatarMoeda(resumo.valor_medido)} />
        <CartaoMetrica titulo="Valor aprovado" valor={formatarMoeda(resumo.valor_aprovado)} />
        <CartaoMetrica titulo="Valor pago" valor={formatarMoeda(resumo.valor_pago)} />
        <CartaoMetrica titulo="Valor glosado" valor={formatarMoeda(resumo.valor_glosado)} />
        <CartaoMetrica titulo="Saldo" valor={formatarMoeda(resumo.saldo)} />
      </div>
      <p className="mt-4 text-xs text-(--color-text-weak)">Os valores medido/aprovado/pago/glosado são consolidados a partir dos lançamentos da aba Medições.</p>
    </div>
  );
}

function AbaBibliotecaKpis({ habilitados }: { habilitados: Set<string> }) {
  return (
    <div>
      <p className="text-sm text-(--color-text-weak)">Todos os indicadores disponíveis no PMO — os habilitados neste projeto aparecem destacados.</p>
      <div className="mt-4 flex flex-col gap-2">
        {KPI_ORDEM.map((chave) => {
          const kpi = BIBLIOTECA_KPIS[chave];
          const destaque = habilitados.has(chave);
          return (
            <details key={chave} className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
              <summary className="cursor-pointer text-sm font-semibold text-(--color-text)">{destaque ? "✅ " : ""}{kpi.nome}</summary>
              <div className="mt-3 flex flex-col gap-2 text-sm text-(--color-text)">
                <p><span className="font-semibold">Objetivo:</span> {kpi.objetivo}</p>
                <p><span className="font-semibold">Fórmula:</span> {kpi.formula}</p>
                <p><span className="font-semibold">Interpretação:</span> {kpi.interpretacao}</p>
                <p><span className="font-semibold">Exemplo prático:</span> {kpi.exemplo}</p>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function AbaConfiguracao({ projeto, podeArquivar, onStatusAlterado, onArquivado }: {
  projeto: ProjetoPmo; podeArquivar: boolean; onStatusAlterado: () => void; onArquivado: () => void;
}) {
  const [novoStatus, setNovoStatus] = useState(projeto.status);
  const [salvandoStatus, setSalvandoStatus] = useState(false);
  const [confirmandoArquivamento, setConfirmandoArquivamento] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [arquivando, setArquivando] = useState(false);

  async function salvarStatus() {
    setSalvandoStatus(true);
    try {
      await fetch(`/api/pmo/projetos/${projeto.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novoStatus }),
      });
      onStatusAlterado();
    } finally {
      setSalvandoStatus(false);
    }
  }

  async function arquivar() {
    setArquivando(true);
    try {
      await fetch(`/api/pmo/projetos/${projeto.id}/arquivar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim() || null }),
      });
      onArquivado();
    } finally {
      setArquivando(false);
    }
  }

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-(--color-text-weak)">Status do projeto</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <select value={novoStatus} onChange={(e) => setNovoStatus(e.target.value)} className={inputClasse} style={{ marginTop: 0 }}>
          {STATUS_PROJETO_OPCOES.map((s) => <option key={s} value={s}>{LABEL_STATUS[s]}</option>)}
        </select>
        {novoStatus !== projeto.status && (
          <button onClick={salvarStatus} disabled={salvandoStatus} className={botaoPrimario}>{salvandoStatus ? "Salvando…" : "Salvar status"}</button>
        )}
      </div>

      <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-(--color-text-weak)">Observações</p>
      <p className="mt-2 text-sm text-(--color-text)">{projeto.observacoes || "Nenhuma observação registrada."}</p>

      {podeArquivar && (
        <div className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-(--color-text-weak)">Arquivar projeto</p>
          {!confirmandoArquivamento ? (
            <button onClick={() => setConfirmandoArquivamento(true)} className={`mt-2 ${botaoSecundario}`}>Arquivar Projeto</button>
          ) : (
            <div className="mt-2 rounded-xl border border-(--color-gold)/30 bg-(--color-gold)/10 px-4 py-3">
              <p className="text-sm text-(--color-text)">
                O projeto sai do Portfólio e dos indicadores, mas todo o histórico continua preservado — pode ser
                restaurado a qualquer momento pelo módulo Arquivo.
              </p>
              <label className={`mt-3 block ${labelClasse}`}>Motivo (opcional)<textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} className={`${inputClasse} h-16`} /></label>
              <div className="mt-3 flex gap-3">
                <button onClick={arquivar} disabled={arquivando} className={botaoPrimario}>{arquivando ? "Arquivando…" : "Confirmar arquivamento"}</button>
                <button onClick={() => setConfirmandoArquivamento(false)} className={botaoSecundario}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ABAS_FIXAS = ["resumo", "dashboard"] as const;
const ABAS_FINAIS = ["biblioteca", "configuracao"] as const;
type Aba = (typeof ABAS_FIXAS)[number] | (typeof ABAS_FINAIS)[number] | (typeof TABS_POR_KPI)[number]["chave"];

export function PainelPmoProjeto({ projetoId, perfil }: { projetoId: number; perfil: string }) {
  const router = useRouter();
  const [dados, setDados] = useState<RespostaProjeto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [painelAberto, setPainelAberto] = useState<null | "editar" | "kpis">(null);
  const [aba, setAba] = useState<Aba>("resumo");

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
  const kpisHabilitadosSet = new Set(kpisHabilitados);

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

      <div className="mt-6 flex flex-wrap gap-2 border-b border-(--color-border) pb-3">
        {ABAS_FIXAS.map((chave) => (
          <button
            key={chave}
            onClick={() => setAba(chave)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium ${aba === chave ? "bg-(--color-navy) text-white" : "border border-(--color-border) text-(--color-text-weak)"}`}
          >
            {chave === "resumo" ? "Resumo Executivo" : "Dashboard"}
          </button>
        ))}
        {TABS_POR_KPI.filter((t) => kpisHabilitadosSet.has(t.chave)).map((t) => (
          <button
            key={t.chave}
            onClick={() => setAba(t.chave)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium ${aba === t.chave ? "bg-(--color-navy) text-white" : "border border-(--color-border) text-(--color-text-weak)"}`}
          >
            {t.rotulo}
          </button>
        ))}
        {ABAS_FINAIS.map((chave) => (
          <button
            key={chave}
            onClick={() => setAba(chave)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium ${aba === chave ? "bg-(--color-navy) text-white" : "border border-(--color-border) text-(--color-text-weak)"}`}
          >
            {chave === "biblioteca" ? "Biblioteca de KPIs" : "Configuração"}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {aba === "resumo" && (
          <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <CartaoMetrica titulo="Status" valor={LABEL_STATUS[projeto.status] ?? projeto.status} />
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

            {kpisHabilitadosSet.size > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-(--color-text-weak)">Indicadores habilitados neste projeto</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {KPI_ORDEM.filter((k) => kpisHabilitadosSet.has(k)).map((k) => (
                    <span key={k} className="rounded-full bg-(--color-surface-3) px-3 py-1 text-xs font-medium text-(--color-navy)">{BIBLIOTECA_KPIS[k].nome}</span>
                  ))}
                </div>
              </div>
            )}

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
          </div>
        )}

        {aba === "dashboard" && <AbaDashboard projetoId={projetoId} kpisHabilitados={kpisHabilitadosSet} />}
        {aba === "cronograma" && kpisHabilitadosSet.has("cronograma") && <AbaCronograma projetoId={projetoId} perfil={perfil} />}
        {aba === "curva_s" && kpisHabilitadosSet.has("curva_s") && <AbaCurvaS projetoId={projetoId} />}
        {aba === "medicoes" && kpisHabilitadosSet.has("medicoes") && <AbaMedicoes projetoId={projetoId} />}
        {aba === "entregaveis" && kpisHabilitadosSet.has("entregaveis") && <AbaEntregaveis projetoId={projetoId} />}
        {aba === "riscos" && kpisHabilitadosSet.has("riscos") && <AbaRiscos projetoId={projetoId} />}
        {aba === "comunicacoes" && kpisHabilitadosSet.has("comunicacoes") && <AbaComunicacoes projetoId={projetoId} />}
        {aba === "financeiro" && kpisHabilitadosSet.has("financeiro") && <AbaFinanceiro projetoId={projetoId} />}
        {aba === "biblioteca" && <AbaBibliotecaKpis habilitados={kpisHabilitadosSet} />}
        {aba === "configuracao" && (
          <AbaConfiguracao
            projeto={projeto}
            podeArquivar={perfilPodeArquivarERestaurar(perfil)}
            onStatusAlterado={() => { carregar(); router.refresh(); }}
            onArquivado={() => router.push("/pmo")}
          />
        )}
      </div>

      <p className="mt-10 text-xs text-(--color-text-dim)">
        Relatórios/OPR (exportação em Word) ficam fora de escopo, assim como em
        todo o restante do sistema.
      </p>
    </div>
  );
}
