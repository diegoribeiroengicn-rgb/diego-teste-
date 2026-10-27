"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BONUS_AVALIACOES_OBRIGATORIAS,
  CRITERIOS_AVALIACAO_ANALISTA,
  ESCALA_AVALIACAO_ANALISTA,
  NOTA_MAXIMA_ANALISTA,
  PENALIDADE_ETG,
  RECOMENDACAO_DESEMPENHO_MAXIMO,
  RESPONSAVEIS,
  rotuloBonificacao,
  rotuloPenalizacao,
  type CriteriosValores,
} from "@/lib/avaliacao-analista-calculo";
import type { AvaliacaoAnalistaEnriquecida, DadosFechamento, LinhaRelatorioGerencialAnalista } from "@/lib/avaliacao-analista";
import { MESES_PT } from "@/lib/meses";
import { GraficoEvolucaoNotaFinal } from "@/components/avaliacao-analista-charts";

function CartaoKpi({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-4 py-4">
      <p className="text-xl font-semibold tabular-nums" style={cor ? { color: cor } : undefined}>{valor}</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">{titulo}</p>
    </div>
  );
}

function formatarDataHora(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleString("pt-BR");
}

function dadosFechamentoDe(linha: AvaliacaoAnalistaEnriquecida): DadosFechamento {
  return {
    avaliacaoAnalistaId: linha.id,
    analista: linha.analista,
    mes: linha.mes,
    ano: linha.ano,
    notaOriginal: linha.mediaGeral,
    avaliacoesObrigatorias: linha.avaliacoesObrigatorias,
    avaliacoesPendentes: linha.avaliacoesPendentes,
    atsPendentes: linha.avaliacoesAtPendentes,
    penalizacaoFracao: linha.penalizacaoFracao,
    bonificacao: linha.bonificacao,
    notaFinal: linha.mediaFinal,
    justificativaAutomatica: linha.justificativaAutomatica,
    recomendacaoGerencial: linha.reconhecimento,
  };
}

