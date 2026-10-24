"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CessionarioAtivo } from "@/lib/cessionarios-ativos";

type Linha = { chaveLocal: string; id?: number; categoria: string; quantidade: number };

function paraLinhas(registros: CessionarioAtivo[]): Linha[] {
  return registros.map((r) => ({ chaveLocal: `id-${r.id}`, id: r.id, categoria: r.categoria, quantidade: r.quantidade }));
}

let contadorNovaLinha = 0;

export function PainelCessionariosAtivos({ registros, podeEditar }: { registros: CessionarioAtivo[]; podeEditar: boolean }) {
  const router = useRouter();
  const [linhas, setLinhas] = useState<Linha[]>(() => paraLinhas(registros));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  function atualizarLinha(chave: string, campo: "categoria" | "quantidade", valor: string) {
    setSucesso(false);
    setLinhas((atual) =>
      atual.map((linha) =>
        linha.chaveLocal === chave
          ? { ...linha, [campo]: campo === "quantidade" ? Math.max(0, Number(valor) || 0) : valor }
          : linha,
      ),
    );
  }

  function adicionarLinha() {
    contadorNovaLinha += 1;
    setLinhas((atual) => [...atual, { chaveLocal: `nova-${contadorNovaLinha}`, categoria: "", quantidade: 0 }]);
  }

  function removerLinha(chave: string) {
    setSucesso(false);
    setLinhas((atual) => atual.filter((linha) => linha.chaveLocal !== chave));
  }

  function mover(chave: string, direcao: -1 | 1) {
    setSucesso(false);
    setLinhas((atual) => {
      const indice = atual.findIndex((linha) => linha.chaveLocal === chave);
      const destino = indice + direcao;
      if (indice < 0 || destino < 0 || destino >= atual.length) return atual;
      const copia = [...atual];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
  }

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      const itens = linhas
        .filter((linha) => linha.categoria.trim())
        .map((linha) => ({ id: linha.id, categoria: linha.categoria.trim(), quantidade: linha.quantidade }));
      const resposta = await fetch("/api/cessionarios-ativos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        setErro(corpo.erro ?? "Erro ao salvar a lista.");
        return;
      }
      setSucesso(true);
      router.refresh();
    } catch {
      setErro("Não foi possível conectar ao sistema.");
    } finally {
      setSalvando(false);
    }
  }

  const somaQuantidades = linhas.reduce((total, linha) => total + (linha.categoria.trim() ? linha.quantidade : 0), 0);

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Cessionários Ativos</h1>
      <p className="mt-1 max-w-2xl text-sm text-(--color-text-weak)">
        Lista mantida manualmente — quais categorias de cessionário estão ativas agora e em que quantidade
        (ex.: &quot;Locadora Ext.&quot; = 2). Usada no One Page Report de Cessionários; não é calculada a partir dos
        projetos de análise.
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-(--color-text-dim)">
              <th className="px-5 py-3">Categoria</th>
              <th className="w-36 px-5 py-3">Quantidade</th>
              <th className="w-28 px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-5 py-10 text-center text-(--color-text-weak)">
                  Nenhuma categoria cadastrada ainda.
                </td>
              </tr>
            ) : (
              linhas.map((linha, indice) => (
                <tr key={linha.chaveLocal} className="border-t border-(--color-border) first:border-0">
                  <td className="px-5 py-2.5">
                    <input
                      value={linha.categoria}
                      onChange={(e) => atualizarLinha(linha.chaveLocal, "categoria", e.target.value)}
                      disabled={!podeEditar}
                      placeholder='Ex.: "Locadora Ext."'
                      className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm text-(--color-text) outline-none transition-colors focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/20 disabled:opacity-60"
                    />
                  </td>
                  <td className="px-5 py-2.5">
                    <input
                      type="number"
                      min={0}
                      value={linha.quantidade}
                      onChange={(e) => atualizarLinha(linha.chaveLocal, "quantidade", e.target.value)}
                      disabled={!podeEditar}
                      className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm tabular-nums text-(--color-text) outline-none transition-colors focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/20 disabled:opacity-60"
                    />
                  </td>
                  <td className="px-5 py-2.5">
                    {podeEditar && (
                      <div className="flex items-center justify-end gap-1 text-(--color-text-dim)">
                        <button
                          type="button"
                          onClick={() => mover(linha.chaveLocal, -1)}
                          disabled={indice === 0}
                          className="rounded px-1.5 py-1 hover:bg-(--color-surface-2) hover:text-(--color-text) disabled:opacity-30"
                          aria-label="Mover para cima"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => mover(linha.chaveLocal, 1)}
                          disabled={indice === linhas.length - 1}
                          className="rounded px-1.5 py-1 hover:bg-(--color-surface-2) hover:text-(--color-text) disabled:opacity-30"
                          aria-label="Mover para baixo"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removerLinha(linha.chaveLocal)}
                          className="rounded px-1.5 py-1 hover:bg-(--color-red-bg) hover:text-(--color-red)"
                          aria-label="Remover"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {podeEditar && (
          <div className="border-t border-(--color-border) px-5 py-3">
            <button type="button" onClick={adicionarLinha} className="text-sm font-medium text-(--color-navy) hover:underline">
              + Adicionar categoria
            </button>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-(--color-text-dim)">
        {linhas.filter((l) => l.categoria.trim()).length} categoria(s) — soma das quantidades: {somaQuantidades}.
      </p>

      {erro && <p className="mt-4 rounded-lg bg-(--color-red-bg) px-3.5 py-2.5 text-sm text-(--color-red)">{erro}</p>}
      {sucesso && (
        <p className="mt-4 rounded-lg bg-(--color-green-bg) px-3.5 py-2.5 text-sm text-(--color-green)">
          Lista de Cessionários Ativos atualizada com sucesso.
        </p>
      )}

      {podeEditar && (
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="mt-4 rounded-full bg-(--color-navy) px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      )}
    </div>
  );
}
