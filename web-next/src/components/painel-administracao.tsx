"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AREAS_PERMISSAO,
  GRUPOS_AREA,
  MODULOS_CONTROLADOS,
  MODULOS_LABELS,
  PERFIL_ANALISTA,
  PERFIS_OPCOES,
  RESPONSAVEIS,
} from "@/lib/administracao-calculo";
import type { Usuario } from "@/lib/administracao";
import type { PermissoesUsuario } from "@/lib/permissoes";

function formatarDataHora(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleString("pt-BR");
}

function FormularioNovoUsuario({ onCriado }: { onCriado: () => void }) {
  const [username, setUsername] = useState("");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState(PERFIS_OPCOES[2]);
  const [nome, setNome] = useState("");
  const [analistaVinculado, setAnalistaVinculado] = useState("— Nenhum —");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function cadastrar() {
    if (!username.trim() || !senha) {
      setErro("Informe usuário e senha.");
      return;
    }
    if (senha.length < 6) {
      setErro("A senha temporária deve ter pelo menos 6 caracteres.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(), senha, nomeCompleto: nome, perfil,
          analistaVinculado: perfil === PERFIL_ANALISTA && analistaVinculado !== "— Nenhum —" ? analistaVinculado : null,
        }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setErro(corpo?.erro || "Não foi possível cadastrar o usuário.");
        return;
      }
      setSucesso(`Usuário '${username.trim()}' cadastrado com sucesso.`);
      setUsername(""); setSenha(""); setNome(""); setAnalistaVinculado("— Nenhum —");
      onCriado();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-6">
      <p className="text-sm font-semibold text-(--color-text)">Cadastrar novo usuário</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">O usuário receberá uma senha inicial temporária e será obrigado a defini-la novamente no primeiro acesso.</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-xs text-(--color-text-weak)">
          Usuário
          <input value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
        </label>
        <label className="text-xs text-(--color-text-weak)">
          Senha temporária
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
        </label>
        <label className="text-xs text-(--color-text-weak)">
          Perfil
          <select value={perfil} onChange={(e) => setPerfil(e.target.value)} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)">
            {PERFIS_OPCOES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>
      <label className="mt-3 block text-xs text-(--color-text-weak)">
        Nome completo
        <input value={nome} onChange={(e) => setNome(e.target.value)} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
      </label>
      {perfil === PERFIL_ANALISTA && (
        <label className="mt-3 block text-xs text-(--color-text-weak)">
          Analista vinculado (necessário para o usuário ver seus próprios KPIs de prazo)
          <select value={analistaVinculado} onChange={(e) => setAnalistaVinculado(e.target.value)} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)">
            <option value="— Nenhum —">— Nenhum —</option>
            {RESPONSAVEIS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      )}

      {erro && <p className="mt-3 text-sm text-(--color-red)">{erro}</p>}
      {sucesso && <p className="mt-3 text-sm text-(--color-green)">{sucesso}</p>}

      <button onClick={cadastrar} disabled={salvando} className="mt-4 rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
        {salvando ? "Cadastrando…" : "Cadastrar usuário"}
      </button>
    </div>
  );
}

