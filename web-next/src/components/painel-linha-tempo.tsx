"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  calcularIntervalosRevisao,
  consolidadoPorEntidade,
  projetosPorEntidade,
  textoSemAcentos,
  type LinhaRevisao,
  type Origem,
} from "@/lib/revisoes-calculo";
import {
  GraficoEvolucaoMensalRetorno,
  GraficoProjetosPorRevisao,
  GraficoSituacaoSlaExterno,
  GraficoTopAtrasoEntidades,
} from "@/components/revisoes-charts";
import { MESES_PT } from "@/lib/meses";

function formatarData(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString("pt-BR");
}

const COR_SITUACAO_TEXTO: Record<string, string> = {
  "DENTRO DO SLA": "var(--color-green)",
  "PRÓXIMO DO LIMITE": "var(--color-gold)",
  "NO LIMITE": "var(--color-orange)",
  "FORA DO SLA": "var(--color-red)",
  "AGUARDANDO NOVA REVISÃO": "var(--color-text-dim)",
  "DATA INCONSISTENTE": "var(--color-purple)",
};

function CartaoKpi({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-4 py-4">
      <p className="text-xl font-semibold tabular-nums" style={cor ? { color: cor } : undefined}>{valor}</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">{titulo}</p>
    </div>
  );
}

function Etapa({ titulo, data, dias, responsavel, observacao }: { titulo: string; data?: string | null; dias?: number | null; responsavel?: string | null; observacao?: string }) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface-1) px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium text-(--color-text)">{titulo}</p>
        <div className="text-right text-xs text-(--color-text-weak)">
          {data && <p>{formatarData(data)}</p>}
          {dias != null && <p className="tabular-nums font-semibold text-(--color-text)">{dias} dia(s) útil(eis)</p>}
        </div>
      </div>
      {observacao && <p className="mt-1 text-xs text-(--color-text-dim)">{observacao}</p>}
      {responsavel && <p className="mt-1 text-xs text-(--color-text-dim)">Responsável: {responsavel}</p>}
    </div>
  );
}