function FormularioNovaAvaliacao({ onSalvo, onCancelar }: { onSalvo: () => void; onCancelar: () => void }) {
  const [analista, setAnalista] = useState(RESPONSAVEIS[0]);
  const [mes, setMes] = useState(1);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [valores, setValores] = useState<CriteriosValores>(() =>
    Object.fromEntries(CRITERIOS_AVALIACAO_ANALISTA.map(([chave]) => [chave, 3])),
  );
  const [justificativa, setJustificativa] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const media = useMemo(() => {
    const vals = Object.values(valores).filter((v): v is number => v != null);
    return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100 : 0;
  }, [valores]);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/avaliacoes/analistas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analista, avaliador: "", mes, ano, criterios: valores, justificativa, observacoes }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setErro(corpo?.erro || "Erro ao salvar avaliação.");
        return;
      }
      onSalvo();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border-2 border-(--color-navy) bg-(--color-surface-1) p-6">
      <p className="text-sm font-semibold text-(--color-text)">Nova Avaliação</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs text-(--color-text-weak)">
          Analista
          <select value={analista} onChange={(e) => setAnalista(e.target.value)} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)">
            {RESPONSAVEIS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="text-xs text-(--color-text-weak)">
          Mês de referência
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)">
            {MESES_PT.map((m, i) => <option key={m} value={i + 1}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
          </select>
        </label>
        <label className="text-xs text-(--color-text-weak)">
          Ano de referência
          <input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
        </label>
      </div>

      <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-(--color-text-dim)">Critérios (escala 1-5)</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">{Object.entries(ESCALA_AVALIACAO_ANALISTA).map(([k, v]) => `${k} — ${v}`).join(" · ")}</p>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {CRITERIOS_AVALIACAO_ANALISTA.map(([chave, rotulo]) => (
          <label key={chave} className="text-xs text-(--color-text-weak)">
            <span className="flex items-center justify-between">
              <span>{rotulo}</span>
              <span className="font-semibold tabular-nums text-(--color-navy)">{valores[chave]}</span>
            </span>
            <input
              type="range" min={1} max={5} step={1} value={valores[chave] ?? 3}
              onChange={(e) => setValores((v) => ({ ...v, [chave]: Number(e.target.value) }))}
              className="mt-1 w-full accent-(--color-navy)"
            />
          </label>
        ))}
      </div>

      <label className="mt-4 block text-xs text-(--color-text-weak)">
        Justificativa
        <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
      </label>
      <label className="mt-3 block text-xs text-(--color-text-weak)">
        Observações complementares
        <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
      </label>

      <p className="mt-4 text-sm text-(--color-text-weak)">Média geral: <span className="text-lg font-semibold tabular-nums text-(--color-navy)">{media}</span></p>
      {erro && <p className="mt-2 text-sm text-(--color-red)">{erro}</p>}

      <div className="mt-4 flex gap-3">
        <button onClick={salvar} disabled={salvando} className="rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        <button onClick={onCancelar} disabled={salvando} className="rounded-full border border-(--color-border) px-5 py-2 text-sm font-medium text-(--color-text-weak) hover:bg-(--color-surface-2)">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function SecaoFechamentoMensal({ combinacoes, podeAvaliar, perfil }: { combinacoes: AvaliacaoAnalistaEnriquecida[]; podeAvaliar: boolean; perfil: string }) {
  const router = useRouter();
  const [escolha, setEscolha] = useState(0);
  const [confirmarRecalculo, setConfirmarRecalculo] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!podeAvaliar || combinacoes.length === 0) return null;
  const linha = combinacoes[Math.min(escolha, combinacoes.length - 1)];

  async function enviar(acao: "fechar" | "recalcular") {
    setProcessando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/avaliacoes/analistas/fechamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, ...dadosFechamentoDe(linha) }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setErro(corpo?.erro || "Erro ao processar fechamento.");
        return;
      }
      setConfirmarRecalculo(false);
      router.refresh();
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold text-(--color-text)">Fechamento mensal</h2>
      <p className="mt-1 max-w-3xl text-xs text-(--color-text-weak)">
        Ao fechar uma competência, a nota final fica congelada — deixa de ser recalculada automaticamente mesmo que
        dados usados no cálculo mudem depois. Recalcular uma competência já fechada é uma ação restrita ao
        Administrador.
      </p>

      <select
        value={escolha}
        onChange={(e) => setEscolha(Number(e.target.value))}
        className="mt-3 w-full max-w-md rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm outline-none focus:border-(--color-navy)"
      >
        {combinacoes.map((c, i) => (
          <option key={`${c.analista}::${c.mes}::${c.ano}`} value={i}>
            {c.analista} — {MESES_PT[c.mes - 1]}/{c.ano}
          </option>
        ))}
      </select>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CartaoKpi titulo="Nota base (pós-ETG)" valor={String(linha.mediaGeral)} />
        <CartaoKpi titulo="Pendências" valor={String(linha.avaliacoesPendentes)} />
        <CartaoKpi titulo={linha.fechado ? "Nota final (fechada)" : "Nota final (prévia)"} valor={String(linha.mediaFinal)} cor="var(--color-navy)" />
      </div>
      <p className="mt-3 text-xs text-(--color-text-weak)">{linha.justificativaAutomatica}</p>

      {erro && <p className="mt-2 text-sm text-(--color-red)">{erro}</p>}

      {linha.fechado ? (
        <div className="mt-4">
          <p className="rounded-xl border border-(--color-border) bg-(--color-surface-2) px-4 py-3 text-xs text-(--color-text-weak)">
            Competência fechada em {formatarDataHora(linha.dataFechamento)} por {linha.usuarioFechamento}.
          </p>
          {perfil === "ADMIN" ? (
            !confirmarRecalculo ? (
              <button onClick={() => setConfirmarRecalculo(true)} className="mt-3 rounded-full border border-(--color-border) px-4 py-2 text-xs font-medium text-(--color-navy) hover:bg-(--color-surface-2)">
                Recalcular (sobrescreve o fechamento atual)
              </button>
            ) : (
              <div className="mt-3 rounded-xl border border-(--color-gold)/40 bg-(--color-gold)/10 px-4 py-3">
                <p className="text-xs text-(--color-text)">
                  A competência {MESES_PT[linha.mes - 1]}/{linha.ano} de <strong>{linha.analista}</strong> já está
                  fechada. Recalcular substitui a nota final congelada pela prévia atual — esta ação não pode ser
                  desfeita pela interface.
                </p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => enviar("recalcular")} disabled={processando} className="rounded-full bg-(--color-navy) px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60">
                    {processando ? "Processando…" : "Confirmar recálculo"}
                  </button>
                  <button onClick={() => setConfirmarRecalculo(false)} disabled={processando} className="rounded-full border border-(--color-border) px-4 py-1.5 text-xs font-medium text-(--color-text-weak)">
                    Cancelar
                  </button>
                </div>
              </div>
            )
          ) : (
            <p className="mt-2 text-xs text-(--color-text-dim)">Recalcular uma competência fechada requer autorização do Administrador.</p>
          )}
        </div>
      ) : (
        <button onClick={() => enviar("fechar")} disabled={processando} className="mt-4 rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
          {processando ? "Processando…" : "Fechar competência"}
        </button>
      )}
    </div>
  );
}

