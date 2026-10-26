"use client";

import { useMemo, useState } from "react";
import type { Atividade } from "@/lib/atividades";

function formatarDataHora(valor: string): string {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleString("pt-BR");
}

export function TabelaAtividades({ atividades }: { atividades: Atividade[] }) {
  const [busca, setBusca] = useState("");
  const [usuario, setUsuario] = useState("");
  const [tipo, setTipo] = useState("");

  const usuarios = useMemo(() => [...new Set(atividades.map((a) => a.usuario))].sort(), [atividades]);
  const tipos = useMemo(() => [...new Set(atividades.map((a) => a.tipo_evento))].sort(), [atividades]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    return atividades.filter((a) => {
      if (usuario && a.usuario !== usuario) return false;
      if (tipo && a.tipo_evento !== tipo) return false;
      if (!termo) return true;
      return (a.modulo || "").toUpperCase().includes(termo) || (a.detalhe || "").toUpperCase().includes(termo);
    });
  }, [atividades, busca, usuario, tipo]);

  const usuariosDistintos = new Set(filtradas.map((a) => a.usuario)).size;
  const logins = filtradas.filter((a) => a.tipo_evento === "LOGIN").length;

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Histórico de Atividades por Login</h1>
      <p className="mt-1 max-w-2xl text-sm text-(--color-text-weak)">
        Login, logout e ações realizadas por usuário. Não registra senhas, hashes ou qualquer informação sensível.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por módulo/página ou detalhe…"
          className="w-72 rounded-full border border-(--color-border) bg-(--color-surface-1) px-4 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy) focus:ring-2 focus:ring-(--color-navy)/15"
        />
        <select
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium text-(--color-text) outline-none focus:border-(--color-navy)"
        >
          <option value="">Todos os usuários</option>
          {usuarios.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium text-(--color-text) outline-none focus:border-(--color-navy)"
        >
          <option value="">Todos os tipos</option>
          {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="text-xs text-(--color-text-dim)">{filtradas.length} de {atividades.length}</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-text)">{filtradas.length}</p>
          <p className="text-xs text-(--color-text-weak)">registros</p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-navy)">{usuariosDistintos}</p>
          <p className="text-xs text-(--color-text-weak)">usuários distintos</p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-4">
          <p className="text-2xl font-semibold tabular-nums text-(--color-green)">{logins}</p>
          <p className="text-xs text-(--color-text-weak)">logins no período</p>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-(--color-text-dim)">
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">Perfil</th>
              <th className="px-4 py-3">Tipo de Atividade</th>
              <th className="px-4 py-3">Módulo/Página</th>
              <th className="px-4 py-3">Detalhe</th>
              <th className="px-4 py-3">Data/Hora</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-16 text-center text-(--color-text-weak)">Nenhuma atividade encontrada.</td></tr>
            ) : (
              filtradas.slice(0, 500).map((a) => (
                <tr key={a.id} className="border-t border-(--color-border) first:border-0 hover:bg-(--color-surface-2)/60">
                  <td className="px-4 py-3 font-medium text-(--color-text)">{a.usuario}</td>
                  <td className="px-4 py-3 text-(--color-text-weak)">{a.perfil || "—"}</td>
                  <td className="px-4 py-3 text-(--color-text-weak)">{a.tipo_evento}</td>
                  <td className="px-4 py-3 text-(--color-text-weak)">{a.modulo || "—"}</td>
                  <td className="px-4 py-3 text-(--color-text-weak)">{a.detalhe || "—"}</td>
                  <td className="px-4 py-3 text-(--color-text-weak)">{formatarDataHora(a.data_hora)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {filtradas.length > 500 && (
        <p className="mt-3 text-xs text-(--color-text-dim)">Mostrando os 500 mais recentes (de {filtradas.length}) — refine os filtros para ver outros.</p>
      )}
    </div>
  );
}
