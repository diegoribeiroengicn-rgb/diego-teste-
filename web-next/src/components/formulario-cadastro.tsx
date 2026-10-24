"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Cadastro, TabelaCadastro as TipoTabela } from "@/lib/cadastro";

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

export function FormularioCadastro({ tabela, registro }: { tabela: TipoTabela; registro?: Cadastro }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState(registro?.codigo ?? "");
  const [nomeEmpresa, setNomeEmpresa] = useState(registro?.nome_empresa ?? "");
  const [possuiPep, setPossuiPep] = useState(registro?.possui_pep ?? "NAO");
  const [numeroPep, setNumeroPep] = useState(registro?.numero_pep ?? "");
  const [luc, setLuc] = useState(registro?.luc ?? "");
  const [rvp, setRvp] = useState(registro?.rvp ?? "");
  const [rci, setRci] = useState(registro?.rci ?? "");
  const [responsavel, setResponsavel] = useState(registro?.responsavel ?? "");
  const [telefone, setTelefone] = useState(registro?.telefone ?? "");
  const [email, setEmail] = useState(registro?.email ?? "");
  const [observacoes, setObservacoes] = useState(registro?.observacoes ?? "");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const dados = {
      codigo: codigo.trim().toUpperCase(),
      nome_empresa: nomeEmpresa.trim(),
      possui_pep: possuiPep,
      numero_pep: numeroPep.trim() || null,
      luc: luc.trim() || null,
      rvp: rvp.trim() || null,
      rci: rci.trim() || null,
      responsavel: responsavel.trim() || null,
      telefone: telefone.trim() || null,
      email: email.trim() || null,
      observacoes: observacoes.trim() || null,
    };
    try {
      const url = registro ? `/api/cadastro/${tabela}/${registro.id}` : `/api/cadastro/${tabela}`;
      const resposta = await fetch(url, {
        method: registro ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        setErro(corpo.erro ?? "Erro ao salvar o cadastro.");
        return;
      }
      router.push(`/${tabela}/cadastro`);
      router.refresh();
    } catch {
      setErro("Não foi possível conectar ao sistema.");
    } finally {
      setCarregando(false);
    }
  }

  async function alternarStatus() {
    if (!registro) return;
    setCarregando(true);
    try {
      const resposta = await fetch(`/api/cadastro/${tabela}/${registro.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "alternar_status" }),
      });
      if (resposta.ok) {
        router.push(`/${tabela}/cadastro`);
        router.refresh();
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">
        {registro ? `Editar cadastro — ${registro.codigo}` : "Novo cadastro"}
      </h1>

      <form onSubmit={salvar} className="mt-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Código" obrigatorio>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} required className={classeInput} placeholder="P221" />
          </Campo>
          <Campo label="Status">
            <input
              disabled
              value={registro ? (registro.status === "ATIVO" ? "Ativo" : "Inativo") : "Ativo (padrão)"}
              className={`${classeInput} opacity-60`}
            />
          </Campo>
        </div>

        <Campo label="Nome da empresa" obrigatorio>
          <input value={nomeEmpresa} onChange={(e) => setNomeEmpresa(e.target.value)} required className={classeInput} />
        </Campo>

        {tabela === "prestadores" ? (
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Possui PEP?">
              <select value={possuiPep ?? "NAO"} onChange={(e) => setPossuiPep(e.target.value)} className={classeInput}>
                <option value="NAO">Não</option>
                <option value="SIM">Sim</option>
              </select>
            </Campo>
            <Campo label="N° PEP">
              <input value={numeroPep ?? ""} onChange={(e) => setNumeroPep(e.target.value)} className={classeInput} />
            </Campo>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <Campo label="LUC">
              <input value={luc ?? ""} onChange={(e) => setLuc(e.target.value)} className={classeInput} />
            </Campo>
            <Campo label="RVP">
              <input value={rvp ?? ""} onChange={(e) => setRvp(e.target.value)} className={classeInput} />
            </Campo>
            <Campo label="RCI">
              <input value={rci ?? ""} onChange={(e) => setRci(e.target.value)} className={classeInput} />
            </Campo>
          </div>
        )}

        <Campo label="Responsável">
          <input value={responsavel ?? ""} onChange={(e) => setResponsavel(e.target.value)} className={classeInput} />
        </Campo>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="Telefone">
            <input value={telefone ?? ""} onChange={(e) => setTelefone(e.target.value)} className={classeInput} />
          </Campo>
          <Campo label="E-mail">
            <input type="email" value={email ?? ""} onChange={(e) => setEmail(e.target.value)} className={classeInput} />
          </Campo>
        </div>

        <Campo label="Observações">
          <textarea value={observacoes ?? ""} onChange={(e) => setObservacoes(e.target.value)} rows={3} className={classeInput} />
        </Campo>

        {erro && <p className="rounded-lg bg-(--color-red-bg) px-3.5 py-2.5 text-sm text-(--color-red)">{erro}</p>}

        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={carregando}
              className="rounded-full bg-(--color-navy) px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {carregando ? "Salvando…" : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/${tabela}/cadastro`)}
              className="rounded-full px-6 py-2.5 text-sm font-medium text-(--color-text-weak) hover:bg-(--color-surface-2)"
            >
              Cancelar
            </button>
          </div>
          {registro && (
            <button
              type="button"
              onClick={alternarStatus}
              disabled={carregando}
              className="text-sm font-medium text-(--color-text-weak) hover:text-(--color-red)"
            >
              {registro.status === "ATIVO" ? "Inativar" : "Reativar"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