function EditorPermissoes({ usuario }: { usuario: Usuario }) {
  const [permissoes, setPermissoes] = useState<PermissoesUsuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/usuarios/${usuario.username}/permissoes?usuarioId=${usuario.id}`)
      .then((r) => r.json())
      .then((dados) => setPermissoes(dados))
      .catch(() => setErro("Não foi possível carregar as permissões."))
      .finally(() => setCarregando(false));
  }, [usuario.id, usuario.username]);

  async function salvar() {
    if (!permissoes) return;
    setSalvando(true);
    setErro(null);
    setSucesso(null);
    try {
      const resposta = await fetch(`/api/admin/usuarios/${usuario.username}/permissoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioId: usuario.id, modulos: permissoes.modulos, areas: permissoes.areas }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setErro(corpo?.erro || "Erro ao salvar permissões.");
        return;
      }
      setSucesso("Permissões atualizadas.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <p className="mt-3 text-xs text-(--color-text-dim)">Carregando permissões…</p>;
  if (!permissoes) return <p className="mt-3 text-sm text-(--color-red)">{erro || "Não foi possível carregar as permissões."}</p>;

  return (
    <div className="mt-4 rounded-xl border border-(--color-border) p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-(--color-text-dim)">Acesso por módulo</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">Módulos bloqueados não aparecem no menu, não abrem por navegação direta e não retornam dados.</p>
      <div className="mt-2 flex flex-wrap gap-4">
        {MODULOS_CONTROLADOS.map((modulo) => (
          <label key={modulo} className="flex items-center gap-2 text-sm text-(--color-text)">
            <input
              type="checkbox" checked={permissoes.modulos[modulo] ?? true}
              onChange={(e) => setPermissoes({ ...permissoes, modulos: { ...permissoes.modulos, [modulo]: e.target.checked } })}
            />
            {MODULOS_LABELS[modulo]}
          </label>
        ))}
      </div>

      <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-(--color-text-dim)">Acesso por área/funcionalidade</p>
      {GRUPOS_AREA.map(([titulo, areas]) => (
        <div key={titulo} className="mt-3">
          <p className="text-xs font-medium text-(--color-text-weak)">{titulo}</p>
          <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {areas.map((area) => (
              <label key={area} className="flex items-center gap-2 text-sm text-(--color-text)">
                <input
                  type="checkbox" checked={permissoes.areas[area] ?? true}
                  onChange={(e) => setPermissoes({ ...permissoes, areas: { ...permissoes.areas, [area]: e.target.checked } })}
                />
                {AREAS_PERMISSAO[area]}
              </label>
            ))}
          </div>
        </div>
      ))}

      {erro && <p className="mt-3 text-sm text-(--color-red)">{erro}</p>}
      {sucesso && <p className="mt-3 text-sm text-(--color-green)">{sucesso}</p>}
      <button onClick={salvar} disabled={salvando} className="mt-4 rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
        {salvando ? "Salvando…" : "Salvar permissões"}
      </button>
    </div>
  );
}

