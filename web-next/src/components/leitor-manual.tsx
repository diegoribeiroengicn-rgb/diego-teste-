"use client";

import { useMemo, useState } from "react";
import type { ManualCapitulo, ManualVersao } from "@/lib/manual-sistema";

function formatarData(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString("pt-BR");
}

/** Suporte mínimo a **negrito** e quebras de linha — o manual não precisa
 * de um parser Markdown completo, só do que os capítulos de fato usam. */
function ConteudoFormatado({ texto }: { texto: string }) {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-(--color-text)">
      {partes.map((parte, i) =>
        parte.startsWith("**") && parte.endsWith("**") ? (
          <strong key={i}>{parte.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{parte}</span>
        ),
      )}
    </p>
  );
}

export function LeitorManual({
  capitulos,
  versaoAtiva,
  jaConfirmou,
}: {
  capitulos: ManualCapitulo[];
  versaoAtiva: ManualVersao | null;
  jaConfirmou: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [capituloId, setCapituloId] = useState(capitulos[0]?.id ?? null);
  const [confirmado, setConfirmado] = useState(jaConfirmou);
  const [confirmando, setConfirmando] = useState(false);
  const [erroConfirmar, setErroConfirmar] = useState(false);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return capitulos;
    return capitulos.filter(
      (c) => c.titulo.toLowerCase().includes(termo) || (c.conteudo || "").toLowerCase().includes(termo),
    );
  }, [capitulos, busca]);

  const capituloAtivo = filtrados.find((c) => c.id === capituloId) ?? filtrados[0] ?? null;

  async function confirmarLeitura() {
    setConfirmando(true);
    setErroConfirmar(false);
    try {
      const resposta = await fetch("/api/manual/confirmar-leitura", { method: "POST" });
      if (!resposta.ok) {
        setErroConfirmar(true);
        return;
      }
      setConfirmado(true);
    } catch {
      setErroConfirmar(true);
    } finally {
      setConfirmando(false);
    }
  }

  if (capitulos.length === 0) {
    return <p className="mt-6 text-sm text-(--color-text-weak)">Nenhum capítulo cadastrado ainda.</p>;
  }

  return (
    <div>
      {versaoAtiva && (
        <p className="mt-1 text-sm text-(--color-text-weak)">
          Versão {versaoAtiva.numeroVersao} · Publicado em {formatarData(versaoAtiva.publicadoEm)} por {versaoAtiva.publicadoPor}
        </p>
      )}

      {versaoAtiva && !confirmado && (
        <div className="mt-4 rounded-2xl border-2 border-(--color-gold) bg-(--color-surface-1) px-5 py-4">
          <p className="text-sm text-(--color-text)">
            Esta é a versão {versaoAtiva.numeroVersao} do Manual do Sistema. Leia o conteúdo relevante para o seu
            perfil e confirme a leitura.
          </p>
          <button
            onClick={confirmarLeitura}
            disabled={confirmando}
            className="mt-3 rounded-full bg-(--color-navy) px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {confirmando ? "Confirmando…" : "Li e estou ciente"}
          </button>
          {erroConfirmar && <p className="mt-2 text-xs text-(--color-red)">Falha ao confirmar — tente novamente.</p>}
        </div>
      )}

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Pesquisar no manual… (ex.: SLA, avaliação, backup)"
        className="mt-5 w-full max-w-md rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/15"
      />

      {filtrados.length === 0 ? (
        <p className="mt-6 text-sm text-(--color-text-weak)">Nenhum capítulo encontrado para a pesquisa.</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
          <nav className="space-y-0.5">
            {filtrados.map((c) => (
              <button
                key={c.id}
                onClick={() => setCapituloId(c.id)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  capituloAtivo?.id === c.id
                    ? "bg-(--color-blue-3) font-medium text-(--color-navy)"
                    : "text-(--color-text-weak) hover:bg-(--color-surface-2) hover:text-(--color-text)"
                }`}
              >
                {c.ordem}. {c.titulo}
              </button>
            ))}
          </nav>

          {capituloAtivo && (
            <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-6">
              <h2 className="text-lg font-semibold text-(--color-text)">{capituloAtivo.titulo}</h2>
              <div className="mt-3">
                {capituloAtivo.conteudo?.trim() ? (
                  <ConteudoFormatado texto={capituloAtivo.conteudo} />
                ) : (
                  <p className="text-sm italic text-(--color-text-weak)">Sem conteúdo cadastrado.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
