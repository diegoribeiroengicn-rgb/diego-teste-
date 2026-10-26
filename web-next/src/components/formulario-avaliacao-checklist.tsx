"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RESPOSTA_CHECKLIST_OPCOES,
  agruparPerguntasPorCategoria,
  classificarChecklist,
  pontuarChecklist,
  type PerguntaChecklist,
  type RespostaChecklist,
  type RespostasChecklist,
  type TipoEntidadeAvaliacao,
} from "@/lib/avaliacao-checklist-calculo";

const classeInput =
  "w-full rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3.5 py-2.5 text-sm text-(--color-text) outline-none transition-colors focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/20";

const COR_CLASSIFICACAO: Record<string, string> = {
  EXCELENTE: "var(--color-green)",
  BOM: "var(--color-sky)",
  REGULAR: "var(--color-gold)",
  BAIXO: "var(--color-orange)",
  "CRÍTICO": "var(--color-red)",
};

function Campo({ label, obrigatorio, children }: { label: string; obrigatorio?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-(--color-text)">
        {label}
        {obrigatorio && <span className="text-(--color-red)"> *</span>}
      </span>
      {children}
    </label>
  );
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function FormularioAvaliacaoChecklist({
  perguntas,
  responsaveis,
}: {
  perguntas: PerguntaChecklist[];
  responsaveis: string[];
}) {
  const router = useRouter();
  const [tipoEntidade, setTipoEntidade] = useState<TipoEntidadeAvaliacao>("PRESTADOR");
  const [nomeEntidade, setNomeEntidade] = useState("");
  const [codigoEntidade, setCodigoEntidade] = useState("");
  const [disciplina, setDisciplina] = useState("");
  const [atReferencia, setAtReferencia] = useState("");
  const [revisao, setRevisao] = useState(1);
  const [analistaResponsavel, setAnalistaResponsavel] = useState("");
  const [dataAvaliacao, setDataAvaliacao] = useState(hojeIso());
  const [nomeProjetista, setNomeProjetista] = useState("");
  const [observacoesGerais, setObservacoesGerais] = useState("");
  const [respostas, setRespostas] = useState<RespostasChecklist>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const categorias = useMemo(() => agruparPerguntasPorCategoria(perguntas), [perguntas]);

  function responder(perguntaId: number, resposta: RespostaChecklist) {
    setRespostas((prev) => ({
      ...prev,
      [perguntaId]: { resposta, justificativa: prev[perguntaId]?.justificativa ?? "" },
    }));
  }

  function justificar(perguntaId: number, justificativa: string) {
    setRespostas((prev) => ({
      ...prev,
      [perguntaId]: { resposta: prev[perguntaId]?.resposta ?? null, justificativa },
    }));
  }

  const pontuacao = pontuarChecklist(respostas);
  const { classificacao, interpretacao, acompanhamento } = classificarChecklist(pontuacao);

  async function salvar() {
    setErro(null);
    setSucesso(null);
    if (!nomeEntidade.trim()) {
      setErro(`Preencha ao menos o nome do ${tipoEntidade === "PRESTADOR" ? "prestador" : "cessionário"}.`);
      return;
    }
    if (tipoEntidade === "CESSIONARIO" && !nomeProjetista.trim()) {
      setErro("Informe o Nome do Projetista antes de salvar.");
      return;
    }
    const naoRespondidas = perguntas.filter((p) => !respostas[p.id]?.resposta);
    if (naoRespondidas.length > 0) {
      setErro(`Responda todas as perguntas do checklist antes de salvar. Pendente(s): ${naoRespondidas.map((p) => p.texto).join("; ")}`);
      return;
    }

    setSalvando(true);
    try {
      const resposta = await fetch("/api/avaliacoes/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoEntidade,
          codigoEntidade: codigoEntidade.trim() || null,
          nomeEntidade: nomeEntidade.trim(),
          disciplina: disciplina.trim() || null,
          atReferencia: atReferencia.trim() || null,
          revisao,
          dataAvaliacao,
          analistaResponsavel: analistaResponsavel || null,
          respostas,
          pontuacao,
          classificacao,
          acompanhamento,
          observacoesGerais: observacoesGerais.trim() || null,
          nomeProjetista: tipoEntidade === "CESSIONARIO" ? nomeProjetista.trim() : null,
        }),
      });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setErro(dados?.erro || "Erro ao salvar avaliação.");
        return;
      }
      setSucesso(
        dados?.atualizado
          ? `Já existia uma avaliação para esta AT/Revisão — o registro existente foi atualizado (nenhuma duplicidade criada).`
          : "Avaliação registrada com sucesso.",
      );
      setNomeEntidade("");
      setCodigoEntidade("");
      setDisciplina("");
      setAtReferencia("");
      setRevisao(1);
      setNomeProjetista("");
      setObservacoesGerais("");
      setRespostas({});
      router.refresh();
    } catch {
      setErro("Erro ao salvar avaliação.");
    } finally {
      setSalvando(false);
    }
  }

  if (perguntas.length === 0) {
    return (
      <p className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4 text-sm text-(--color-text-weak)">
        Nenhuma pergunta de checklist cadastrada ainda — contate a Administração.
      </p>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex gap-1 rounded-full border border-(--color-border) bg-(--color-surface-1) p-1 text-sm font-medium w-fit">
        {(["PRESTADOR", "CESSIONARIO"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTipoEntidade(t)}
            className={`rounded-full px-4 py-1.5 transition-colors ${tipoEntidade === t ? "bg-(--color-navy) text-white" : "text-(--color-text-weak) hover:text-(--color-text)"}`}
          >
            {t === "PRESTADOR" ? "Prestador" : "Cessionário"}
          </button>
        ))}
      </div>

      <p className="mt-4 text-sm text-(--color-text-weak)">
        Checklist de avaliação, preferencialmente utilizado a partir da 1ª revisão. Cada pergunta conta 1 ponto
        quando respondida &quot;Sim&quot; (0 a {perguntas.length} pontos).
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo label={tipoEntidade === "PRESTADOR" ? "Prestador" : "Cessionário"} obrigatorio>
          <input value={nomeEntidade} onChange={(e) => setNomeEntidade(e.target.value)} className={classeInput} />
        </Campo>
        <Campo label={`Código do ${tipoEntidade === "PRESTADOR" ? "Prestador" : "Cessionário"}`}>
          <input value={codigoEntidade} onChange={(e) => setCodigoEntidade(e.target.value)} className={classeInput} />
        </Campo>
        <Campo label="Disciplina">
          <input value={disciplina} onChange={(e) => setDisciplina(e.target.value)} className={classeInput} />
        </Campo>
        <Campo label="N° AT de referência">
          <input value={atReferencia} onChange={(e) => setAtReferencia(e.target.value)} className={classeInput} />
        </Campo>
        <Campo label="Revisão avaliada">
          <input type="number" min={0} value={revisao} onChange={(e) => setRevisao(Math.max(0, Number(e.target.value) || 0))} className={classeInput} />
        </Campo>
        <Campo label="Analista responsável">
          <select value={analistaResponsavel} onChange={(e) => setAnalistaResponsavel(e.target.value)} className={classeInput}>
            <option value="">—</option>
            {responsaveis.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Campo>
        <Campo label="Data da avaliação">
          <input type="date" value={dataAvaliacao} onChange={(e) => setDataAvaliacao(e.target.value)} className={classeInput} />
        </Campo>
        {tipoEntidade === "CESSIONARIO" && (
          <Campo label="Nome do Projetista" obrigatorio>
            <input
              value={nomeProjetista}
              onChange={(e) => setNomeProjetista(e.target.value)}
              className={classeInput}
              placeholder="Profissional/escritório responsável pelo projeto avaliado"
            />
          </Campo>
        )}
      </div>

      <p className="mt-8 text-sm font-semibold text-(--color-text)">Checklist</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">Todas as perguntas devem ser respondidas antes de salvar — nenhuma vem pré-marcada.</p>

      <div className="mt-4 space-y-4">
        {categorias.map(([categoria, itens]) => (
          <div key={categoria} className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
            <p className="text-sm font-semibold text-(--color-navy)">{categoria}</p>
            <div className="mt-3 space-y-3">
              {itens.map((p) => {
                const atual = respostas[p.id];
                return (
                  <div key={p.id} className="border-t border-(--color-border) pt-3 first:border-0 first:pt-0">
                    <p className="text-sm text-(--color-text)">{p.texto}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-4">
                      <div className="flex gap-1 rounded-full border border-(--color-border) p-1 text-xs font-medium">
                        {RESPOSTA_CHECKLIST_OPCOES.map((opcao) => (
                          <button
                            key={opcao}
                            onClick={() => responder(p.id, opcao)}
                            className={`rounded-full px-3 py-1.5 transition-colors ${
                              atual?.resposta === opcao ? "bg-(--color-navy) text-white" : "text-(--color-text-weak) hover:bg-(--color-surface-2)"
                            }`}
                          >
                            {opcao}
                          </button>
                        ))}
                      </div>
                      <input
                        value={atual?.justificativa ?? ""}
                        onChange={(e) => justificar(p.id, e.target.value)}
                        placeholder="Justificativa/observação (opcional)"
                        className="min-w-[220px] flex-1 rounded-full border border-(--color-border) bg-(--color-bg) px-3.5 py-1.5 text-xs text-(--color-text) outline-none focus:border-(--color-navy)"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Campo label="Observações gerais">
        <textarea value={observacoesGerais} onChange={(e) => setObservacoesGerais(e.target.value)} rows={3} className={`mt-6 ${classeInput}`} />
      </Campo>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-xl font-semibold tabular-nums text-(--color-text)">{pontuacao} / {perguntas.length}</p>
          <p className="mt-1 text-xs text-(--color-text-weak)">Pontuação</p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-xl font-semibold" style={{ color: COR_CLASSIFICACAO[classificacao] ?? "var(--color-text)" }}>{classificacao}</p>
          <p className="mt-1 text-xs text-(--color-text-weak)">Classificação</p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-sm font-medium text-(--color-text)">{acompanhamento}</p>
          <p className="mt-1 text-xs text-(--color-text-weak)">Acompanhamento</p>
        </div>
      </div>
      {interpretacao && <p className="mt-2 text-xs text-(--color-text-dim)">{interpretacao}</p>}

      {erro && <p className="mt-4 text-sm text-(--color-red)">{erro}</p>}
      {sucesso && <p className="mt-4 text-sm text-(--color-green)">{sucesso}</p>}

      <button
        onClick={salvar}
        disabled={salvando}
        className="mt-4 rounded-full bg-(--color-navy) px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {salvando ? "Salvando…" : "Salvar avaliação"}
      </button>
    </div>
  );
}
