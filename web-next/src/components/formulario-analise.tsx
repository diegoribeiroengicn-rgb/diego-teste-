"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  DISCIPLINAS_SLA, STATUS_ANALISE_OPCOES, TIPO_CESSIONARIO_OPCOES, ETG_OPCOES, RESPONSAVEIS,
} from "@/lib/administracao-calculo";
import { calcularDataLimite } from "@/lib/dias-uteis";
import { calcularSlaCessionario, SLA_PRESTADORES_DIAS_UTEIS } from "@/lib/analise-validacao-calculo";
import { nomeExibicaoObra } from "@/lib/obra-calculo";
import type { ObraPrestador } from "@/lib/obra";
import type { DadosCessionario, DadosPrestador } from "@/lib/analise";

const classeInput =
  "w-full rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3.5 py-2.5 text-sm text-(--color-text) outline-none transition-colors focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/20";

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

type RegistroPrestador = DadosPrestador & { id: number };
type RegistroCessionario = DadosCessionario & { id: number };

/** Formulário de cadastro/edição de análise (Prestadores ou Cessionários)
 * — primeiro incremento (ver lib/analise.ts para o escopo reduzido desta
 * versão: vínculo a Cadastro, Obra vinculada, prioridade/SLA reduzido e
 * repactuação de prazo ficam para um próximo incremento). */
