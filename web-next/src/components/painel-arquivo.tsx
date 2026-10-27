"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CATEGORIAS,
  aplicarFiltrosArquivo,
  descricaoLinha,
  type FiltrosArquivo,
  type RegistroArquivado,
} from "@/lib/arquivo-calculo";
import type { ProjetoGatArquivado, RegistroAuditoriaArquivo } from "@/lib/arquivo";

const TEXTO_CONFIRMACAO_1 = "Deseja realmente excluir definitivamente este registro?";
const TEXTO_CONFIRMACAO_2 = "Esta operação não poderá ser desfeita. Confirmar novamente?";

function formatarDataHora(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleString("pt-BR");
}

function CartaoAcoes({
  tabela, registroId, podeRestaurar, podeExcluirDefinitivamente,
}: { tabela: string; registroId: number; podeRestaurar: boolean; podeExcluirDefinitivamente: boolean }) {
  const router = useRouter();
  const [modo, setModo] = useState<null | "restaurar" | "excluir1" | "excluir2">(null);
  const [justificativa, setJustificativa] = useState("");
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmarRestaurar() {
    setProcessando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/arquivo/registros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "restaurar", tabela, registroId, justificativa: justificativa.trim() || null }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setErro(corpo?.erro || "Erro ao restaurar registro.");
        return;
      }
      router.refresh();
      setModo(null);
    } finally {
      setProcessando(false);
    }
  }

  async function confirmarExclusao() {
    if (!justificativa.trim()) {
      setErro("Informe a justificativa da exclusão definitiva.");
      return;
    }
    setProcessando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/arquivo/registros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "excluir", tabela, registroId, justificativa: justificativa.trim() }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setErro(corpo?.erro || "Erro ao excluir definitivamente.");
        return;
      }
      router.refresh();
      setModo(null);
    } finally {
      setProcessando(false);
    }
  }

  if (modo === "restaurar") {
    return (
      <div className="mt-3 rounded-xl border border-(--color-border) bg-(--color-bg) p-4">
        <p className="text-xs text-(--color-text-weak)">O registro volta a aparecer nas telas, KPIs e indicadores operacionais normalmente, sem perda de dados.</p>
        <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Justificativa (opcional)" rows={2} className="mt-2 w-full rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
        {erro && <p className="mt-2 text-sm text-(--color-red)">{erro}</p>}
        <div className="mt-2 flex gap-2">
          <button onClick={confirmarRestaurar} disabled={processando} className="rounded-full bg-(--color-navy) px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60">
            {processando ? "Processando…" : "Confirmar restauração"}
          </button>
          <button onClick={() => { setModo(null); setErro(null); }} disabled={processando} className="rounded-full border border-(--color-border) px-4 py-1.5 text-xs font-medium text-(--color-text-weak)">Cancelar</button>
        </div>
      </div>
    );
  }

  if (modo === "excluir1") {
    return (
      <div className="mt-3 rounded-xl border border-(--color-red)/40 bg-(--color-red)/10 p-4">
        <p className="text-sm text-(--color-text)">{TEXTO_CONFIRMACAO_1}</p>
        <div className="mt-2 flex gap-2">
          <button onClick={() => setModo("excluir2")} className="rounded-full bg-(--color-red) px-4 py-1.5 text-xs font-medium text-white">Sim, continuar</button>
          <button onClick={() => setModo(null)} className="rounded-full border border-(--color-border) px-4 py-1.5 text-xs font-medium text-(--color-text-weak)">Cancelar</button>
        </div>
      </div>
    );
  }

  if (modo === "excluir2") {
    return (
      <div className="mt-3 rounded-xl border border-(--color-red)/40 bg-(--color-red)/10 p-4">
        <p className="text-sm font-semibold text-(--color-red)">{TEXTO_CONFIRMACAO_2}</p>
        <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Justificativa da exclusão (obrigatória)" rows={2} className="mt-2 w-full rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
        {erro && <p className="mt-2 text-sm text-(--color-red)">{erro}</p>}
        <div className="mt-2 flex gap-2">
          <button onClick={confirmarExclusao} disabled={processando} className="rounded-full bg-(--color-red) px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60">
            {processando ? "Processando…" : "Confirmar exclusão definitiva"}
          </button>
          <button onClick={() => { setModo(null); setErro(null); }} disabled={processando} className="rounded-full border border-(--color-border) px-4 py-1.5 text-xs font-medium text-(--color-text-weak)">Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex gap-2">
      {podeRestaurar && (
        <button onClick={() => setModo("restaurar")} className="rounded-full border border-(--color-border) px-4 py-1.5 text-xs font-medium text-(--color-navy) hover:bg-(--color-surface-2)">
          Restaurar
        </button>
      )}
      {podeExcluirDefinitivamente && (
        <button onClick={() => setModo("excluir1")} className="rounded-full border border-(--color-red)/40 px-4 py-1.5 text-xs font-medium text-(--color-red) hover:bg-(--color-red)/10">
          Excluir Definitivamente
        </button>
      )}
    </div>
  );
}