function TabelaRelatorioGerencial({ linhas }: { linhas: LinhaRelatorioGerencialAnalista[] }) {
  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold text-(--color-text)">Relatório Gerencial</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-(--color-text-dim)">
              <th className="px-4 py-3">Analista</th>
              <th className="px-4 py-3">Mês</th>
              <th className="px-4 py-3">Ano</th>
              <th className="px-4 py-3">Análises Realizadas</th>
              <th className="px-4 py-3">Avaliações Obrig.</th>
              <th className="px-4 py-3">Realizadas</th>
              <th className="px-4 py-3">Pendentes</th>
              <th className="px-4 py-3">ATs Pendentes</th>
              <th className="px-4 py-3">Nota Original</th>
              <th className="px-4 py-3">Penalização</th>
              <th className="px-4 py-3">Bonificação</th>
              <th className="px-4 py-3">Nota Final</th>
              <th className="px-4 py-3">Situação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr><td colSpan={13} className="px-4 py-10 text-center text-(--color-text-weak)">Nenhum dado para os filtros aplicados.</td></tr>
            ) : (
              linhas.map((l) => (
                <tr key={`${l.analista}::${l.mes}::${l.ano}`} className="border-t border-(--color-border) first:border-0">
                  <td className="px-4 py-2.5 font-medium text-(--color-text)">{l.analista}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{MESES_PT[l.mes - 1]}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.ano}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.analisesRealizadas}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.avaliacoesObrigatorias}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.avaliacoesRealizadas}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.avaliacoesPendentes}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.atsPendentes}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.notaOriginal}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{rotuloPenalizacao(l.penalizacaoFracao)}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{rotuloBonificacao(l.bonificacao)}</td>
                  <td className="px-4 py-2.5 font-semibold text-(--color-navy)">{l.notaFinal}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.situacao}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PainelAvaliacaoAnalistas({
  avaliacoes,
  relatorioGerencial,
  podeAvaliar,
  podeVerRelatorios,
  perfil,
}: {
  avaliacoes: AvaliacaoAnalistaEnriquecida[];
  relatorioGerencial: LinhaRelatorioGerencialAnalista[];
  podeAvaliar: boolean;
  podeVerRelatorios: boolean;
  perfil: string;
}) {
  const router = useRouter();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [fAnalista, setFAnalista] = useState("");
  const [fAvaliador, setFAvaliador] = useState("");
  const [fAno, setFAno] = useState("");
  const [fMes, setFMes] = useState("");

  const analistas = useMemo(() => [...new Set(avaliacoes.map((a) => a.analista))].sort(), [avaliacoes]);
  const avaliadores = useMemo(() => [...new Set(avaliacoes.map((a) => a.avaliador).filter((v): v is string => !!v))].sort(), [avaliacoes]);
  const anos = useMemo(() => [...new Set(avaliacoes.map((a) => a.ano))].sort((a, b) => b - a), [avaliacoes]);

  const filtradas = useMemo(
    () =>
      avaliacoes.filter((a) => {
        if (fAnalista && a.analista !== fAnalista) return false;
        if (fAvaliador && a.avaliador !== fAvaliador) return false;
        if (fAno && a.ano !== Number(fAno)) return false;
        if (fMes && a.mes !== Number(fMes)) return false;
        return true;
      }),
    [avaliacoes, fAnalista, fAvaliador, fAno, fMes],
  );

  const mediasCriterio = useMemo(
    () =>
      CRITERIOS_AVALIACAO_ANALISTA.slice(0, 6).map(([chave, rotulo]) => {
        const vals = filtradas.map((a) => a.criterios[chave]).filter((v): v is number => v != null);
        const media = vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100 : 0;
        return { rotulo, media };
      }),
    [filtradas],
  );

  const evolucao = useMemo(() => {
    const porCompetencia = new Map<string, { ano: number; mes: number; notas: number[] }>();
    for (const a of filtradas) {
      const chave = `${a.ano}-${a.mes}`;
      const entrada = porCompetencia.get(chave) ?? { ano: a.ano, mes: a.mes, notas: [] };
      entrada.notas.push(a.mediaFinal);
      porCompetencia.set(chave, entrada);
    }
    return [...porCompetencia.values()]
      .map((e) => ({ ano: e.ano, mes: e.mes, mediaFinal: Math.round((e.notas.reduce((s, v) => s + v, 0) / e.notas.length) * 100) / 100 }))
      .sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  }, [filtradas]);

  const reconhecidos = useMemo(() => [...new Set(filtradas.filter((a) => a.reconhecimento).map((a) => a.analista))].sort(), [filtradas]);

  const combinacoes = useMemo(() => {
    const vistos = new Set<string>();
    const lista: AvaliacaoAnalistaEnriquecida[] = [];
    for (const a of [...filtradas].sort((x, y) => y.ano - x.ano || y.mes - x.mes || x.analista.localeCompare(y.analista))) {
      const chave = `${a.analista}::${a.mes}::${a.ano}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      lista.push(a);
    }
    return lista;
  }, [filtradas]);

  const relatorioFiltrado = useMemo(() => {
    const combosFiltradas = new Set(filtradas.map((a) => `${a.analista}::${a.mes}::${a.ano}`));
    return relatorioGerencial.filter((l) => combosFiltradas.has(`${l.analista}::${l.mes}::${l.ano}`));
  }, [relatorioGerencial, filtradas]);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Avaliação dos Analistas</h1>
      <p className="mt-1 max-w-3xl text-sm text-(--color-text-weak)">
        Notas de desempenho por critério — módulo restrito, separado da produtividade. Escala:{" "}
        {Object.entries(ESCALA_AVALIACAO_ANALISTA).map(([k, v]) => `${k} = ${v}`).join(" · ")}
      </p>
      <p className="mt-2 max-w-3xl text-xs text-(--color-text-weak)">
        Penalidade automática: quando o analista teve pelo menos um projeto (Prestador ou Cessionário) com ETG = SIM
        na mesma competência da avaliação, a Média Geral é reduzida em {Math.round((1 - PENALIDADE_ETG) * 100)}%.
      </p>
      <p className="mt-2 max-w-3xl text-xs text-(--color-text-weak)">
        Avaliações obrigatórias: 1 pendência no fechamento do mês reduz a nota em 1/3; 2 ou mais reduzem em 1/2
        (nunca mais que isso). Zero pendências (havendo ao menos uma obrigatória no mês) soma +{BONUS_AVALIACOES_OBRIGATORIAS}{" "}
        ponto, respeitando o limite máximo da nota ({NOTA_MAXIMA_ANALISTA}). Penalização e bonificação nunca se aplicam juntas.
      </p>

      {podeAvaliar && !mostrarForm && (
        <button onClick={() => setMostrarForm(true)} className="mt-5 rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white">
          Nova Avaliação
        </button>
      )}
      {podeAvaliar && mostrarForm && (
        <FormularioNovaAvaliacao
          onSalvo={() => { setMostrarForm(false); router.refresh(); }}
          onCancelar={() => setMostrarForm(false)}
        />
      )}

      {avaliacoes.length === 0 ? (
        <p className="mt-8 rounded-xl border border-(--color-border) bg-(--color-surface-1) px-4 py-6 text-center text-sm text-(--color-text-weak)">
          Nenhuma avaliação de analista registrada ainda.
        </p>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <select value={fAnalista} onChange={(e) => setFAnalista(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
              <option value="">Todos os analistas</option>
              {analistas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={fAvaliador} onChange={(e) => setFAvaliador(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
              <option value="">Todos os avaliadores</option>
              {avaliadores.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={fAno} onChange={(e) => setFAno(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
              <option value="">Todos os anos</option>
              {anos.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={fMes} onChange={(e) => setFMes(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
              <option value="">Todos os meses</option>
              {MESES_PT.map((m, i) => <option key={m} value={i + 1}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
            </select>
          </div>

          {filtradas.length === 0 ? (
            <p className="mt-6 rounded-xl border border-(--color-border) bg-(--color-surface-1) px-4 py-6 text-center text-sm text-(--color-text-weak)">
              Nenhuma avaliação encontrada com os filtros aplicados.
            </p>
          ) : (
            <>
              <h2 className="mt-8 text-sm font-semibold text-(--color-text)">Médias por critério</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {mediasCriterio.map((m) => <CartaoKpi key={m.rotulo} titulo={m.rotulo} valor={String(m.media)} cor="var(--color-navy)" />)}
              </div>

              <div className="mt-8 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
                <GraficoEvolucaoNotaFinal dados={evolucao} />
              </div>

              {reconhecidos.length > 0 && (
                <div className="mt-8">
                  <h2 className="text-sm font-semibold text-(--color-text)">Reconhecimento</h2>
                  <div className="mt-3 flex flex-col gap-2">
                    {reconhecidos.map((nome) => (
                      <p key={nome} className="rounded-xl border border-(--color-green)/30 bg-(--color-green)/10 px-4 py-3 text-sm text-(--color-text)">
                        <strong>{nome}</strong>: {RECOMENDACAO_DESEMPENHO_MAXIMO}
                      </p>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-(--color-text-dim)">
                    Recomendação gerencial apenas — não gera promoção, aumento salarial, prêmio ou novas permissões automaticamente.
                  </p>
                </div>
              )}

              <SecaoFechamentoMensal combinacoes={combinacoes} podeAvaliar={podeAvaliar} perfil={perfil} />

              <h2 className="mt-8 text-sm font-semibold text-(--color-text)">Avaliações registradas</h2>
              <div className="mt-3 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
                <table className="w-full min-w-[1300px] text-left text-sm">
                  <thead>
                    <tr className="text-xs font-medium text-(--color-text-dim)">
                      <th className="px-4 py-3">Analista</th>
                      <th className="px-4 py-3">Avaliador</th>
                      <th className="px-4 py-3">Mês</th>
                      <th className="px-4 py-3">Ano</th>
                      <th className="px-4 py-3">Média (critérios)</th>
                      <th className="px-4 py-3">Penalidade ETG</th>
                      <th className="px-4 py-3">Média (pós-ETG)</th>
                      <th className="px-4 py-3">Avaliações Obrig.</th>
                      <th className="px-4 py-3">Pendentes</th>
                      <th className="px-4 py-3">ATs Pendentes</th>
                      <th className="px-4 py-3">Penalização</th>
                      <th className="px-4 py-3">Bonificação</th>
                      <th className="px-4 py-3">Nota Final</th>
                      <th className="px-4 py-3">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...filtradas].sort((a, b) => b.ano - a.ano || a.analista.localeCompare(b.analista)).map((a) => (
                      <tr key={a.id} className="border-t border-(--color-border) first:border-0">
                        <td className="px-4 py-2.5 font-medium text-(--color-text)">{a.analista}</td>
                        <td className="px-4 py-2.5 text-(--color-text-weak)">{a.avaliador || "—"}</td>
                        <td className="px-4 py-2.5 text-(--color-text-weak)">{MESES_PT[a.mes - 1]}</td>
                        <td className="px-4 py-2.5 text-(--color-text-weak)">{a.ano}</td>
                        <td className="px-4 py-2.5 text-(--color-text-weak)">{a.mediaBruta}</td>
                        <td className="px-4 py-2.5 text-(--color-text-weak)">{a.etgPenalizado ? `Sim (-${Math.round((1 - PENALIDADE_ETG) * 100)}%)` : "—"}</td>
                        <td className="px-4 py-2.5 text-(--color-text-weak)">{a.mediaGeral}</td>
                        <td className="px-4 py-2.5 text-(--color-text-weak)">{a.avaliacoesObrigatorias}</td>
                        <td className="px-4 py-2.5 text-(--color-text-weak)">{a.avaliacoesPendentes}</td>
                        <td className="px-4 py-2.5 text-(--color-text-weak)">{a.avaliacoesAtPendentes || "—"}</td>
                        <td className="px-4 py-2.5 text-(--color-text-weak)">{rotuloPenalizacao(a.penalizacaoFracao)}</td>
                        <td className="px-4 py-2.5 text-(--color-text-weak)">{rotuloBonificacao(a.bonificacao)}</td>
                        <td className="px-4 py-2.5 font-semibold text-(--color-navy)">{a.mediaFinal}</td>
                        <td className="px-4 py-2.5 text-(--color-text-weak)">{a.fechado ? "Fechada" : "Prévia (não fechada)"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {podeVerRelatorios && <TabelaRelatorioGerencial linhas={relatorioFiltrado} />}
            </>
          )}
        </>
      )}
    </div>
  );
}
