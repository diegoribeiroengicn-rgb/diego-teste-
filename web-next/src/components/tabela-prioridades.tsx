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

export function TabelaPrioridades({ itens }: { itens: ItemPrioridade[] }) {
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

      <p className="mt-4 text-xs text-(--color-text-dim)">
        Exportação de relatórios (Excel/Word/PDF) ainda não disponível nesta versão — use o sistema atual enquanto
        esse recurso não chega por aqui.
      </p>
    </div>
  );
}