function CartaoRegistro({
  tabela, linha, podeRestaurar, podeExcluirDefinitivamente,
}: { tabela: string; linha: RegistroArquivado; podeRestaurar: boolean; podeExcluirDefinitivamente: boolean }) {
  const [aberto, setAberto] = useState(false);
  const descricao = descricaoLinha(tabela, linha);
  let detalhe = `Arquivado em ${formatarDataHora(linha.arquivado_em)} por ${linha.arquivado_por || "—"}`;
  if (linha.motivo_arquivamento) detalhe += ` · Motivo: ${linha.motivo_arquivamento}`;
  if (linha.arquivado_teste) detalhe += " · Registro de teste";

  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
      <button onClick={() => setAberto((v) => !v)} className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left">
        <span className="font-medium text-(--color-text)">{descricao}</span>
        <span className="text-xs text-(--color-text-dim)">{aberto ? "▲" : "▼"}</span>
      </button>
      {aberto && (
        <div className="border-t border-(--color-border) px-5 py-4">
          <p className="text-xs text-(--color-text-weak)">{detalhe}</p>
          <CartaoAcoes tabela={tabela} registroId={linha.id} podeRestaurar={podeRestaurar} podeExcluirDefinitivamente={podeExcluirDefinitivamente} />
        </div>
      )}
    </div>
  );
}

function CartaoProjetoGat({ projeto, podeRestaurar }: { projeto: ProjetoGatArquivado; podeRestaurar: boolean }) {
  const router = useRouter();
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function restaurar() {
    setProcessando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/arquivo/projeto-gat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: projeto.codigo }),
      });
      if (!resposta.ok) {
        setErro("Erro ao restaurar projeto.");
        return;
      }
      router.refresh();
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
      <p className="font-medium text-(--color-text)">Projeto {projeto.codigo}</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">Arquivado em {formatarDataHora(projeto.arquivado_em)}</p>
      {erro && <p className="mt-2 text-sm text-(--color-red)">{erro}</p>}
      {podeRestaurar && (
        <button onClick={restaurar} disabled={processando} className="mt-3 rounded-full border border-(--color-border) px-4 py-1.5 text-xs font-medium text-(--color-navy) hover:bg-(--color-surface-2) disabled:opacity-60">
          {processando ? "Processando…" : "Restaurar projeto"}
        </button>
      )}
    </div>
  );
}

