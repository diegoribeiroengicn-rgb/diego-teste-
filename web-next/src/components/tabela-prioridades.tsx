"use client";

import { useMemo, useState } from "react";
import type { CorMapaCalor, ItemPrioridade } from "@/lib/lista-prioridades";

const COR_HEX: Record<CorMapaCalor, string> = {
  verde: "var(--color-green)",
  amarelo: "var(--color-gold)",
  laranja: "var(--color-orange)",
  vermelho: "var(--color-red)",
  roxo: "var(--color-purple)",
  azul: "var(--color-sky)",
};

const ROTULO_COR: Record<CorMapaCalor, string> = {
  verde: "Dentro do prazo", amarelo: "Vence em breve", laranja: "Vence hoje",
  vermelho: "Atrasado", roxo: "Reforço (SLA reduzido / Nível 1)", azul: "Em HOLD",
};

const ROTULO_SITUACAO: Record<string, string> = {
  "DENTRO DO PRAZO": "Dentro do prazo", "VENCE EM BREVE": "Vence em breve",
  "VENCE HOJE": "Vence hoje", ATRASADO: "Atrasado", "EM HOLD": "Em HOLD",
};

function formatarData(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString("pt-BR");
}

function Ponto({ cor }: { cor: CorMapaCalor }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR_HEX[cor] }} title={ROTULO_COR[cor]} />;
}

async function baixarRelatorio(url: string, corpo: unknown): Promise<string | null> {
  const resposta = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  if (!resposta.ok) {
    const erro = await resposta.json().catch(() => ({}));
    return erro?.erro || "Erro ao gerar o relatório.";
  }
  const nomeArquivo = resposta.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || "relatorio";
  const blob = await resposta.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(link.href);
  return null;
}

function BotaoRelatorio({ rotulo, url, corpo }: { rotulo: string; url: string; corpo: unknown }) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    setGerando(true);
    setErro(null);
    try {
      const resultado = await baixarRelatorio(url, corpo);
      if (resultado) setErro(resultado);
    } catch {
      setErro("Não foi possível conectar ao sistema.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div>
      <button
        onClick={gerar} disabled={gerando}
        className="w-full rounded-full border border-(--color-border) px-4 py-2 text-sm font-medium text-(--color-text) hover:bg-(--color-surface-2) disabled:opacity-60"
      >
        {gerando ? "Gerando…" : rotulo}
      </button>
      {erro && <p className="mt-1 text-xs text-(--color-red)">{erro}</p>}
    </div>
  );
}

/** "Relatórios de Prioridades" — porta da seção de relatórios de
 * views/lista_prioridades.py::render (coletivo: Excel/Word/PDF a partir
 * da lista já filtrada na tela; individual: Word/PDF de um projeto). */
