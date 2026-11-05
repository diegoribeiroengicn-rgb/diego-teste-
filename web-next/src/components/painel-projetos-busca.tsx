"use client";

import { useMemo, useState } from "react";
import {
  marcarMaisRecente,
  rotulosCanaisSelecionados,
  type LinhaLocalizacaoMarcada,
} from "@/lib/localizacao-ats-calculo";
import type { LinhaLocalizacao } from "@/lib/localizacao-ats-calculo";
import { textoSemAcentos } from "@/lib/revisoes-calculo";
import { SequenciaProjeto } from "@/components/painel-linha-tempo";
import { MESES_PT } from "@/lib/meses";

const COR_BADGE_STATUS: Record<string, string> = {
  "EM ANÁLISE": "var(--color-orange)",
  "EM HOLD": "var(--color-sky)",
  LIBERADO: "var(--color-green)",
  "LIBERADO C/ REST.": "var(--color-green)",
  "NÃO LIBERADO": "var(--color-red)",
  OBSOLETO: "var(--color-text-dim)",
  CANCELADO: "var(--color-text-dim)",
};

const COR_SITUACAO_ANALISE: Record<string, string> = {
  "ANTES DO PRAZO": "var(--color-green)",
  "NO PRAZO": "var(--color-sky)",
  ATRASADO: "var(--color-red)",
};

/** Mesmos níveis/rótulos da Lista de Prioridades (`lista-prioridades.ts`,
 * não importado para não acoplar este módulo à centralização
 * administrável da lista, que é uma fase futura separada) — só para
 * exibir e filtrar o nível já gravado em `nivelPrioridade`. */
const ROTULO_NIVEL_PRIORIDADE: Record<number, string> = {
  1: "Nível 1 (até 3 dias úteis)",
  2: "Nível 2 (5 dias úteis)",
  3: "Nível 3 (7 dias úteis)",
};
const SEM_PRIORIDADE = "SEM_PRIORIDADE";

function BadgeStatus({ status }: { status: string | null }) {
  const texto = status?.trim() || "—";
  return (
    <span className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: COR_BADGE_STATUS[texto.toUpperCase()] ?? "#64748B" }}>
      {texto}
    </span>
  );
}

function BadgeSituacaoAnalise({ situacao }: { situacao: LinhaLocalizacao["statusEntregaCalc"] }) {
  if (!situacao) return <span className="text-(--color-text-dim)">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: COR_SITUACAO_ANALISE[situacao] }}>
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: COR_SITUACAO_ANALISE[situacao] }} />
      {situacao}
    </span>
  );
}

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

function anoDoAt(numAt: string | null): string {
  if (!numAt || !numAt.includes("/")) return "—";
  const partes = numAt.split("/");
  return partes[partes.length - 1] || "—";
}

/** "YYYY-MM-DD..." → "YYYY-MM-DD", para comparar com um filtro de data
 * (input type="date") sem depender de fuso horário. */
function soData(valor: string | null): string | null {
  return valor ? String(valor).slice(0, 10) : null;
}

const classeInput = "rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm outline-none focus:border-(--color-navy)";
const classeSelect = "rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)";
const classeInputData = "rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-1.5 text-xs outline-none focus:border-(--color-navy)";

function CampoData({ label, valor, onChange }: { label: string; valor: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-(--color-text-weak)">
      {label}
      <input type="date" value={valor} onChange={(e) => onChange(e.target.value)} className={classeInputData} />
    </label>
  );
}