export function FormularioAnalise(
  props:
    | { tabela: "prestadores"; registro?: RegistroPrestador }
    | { tabela: "cessionarios"; registro?: RegistroCessionario },
) {
  const { tabela, registro } = props;
  const router = useRouter();

  const [codigo, setCodigo] = useState(registro?.codigo ?? "");
  const [nomeEntidade, setNomeEntidade] = useState(
    tabela === "prestadores" ? (registro as RegistroPrestador | undefined)?.prestador ?? "" : (registro as RegistroCessionario | undefined)?.cessionario ?? "",
  );
  const [disciplina, setDisciplina] = useState(registro?.disciplina ?? "");
  const [disciplinaSla, setDisciplinaSla] = useState(registro?.disciplina_sla ?? "");
  const [peps, setPeps] = useState((registro as RegistroPrestador | undefined)?.peps ?? "");
  const [obraReferencia, setObraReferencia] = useState((registro as RegistroPrestador | undefined)?.obra_referencia ?? "");
  const [obraId, setObraId] = useState<number | null>((registro as RegistroPrestador | undefined)?.obra_id ?? null);
  const [obrasDisponiveis, setObrasDisponiveis] = useState<ObraPrestador[]>([]);
  const [tipoCessionario, setTipoCessionario] = useState((registro as RegistroCessionario | undefined)?.tipo ?? TIPO_CESSIONARIO_OPCOES[0]);
  const [revisao, setRevisao] = useState(registro?.revisao ?? 0);
  const [numDocumentos, setNumDocumentos] = useState(registro?.num_documentos ?? 1);
  const [dataSolicitacao, setDataSolicitacao] = useState(registro?.data_solicitacao?.slice(0, 10) ?? "");
  const [dataAnalise, setDataAnalise] = useState(registro?.data_analise?.slice(0, 10) ?? "");
  const [holdInicio, setHoldInicio] = useState(registro?.hold_inicio?.slice(0, 10) ?? "");
  const [holdFim, setHoldFim] = useState(registro?.hold_fim?.slice(0, 10) ?? "");
  const [numAt, setNumAt] = useState(registro?.num_at ?? "");
  const [revisaoAt, setRevisaoAt] = useState(registro?.revisao_at?.toString() ?? "");
  const [responsavel, setResponsavel] = useState(registro?.responsavel ?? "");
  const [statusAnalise, setStatusAnalise] = useState(registro?.status_analise ?? "EM ANÁLISE");
  const [observacoes, setObservacoes] = useState(registro?.observacoes ?? "");
  const [naturezaRevisao, setNaturezaRevisao] = useState(registro?.natureza_revisao ?? "");
  const [numErros, setNumErros] = useState(registro?.num_erros?.toString() ?? "");
  const [etg, setEtg] = useState(registro?.etg ?? ETG_OPCOES[0]);

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const slaDiasUteis = tabela === "prestadores" ? SLA_PRESTADORES_DIAS_UTEIS : calcularSlaCessionario(tipoCessionario, revisao);
  const dataLimiteSugerida = useMemo(() => {
    const d = calcularDataLimite(dataSolicitacao || null, slaDiasUteis);
    return d ? d.toISOString().slice(0, 10) : "";
  }, [dataSolicitacao, slaDiasUteis]);

  // Busca as obras do Cadastro de Prestador com este código — vínculo
  // "leve" por código (não exige um seletor de cadastro próprio, ainda
  // não construído nesta versão do formulário de análise).
  useEffect(() => {
    if (tabela !== "prestadores" || !codigo.trim()) return;
    const controlador = new AbortController();
    const temporizador = setTimeout(() => {
      fetch(`/api/obras-prestador?codigo=${encodeURIComponent(codigo.trim())}`, { signal: controlador.signal })
        .then((r) => r.json())
        .then((corpo) => setObrasDisponiveis(corpo.obras ?? []))
        .catch(() => {});
    }, 400);
    return () => {
      clearTimeout(temporizador);
      controlador.abort();
    };
  }, [tabela, codigo]);

  const obrasExibidas = tabela === "prestadores" && codigo.trim() ? obrasDisponiveis : [];

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!nomeEntidade.trim() || !dataSolicitacao) {
      setErro(`Preencha ao menos ${tabela === "prestadores" ? "Prestador de Serviço" : "Cessionário"} e Data de Solicitação.`);
      return;
    }
    setCarregando(true);

    const base = {
      codigo: codigo.trim() || null,
      disciplina: disciplina.trim() || null,
      disciplina_sla: disciplinaSla.trim() || null,
      revisao: Number(revisao) || 0,
      num_documentos: Number(numDocumentos) || 1,
      data_solicitacao: dataSolicitacao,
      data_limite: dataLimiteSugerida || null,
      data_analise: dataAnalise || null,
      hold_inicio: holdInicio || null,
      hold_fim: holdFim || null,
      num_at: numAt.trim() || null,
      revisao_at: revisaoAt ? Number(revisaoAt) : null,
      responsavel: responsavel.trim() || null,
      status_analise: statusAnalise,
      observacoes: observacoes.trim() || null,
      natureza_revisao: naturezaRevisao.trim() || null,
      num_erros: numErros ? Number(numErros) : null,
      etg,
    };

    const dados =
      tabela === "prestadores"
        ? { ...base, prestador: nomeEntidade.trim(), peps: peps.trim() || null, obra_referencia: obraReferencia.trim() || null, obra_id: obraId }
        : { ...base, cessionario: nomeEntidade.trim(), tipo: tipoCessionario, sla_dias: slaDiasUteis };

    try {
      const url = registro ? `/api/analises/${tabela}/${registro.id}` : `/api/analises/${tabela}`;
      const resposta = await fetch(url, {
        method: registro ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(corpo.erro ?? "Erro ao salvar a análise.");
        return;
      }
      router.push(`/${tabela}/projetos`);
      router.refresh();
    } catch {
      setErro("Não foi possível conectar ao sistema.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">
        {registro ? `Editar análise — ${registro.codigo || nomeEntidade}` : `Nova análise — ${tabela === "prestadores" ? "Prestador" : "Cessionário"}`}
      </h1>
      <p className="mt-1 text-sm text-(--color-text-weak)">
        Escopo deste primeiro incremento: vínculo completo a Cadastro, nível de prioridade/SLA reduzido e repactuação de prazo ainda não estão disponíveis aqui — a Obra Vinculada já pode ser selecionada pelo código do prestador, cadastrado em Prestadores &gt; Cadastro.
      </p>

      <form onSubmit={salvar} className="mt-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Código">
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} className={classeInput} placeholder="Ex.: P245" />
          </Campo>
          <Campo label={tabela === "prestadores" ? "Prestador de Serviço" : "Cessionário"} obrigatorio>
            <input value={nomeEntidade} onChange={(e) => setNomeEntidade(e.target.value)} required className={classeInput} />
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="Disciplina">
            <input value={disciplina} onChange={(e) => setDisciplina(e.target.value)} className={classeInput} />
          </Campo>
          <Campo label="Disciplina (SLA)">
            <select value={disciplinaSla} onChange={(e) => setDisciplinaSla(e.target.value)} className={classeInput}>
              <option value="">—</option>
              {DISCIPLINAS_SLA.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Campo>
        </div>

        {tabela === "prestadores" ? (
          <div className="grid grid-cols-3 gap-4">
            <Campo label="PEPs">
              <input value={peps} onChange={(e) => setPeps(e.target.value)} className={classeInput} />
            </Campo>
            <Campo label="Obra / Referência">
              <input value={obraReferencia} onChange={(e) => setObraReferencia(e.target.value)} className={classeInput} />
            </Campo>
            <Campo label="Obra Vinculada (do Cadastro, por código)">
              <select
                value={obraId ?? ""} onChange={(e) => setObraId(e.target.value ? Number(e.target.value) : null)}
                disabled={!obrasExibidas.length} className={`${classeInput} ${!obrasExibidas.length ? "opacity-60" : ""}`}
              >
                <option value="">—</option>
                {obrasExibidas.map((o) => <option key={o.id} value={o.id}>{nomeExibicaoObra(o)}</option>)}
              </select>
              {!obrasExibidas.length && (
                <span className="mt-1 block text-xs text-(--color-text-dim)">
                  {codigo.trim() ? "Nenhuma obra cadastrada para este código no Cadastro de Prestadores." : "Informe o Código para ver as obras cadastradas."}
                </span>
              )}
            </Campo>
          </div>
        ) : (
          <Campo label="Tipo">
            <select value={tipoCessionario ?? ""} onChange={(e) => setTipoCessionario(e.target.value)} className={classeInput}>
              {TIPO_CESSIONARIO_OPCOES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
        )}

        <div className="grid grid-cols-3 gap-4">
          <Campo label="Revisão" obrigatorio>
            <input type="number" min={0} value={revisao} onChange={(e) => setRevisao(Number(e.target.value))} className={classeInput} />
          </Campo>
          <Campo label="N° de Documentos" obrigatorio>
            <input type="number" min={1} value={numDocumentos} onChange={(e) => setNumDocumentos(Number(e.target.value))} className={classeInput} />
          </Campo>
          <Campo label="SLA (dias úteis)">
            <input disabled value={slaDiasUteis} className={`${classeInput} opacity-60`} />
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="Data de Solicitação" obrigatorio>
            <input type="date" value={dataSolicitacao} onChange={(e) => setDataSolicitacao(e.target.value)} required className={classeInput} />
          </Campo>
          <Campo label="Data Limite (sugerida pelo SLA)">
            <input disabled value={dataLimiteSugerida ? new Date(dataLimiteSugerida).toLocaleDateString("pt-BR") : "—"} className={`${classeInput} opacity-60`} />
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="Início do Hold">
            <input type="date" value={holdInicio} onChange={(e) => setHoldInicio(e.target.value)} className={classeInput} />
          </Campo>
          <Campo label="Fim do Hold">
            <input type="date" value={holdFim} onChange={(e) => setHoldFim(e.target.value)} className={classeInput} />
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="Status da Análise" obrigatorio>
            <select value={statusAnalise} onChange={(e) => setStatusAnalise(e.target.value)} className={classeInput}>
              {STATUS_ANALISE_OPCOES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Campo>
          <Campo label="Data da Análise">
            <input type="date" value={dataAnalise} onChange={(e) => setDataAnalise(e.target.value)} className={classeInput} />
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="N° da AT">
            <input value={numAt} onChange={(e) => setNumAt(e.target.value)} className={classeInput} placeholder="Ex.: 0210" />
          </Campo>
          <Campo label="Revisão da AT">
            <input type="number" min={0} value={revisaoAt} onChange={(e) => setRevisaoAt(e.target.value)} className={classeInput} />
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="Responsável">
            <select value={responsavel ?? ""} onChange={(e) => setResponsavel(e.target.value)} className={classeInput}>
              <option value="">—</option>
              {RESPONSAVEIS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Campo>
          <Campo label="ETG">
            <select value={etg} onChange={(e) => setEtg(e.target.value)} className={classeInput}>
              {ETG_OPCOES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="Natureza da Revisão">
            <input value={naturezaRevisao} onChange={(e) => setNaturezaRevisao(e.target.value)} className={classeInput} />
          </Campo>
          <Campo label="N° de Erros">
            <input type="number" min={0} value={numErros} onChange={(e) => setNumErros(e.target.value)} className={classeInput} />
          </Campo>
        </div>

        <Campo label="Observações">
          <textarea value={observacoes ?? ""} onChange={(e) => setObservacoes(e.target.value)} rows={3} className={classeInput} />
        </Campo>

        {erro && <p className="rounded-lg bg-(--color-red-bg) px-3.5 py-2.5 text-sm text-(--color-red)">{erro}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={carregando}
            className="rounded-full bg-(--color-navy) px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {carregando ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/${tabela}/projetos`)}
            className="rounded-full px-6 py-2.5 text-sm font-medium text-(--color-text-weak) hover:bg-(--color-surface-2)"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