function EditorUsuario({ usuario, onFechar, onAtualizado }: { usuario: Usuario; onFechar: () => void; onAtualizado: () => void }) {
  const [nome, setNome] = useState(usuario.nomeCompleto ?? "");
  const [perfil, setPerfil] = useState(usuario.perfil);
  const [ativo, setAtivo] = useState(usuario.ativo);
  const [analistaVinculado, setAnalistaVinculado] = useState(usuario.analistaVinculado ?? "— Nenhum —");
  const [salvandoBasico, setSalvandoBasico] = useState(false);
  const [erroBasico, setErroBasico] = useState<string | null>(null);
  const [sucessoBasico, setSucessoBasico] = useState<string | null>(null);

  const [novaSenha, setNovaSenha] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [sucessoSenha, setSucessoSenha] = useState<string | null>(null);

  async function salvarBasico() {
    setSalvandoBasico(true);
    setErroBasico(null);
    setSucessoBasico(null);
    try {
      const resposta = await fetch(`/api/admin/usuarios/${usuario.username}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomeCompleto: nome, perfil, ativo,
          analistaVinculado: perfil === PERFIL_ANALISTA && analistaVinculado !== "— Nenhum —" ? analistaVinculado : null,
        }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setErroBasico(corpo?.erro || "Erro ao atualizar dados.");
        return;
      }
      setSucessoBasico("Dados atualizados.");
      onAtualizado();
    } finally {
      setSalvandoBasico(false);
    }
  }

  async function redefinirSenha() {
    if (!novaSenha || novaSenha.length < 6) {
      setErroSenha("Informe uma senha com pelo menos 6 caracteres.");
      return;
    }
    setSalvandoSenha(true);
    setErroSenha(null);
    setSucessoSenha(null);
    try {
      const resposta = await fetch(`/api/admin/usuarios/${usuario.username}/senha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "redefinir", novaSenha }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setErroSenha(corpo?.erro || "Erro ao redefinir senha.");
        return;
      }
      setSucessoSenha("Senha redefinida. O usuário será obrigado a trocá-la no próximo login.");
      setNovaSenha("");
    } finally {
      setSalvandoSenha(false);
    }
  }

  async function exigirTroca() {
    setSalvandoSenha(true);
    setErroSenha(null);
    setSucessoSenha(null);
    try {
      const resposta = await fetch(`/api/admin/usuarios/${usuario.username}/senha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "exigir_troca" }),
      });
      if (!resposta.ok) {
        setErroSenha("Erro ao exigir troca de senha.");
        return;
      }
      setSucessoSenha("Troca de senha exigida no próximo login.");
    } finally {
      setSalvandoSenha(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border-2 border-(--color-navy) bg-(--color-surface-1) p-6">
      <p className="text-sm font-semibold text-(--color-text)">Editando: {usuario.username}</p>
      <p className="mt-1 text-xs text-(--color-text-dim)">Criado em {formatarDataHora(usuario.criadoEm)} · Último acesso: {formatarDataHora(usuario.ultimoAcesso)}</p>

      <div className="mt-4 rounded-xl border border-(--color-border) p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-(--color-text-weak)">
            Nome completo
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
          </label>
          <label className="text-xs text-(--color-text-weak)">
            Perfil
            <select value={perfil} onChange={(e) => setPerfil(e.target.value)} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)">
              {PERFIS_OPCOES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-(--color-text)">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Usuário ativo
        </label>
        {perfil === PERFIL_ANALISTA && (
          <label className="mt-3 block text-xs text-(--color-text-weak)">
            Analista vinculado (RESPONSAVEIS)
            <select value={analistaVinculado} onChange={(e) => setAnalistaVinculado(e.target.value)} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)">
              <option value="— Nenhum —">— Nenhum —</option>
              {RESPONSAVEIS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        )}
        {erroBasico && <p className="mt-3 text-sm text-(--color-red)">{erroBasico}</p>}
        {sucessoBasico && <p className="mt-3 text-sm text-(--color-green)">{sucessoBasico}</p>}
        <button onClick={salvarBasico} disabled={salvandoBasico} className="mt-3 rounded-full bg-(--color-navy) px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60">
          {salvandoBasico ? "Salvando…" : "Salvar dados básicos"}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-(--color-border) p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-(--color-text-dim)">Senha</p>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <input type="password" placeholder="Redefinir senha (temporária)" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
            <button onClick={redefinirSenha} disabled={salvandoSenha} className="mt-2 rounded-full border border-(--color-border) px-4 py-1.5 text-xs font-medium text-(--color-navy) hover:bg-(--color-surface-2) disabled:opacity-60">
              Redefinir senha
            </button>
          </div>
          <div className="flex items-start">
            <button onClick={exigirTroca} disabled={salvandoSenha} className="rounded-full border border-(--color-border) px-4 py-1.5 text-xs font-medium text-(--color-navy) hover:bg-(--color-surface-2) disabled:opacity-60">
              Exigir troca de senha no próximo login
            </button>
          </div>
        </div>
        {erroSenha && <p className="mt-2 text-sm text-(--color-red)">{erroSenha}</p>}
        {sucessoSenha && <p className="mt-2 text-sm text-(--color-green)">{sucessoSenha}</p>}
      </div>

      <EditorPermissoes key={usuario.username} usuario={usuario} />

      <button onClick={onFechar} className="mt-5 rounded-full border border-(--color-border) px-4 py-1.5 text-xs font-medium text-(--color-text-weak) hover:bg-(--color-surface-2)">
        Fechar edição
      </button>
    </div>
  );
}

function SecaoUsuarios({ usuarios }: { usuarios: Usuario[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | null>(null);
  const [alvoSelecionado, setAlvoSelecionado] = useState(usuarios[0]?.username ?? "");

  const usuarioEditando = usuarios.find((u) => u.username === editando) ?? null;
  const usuarioAlvo = usuarios.find((u) => u.username === alvoSelecionado) ?? null;

  return (
    <div>
      <FormularioNovoUsuario onCriado={() => router.refresh()} />

      <h2 className="mt-8 text-sm font-semibold text-(--color-text)">Usuários cadastrados</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-(--color-text-dim)">
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Perfil</th>
              <th className="px-4 py-3">Ativo</th>
              <th className="px-4 py-3">Deve trocar senha</th>
              <th className="px-4 py-3">Último acesso</th>
              <th className="px-4 py-3">Analista vinculado</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.username} className="border-t border-(--color-border) first:border-0">
                <td className="px-4 py-2.5 font-medium text-(--color-text)">{u.username}</td>
                <td className="px-4 py-2.5 text-(--color-text-weak)">{u.nomeCompleto || "—"}</td>
                <td className="px-4 py-2.5 text-(--color-text-weak)">{u.perfil}</td>
                <td className="px-4 py-2.5 text-(--color-text-weak)">{u.ativo ? "Sim" : "Não"}</td>
                <td className="px-4 py-2.5 text-(--color-text-weak)">{u.deveTrocarSenha ? "Sim" : "Não"}</td>
                <td className="px-4 py-2.5 text-(--color-text-weak)">{formatarDataHora(u.ultimoAcesso)}</td>
                <td className="px-4 py-2.5 text-(--color-text-weak)">{u.analistaVinculado || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {usuarios.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold text-(--color-text)">Editar usuário / permissões</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select value={alvoSelecionado} onChange={(e) => setAlvoSelecionado(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
              {usuarios.map((u) => <option key={u.username} value={u.username}>{u.username}</option>)}
            </select>
            {usuarioAlvo && (
              <button onClick={() => setEditando(usuarioAlvo.username)} className="rounded-full bg-(--color-navy) px-4 py-2 text-xs font-medium text-white">
                Editar usuário selecionado
              </button>
            )}
          </div>

          {usuarioEditando && usuarioEditando.username === alvoSelecionado && (
            <EditorUsuario usuario={usuarioEditando} onFechar={() => setEditando(null)} onAtualizado={() => router.refresh()} />
          )}
        </>
      )}
    </div>
  );
}

function SecaoConfiguracoes({
  diasAtencaoInicial, diasCriticoInicial, metaRev2Inicial,
}: { diasAtencaoInicial: number; diasCriticoInicial: number; metaRev2Inicial: number }) {
  const [diasAtencao, setDiasAtencao] = useState(diasAtencaoInicial);
  const [diasCritico, setDiasCritico] = useState(diasCriticoInicial);
  const [salvandoPep, setSalvandoPep] = useState(false);
  const [erroPep, setErroPep] = useState<string | null>(null);
  const [sucessoPep, setSucessoPep] = useState<string | null>(null);

  const [metaRev2, setMetaRev2] = useState(metaRev2Inicial);
  const [salvandoMeta, setSalvandoMeta] = useState(false);
  const [sucessoMeta, setSucessoMeta] = useState<string | null>(null);

  async function salvarPep() {
    if (diasCritico <= diasAtencao) {
      setErroPep("O limiar de 'Crítico' deve ser maior que o de 'Atenção'.");
      return;
    }
    setSalvandoPep(true);
    setErroPep(null);
    setSucessoPep(null);
    try {
      const resposta = await fetch("/api/admin/configuracoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diasAtencao, diasCritico }),
      });
      if (!resposta.ok) {
        setErroPep("Erro ao salvar limiares.");
        return;
      }
      setSucessoPep("Limiares atualizados com sucesso.");
    } finally {
      setSalvandoPep(false);
    }
  }

  async function salvarMeta() {
    setSalvandoMeta(true);
    setSucessoMeta(null);
    try {
      const resposta = await fetch("/api/admin/configuracoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metaRev2 }),
      });
      if (resposta.ok) setSucessoMeta("Meta atualizada com sucesso.");
    } finally {
      setSalvandoMeta(false);
    }
  }

  return (
    <div>
      <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-6">
        <p className="text-sm font-semibold text-(--color-text)">Criticidade de projetos sem PEP</p>
        <p className="mt-1 text-xs text-(--color-text-weak)">
          Define, em dias corridos desde a Data de Solicitação, quando um projeto sem PEP passa a ser classificado
          como Atenção ou Crítico nos Lembretes e nos KPIs dos dashboards.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 max-w-sm">
          <label className="text-xs text-(--color-text-weak)">
            Dias para &quot;Atenção&quot;
            <input type="number" min={1} value={diasAtencao} onChange={(e) => setDiasAtencao(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
          </label>
          <label className="text-xs text-(--color-text-weak)">
            Dias para &quot;Crítico&quot;
            <input type="number" min={1} value={diasCritico} onChange={(e) => setDiasCritico(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
          </label>
        </div>
        {erroPep && <p className="mt-2 text-sm text-(--color-red)">{erroPep}</p>}
        {sucessoPep && <p className="mt-2 text-sm text-(--color-green)">{sucessoPep}</p>}
        <button onClick={salvarPep} disabled={salvandoPep} className="mt-3 rounded-full bg-(--color-navy) px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60">
          {salvandoPep ? "Salvando…" : "Salvar limiares"}
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-6">
        <p className="text-sm font-semibold text-(--color-text)">Meta de aprovação até a REV2</p>
        <p className="mt-1 text-xs text-(--color-text-weak)">
          Percentual de projetos aprovados (LIBERADO/LIBERADO C/ REST.) que devem estar aprovados até a Revisão 2,
          entre o total de projetos aprovados. Usado nos Dashboards e relatórios.
        </p>
        <label className="mt-3 block max-w-xs text-xs text-(--color-text-weak)">
          Meta de aprovação até REV2 (%)
          <input type="number" min={0} max={100} step={1} value={metaRev2} onChange={(e) => setMetaRev2(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
        </label>
        {sucessoMeta && <p className="mt-2 text-sm text-(--color-green)">{sucessoMeta}</p>}
        <button onClick={salvarMeta} disabled={salvandoMeta} className="mt-3 rounded-full bg-(--color-navy) px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60">
          {salvandoMeta ? "Salvando…" : "Salvar meta"}
        </button>
      </div>
    </div>
  );
}

export function PainelAdministracao({
  usuarios, podeAdministrarUsuarios, podeConfigurar, diasAtencaoInicial, diasCriticoInicial, metaRev2Inicial,
}: {
  usuarios: Usuario[];
  podeAdministrarUsuarios: boolean;
  podeConfigurar: boolean;
  diasAtencaoInicial: number;
  diasCriticoInicial: number;
  metaRev2Inicial: number;
}) {
  const abasDisponiveis = useMemo(() => {
    const abas: ("usuarios" | "configuracoes")[] = [];
    if (podeAdministrarUsuarios) abas.push("usuarios");
    if (podeConfigurar) abas.push("configuracoes");
    return abas;
  }, [podeAdministrarUsuarios, podeConfigurar]);

  const [aba, setAba] = useState(abasDisponiveis[0]);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Administração do Sistema</h1>

      {abasDisponiveis.length > 1 && (
        <div className="mt-6 flex gap-1 rounded-full border border-(--color-border) bg-(--color-surface-1) p-1 text-sm font-medium w-fit">
          {abasDisponiveis.map((a) => (
            <button
              key={a}
              onClick={() => setAba(a)}
              className={`rounded-full px-4 py-1.5 transition-colors ${aba === a ? "bg-(--color-navy) text-white" : "text-(--color-text-weak) hover:text-(--color-text)"}`}
            >
              {a === "usuarios" ? "Usuários" : "Configurações"}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        {aba === "usuarios" && podeAdministrarUsuarios && <SecaoUsuarios usuarios={usuarios} />}
        {aba === "configuracoes" && podeConfigurar && (
          <SecaoConfiguracoes diasAtencaoInicial={diasAtencaoInicial} diasCriticoInicial={diasCriticoInicial} metaRev2Inicial={metaRev2Inicial} />
        )}
      </div>
    </div>
  );
}