function AbaRegistros({ podeRestaurar, podeExcluirDefinitivamente }: { podeRestaurar: boolean; podeExcluirDefinitivamente: boolean }) {
  const categoriasVisiveis = CATEGORIAS;
  const [categoriaChave, setCategoriaChave] = useState(categoriasVisiveis[0].chave);
  const categoria = categoriasVisiveis.find((c) => c.chave === categoriaChave)!;

  const [registros, setRegistros] = useState<(RegistroArquivado & { _tabela: string })[] | null>(null);
  const [projetos, setProjetos] = useState<ProjetoGatArquivado[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const carregando = !categoria.reservada && registros === null && projetos === null && !erro;

  const [filtros, setFiltros] = useState<FiltrosArquivo>({ texto: "", usuarioFiltro: "", apenasTeste: false, dataDe: null, dataAte: null });

  useEffect(() => {
    if (categoria.reservada) return;
    fetch(`/api/arquivo/registros?categoria=${categoria.chave}`)
      .then((r) => r.json())
      .then((dados) => {
        if (dados.projetos) setProjetos(dados.projetos);
        else setRegistros(dados.registros ?? []);
      })
      .catch(() => setErro("Não foi possível carregar os registros arquivados."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoria.chave]);

  const registrosFiltrados = useMemo(() => (registros ? aplicarFiltrosArquivo(registros, filtros) : []), [registros, filtros]);

  return (
    <div>
      <label className="block max-w-md text-xs text-(--color-text-weak)">
        Categoria (tipo de registro)
        <select value={categoriaChave} onChange={(e) => { setCategoriaChave(e.target.value); setRegistros(null); setProjetos(null); setErro(null); }} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)">
          {categoriasVisiveis.map((c) => <option key={c.chave} value={c.chave}>{c.rotulo}</option>)}
        </select>
      </label>

      {categoria.reservada ? (
        <p className="mt-4 rounded-xl border border-(--color-border) bg-(--color-surface-1) px-4 py-3 text-sm text-(--color-text-weak)">{categoria.mensagemReservada}</p>
      ) : categoria.granularidade === "projeto_codigo" ? (
        <>
          {carregando ? (
            <p className="mt-4 text-xs text-(--color-text-dim)">Carregando…</p>
          ) : erro ? (
            <p className="mt-4 text-sm text-(--color-red)">{erro}</p>
          ) : (
            <>
              <p className="mt-4 text-sm text-(--color-text-weak)">{(projetos ?? []).length} projeto(s) GAT totalmente arquivado(s) (todas as análises de Prestadores e Cessionários daquele código).</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(projetos ?? []).map((p) => <CartaoProjetoGat key={p.codigo} projeto={p} podeRestaurar={podeRestaurar} />)}
              </div>
              <p className="mt-4 text-xs text-(--color-text-dim)">A exclusão definitiva de projetos GAT é feita análise por análise, na categoria &quot;Análises Arquivadas&quot; — evita excluir em lote acidentalmente todo o histórico de um projeto.</p>
            </>
          )}
        </>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input value={filtros.texto} onChange={(e) => setFiltros((f) => ({ ...f, texto: e.target.value }))} placeholder="Buscar (projeto, analista, prestador, cessionário, código...)" className="w-72 rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm outline-none focus:border-(--color-navy)" />
            <input value={filtros.usuarioFiltro} onChange={(e) => setFiltros((f) => ({ ...f, usuarioFiltro: e.target.value }))} placeholder="Usuário que arquivou" className="w-48 rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm outline-none focus:border-(--color-navy)" />
            <label className="flex items-center gap-2 text-xs text-(--color-text-weak)">
              <input type="checkbox" checked={filtros.apenasTeste} onChange={(e) => setFiltros((f) => ({ ...f, apenasTeste: e.target.checked }))} />
              Somente registros de teste
            </label>
          </div>

          {carregando ? (
            <p className="mt-4 text-xs text-(--color-text-dim)">Carregando…</p>
          ) : erro ? (
            <p className="mt-4 text-sm text-(--color-red)">{erro}</p>
          ) : (
            <>
              <p className="mt-4 text-sm text-(--color-text-weak)">{registrosFiltrados.length} registro(s) arquivado(s) com os filtros atuais.</p>
              <div className="mt-3 flex flex-col gap-2">
                {registrosFiltrados.length === 0 ? (
                  <p className="text-sm text-(--color-text-weak)">Nenhum registro arquivado nesta categoria.</p>
                ) : (
                  registrosFiltrados.map((l) => (
                    <CartaoRegistro key={`${l._tabela}-${l.id}`} tabela={l._tabela} linha={l} podeRestaurar={podeRestaurar} podeExcluirDefinitivamente={podeExcluirDefinitivamente} />
                  ))
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function AbaAuditoria() {
  const [tipo, setTipo] = useState("Todas");
  const [origem, setOrigem] = useState("Todas");
  const [registros, setRegistros] = useState<RegistroAuditoriaArquivo[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (tipo !== "Todas") params.set("tipo", tipo);
    if (origem !== "Todas") params.set("origem", origem);
    fetch(`/api/arquivo/auditoria?${params.toString()}`)
      .then((r) => r.json())
      .then((dados) => setRegistros(dados.registros ?? []))
      .catch(() => setErro("Não foi possível carregar a auditoria."))
      .finally(() => setCarregando(false));
  }, [tipo, origem]);

  return (
    <div>
      <p className="text-sm text-(--color-text-weak)">Trilha completa de arquivamentos, restaurações e exclusões definitivas — nunca é apagada.</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
          {["Todas", "ARQUIVAMENTO", "RESTAURACAO", "EXCLUSAO_DEFINITIVA"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={origem} onChange={(e) => setOrigem(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
          {["Todas", "GAT", "PMO"].map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      {carregando ? (
        <p className="mt-4 text-xs text-(--color-text-dim)">Carregando…</p>
      ) : erro || !registros ? (
        <p className="mt-4 text-sm text-(--color-red)">{erro || "Não foi possível carregar a auditoria."}</p>
      ) : registros.length === 0 ? (
        <p className="mt-4 text-sm text-(--color-text-weak)">Nenhuma operação registrada ainda.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="text-xs font-medium text-(--color-text-dim)">
                <th className="px-4 py-3">Data/Hora</th>
                <th className="px-4 py-3">Operação</th>
                <th className="px-4 py-3">Tabela</th>
                <th className="px-4 py-3">Registro</th>
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3">Justificativa</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id} className="border-t border-(--color-border) first:border-0">
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{formatarDataHora(r.data_hora)}</td>
                  <td className="px-4 py-2.5 font-medium text-(--color-text)">{r.tipo_operacao}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{r.tabela}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{r.descricao_registro || "—"}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{r.usuario}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{r.origem || "—"}</td>
                  <td className="px-4 py-2.5 text-(--color-text-weak)">{r.justificativa || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PainelArquivo({ podeRestaurar, podeExcluirDefinitivamente }: { podeRestaurar: boolean; podeExcluirDefinitivamente: boolean }) {
  const [aba, setAba] = useState<"registros" | "auditoria">("registros");

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Arquivo</h1>
      <p className="mt-1 max-w-3xl text-sm text-(--color-text-weak)">
        Registros arquivados saem da operação do dia a dia — não aparecem em listas, dashboards, KPIs, relatórios
        ou alertas ativos — mas continuam guardados e podem ser restaurados a qualquer momento, sem perda de
        dados. A exclusão definitiva só é possível para um registro já arquivado.
      </p>

      <div className="mt-6 flex gap-1 rounded-full border border-(--color-border) bg-(--color-surface-1) p-1 text-sm font-medium w-fit">
        {(["registros", "auditoria"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={`rounded-full px-4 py-1.5 transition-colors ${aba === a ? "bg-(--color-navy) text-white" : "text-(--color-text-weak) hover:text-(--color-text)"}`}
          >
            {a === "registros" ? "Registros Arquivados" : "Auditoria"}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {aba === "registros" ? (
          <AbaRegistros podeRestaurar={podeRestaurar} podeExcluirDefinitivamente={podeExcluirDefinitivamente} />
        ) : (
          <AbaAuditoria />
        )}
      </div>
    </div>
  );
}
