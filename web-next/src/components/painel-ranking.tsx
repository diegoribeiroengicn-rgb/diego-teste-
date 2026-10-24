"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { DetalheAvaliacao, ItemRanking, TipoEntidadeAvaliacao } from "@/lib/ranking";

function formatarData(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString("pt-BR");
}

function formatarNota(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}

export function PainelRanking({ tipoEntidade, ranking }: { tipoEntidade: TipoEntidadeAvaliacao; ranking: ItemRanking[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<DetalheAvaliacao[] | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  function trocarTipo(novoTipo: TipoEntidadeAvaliacao) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tipo", novoTipo);
    router.push(`${pathname}?${params.toString()}`);
  }

  async function selecionar(item: ItemRanking) {
    setSelecionado(item.chave);
    setCarregandoDetalhe(true);
    try {
      const resposta = await fetch(`/api/avaliacoes/detalhamento?tipo=${tipoEntidade}&chave=${encodeURIComponent(item.chave)}`);
      const dados = await resposta.json();
      setDetalhe(dados.detalhe ?? []);
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  const rotuloNome = tipoEntidade === "PRESTADOR" ? "Prestador" : "Projetista/Cessionário";
  const itemSelecionado = ranking.find((r) => r.chave === selecionado);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-(--color-text)">
            {tipoEntidade === "PRESTADOR" ? "Ranking de Prestadores" : "Ranking de Projetistas de Cessionários"}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-(--color-text-weak)">
            Média das avaliações concluídas a partir de 01/07/2026 — avaliação pendente nunca entra como nota zero.
          </p>
        </div>
        <div className="flex gap-1 rounded-full border border-(--color-border) bg-(--color-surface-1) p-1 text-xs font-medium">
          <button
            onClick={() => trocarTipo("PRESTADOR")}
            className={`rounded-full px-4 py-1.5 transition-colors ${
              tipoEntidade === "PRESTADOR" ? "bg-(--color-navy) text-white" : "text-(--color-text-weak) hover:text-(--color-text)"
            }`}
          >
            Prestadores
          </button>
          <button
            onClick={() => trocarTipo("CESSIONARIO")}
            className={`rounded-full px-4 py-1.5 transition-colors ${
              tipoEntidade === "CESSIONARIO" ? "bg-(--color-navy) text-white" : "text-(--color-text-weak) hover:text-(--color-text)"
            }`}
          >
            Cessionários
          </button>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-(--color-text-dim)">
              <th className="px-5 py-3">#</th>
              <th className="px-5 py-3">{rotuloNome}</th>
              <th className="px-5 py-3">Código</th>
              <th className="px-5 py-3">Nota Média</th>
              <th className="px-5 py-3">Avaliações</th>
              <th className="px-5 py-3">Melhor</th>
              <th className="px-5 py-3">Menor</th>
              <th className="px-5 py-3">Última Avaliação</th>
            </tr>
          </thead>
          <tbody>
            {ranking.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-16 text-center text-(--color-text-weak)">
                  Sem avaliações válidas no período.
                </td>
              </tr>
            ) : (
              ranking.map((item) => (
                <tr
                  key={item.chave}
                  onClick={() => selecionar(item)}
                  className={`cursor-pointer border-t border-(--color-border) first:border-0 hover:bg-(--color-surface-2)/60 ${
                    selecionado === item.chave ? "bg-(--color-blue-3)/40" : ""
                  }`}
                >
                  <td className="px-5 py-3.5 font-medium text-(--color-text)">{item.posicao}º</td>
                  <td className="px-5 py-3.5 text-(--color-text)">{item.nome}</td>
                  <td className="px-5 py-3.5 text-(--color-text-weak)">{item.codigo || "—"}</td>
                  <td className="px-5 py-3.5 font-semibold tabular-nums text-(--color-navy)">{formatarNota(item.media)}</td>
                  <td className="px-5 py-3.5 tabular-nums text-(--color-text-weak)">{item.qtd_avaliacoes}</td>
                  <td className="px-5 py-3.5 tabular-nums text-(--color-text-weak)">{item.melhor_nota}</td>
                  <td className="px-5 py-3.5 tabular-nums text-(--color-text-weak)">{item.pior_nota}</td>
                  <td className="px-5 py-3.5 text-(--color-text-weak)">{formatarData(item.ultima_data)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {itemSelecionado && (
        <div className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-6">
          <h2 className="text-sm font-semibold text-(--color-text)">Detalhamento — {itemSelecionado.nome}</h2>
          {carregandoDetalhe ? (
            <p className="mt-3 text-sm text-(--color-text-weak)">Carregando…</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs font-medium text-(--color-text-dim)">
                    <th className="px-3 py-2">N° AT</th>
                    <th className="px-3 py-2">Disciplina</th>
                    <th className="px-3 py-2">Revisão</th>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Nota</th>
                    <th className="px-3 py-2">Classificação</th>
                    <th className="px-3 py-2">Média Acumulada</th>
                  </tr>
                </thead>
                <tbody>
                  {(detalhe ?? []).map((d, i) => (
                    <tr key={i} className="border-t border-(--color-border) first:border-0">
                      <td className="px-3 py-2 text-(--color-text-weak)">{d.at_referencia || "—"}</td>
                      <td className="px-3 py-2 text-(--color-text-weak)">{d.disciplina || "—"}</td>
                      <td className="px-3 py-2 text-(--color-text-weak)">{d.revisao ?? "—"}</td>
                      <td className="px-3 py-2 text-(--color-text-weak)">{formatarData(d.data_avaliacao)}</td>
                      <td className="px-3 py-2 font-medium tabular-nums text-(--color-text)">{d.pontuacao}</td>
                      <td className="px-3 py-2 text-(--color-text-weak)">{d.classificacao}</td>
                      <td className="px-3 py-2 tabular-nums text-(--color-text-weak)">{formatarNota(d.media_acumulada)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
