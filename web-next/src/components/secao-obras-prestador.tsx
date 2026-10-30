"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { STATUS_OBRA_OPCOES, nomeExibicaoObra, type DadosObraPrestador, type StatusObra } from "@/lib/obra-calculo";
import type { ObraPrestador } from "@/lib/obra";

const inputClasse = "mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)";
const labelClasse = "text-xs text-(--color-text-weak)";

function dadosVazios(prestadorId: number): DadosObraPrestador {
  return { prestador_id: prestadorId, nome_obra: "", codigo_referencia: null, status: "ATIVA", e_canteiro: false, observacoes: null };
}

/** Pop-up "Obra / Área Vinculada" — porta de
 * gat/ui/modals_cadastro.py::dialog_obra_prestador. */
function FormularioObra({
  prestadorId, registro, onFechar, onSalvo,
}: {
  prestadorId: number;
  registro: ObraPrestador | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [dados, setDados] = useState<DadosObraPrestador>(() => (registro ? { ...registro } : dadosVazios(prestadorId)));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function campo<K extends keyof DadosObraPrestador>(chave: K, valor: DadosObraPrestador[K]) {
    setDados((atual) => ({ ...atual, [chave]: valor }));
  }

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      const url = registro ? `/api/obras-prestador/${registro.id}` : "/api/obras-prestador";
      const resposta = await fetch(url, {
        method: registro ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(resultado?.erro || "Erro ao salvar a obra.");
        return;
      }
      onSalvo();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onFechar}>
      <div className="w-full max-w-lg rounded-2xl bg-(--color-surface-1) p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-(--color-text)">{registro ? "Editar obra" : "Obra / Área Vinculada"}</p>
        <p className="mt-1 text-xs text-(--color-text-weak)">
          Obras marcadas como canteiro são exibidas como &quot;CANTEIRO – &lt;nome da obra&gt;&quot; em todo o sistema, sem
          alterar o nome original cadastrado aqui.
        </p>

        <label className={`mt-4 block ${labelClasse}`}>
          Nome da obra *
          <input value={dados.nome_obra} onChange={(e) => campo("nome_obra", e.target.value)} className={inputClasse} />
        </label>
        <label className={`mt-3 block ${labelClasse}`}>
          Código ou referência (quando existir)
          <input value={dados.codigo_referencia ?? ""} onChange={(e) => campo("codigo_referencia", e.target.value || null)} className={inputClasse} />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className={labelClasse}>
            Status
            <select value={dados.status} onChange={(e) => campo("status", e.target.value as StatusObra)} className={inputClasse}>
              {STATUS_OBRA_OPCOES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="mt-6 flex items-center gap-2 text-sm text-(--color-text)">
            <input type="checkbox" checked={dados.e_canteiro} onChange={(e) => campo("e_canteiro", e.target.checked)} />
            É canteiro?
          </label>
        </div>
        {dados.e_canteiro && dados.nome_obra.trim() && (
          <p className="mt-2 text-xs text-(--color-text-weak)">Nome de exibição: <strong>CANTEIRO – {dados.nome_obra.trim()}</strong></p>
        )}
        <label className={`mt-3 block ${labelClasse}`}>
          Observações
          <textarea value={dados.observacoes ?? ""} onChange={(e) => campo("observacoes", e.target.value || null)} rows={2} className={inputClasse} />
        </label>

        {erro && <p className="mt-3 text-sm text-(--color-red)">{erro}</p>}
        <div className="mt-5 flex gap-3">
          <button onClick={salvar} disabled={salvando} className="rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          <button onClick={onFechar} className="rounded-full border border-(--color-border) px-5 py-2 text-sm font-medium text-(--color-text)">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Obras / Áreas Vinculadas" — porta de views/cadastro_prestadores.py
 * (seção dentro da edição de um Cadastro de Prestador). */
export function SecaoObrasPrestador({ prestadorId, obrasIniciais, podeEditar }: { prestadorId: number; obrasIniciais: ObraPrestador[]; podeEditar: boolean }) {
  const router = useRouter();
  const obras = obrasIniciais;
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<ObraPrestador | null>(null);

  return (
    <div className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-(--color-navy)">Obras / Áreas Vinculadas</p>
        {podeEditar && (
          <button onClick={() => setCriando(true)} className="rounded-full bg-(--color-navy) px-4 py-1.5 text-xs font-medium text-white">
            Adicionar nova obra
          </button>
        )}
      </div>

      {obras.length === 0 ? (
        <p className="mt-3 text-xs text-(--color-text-weak)">Nenhuma obra cadastrada para este prestador.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {obras.map((obra) => (
            <details key={obra.id} className="rounded-xl border border-(--color-border) px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-(--color-text)">
                {obra.e_canteiro ? "🏗️" : "🏠"} {nomeExibicaoObra(obra)} · {obra.status}
              </summary>
              <p className="mt-2 text-xs text-(--color-text-weak)">{obra.observacoes || "Sem observações."}</p>
              {podeEditar && (
                <button onClick={() => setEditando(obra)} className="mt-2 rounded-full border border-(--color-border) px-3 py-1 text-xs font-medium text-(--color-text) hover:bg-(--color-surface-2)">
                  Editar obra
                </button>
              )}
            </details>
          ))}
        </div>
      )}

      {criando && (
        <FormularioObra
          prestadorId={prestadorId} registro={null}
          onFechar={() => setCriando(false)}
          onSalvo={() => { setCriando(false); router.refresh(); }}
        />
      )}
      {editando && (
        <FormularioObra
          prestadorId={prestadorId} registro={editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