function PainelDetalhe({ linha, grupo }: { linha: LinhaLocalizacaoMarcada; grupo: LinhaLocalizacao[] }) {
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const canais = rotulosCanaisSelecionados(linha.resumoMfiles, linha.resumoDrive, linha.resumoEmail);

  return (
    <div className="mt-6 rounded-2xl border-2 border-(--color-navy) bg-(--color-surface-1) p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-(--color-text-dim)">Detalhes</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-(--color-text)">AT {linha.numAt || "—"} · {linha.disciplina || "—"} · REV{String(linha.revisao).padStart(2, "0")}</p>
          <p className="mt-1 text-sm text-(--color-text-weak)">
            {linha.modulo === "prestadores" ? "Prestador" : "Cessionário"}: {linha.codigo || "—"} — {linha.nome || "—"}
          </p>
          {linha.obra && <p className="mt-0.5 text-sm text-(--color-text-weak)">Obra: {linha.obra}</p>}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <BadgeStatus status={linha.statusAnalise} />
          <BadgeSituacaoAnalise situacao={linha.statusEntregaCalc} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-3">
          <p className="text-sm font-semibold tabular-nums text-(--color-text)">{anoDoAt(linha.numAt)}</p>
          <p className="text-xs text-(--color-text-weak)">Ano</p>
        </div>
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-3">
          <p className="text-sm font-semibold text-(--color-text)">{linha.responsavel || "—"}</p>
          <p className="text-xs text-(--color-text-weak)">Analista responsável</p>
        </div>
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-3">
          <p className="text-sm font-semibold text-(--color-text)">{linha.nivelPrioridade != null ? (ROTULO_NIVEL_PRIORIDADE[linha.nivelPrioridade] ?? `Nível ${linha.nivelPrioridade}`) : "Sem prioridade"}</p>
          <p className="text-xs text-(--color-text-weak)">Prioridade{linha.slaReduzido ? " · SLA reduzido" : ""}</p>
        </div>
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-3">
          <p className="text-sm font-semibold text-(--color-text)">{formatarDataHora(linha.atualizadoEm)}</p>
          <p className="text-xs text-(--color-text-weak)">Última atualização</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-(--color-text-weak)">
        <p>Data de recebimento: {formatarData(linha.dataSolicitacao)}</p>
        <p>Data de vencimento: {formatarData(linha.dataLimite)}</p>
        <p>Data de conclusão: {formatarData(linha.dataAnalise)}</p>
      </div>
      <p className="mt-2 text-xs text-(--color-text-weak)">Localização da AT (Resumo de Conclusão): {canais.length ? canais.join(", ") : "—"}</p>
      {linha.observacoes?.trim() && <p className="mt-1 text-xs text-(--color-text-dim)">Observações: {linha.observacoes}</p>}

      <button onClick={() => setHistoricoAberto((v) => !v)} className="mt-4 rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-navy) hover:bg-(--color-surface-2)">
        {historicoAberto ? "Fechar histórico" : "Ver histórico completo (Linha do Tempo)"}
      </button>
      {historicoAberto && (
        <div className="mt-4">
          <SequenciaProjeto linhasProjeto={grupo} />
        </div>
      )}
    </div>
  );
}