function SequenciaProjeto({ linhasProjeto }: { linhasProjeto: LinhaRevisao[] }) {
  const ordenado = [...linhasProjeto].sort((a, b) => a.revisao - b.revisao);
  return (
    <div className="space-y-3">
      {ordenado.map((revisao, idx) => {
        const anterior = idx > 0 ? ordenado[idx - 1] : null;
        let dias: number | null = null;
        let situacao: string | null = null;
        if (anterior && revisao.dataSolicitacao && anterior.dataSolicitacao) {
          const intervalo = calcularIntervalosRevisao([anterior, revisao]);
          if (intervalo.length) {
            dias = intervalo[0].diasUteisRetorno;
            situacao = intervalo[0].situacaoSla;
          }
        }
        return (
          <div key={revisao.id}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-(--color-text-dim)">REV{String(revisao.revisao).padStart(2, "0")}</p>
            <div className="space-y-2">
              <Etapa titulo="Postagem (Data de Solicitação)" data={revisao.dataSolicitacao} />
              <Etapa titulo="Análise Tecnoplano (tempo de análise interna)" dias={revisao.tempoAnaliseInterna} responsavel={revisao.responsavel} />
              {revisao.dataAnalise ? (
                <Etapa titulo="Resposta da Tecnoplano" data={revisao.dataAnalise} responsavel={revisao.responsavel} observacao="Data em que a análise foi concluída." />
              ) : (
                <Etapa titulo="Resposta da Tecnoplano" observacao="Ainda em análise — sem data de resposta registrada." />
              )}
              {revisao.holdDias > 0 && (
                <Etapa
                  titulo="Aguardando retorno externo (Hold)"
                  dias={revisao.holdDias}
                  observacao={`Hold de ${formatarData(revisao.holdInicio)} a ${formatarData(revisao.holdFim)}.`}
                />
              )}
              {anterior && dias != null && (
                <div className="rounded-xl border-2 px-4 py-3" style={{ borderColor: COR_SITUACAO_TEXTO[situacao ?? ""] || "var(--color-border)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-(--color-text)">Retorno externo — REV{String(anterior.revisao).padStart(2, "0")} → REV{String(revisao.revisao).padStart(2, "0")}</p>
                    <p className="text-sm font-semibold tabular-nums" style={{ color: COR_SITUACAO_TEXTO[situacao ?? ""] }}>{dias} dia(s) útil(eis)</p>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: COR_SITUACAO_TEXTO[situacao ?? ""] }}>Situação: {situacao}</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <Etapa titulo="Data limite (prazo acordado)" data={ordenado[ordenado.length - 1]?.dataLimite} observacao={`Status de entrega: ${ordenado[ordenado.length - 1]?.statusEntregaCalc ?? "—"}`} />
      {ordenado[ordenado.length - 1]?.observacoes?.trim() && (
        <p className="text-xs text-(--color-text-dim)">Observações: {ordenado[ordenado.length - 1].observacoes}</p>
      )}
    </div>
  );
}

function ProjetoExpandivel({ projeto, linhasGrupo }: { projeto: ReturnType<typeof projetosPorEntidade>[number]; linhasGrupo: LinhaRevisao[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
      <button onClick={() => setAberto((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <p className="text-sm font-medium text-(--color-text)">
          AT {projeto.numAt || "—"} · {projeto.disciplina || "—"} · REV{String(projeto.revisaoAtual).padStart(2, "0")} · {projeto.qtdRevisoes} revisão(ões)
        </p>
        <span className="text-xs text-(--color-text-dim)">{aberto ? "Fechar" : "Abrir"}</span>
      </button>
      {aberto && (
        <div className="border-t border-(--color-border) px-4 py-4">
          <SequenciaProjeto linhasProjeto={linhasGrupo} />
        </div>
      )}
    </div>
  );
}

export function PainelLinhaTempo({
  linhasPrestadores,
  linhasCessionarios,
}: {
  linhasPrestadores: LinhaRevisao[];
  linhasCessionarios: LinhaRevisao[];
}) {
  const [modulo, setModulo] = useState<Origem>("prestadores");
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [at, setAt] = useState("");
  const [disciplina, setDisciplina] = useState("");
  const [analista, setAnalista] = useState("");
  const [revisaoFiltro, setRevisaoFiltro] = useState("");
  const [mes, setMes] = useState("");
  const [ano, setAno] = useState("");
  const [entidadeEscolhida, setEntidadeEscolhida] = useState<string | null>(null);

  const linhasBase = modulo === "prestadores" ? linhasPrestadores : linhasCessionarios;

  const disciplinas = useMemo(() => [...new Set(linhasBase.map((l) => l.disciplina).filter((d): d is string => !!d))].sort(), [linhasBase]);
  const analistas = useMemo(() => [...new Set(linhasBase.map((l) => l.responsavel).filter((r): r is string => !!r))].sort(), [linhasBase]);
  const anoAtual = new Date().getFullYear();
  const anosDisponiveis = [anoAtual - 1, anoAtual, anoAtual + 1];

  const linhasFiltradas = useMemo(() => {
    const mesNum = mes ? Number(mes) : null;
    const anoNum = ano ? Number(ano) : null;
    return linhasBase.filter((l) => {
      if (codigo.trim() && !(l.codigo || "").toUpperCase().includes(codigo.trim().toUpperCase())) return false;
      if (nome.trim() && !(l.nome || "").toUpperCase().includes(nome.trim().toUpperCase())) return false;
      if (at.trim() && !(l.numAt || "").toUpperCase().includes(at.trim().toUpperCase())) return false;
      if (disciplina && textoSemAcentos(l.disciplina) !== textoSemAcentos(disciplina)) return false;
      if (analista && l.responsavel !== analista) return false;
      if (revisaoFiltro.trim() && String(l.revisao) !== revisaoFiltro.trim()) return false;
      if (mesNum || anoNum) {
        if (!l.dataSolicitacao) return false;
        const d = new Date(l.dataSolicitacao);
        if (Number.isNaN(d.getTime())) return false;
        if (mesNum && d.getUTCMonth() + 1 !== mesNum) return false;
        if (anoNum && d.getUTCFullYear() !== anoNum) return false;
      }
      return true;
    });
  }, [linhasBase, codigo, nome, at, disciplina, analista, revisaoFiltro, mes, ano]);

  const intervalos = useMemo(() => calcularIntervalosRevisao(linhasFiltradas), [linhasFiltradas]);
  const consolidado = useMemo(() => consolidadoPorEntidade(linhasFiltradas), [linhasFiltradas]);
  const projetos = useMemo(() => projetosPorEntidade(linhasFiltradas), [linhasFiltradas]);

  const intervalosValidos = intervalos.filter((i) => i.situacaoSla !== "DATA INCONSISTENTE");
  const pctDentroGeral = intervalosValidos.length
    ? Math.round((1000 * intervalosValidos.filter((i) => i.situacaoSla === "DENTRO DO SLA").length) / intervalosValidos.length) / 10
    : 0;
  const mediaInterno = linhasFiltradas.length
    ? Math.round((linhasFiltradas.reduce((s, l) => s + (l.tempoAnaliseInterna ?? 0), 0) / linhasFiltradas.length) * 10) / 10
    : 0;
  const mediaExterno = intervalosValidos.length
    ? Math.round((intervalosValidos.reduce((s, i) => s + (i.diasUteisRetorno ?? 0), 0) / intervalosValidos.length) * 10) / 10
    : 0;
  const qtdInconsistentes = consolidado.reduce((s, c) => s + c.qtdInconsistentes, 0);

  const consolidadoOrdenado = [...consolidado].sort((a, b) => b.qtdForaSla - a.qtdForaSla);
  const entidadesOrdenadas = [...consolidado].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const entidade = entidadeEscolhida ? consolidado.find((c) => c.chaveEntidade === entidadeEscolhida) : null;
  const projetosEntidade = entidade ? projetos.filter((p) => p.chaveEntidade === entidade.chaveEntidade) : [];

  const hrefProjetos = modulo === "prestadores" ? "/prestadores/projetos" : "/cessionarios/projetos";

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Linha do Tempo — Consolidada por Código</h1>
      <p className="mt-1 max-w-3xl text-sm text-(--color-text-weak)">
        Consolida todos os projetos, ATs, disciplinas e revisões do mesmo código de Prestador/Cessionário, com o
        tempo de retorno externo entre revisões e a conformidade com o SLA de 10 dias úteis.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-(--color-border) bg-(--color-surface-1) p-1 text-xs font-medium">
          {(["prestadores", "cessionarios"] as const).map((m) => (
            <button key={m} onClick={() => { setModulo(m); setEntidadeEscolhida(null); }} className={`rounded-full px-3 py-1.5 transition-colors ${modulo === m ? "bg-(--color-navy) text-white" : "text-(--color-text-weak) hover:text-(--color-text)"}`}>
              {m === "prestadores" ? "Prestadores" : "Cessionários"}
            </button>
          ))}
        </div>
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código" className="w-32 rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm outline-none focus:border-(--color-navy)" />
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (busca)" className="w-40 rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm outline-none focus:border-(--color-navy)" />
        <input value={at} onChange={(e) => setAt(e.target.value)} placeholder="N° AT" className="w-36 rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm outline-none focus:border-(--color-navy)" />
        <select value={disciplina} onChange={(e) => setDisciplina(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
          <option value="">Todas as disciplinas</option>
          {disciplinas.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={analista} onChange={(e) => setAnalista(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
          <option value="">Todos os analistas</option>
          {analistas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input value={revisaoFiltro} onChange={(e) => setRevisaoFiltro(e.target.value)} placeholder="Revisão" className="w-24 rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm outline-none focus:border-(--color-navy)" />
        <select value={mes} onChange={(e) => setMes(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
          <option value="">Todos os meses</option>
          {MESES_PT.map((m, i) => <option key={m} value={i + 1}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
        </select>
        <select value={ano} onChange={(e) => setAno(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
          <option value="">Todos os anos</option>
          {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CartaoKpi titulo="Códigos/entidades" valor={String(consolidado.length)} cor="var(--color-navy)" />
        <CartaoKpi titulo="Projetos consolidados" valor={String(projetos.length)} />
        <CartaoKpi titulo="Intervalos calculados" valor={String(intervalos.length)} />
        <CartaoKpi titulo="% dentro do SLA (geral)" valor={`${pctDentroGeral}%`} cor={pctDentroGeral >= 80 ? "var(--color-green)" : pctDentroGeral >= 60 ? "var(--color-gold)" : "var(--color-red)"} />
      </div>

      <p className="mt-6 text-sm font-semibold text-(--color-text)">Gráficos consolidados (retorno externo entre revisões)</p>
      <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5"><GraficoSituacaoSlaExterno intervalos={intervalos} /></div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5"><GraficoEvolucaoMensalRetorno intervalos={intervalosValidos} /></div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5"><GraficoProjetosPorRevisao intervalos={intervalos} /></div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5"><GraficoTopAtrasoEntidades consolidado={consolidado} /></div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <CartaoKpi titulo="Média dias úteis — análise interna" valor={String(mediaInterno)} cor="var(--color-navy)" />
        <CartaoKpi titulo="Média dias úteis — retorno externo" valor={String(mediaExterno)} cor="var(--color-sky)" />
      </div>

      <p className="mt-8 text-sm font-semibold text-(--color-text)">Consolidado por código</p>
      {qtdInconsistentes > 0 && (
        <p className="mt-1 text-xs text-(--color-orange)">
          {qtdInconsistentes} intervalo(s) com data de revisão inconsistente — sinalizados na coluna &quot;Inconsistentes&quot;, não entram nas médias.
        </p>
      )}
      <div className="mt-2 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-(--color-text-dim)">
              <th className="px-4 py-3">Código/Nome</th>
              <th className="px-4 py-3 text-right">Projetos</th>
              <th className="px-4 py-3 text-right">ATs</th>
              <th className="px-4 py-3 text-right">Disciplinas</th>
              <th className="px-4 py-3 text-right">Atrasados</th>
              <th className="px-4 py-3 text-right">Intervalos</th>
              <th className="px-4 py-3 text-right">Média dias</th>
              <th className="px-4 py-3 text-right">Dentro SLA</th>
              <th className="px-4 py-3 text-right">Fora SLA</th>
              <th className="px-4 py-3 text-right">Inconsist.</th>
              <th className="px-4 py-3 text-right">% dentro SLA</th>
            </tr>
          </thead>
          <tbody>
            {consolidadoOrdenado.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-16 text-center text-(--color-text-weak)">Nenhum projeto encontrado com os critérios de busca.</td></tr>
            ) : (
              consolidadoOrdenado.map((c) => (
                <tr
                  key={c.chaveEntidade}
                  onClick={() => setEntidadeEscolhida(c.chaveEntidade)}
                  className={`cursor-pointer border-t border-(--color-border) first:border-0 hover:bg-(--color-surface-2)/60 ${entidadeEscolhida === c.chaveEntidade ? "bg-(--color-blue-3)" : ""}`}
                >
                  <td className="px-4 py-2.5 font-medium text-(--color-text)">{c.codigo || "—"} <span className="font-normal text-(--color-text-dim)">· {c.nome}</span></td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-(--color-text-weak)">{c.qtdProjetos}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-(--color-text-weak)">{c.qtdAts}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-(--color-text-weak)">{c.qtdDisciplinas}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: c.qtdAtrasadosAtual ? "var(--color-red)" : undefined }}>{c.qtdAtrasadosAtual}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-(--color-text-weak)">{c.qtdIntervalos}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-(--color-text-weak)">{c.mediaDias ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-(--color-green)">{c.qtdDentroSla}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-(--color-red)">{c.qtdForaSla}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-(--color-purple)">{c.qtdInconsistentes}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-(--color-text)">{c.pctDentroSla}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-8 text-sm font-semibold text-(--color-text)">Detalhamento por código</p>
      <select
        value={entidadeEscolhida ?? ""}
        onChange={(e) => setEntidadeEscolhida(e.target.value || null)}
        className="mt-2 w-full max-w-md rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3.5 py-2.5 text-sm outline-none focus:border-(--color-navy)"
      >
        <option value="">Selecione um código/entidade ({entidadesOrdenadas.length} encontrado(s))</option>
        {entidadesOrdenadas.map((e) => <option key={e.chaveEntidade} value={e.chaveEntidade}>{e.codigo || "—"} · {e.nome}</option>)}
      </select>

      {entidade && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <CartaoKpi titulo="Projetos" valor={String(entidade.qtdProjetos)} />
            <CartaoKpi titulo="Média dias retorno" valor={String(entidade.mediaDias ?? "—")} />
            <CartaoKpi titulo="Maior atraso" valor={String(entidade.maiorDias ?? "—")} />
            <CartaoKpi titulo="Fora do SLA" valor={String(entidade.qtdForaSla)} cor="var(--color-red)" />
            <CartaoKpi titulo="% dentro do SLA" valor={`${entidade.pctDentroSla}%`} />
          </div>
          {entidade.qtdProjetosSemAtValido > 0 && (
            <p className="mt-2 text-xs text-(--color-orange)">{entidade.qtdProjetosSemAtValido} projeto(s) sem N° AT utilizável — não entram no cálculo de tempo entre revisões.</p>
          )}
          {entidade.qtdInconsistentes > 0 && (
            <p className="mt-1 text-xs text-(--color-purple)">{entidade.qtdInconsistentes} intervalo(s) com data de revisão inconsistente — verifique as datas de entrada na sequência abaixo.</p>
          )}
          {entidade.codigo && (
            <Link href={hrefProjetos} className="mt-3 inline-block rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-navy) hover:bg-(--color-surface-2)">
              Ver projetos deste código
            </Link>
          )}

          <div className="mt-4 space-y-3">
            {projetosEntidade
              .sort((a, b) => (a.disciplina || "").localeCompare(b.disciplina || "") || (a.numAt || "").localeCompare(b.numAt || ""))
              .map((projeto) => (
                <ProjetoExpandivel key={`${projeto.chaveEntidade}-${projeto.numAt}-${projeto.disciplina}-${projeto.ids[0]}`} projeto={projeto} linhasGrupo={linhasFiltradas.filter((l) => projeto.ids.includes(l.id))} />
              ))}
          </div>
        </div>
      )}

      <p className="mt-8 text-xs text-(--color-text-dim)">
        Relatório do {modulo === "prestadores" ? "Prestador" : "Cessionário"} (Word) ainda não disponível nesta
        versão — use o sistema atual enquanto esse recurso não chega por aqui.
      </p>
    </div>
  );
}
