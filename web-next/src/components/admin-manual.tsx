"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfirmacaoLeitura, ManualCapitulo, ManualVersao } from "@/lib/manual-sistema";

const PERFIS_OPCOES = ["ADMIN", "GESTOR", "ANALISTA", "CONSULTA"];

function formatarDataHora(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleString("pt-BR");
}

function SeletorPerfis({ valor, onChange }: { valor: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PERFIS_OPCOES.map((p) => {
        const marcado = valor.includes(p);
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(marcado ? valor.filter((v) => v !== p) : [...valor, p])}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              marcado ? "border-(--color-navy) bg-(--color-navy) text-white" : "border-(--color-border) text-(--color-text-weak) hover:bg-(--color-surface-2)"
            }`}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}

function FormularioCapitulo({
  capitulo,
  onSalvo,
  onCancelar,
}: {
  capitulo?: ManualCapitulo;
  onSalvo: () => void;
  onCancelar?: () => void;
}) {
  const [titulo, setTitulo] = useState(capitulo?.titulo ?? "");
  const [conteudo, setConteudo] = useState(capitulo?.conteudo ?? "");
  const [perfis, setPerfis] = useState<string[]>(capitulo?.perfisVisiveis ? capitulo.perfisVisiveis.split(",").map((p) => p.trim()) : []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!titulo.trim()) {
      setErro("O título é obrigatório.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const corpo = { titulo: titulo.trim(), conteudo, perfisVisiveis: perfis.length ? perfis.join(",") : null };
    const resposta = capitulo
      ? await fetch(`/api/manual/capitulos/${capitulo.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
      : await fetch(`/api/manual/capitulos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    setSalvando(false);
    if (!resposta.ok) {
      const dados = await resposta.json().catch(() => null);
      setErro(dados?.erro || "Erro ao salvar capítulo.");
      return;
    }
    if (!capitulo) {
      setTitulo("");
      setConteudo("");
      setPerfis([]);
    }
    onSalvo();
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-(--color-text-weak)">Título do capítulo *</label>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-(--color-text-weak)">Conteúdo (aceita **negrito** e quebras de linha)</label>
        <textarea
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value)}
          rows={8}
          className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-(--color-text-weak)">Restringir a perfis específicos (vazio = visível a todos)</label>
        <div className="mt-1"><SeletorPerfis valor={perfis} onChange={setPerfis} /></div>
      </div>
      {erro && <p className="text-xs text-(--color-red)">{erro}</p>}
      <div className="flex gap-2">
        <button
          onClick={salvar}
          disabled={salvando}
          className="rounded-full bg-(--color-navy) px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {salvando ? "Salvando…" : "Salvar capítulo"}
        </button>
        {onCancelar && (
          <button onClick={onCancelar} className="rounded-full border border-(--color-border) px-4 py-2 text-sm text-(--color-text-weak) hover:bg-(--color-surface-2)">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

export function AdminManual({
  capitulos,
  versoes,
  versaoAtivaNumero,
  confirmacoes,
}: {
  capitulos: ManualCapitulo[];
  versoes: ManualVersao[];
  versaoAtivaNumero: number | null;
  confirmacoes: ConfirmacaoLeitura[];
}) {
  const router = useRouter();
  const [aba, setAba] = useState<"capitulos" | "versoes">("capitulos");
  const [criandoNovo, setCriandoNovo] = useState(false);
  const [notas, setNotas] = useState("");
  const [publicando, setPublicando] = useState(false);
  const [erroPublicar, setErroPublicar] = useState<string | null>(null);

  const idsOrdenados = capitulos.map((c) => c.id);

  async function mover(capituloId: number, direcao: -1 | 1) {
    const indice = idsOrdenados.indexOf(capituloId);
    const alvo = indice + direcao;
    if (alvo < 0 || alvo >= idsOrdenados.length) return;
    const nova = [...idsOrdenados];
    [nova[indice], nova[alvo]] = [nova[alvo], nova[indice]];
    await fetch(`/api/manual/capitulos/reordenar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ordemIds: nova }) });
    router.refresh();
  }

  async function publicarVersao() {
    setPublicando(true);
    setErroPublicar(null);
    const resposta = await fetch(`/api/manual/versoes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notas }) });
    setPublicando(false);
    if (!resposta.ok) {
      setErroPublicar("Erro ao publicar nova versão.");
      return;
    }
    setNotas("");
    router.refresh();
  }

  return (
    <div className="mt-10 border-t border-(--color-border) pt-8">
      <h2 className="text-lg font-semibold text-(--color-text)">Administração do Manual</h2>

      <div className="mt-4 flex gap-1 rounded-full border border-(--color-border) bg-(--color-surface-1) p-1 text-sm font-medium w-fit">
        {(["capitulos", "versoes"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={`rounded-full px-4 py-1.5 transition-colors ${aba === a ? "bg-(--color-navy) text-white" : "text-(--color-text-weak) hover:text-(--color-text)"}`}
          >
            {a === "capitulos" ? "Capítulos" : "Versões e leitura"}
          </button>
        ))}
      </div>

      {aba === "capitulos" ? (
        <div className="mt-5">
          <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
            <button onClick={() => setCriandoNovo((v) => !v)} className="text-sm font-medium text-(--color-navy)">
              {criandoNovo ? "Fechar" : "+ Novo capítulo"}
            </button>
            {criandoNovo && (
              <div className="mt-4">
                <FormularioCapitulo onSalvo={() => { setCriandoNovo(false); router.refresh(); }} />
              </div>
            )}
          </div>

          <div className="mt-4 space-y-3">
            {capitulos.map((c, i) => (
              <div key={c.id} className="rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
                <CapituloExpandivel capitulo={c} primeiro={i === 0} ultimo={i === capitulos.length - 1} onMover={mover} onMudou={() => router.refresh()} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-8">
          <div>
            <p className="text-sm font-semibold text-(--color-text)">Publicar nova versão</p>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Notas da nova versão (o que mudou)"
              rows={3}
              className="mt-2 w-full max-w-xl rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)"
            />
            <div className="mt-2">
              <button
                onClick={publicarVersao}
                disabled={publicando}
                className="rounded-full bg-(--color-navy) px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {publicando ? "Publicando…" : "Publicar nova versão"}
              </button>
            </div>
            {erroPublicar && <p className="mt-2 text-xs text-(--color-red)">{erroPublicar}</p>}
          </div>

          <div>
            <p className="text-sm font-semibold text-(--color-text)">Histórico de versões</p>
            <div className="mt-2 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="text-xs font-medium text-(--color-text-dim)">
                    <th className="px-4 py-3">Versão</th>
                    <th className="px-4 py-3">Notas</th>
                    <th className="px-4 py-3">Publicado em</th>
                    <th className="px-4 py-3">Publicado por</th>
                    <th className="px-4 py-3">Ativa</th>
                  </tr>
                </thead>
                <tbody>
                  {versoes.map((v) => (
                    <tr key={v.id} className="border-t border-(--color-border)">
                      <td className="px-4 py-2.5 text-(--color-text)">{v.numeroVersao}</td>
                      <td className="px-4 py-2.5 text-(--color-text-weak)">{v.notas || "—"}</td>
                      <td className="px-4 py-2.5 text-(--color-text-weak)">{formatarDataHora(v.publicadoEm)}</td>
                      <td className="px-4 py-2.5 text-(--color-text-weak)">{v.publicadoPor}</td>
                      <td className="px-4 py-2.5 text-(--color-text-weak)">{v.ativa ? "Sim" : "Não"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-(--color-text)">Confirmações de leitura</p>
            <p className="mt-1 text-xs text-(--color-text-weak)">
              {confirmacoes.length} usuário(s) confirmaram a leitura da versão {versaoAtivaNumero ?? "—"}.
            </p>
            <div className="mt-2 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
              <table className="w-full min-w-[400px] text-left text-sm">
                <thead>
                  <tr className="text-xs font-medium text-(--color-text-dim)">
                    <th className="px-4 py-3">Usuário</th>
                    <th className="px-4 py-3">Versão</th>
                    <th className="px-4 py-3">Confirmado em</th>
                  </tr>
                </thead>
                <tbody>
                  {confirmacoes.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-(--color-text-weak)">Nenhuma confirmação ainda.</td></tr>
                  ) : (
                    confirmacoes.map((c) => (
                      <tr key={c.id} className="border-t border-(--color-border)">
                        <td className="px-4 py-2.5 text-(--color-text)">{c.usuario}</td>
                        <td className="px-4 py-2.5 text-(--color-text-weak)">{c.versao}</td>
                        <td className="px-4 py-2.5 text-(--color-text-weak)">{formatarDataHora(c.confirmadoEm)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CapituloExpandivel({
  capitulo,
  primeiro,
  ultimo,
  onMover,
  onMudou,
}: {
  capitulo: ManualCapitulo;
  primeiro: boolean;
  ultimo: boolean;
  onMover: (id: number, direcao: -1 | 1) => void;
  onMudou: () => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  async function excluir() {
    if (!confirm(`Excluir o capítulo "${capitulo.titulo}"? Esta ação não pode ser desfeita.`)) return;
    setExcluindo(true);
    const resposta = await fetch(`/api/manual/capitulos/${capitulo.id}`, { method: "DELETE" });
    setExcluindo(false);
    if (resposta.ok) onMudou();
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button onClick={() => setExpandido((v) => !v)} className="flex-1 text-left text-sm font-medium text-(--color-text)">
          {capitulo.ordem}. {capitulo.titulo}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={() => onMover(capitulo.id, -1)} disabled={primeiro} className="rounded-full border border-(--color-border) px-2.5 py-1.5 text-xs text-(--color-text-weak) hover:bg-(--color-surface-2) disabled:opacity-30" title="Mover para cima">↑</button>
          <button onClick={() => onMover(capitulo.id, 1)} disabled={ultimo} className="rounded-full border border-(--color-border) px-2.5 py-1.5 text-xs text-(--color-text-weak) hover:bg-(--color-surface-2) disabled:opacity-30" title="Mover para baixo">↓</button>
          <button onClick={excluir} disabled={excluindo} className="rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-red) hover:bg-(--color-surface-2) disabled:opacity-50">
            {excluindo ? "Excluindo…" : "Excluir"}
          </button>
        </div>
      </div>
      {expandido && (
        <div className="border-t border-(--color-border) px-4 py-4">
          <FormularioCapitulo capitulo={capitulo} onSalvo={() => { setExpandido(false); onMudou(); }} onCancelar={() => setExpandido(false)} />
        </div>
      )}
    </>
  );
}