export function PainelProjetosBusca({ linhas }: { linhas: LinhaLocalizacao[] }) {
  const [at, setAt] = useState("");
  const [obra, setObra] = useState("");
  const [disciplina, setDisciplina] = useState("");
  const [prestador, setPrestador] = useState("");
  const [cessionario, setCessionario] = useState("");
  const [codigo, setCodigo] = useState("");
  const [revisaoFiltro, setRevisaoFiltro] = useState("");
  const [status, setStatus] = useState("");
  const [situacaoAnalise, setSituacaoAnalise] = useState("");
  const [prioridade, setPrioridade] = useState("");
  const [analista, setAnalista] = useState("");
  const [mes, setMes] = useState("");
  const [ano, setAno] = useState("");
  const [recebimentoDe, setRecebimentoDe] = useState("");
  const [recebimentoAte, setRecebimentoAte] = useState("");
  const [vencimentoDe, setVencimentoDe] = useState("");
  const [vencimentoAte, setVencimentoAte] = useState("");
  const [conclusaoDe, setConclusaoDe] = useState("");
  const [conclusaoAte, setConclusaoAte] = useState("");
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const disciplinas = useMemo(() => [...new Set(linhas.map((l) => l.disciplina).filter((d): d is string => !!d))].sort(), [linhas]);
  const statusOpcoes = useMemo(() => [...new Set(linhas.map((l) => l.statusAnalise))].sort(), [linhas]);
  const analistas = useMemo(() => [...new Set(linhas.map((l) => l.responsavel).filter((r): r is string => !!r))].sort(), [linhas]);
  const anoAtual = new Date().getFullYear();
  const anosDisponiveis = [anoAtual - 1, anoAtual, anoAtual + 1];

  function limparFiltros() {
    setAt(""); setObra(""); setDisciplina(""); setPrestador(""); setCessionario(""); setCodigo("");
    setRevisaoFiltro(""); setStatus(""); setSituacaoAnalise(""); setPrioridade(""); setAnalista("");
    setMes(""); setAno(""); setRecebimentoDe(""); setRecebimentoAte(""); setVencimentoDe(""); setVencimentoAte("");
    setConclusaoDe(""); setConclusaoAte("");
  }

  const temFiltroAtivo = !!(
    at || obra || disciplina || prestador || cessionario || codigo || revisaoFiltro || status || situacaoAnalise ||
    prioridade || analista || mes || ano || recebimentoDe || recebimentoAte || vencimentoDe || vencimentoAte ||
    conclusaoDe || conclusaoAte
  );

  const filtradas = useMemo(() => {
    const mesNum = mes ? Number(mes) : null;
    const anoNum = ano ? Number(ano) : null;
    return linhas.filter((l) => {
      // Número da AT.
      if (at.trim() && !(l.numAt || "").toUpperCase().includes(at.trim().toUpperCase())) return false;
      // Obra (filtro já existente na antiga Localização de ATs — preservado).
      if (obra.trim() && !(l.obra || "").toUpperCase().includes(obra.trim().toUpperCase())) return false;
      // Disciplina (idem).
      if (disciplina && textoSemAcentos(l.disciplina) !== textoSemAcentos(disciplina)) return false;
      // Nome do prestador.
      if (prestador.trim() && !(l.modulo === "prestadores" && (l.nome || "").toUpperCase().includes(prestador.trim().toUpperCase()))) return false;
      // Cessionário.
      if (cessionario.trim() && !(l.modulo === "cessionarios" && (l.nome || "").toUpperCase().includes(cessionario.trim().toUpperCase()))) return false;
      // Código do prestador / Projeto — mesmo campo (`codigo`) nas duas
      // origens; ver nota de arquitetura no relatório de entrega.
      if (codigo.trim() && !(l.codigo || "").toUpperCase().includes(codigo.trim().toUpperCase())) return false;
      // Revisão (filtro já existente — preservado).
      if (revisaoFiltro.trim() && String(l.revisao) !== revisaoFiltro.trim()) return false;
      // Status da AT.
      if (status && l.statusAnalise !== status) return false;
      // Situação da análise (prazo calculado).
      if (situacaoAnalise && l.statusEntregaCalc !== situacaoAnalise) return false;
      // Prioridade.
      if (prioridade) {
        if (prioridade === SEM_PRIORIDADE ? l.nivelPrioridade != null : String(l.nivelPrioridade ?? "") !== prioridade) return false;
      }
      // Analista responsável.
      if (analista && l.responsavel !== analista) return false;
      // Mês/Ano de emissão ou cadastro da AT (data de recebimento/solicitação).
      if (mesNum || anoNum) {
        if (!l.dataSolicitacao) return false;
        const d = new Date(l.dataSolicitacao);
        if (Number.isNaN(d.getTime())) return false;
        if (mesNum && d.getUTCMonth() + 1 !== mesNum) return false;
        if (anoNum && d.getUTCFullYear() !== anoNum) return false;
      }
      // Data de recebimento.
      const recebimento = soData(l.dataSolicitacao);
      if (recebimentoDe && (!recebimento || recebimento < recebimentoDe)) return false;
      if (recebimentoAte && (!recebimento || recebimento > recebimentoAte)) return false;
      // Data de vencimento.
      const vencimento = soData(l.dataLimite);
      if (vencimentoDe && (!vencimento || vencimento < vencimentoDe)) return false;
      if (vencimentoAte && (!vencimento || vencimento > vencimentoAte)) return false;
      // Data de conclusão.
      const conclusao = soData(l.dataAnalise);
      if (conclusaoDe && (!conclusao || conclusao < conclusaoDe)) return false;
      if (conclusaoAte && (!conclusao || conclusao > conclusaoAte)) return false;
      return true;
    });
  }, [
    linhas, at, obra, disciplina, prestador, cessionario, codigo, revisaoFiltro, status, situacaoAnalise, prioridade,
    analista, mes, ano, recebimentoDe, recebimentoAte, vencimentoDe, vencimentoAte, conclusaoDe, conclusaoAte,
  ]);

  const marcadas = useMemo(() => marcarMaisRecente(filtradas), [filtradas]);
  const ordenadas = useMemo(
    () => [...marcadas].sort((a, b) => a.chaveProjeto.localeCompare(b.chaveProjeto) || b.revisao - a.revisao),
    [marcadas],
  );

  const chaveLinha = (l: LinhaLocalizacaoMarcada) => `${l.modulo}:${l.id}`;
  const linhaSelecionada = selecionada ? ordenadas.find((l) => chaveLinha(l) === selecionada) : null;
  const grupoSelecionado = linhaSelecionada ? marcadas.filter((l) => l.chaveProjeto === linhaSelecionada.chaveProjeto) : [];

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Projetos</h1>
      <p className="mt-1 max-w-3xl text-sm text-(--color-text-weak)">
        Busca avançada de todas as ATs cadastradas no sistema (Prestadores e Cessionários), com filtros combináveis.
        Localize por número da AT, código/nome do prestador ou cessionário, projeto, analista, status, situação da
        análise, prioridade ou datas de recebimento, vencimento e conclusão. Consulta somente leitura — não altera,
        arquiva nem duplica nenhum dado do sistema.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input value={at} onChange={(e) => setAt(e.target.value)} placeholder="Número da AT" className={`w-40 ${classeInput}`} />
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código (prestador/projeto)" className={`w-52 ${classeInput}`} />
        <input value={prestador} onChange={(e) => setPrestador(e.target.value)} placeholder="Nome do prestador" className={`w-40 ${classeInput}`} />
        <input value={cessionario} onChange={(e) => setCessionario(e.target.value)} placeholder="Cessionário" className={`w-40 ${classeInput}`} />
        <input value={obra} onChange={(e) => setObra(e.target.value)} placeholder="Obra" className={`w-32 ${classeInput}`} />
        <select value={disciplina} onChange={(e) => setDisciplina(e.target.value)} className={classeSelect}>
          <option value="">Todas as disciplinas</option>
          {disciplinas.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <input value={revisaoFiltro} onChange={(e) => setRevisaoFiltro(e.target.value)} placeholder="Revisão" className={`w-24 ${classeInput}`} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={classeSelect}>
          <option value="">Todos os status da AT</option>
          {statusOpcoes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={situacaoAnalise} onChange={(e) => setSituacaoAnalise(e.target.value)} className={classeSelect}>
          <option value="">Todas as situações da análise</option>
          <option value="ANTES DO PRAZO">Antes do prazo</option>
          <option value="NO PRAZO">No prazo</option>
          <option value="ATRASADO">Atrasado</option>
        </select>
        <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className={classeSelect}>
          <option value="">Todas as prioridades</option>
          <option value="1">{ROTULO_NIVEL_PRIORIDADE[1]}</option>
          <option value="2">{ROTULO_NIVEL_PRIORIDADE[2]}</option>
          <option value="3">{ROTULO_NIVEL_PRIORIDADE[3]}</option>
          <option value={SEM_PRIORIDADE}>Sem prioridade</option>
        </select>
        <select value={analista} onChange={(e) => setAnalista(e.target.value)} className={classeSelect}>
          <option value="">Todos os analistas</option>
          {analistas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={mes} onChange={(e) => setMes(e.target.value)} className={classeSelect}>
          <option value="">Todos os meses</option>
          {MESES_PT.map((m, i) => <option key={m} value={i + 1}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
        </select>
        <select value={ano} onChange={(e) => setAno(e.target.value)} className={classeSelect}>
          <option value="">Todos os anos</option>
          {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-(--color-text-dim)">Recebimento:</span>
          <CampoData label="de" valor={recebimentoDe} onChange={setRecebimentoDe} />
          <CampoData label="até" valor={recebimentoAte} onChange={setRecebimentoAte} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-(--color-text-dim)">Vencimento:</span>
          <CampoData label="de" valor={vencimentoDe} onChange={setVencimentoDe} />
          <CampoData label="até" valor={vencimentoAte} onChange={setVencimentoAte} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-(--color-text-dim)">Conclusão:</span>
          <CampoData label="de" valor={conclusaoDe} onChange={setConclusaoDe} />
          <CampoData label="até" valor={conclusaoAte} onChange={setConclusaoAte} />
        </div>
        {temFiltroAtivo && (
          <button onClick={limparFiltros} className="ml-auto rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-navy) hover:bg-(--color-surface-2)">
            Limpar filtros
          </button>
        )}
      </div>

      <p className="mt-4 text-sm text-(--color-text-weak)">
        <span className="text-xl font-semibold tabular-nums text-(--color-navy)">{ordenadas.length}</span> AT(s) encontrada(s)
      </p>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
        <table className="w-full min-w-[1300px] text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-(--color-text-dim)">
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3">Módulo</th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Prestador/Cessionário</th>
              <th className="px-4 py-3">Obra</th>
              <th className="px-4 py-3">Disciplina</th>
              <th className="px-4 py-3">Rev.</th>
              <th className="px-4 py-3">N° AT</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Situação</th>
              <th className="px-4 py-3">Prioridade</th>
              <th className="px-4 py-3">Analista</th>
              <th className="px-4 py-3">Recebimento</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.length === 0 ? (
              <tr><td colSpan={13} className="px-4 py-16 text-center text-(--color-text-weak)">Nenhuma AT encontrada para os filtros informados.</td></tr>
            ) : (
              ordenadas.map((l) => (
                <tr
                  key={chaveLinha(l)}
                  onClick={() => setSelecionada(chaveLinha(l))}
                  className={`cursor-pointer border-t border-(--color-border) first:border-0 hover:bg-(--color-surface-2)/60 ${selecionada === chaveLinha(l) ? "bg-(--color-blue-3)" : ""}`}
                >
                  <td className="px-4 py-2.5">{l.maisRecente && <span className="inline-block rounded-full bg-(--color-navy) px-2 py-0.5 text-[10px] font-semibold text-white">Mais recente</span>}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.modulo === "prestadores" ? "Prestador" : "Cessionário"}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.codigo || "—"}</td>
                  <td className="px-4 py-2.5 font-medium text-(--color-text)">{l.nome || "—"}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.obra || "—"}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.disciplina || "—"}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.revisao}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.numAt || "—"}</td>
                  <td className="px-4 py-2.5"><BadgeStatus status={l.statusAnalise} /></td>
                  <td className="px-4 py-2.5"><BadgeSituacaoAnalise situacao={l.statusEntregaCalc} /></td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.nivelPrioridade != null ? `Nível ${l.nivelPrioridade}` : "—"}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{l.responsavel || "—"}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{formatarData(l.dataSolicitacao)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!linhaSelecionada && ordenadas.length > 0 && (
        <p className="mt-3 text-xs text-(--color-text-dim)">Selecione uma linha na tabela para ver os detalhes completos e o histórico.</p>
      )}
      {linhaSelecionada && <PainelDetalhe linha={linhaSelecionada} grupo={grupoSelecionado} />}
    </div>
  );
}