function SecaoRelatoriosPrioridades({ filtrados }: { filtrados: ItemPrioridade[] }) {
  const [aba, setAba] = useState<"coletivo" | "individual">("coletivo");
  const [indiceSelecionado, setIndiceSelecionado] = useState(0);
  const selecionado = filtrados[indiceSelecionado] ?? null;

  return (
    <div className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
      <p className="text-sm font-semibold text-(--color-navy)">Relatórios de Prioridades</p>
      <div className="mt-3 flex gap-1 rounded-full border border-(--color-border) bg-(--color-bg) p-1 text-xs font-medium w-fit">
        {(["coletivo", "individual"] as const).map((a) => (
          <button
            key={a} onClick={() => setAba(a)}
            className={`rounded-full px-4 py-1.5 transition-colors ${aba === a ? "bg-(--color-navy) text-white" : "text-(--color-text-weak) hover:text-(--color-text)"}`}
          >
            {a === "coletivo" ? "Relatório coletivo" : "Relatório individual"}
          </button>
        ))}
      </div>

      {aba === "coletivo" ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <BotaoRelatorio rotulo="Gerar Excel" url="/api/relatorios/prioridades/excel" corpo={{ itens: filtrados }} />
          <BotaoRelatorio rotulo="Gerar Word" url="/api/relatorios/prioridades/word" corpo={{ itens: filtrados }} />
          <BotaoRelatorio rotulo="Gerar PDF" url="/api/relatorios/prioridades/pdf" corpo={{ itens: filtrados }} />
        </div>
      ) : filtrados.length === 0 ? (
        <p className="mt-4 text-xs text-(--color-text-weak)">Nenhum projeto disponível com os filtros atuais.</p>
      ) : (
        <div className="mt-4">
          <select
            value={indiceSelecionado} onChange={(e) => setIndiceSelecionado(Number(e.target.value))}
            className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)"
          >
            {filtrados.map((it, i) => (
              <option key={`${it.modulo}-${it.id}`} value={i}>{it.tipo} · {it.nome_entidade} · AT {it.num_at || "—"}</option>
            ))}
          </select>
          {selecionado && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <BotaoRelatorio rotulo="Gerar Word" url="/api/relatorios/prioridades/word-individual" corpo={{ item: selecionado }} />
              <BotaoRelatorio rotulo="Gerar PDF" url="/api/relatorios/prioridades/pdf-individual" corpo={{ item: selecionado }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TabelaPrioridades({ itens, podeGerarRelatorios = false }: { itens: ItemPrioridade[]; podeGerarRelatorios?: boolean }) {
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<"TODOS" | "Prestador" | "Cessionário">("TODOS");
  const [cor, setCor] = useState<"TODAS" | CorMapaCalor>("TODAS");

  const filtrados = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    return itens.filter((it) => {
      if (tipo !== "TODOS" && it.tipo !== tipo) return false;
      if (cor !== "TODAS" && it.cor_mapa_calor !== cor) return false;
      if (!termo) return true;
      return (
        (it.num_at || "").toUpperCase().includes(termo) ||
        (it.codigo || "").toUpperCase().includes(termo) ||
        (it.nome_entidade || "").toUpperCase().includes(termo) ||
        (it.responsavel || "").toUpperCase().includes(termo)
      );
    });
  }, [itens, busca, tipo, cor]);

  const totalPrestadores = filtrados.filter((i) => i.tipo === "Prestador").length;
  const totalCessionarios = filtrados.filter((i) => i.tipo === "Cessionário").length;
  const atrasados = filtrados.filter((i) => i.situacao_prazo === "ATRASADO").length;
  const emHold = filtrados.filter((i) => i.situacao_prazo === "EM HOLD").length;

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Lista de Prioridades</h1>
      <p className="mt-1 max-w-3xl text-sm text-(--color-text-weak)">
        Único painel com Prestadores e Cessionários juntos: projetos com nível de prioridade, SLA reduzido, ou a até 2
        dias úteis do vencimento (vence em 2/1 dia, vence hoje ou já atrasado), ainda em andamento. Sai automaticamente
        da lista assim que a análise é concluída.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por AT, código, prestador/cessionário ou responsável…"
          className="w-80 rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/15"
        />
        <div className="flex gap-1 rounded-full border border-(--color-border) bg-(--color-surface-1) p-1 text-xs font-medium">
          {(["TODOS", "Prestador", "Cessionário"] as const).map((opcao) => (
            <button
              key={opcao}
              onClick={() => setTipo(opcao)}
              className={`rounded-full px-3 py-1.5 transition-colors ${tipo === opcao ? "bg-(--color-navy) text-white" : "text-(--color-text-weak) hover:text-(--color-text)"}`}
            >
              {opcao === "TODOS" ? "Todos" : opcao}
            </button>
          ))}
        </div>
        <select
          value={cor}
          onChange={(e) => setCor(e.target.value as typeof cor)}
          className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium text-(--color-text) outline-none focus:border-(--color-navy)"
        >
          <option value="TODAS">Mapa de calor: todas as cores</option>
          {(Object.keys(ROTULO_COR) as CorMapaCalor[]).map((c) => (
            <option key={c} value={c}>{ROTULO_COR[c]}</option>
          ))}
        </select>
        <span className="text-xs text-(--color-text-dim)">{filtrados.length} de {itens.length}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-text)">{filtrados.length}</p>
          <p className="text-xs text-(--color-text-weak)">total prioritários</p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-navy)">{totalPrestadores}</p>
          <p className="text-xs text-(--color-text-weak)">prestadores</p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-blue-2)">{totalCessionarios}</p>
          <p className="text-xs text-(--color-text-weak)">cessionários</p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-red)">{atrasados}</p>
          <p className="text-xs text-(--color-text-weak)">atrasados · {emHold} em HOLD</p>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-(--color-text-dim)">
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Prestador/Cessionário</th>
              <th className="px-4 py-3">N° AT</th>
              <th className="px-4 py-3">Disciplina</th>
              <th className="px-4 py-3">Motivo(s)</th>
              <th className="px-4 py-3">Responsável</th>
              <th className="px-4 py-3">Prazo</th>
              <th className="px-4 py-3">Situação</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-16 text-center text-(--color-text-weak)">
                  Nenhum projeto prioritário encontrado.
                </td>
              </tr>
            ) : (
              filtrados.map((it) => (
                <tr key={`${it.modulo}-${it.id}`} className="border-t border-(--color-border) first:border-0 hover:bg-(--color-surface-2)/60">
                  <td className="px-4 py-3.5"><Ponto cor={it.cor_mapa_calor} /></td>
                  <td className="px-4 py-3.5 text-(--color-text-weak)">{it.tipo}</td>
                  <td className="px-4 py-3.5 font-medium text-(--color-text)">{it.nome_entidade || "—"} <span className="font-normal text-(--color-text-dim)">· {it.codigo}</span></td>
                  <td className="px-4 py-3.5 text-(--color-text-weak)">{it.num_at || "—"}</td>
                  <td className="px-4 py-3.5 text-(--color-text-weak)">{it.disciplina || "—"}</td>
                  <td className="px-4 py-3.5 text-(--color-text-weak)">{it.motivos_entrada.join(" + ")}</td>
                  <td className="px-4 py-3.5 text-(--color-text-weak)">{it.responsavel || "—"}</td>
                  <td className="px-4 py-3.5 text-(--color-text-weak)">{formatarData(it.data_limite)}</td>
                  <td className="px-4 py-3.5 text-(--color-text-weak)">{ROTULO_SITUACAO[it.situacao_prazo]}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {podeGerarRelatorios && <SecaoRelatoriosPrioridades filtrados={filtrados} />}
    </div>
  );
}
