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
  TIPOS_HISTORICO,
} from "@/lib/administracao-calculo";
import type {
  DiagnosticoImportacao,
  PerguntaChecklistAdmin,
  RegistroHistorico,
  Usuario,
} from "@/lib/administracao";
import type { PermissoesUsuario } from "@/lib/permissoes";
import { resumoPlano, type ItemPlanoImportacao, type PlanoImportacao, type TabelaPlanilha } from "@/lib/planilha-analise-calculo";
import type { ImportacaoHistorico, RelatorioImportacao, ResolucoesConflito } from "@/lib/planilha-analise";

function formatarDataHora(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleString("pt-BR");
}

function CartaoKpi({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-4 py-4">
      <p className="text-xl font-semibold tabular-nums" style={cor ? { color: cor } : undefined}>{valor}</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">{titulo}</p>
    </div>
  );
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

function SecaoValidacaoDados({ validacao }: { validacao: { prestadores: DiagnosticoImportacao; cessionarios: DiagnosticoImportacao } }) {
  const total = validacao.prestadores.totalImportados + validacao.cessionarios.totalImportados;
  return (
    <div>
      <p className="text-sm font-semibold text-(--color-text)">Validação da importação dos dados históricos</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">
        Calculado a partir dos registros efetivamente gravados no banco (não depende do arquivo de origem estar
        disponível). A numeração de Item é preservada exatamente como veio da planilha — nunca renumerada.
      </p>

      {([["Prestadores", validacao.prestadores], ["Cessionários", validacao.cessionarios]] as const).map(([titulo, dados]) => (
        <div key={titulo} className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-6">
          <p className="text-sm font-semibold text-(--color-text)">{titulo}</p>
          <div className="mt-3 grid grid-cols-3 gap-3 max-w-lg">
            <CartaoKpi titulo="Registros importados" valor={String(dados.totalImportados)} />
            <CartaoKpi titulo="Item mínimo" valor={dados.itemMinimo != null ? String(dados.itemMinimo) : "-"} />
            <CartaoKpi titulo="Item máximo" valor={dados.itemMaximo != null ? String(dados.itemMaximo) : "-"} />
          </div>
          {dados.itensAusentesNaOrigem.length > 0 ? (
            <p className="mt-3 rounded-xl border border-(--color-gold)/40 bg-(--color-gold)/10 px-4 py-3 text-xs text-(--color-text)">
              A numeração de Item vai de {dados.itemMinimo} a {dados.itemMaximo} (
              {(dados.itemMaximo ?? 0) - (dados.itemMinimo ?? 0) + 1} números), mas{" "}
              <strong>{dados.itensAusentesNaOrigem.length}</strong> número(s) de Item não possuem nenhuma linha
              correspondente na planilha de origem: <strong>{dados.itensAusentesNaOrigem.join(", ")}</strong>. Isso
              indica que essas linhas já não existiam fisicamente na planilha (removidas na origem antes da
              importação, sem reaproveitamento de numeração) — todas as demais linhas foram importadas sem nenhum
              filtro de status, PEP ou duplicidade.
            </p>
          ) : (
            <p className="mt-3 rounded-xl border border-(--color-green)/30 bg-(--color-green)/10 px-4 py-3 text-xs text-(--color-text)">
              Numeração de Item contígua — nenhuma linha da planilha de origem ficou de fora da importação.
            </p>
          )}
        </div>
      ))}

      <div className="mt-6 max-w-xs">
        <CartaoKpi titulo="Total geral importado (Prestadores + Cessionários)" valor={String(total)} cor="var(--color-navy)" />
      </div>
    </div>
  );
}

function SecaoHistorico() {
  const [tabela, setTabela] = useState("Todas");
  const [completo, setCompleto] = useState(false);
  const [registros, setRegistros] = useState<RegistroHistorico[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (tabela !== "Todas") params.set("tabela", tabela);
    if (completo) params.set("completo", "1");
    fetch(`/api/admin/historico?${params.toString()}`)
      .then((r) => r.json())
      .then((dados) => setRegistros(dados.registros ?? []))
      .catch(() => setErro("Não foi possível carregar o histórico."))
      .finally(() => setCarregando(false));
  }, [tabela, completo]);

  function formatarDataHora(valor: string): string {
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? valor : data.toLocaleString("pt-BR");
  }

  return (
    <div>
      <p className="text-sm font-semibold text-(--color-text)">Histórico de edições e auditoria de segurança</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select value={tabela} onChange={(e) => setTabela(e.target.value)} className="rounded-full border border-(--color-border) bg-(--color-surface-1) px-3 py-2 text-xs font-medium outline-none focus:border-(--color-navy)">
          {TIPOS_HISTORICO.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-(--color-text-weak)">
          <input type="checkbox" checked={completo} onChange={(e) => setCompleto(e.target.checked)} />
          Carregar histórico completo
        </label>
      </div>
      {!completo && registros && <p className="mt-2 text-xs text-(--color-text-dim)">Mostrando os {registros.length} registros mais recentes.</p>}

      {carregando ? (
        <p className="mt-4 text-xs text-(--color-text-dim)">Carregando…</p>
      ) : erro || !registros ? (
        <p className="mt-4 text-sm text-(--color-red)">{erro || "Não foi possível carregar o histórico."}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead>
              <tr className="text-xs font-medium text-(--color-text-dim)">
                <th className="px-4 py-3">Tabela</th>
                <th className="px-4 py-3">Registro</th>
                <th className="px-4 py-3">Campo</th>
                <th className="px-4 py-3">Valor anterior</th>
                <th className="px-4 py-3">Valor novo</th>
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3">Data/Hora</th>
              </tr>
            </thead>
            <tbody>
              {registros.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-(--color-text-weak)">Nenhum registro encontrado.</td></tr>
              ) : (
                registros.map((r) => (
                  <tr key={r.id} className="border-t border-(--color-border) first:border-0">
                    <td className="px-4 py-2.5 text-(--color-text-weak)">{r.tabela}</td>
                    <td className="px-4 py-2.5 text-(--color-text-weak)">{r.registroId}</td>
                    <td className="px-4 py-2.5 font-medium text-(--color-text)">{r.campo}</td>
                    <td className="px-4 py-2.5 text-(--color-text-weak)">{r.valorAnterior ?? "—"}</td>
                    <td className="px-4 py-2.5 text-(--color-text-weak)">{r.valorNovo ?? "—"}</td>
                    <td className="px-4 py-2.5 text-(--color-text-weak)">{r.usuario}</td>
                    <td className="px-4 py-2.5 text-(--color-text-weak)">{formatarDataHora(r.dataHora)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const botaoPrimario = "rounded-full bg-(--color-navy) px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60";
const botaoSecundario = "rounded-full border border-(--color-border) px-4 py-1.5 text-xs font-medium text-(--color-text) hover:bg-(--color-surface-2)";

function UploadPlanilha({ tabela, titulo, nomeAba }: { tabela: TabelaPlanilha; titulo: string; nomeAba: string }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [plano, setPlano] = useState<PlanoImportacao | null>(null);
  const [resolucoes, setResolucoes] = useState<ResolucoesConflito>({});
  const [relatorio, setRelatorio] = useState<RelatorioImportacao | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function reiniciar() {
    setArquivo(null);
    setPlano(null);
    setResolucoes({});
    setRelatorio(null);
    setErro(null);
  }

  async function enviarEPrever() {
    if (!arquivo) return;
    setCarregando(true);
    setErro(null);
    try {
      const formData = new FormData();
      formData.append("arquivo", arquivo);
      const resposta = await fetch(`/api/planilha/${tabela}/planejar`, { method: "POST", body: formData });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setErro(corpo?.erro || "Erro ao ler a planilha.");
        return;
      }
      setPlano(corpo.plano);
    } finally {
      setCarregando(false);
    }
  }

  async function confirmar() {
    if (!plano) return;
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/planilha/${tabela}/executar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plano, resolucoesConflito: resolucoes, nomeArquivo: arquivo?.name }),
      });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setErro(corpo?.erro || "Erro ao aplicar a importação.");
        return;
      }
      setRelatorio(corpo.relatorio);
    } finally {
      setCarregando(false);
    }
  }

  function escolher(chaveStr: string, campo: string, escolha: "sistema" | "planilha") {
    setResolucoes((atual) => ({ ...atual, [chaveStr]: { ...atual[chaveStr], [campo]: escolha } }));
  }

  const resumo = plano ? resumoPlano(plano) : null;
  const itensComConflito = plano?.itens.filter((i: ItemPlanoImportacao) => Object.keys(i.conflitos).length > 0) ?? [];
  const inconsistentes = plano?.itens.filter((i: ItemPlanoImportacao) => i.tipo === "inconsistente") ?? [];

  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-6">
      <p className="text-sm font-semibold text-(--color-text)">{titulo}</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">
        Lê a aba &quot;{nomeAba}&quot; da planilha oficial. Correspondência por código + disciplina + revisão + N° AT —
        um registro já cadastrado é atualizado (nunca duplicado); um campo vazio na planilha nunca apaga um valor já
        preenchido no sistema. Nada é gravado até você revisar a prévia e confirmar.
      </p>

      {!plano && !relatorio && (
        <>
          <input
            type="file" accept=".xlsx,.xls"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="mt-3 block w-full text-sm text-(--color-text)"
          />
          {erro && <p className="mt-2 text-sm text-(--color-red)">{erro}</p>}
          <button onClick={enviarEPrever} disabled={!arquivo || carregando} className={`mt-3 ${botaoPrimario}`}>
            {carregando ? "Lendo…" : "Enviar e pré-visualizar"}
          </button>
        </>
      )}

      {plano && !relatorio && resumo && (
        <>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-(--color-surface-2) px-3 py-1 font-medium text-(--color-text)">{resumo.lidos} lidos</span>
            <span className="rounded-full bg-(--color-green-bg) px-3 py-1 font-medium text-(--color-green)">{resumo.novos} novos</span>
            <span className="rounded-full bg-(--color-blue-3) px-3 py-1 font-medium text-(--color-blue-2)">{resumo.atualizados} atualizados ({resumo.totalConflitos} com conflito)</span>
            <span className="rounded-full bg-(--color-surface-2) px-3 py-1 font-medium text-(--color-text-weak)">{resumo.semMudanca} sem mudança</span>
            <span className="rounded-full bg-(--color-surface-2) px-3 py-1 font-medium text-(--color-text-weak)">{resumo.arquivados} já arquivados (ignorados)</span>
            {resumo.inconsistentes > 0 && (
              <span className="rounded-full bg-(--color-red-bg) px-3 py-1 font-medium text-(--color-red)">{resumo.inconsistentes} com inconsistência</span>
            )}
          </div>

          {plano.colunasNaoMapeadas.length > 0 && (
            <p className="mt-3 text-xs text-(--color-orange)">
              Colunas da planilha sem correspondência conhecida (ignoradas): {plano.colunasNaoMapeadas.join(", ")}
            </p>
          )}

          {itensComConflito.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-(--color-text)">Conflitos a resolver — por padrão, aplica o valor da planilha</p>
              <div className="mt-2 flex flex-col gap-3">
                {itensComConflito.map((item: ItemPlanoImportacao) => {
                  const chaveStr = JSON.stringify(item.chave);
                  return (
                    <div key={chaveStr} className="rounded-xl border border-(--color-border) px-3 py-2.5">
                      <p className="text-xs font-medium text-(--color-text)">Linha {item.linhaPlanilha ?? "?"} — {item.identificacao}</p>
                      <div className="mt-2 flex flex-col gap-1.5">
                        {Object.entries(item.conflitos).map(([campo, [valorSistema, valorPlanilha]]) => {
                          const escolha = resolucoes[chaveStr]?.[campo] ?? "planilha";
                          return (
                            <div key={campo} className="flex flex-wrap items-center gap-2 text-xs text-(--color-text-weak)">
                              <span className="font-medium text-(--color-text)">{campo}:</span>
                              <label className="flex items-center gap-1">
                                <input type="radio" checked={escolha === "planilha"} onChange={() => escolher(chaveStr, campo, "planilha")} />
                                Planilha ({String(valorPlanilha)})
                              </label>
                              <label className="flex items-center gap-1">
                                <input type="radio" checked={escolha === "sistema"} onChange={() => escolher(chaveStr, campo, "sistema")} />
                                Manter sistema ({String(valorSistema)})
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {inconsistentes.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-(--color-text)">Inconsistências (não serão gravadas)</p>
              <div className="mt-2 flex flex-col gap-1.5">
                {inconsistentes.map((item: ItemPlanoImportacao, i: number) => (
                  <p key={i} className="text-xs text-(--color-red)">
                    Linha {item.linhaPlanilha ?? "?"} ({item.identificacao}): {item.motivoInconsistencia}
                  </p>
                ))}
              </div>
            </div>
          )}

          {plano.registrosNaoEncontrados.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-semibold text-(--color-text)">
                {plano.registrosNaoEncontrados.length} registro(s) em andamento no sistema sem linha correspondente na planilha
              </summary>
              <div className="mt-2 flex flex-col gap-1.5">
                {plano.registrosNaoEncontrados.map((r) => (
                  <p key={r.id} className="text-xs text-(--color-text-weak)">
                    {r.identificacao} — {r.disciplina} — status {r.status_analise} — AT {r.num_at || "(sem AT)"}
                  </p>
                ))}
              </div>
            </details>
          )}

          {erro && <p className="mt-3 text-sm text-(--color-red)">{erro}</p>}
          <div className="mt-4 flex gap-3">
            <button onClick={confirmar} disabled={carregando} className={botaoPrimario}>
              {carregando ? "Aplicando…" : "Confirmar importação"}
            </button>
            <button onClick={reiniciar} disabled={carregando} className={botaoSecundario}>Cancelar</button>
          </div>
        </>
      )}

      {relatorio && (
        <>
          <p className="mt-4 rounded-xl border border-(--color-green)/30 bg-(--color-green)/10 px-4 py-3 text-sm text-(--color-green)">
            Importação concluída — {relatorio.lidos} lidos · {relatorio.novos} novos · {relatorio.atualizados} atualizados
            ({relatorio.conflitosTratados} conflitos tratados) · {relatorio.ignoradosSemMudanca} sem mudança ·
            {" "}{relatorio.ignoradosArquivados} já arquivados · {relatorio.inconsistentes} com inconsistência.
          </p>
          {relatorio.erros.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-(--color-red)">Linhas com erro ao gravar ({relatorio.erros.length}) — corrija e reimporte só essas:</p>
              <div className="mt-1 flex flex-col gap-1">
                {relatorio.erros.map((e, i) => <p key={i} className="text-xs text-(--color-red)">{e}</p>)}
              </div>
            </div>
          )}
          <button onClick={reiniciar} className={`mt-3 ${botaoSecundario}`}>Nova importação</button>
        </>
      )}
    </div>
  );
}

function SecaoAtualizacaoPlanilha() {
  const [historico, setHistorico] = useState<ImportacaoHistorico[] | null>(null);

  useEffect(() => {
    fetch("/api/planilha/historico")
      .then((r) => r.json())
      .then((corpo) => setHistorico(corpo.historico ?? []))
      .catch(() => setHistorico([]));
  }, []);

  return (
    <div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <UploadPlanilha tabela="prestadores" titulo="Prestadores" nomeAba="PROJ_PREST" />
        <UploadPlanilha tabela="cessionarios" titulo="Cessionários" nomeAba="PROJ_CESS" />
      </div>

      {historico && historico.length > 0 && (
        <details className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
          <summary className="cursor-pointer text-sm font-semibold text-(--color-text)">Histórico de importações</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="text-xs font-medium text-(--color-text-dim)">
                  <th className="px-3 py-2">Data/Hora</th>
                  <th className="px-3 py-2">Origem</th>
                  <th className="px-3 py-2">Arquivo</th>
                  <th className="px-3 py-2">Usuário</th>
                  <th className="px-3 py-2">Resultado</th>
                  <th className="px-3 py-2">Novos/Atualizados</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.id} className="border-t border-(--color-border) first:border-0">
                    <td className="px-3 py-2 text-(--color-text-weak)">{formatarDataHora(h.data_hora)}</td>
                    <td className="px-3 py-2 text-(--color-text)">{h.origem}</td>
                    <td className="px-3 py-2 text-(--color-text-weak)">{h.nome_arquivo}</td>
                    <td className="px-3 py-2 text-(--color-text-weak)">{h.usuario}</td>
                    <td className="px-3 py-2">
                      <span className={h.resultado === "SUCESSO" ? "text-(--color-green)" : "text-(--color-orange)"}>{h.resultado}</span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-(--color-text-weak)">{h.novos}/{h.atualizados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function SecaoChecklistPerguntas({ perguntasIniciais }: { perguntasIniciais: PerguntaChecklistAdmin[] }) {
  const router = useRouter();
  const [perguntas, setPerguntas] = useState(perguntasIniciais);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const [categoriaNova, setCategoriaNova] = useState("");
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("— Nova categoria —");
  const [textoNovo, setTextoNovo] = useState("");
  const [ordemCategoriaNova, setOrdemCategoriaNova] = useState(1);
  const [ordemPerguntaNova, setOrdemPerguntaNova] = useState(1);
  const [adicionando, setAdicionando] = useState(false);
  const [erroNova, setErroNova] = useState<string | null>(null);

  const categoriasExistentes = useMemo(() => [...new Set(perguntasIniciais.map((p) => p.categoria))].sort(), [perguntasIniciais]);

  function atualizarPergunta(id: number, campo: keyof PerguntaChecklistAdmin, valor: string | number | boolean) {
    setPerguntas((atual) => atual.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)));
  }

  async function salvarPerguntas() {
    setSalvando(true);
    setErro(null);
    setSucesso(null);
    try {
      for (const p of perguntas) {
        const original = perguntasIniciais.find((o) => o.id === p.id);
        if (!original) continue;
        if (
          p.categoria !== original.categoria || p.texto !== original.texto ||
          p.ordemCategoria !== original.ordemCategoria || p.ordemPergunta !== original.ordemPergunta ||
          p.ativo !== original.ativo
        ) {
          const resposta = await fetch(`/api/admin/checklist-perguntas/${p.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ categoria: p.categoria, texto: p.texto, ordemCategoria: p.ordemCategoria, ordemPergunta: p.ordemPergunta, ativo: p.ativo }),
          });
          if (!resposta.ok) {
            setErro("Erro ao salvar perguntas do checklist.");
            return;
          }
        }
      }
      setSucesso("Perguntas do checklist atualizadas com sucesso.");
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  async function adicionarPergunta() {
    const categoria = categoriaSelecionada === "— Nova categoria —" ? categoriaNova : categoriaSelecionada;
    if (!categoria.trim() || !textoNovo.trim()) {
      setErroNova("Preencha a categoria e o texto da pergunta.");
      return;
    }
    setAdicionando(true);
    setErroNova(null);
    try {
      const resposta = await fetch("/api/admin/checklist-perguntas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoria, texto: textoNovo, ordemCategoria: ordemCategoriaNova, ordemPergunta: ordemPerguntaNova }),
      });
      if (!resposta.ok) {
        setErroNova("Erro ao adicionar pergunta.");
        return;
      }
      setTextoNovo("");
      router.refresh();
    } finally {
      setAdicionando(false);
    }
  }

  return (
    <div>
      <p className="text-sm font-semibold text-(--color-text)">Checklist de Avaliação — perguntas</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">
        Perguntas do checklist de Avaliação (Prestadores e Cessionários), usado no formulário de Avaliação —
        Checklist. Editar texto/categoria/ordem ou desativar uma pergunta aqui não altera avaliações já
        registradas — elas continuam mostrando exatamente o que foi respondido/calculado no momento em que foram
        salvas.
      </p>

      {perguntas.length === 0 ? (
        <p className="mt-4 text-sm text-(--color-text-weak)">Nenhuma pergunta cadastrada.</p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead>
                <tr className="text-xs font-medium text-(--color-text-dim)">
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Pergunta</th>
                  <th className="px-4 py-3">Ordem categoria</th>
                  <th className="px-4 py-3">Ordem pergunta</th>
                  <th className="px-4 py-3">Ativa</th>
                </tr>
              </thead>
              <tbody>
                {perguntas.map((p) => (
                  <tr key={p.id} className="border-t border-(--color-border) first:border-0">
                    <td className="px-4 py-2.5">
                      <input value={p.categoria} onChange={(e) => atualizarPergunta(p.id, "categoria", e.target.value)} className="w-32 rounded-lg border border-(--color-border) bg-(--color-bg) px-2 py-1 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
                    </td>
                    <td className="px-4 py-2.5">
                      <input value={p.texto} onChange={(e) => atualizarPergunta(p.id, "texto", e.target.value)} className="w-full min-w-[320px] rounded-lg border border-(--color-border) bg-(--color-bg) px-2 py-1 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
                    </td>
                    <td className="px-4 py-2.5">
                      <input type="number" min={1} value={p.ordemCategoria} onChange={(e) => atualizarPergunta(p.id, "ordemCategoria", Number(e.target.value))} className="w-20 rounded-lg border border-(--color-border) bg-(--color-bg) px-2 py-1 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
                    </td>
                    <td className="px-4 py-2.5">
                      <input type="number" min={1} value={p.ordemPergunta} onChange={(e) => atualizarPergunta(p.id, "ordemPergunta", Number(e.target.value))} className="w-20 rounded-lg border border-(--color-border) bg-(--color-bg) px-2 py-1 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
                    </td>
                    <td className="px-4 py-2.5">
                      <input type="checkbox" checked={p.ativo} onChange={(e) => atualizarPergunta(p.id, "ativo", e.target.checked)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {erro && <p className="mt-2 text-sm text-(--color-red)">{erro}</p>}
          {sucesso && <p className="mt-2 text-sm text-(--color-green)">{sucesso}</p>}
          <button onClick={salvarPerguntas} disabled={salvando} className="mt-4 rounded-full bg-(--color-navy) px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
            {salvando ? "Salvando…" : "Salvar perguntas do checklist"}
          </button>
        </>
      )}

      <div className="mt-8 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-6">
        <p className="text-sm font-semibold text-(--color-text)">Adicionar nova pergunta</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-(--color-text-weak)">
              Categoria
              <select value={categoriaSelecionada} onChange={(e) => setCategoriaSelecionada(e.target.value)} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)">
                {categoriasExistentes.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="— Nova categoria —">— Nova categoria —</option>
              </select>
            </label>
            {categoriaSelecionada === "— Nova categoria —" && (
              <input value={categoriaNova} onChange={(e) => setCategoriaNova(e.target.value)} placeholder="Nome da nova categoria" className="mt-2 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
            )}
            <label className="mt-3 block text-xs text-(--color-text-weak)">
              Texto da pergunta
              <textarea value={textoNovo} onChange={(e) => setTextoNovo(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
            </label>
          </div>
          <div>
            <label className="text-xs text-(--color-text-weak)">
              Ordem da categoria
              <input type="number" min={1} value={ordemCategoriaNova} onChange={(e) => setOrdemCategoriaNova(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
            </label>
            <label className="mt-3 block text-xs text-(--color-text-weak)">
              Ordem na categoria
              <input type="number" min={1} value={ordemPerguntaNova} onChange={(e) => setOrdemPerguntaNova(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-navy)" />
            </label>
          </div>
        </div>
        {erroNova && <p className="mt-2 text-sm text-(--color-red)">{erroNova}</p>}
        <button onClick={adicionarPergunta} disabled={adicionando} className="mt-3 rounded-full border border-(--color-border) px-4 py-1.5 text-xs font-medium text-(--color-navy) hover:bg-(--color-surface-2) disabled:opacity-60">
          {adicionando ? "Adicionando…" : "Adicionar pergunta"}
        </button>
      </div>
    </div>
  );
}

const ABAS_LABEL: Record<string, string> = {
  usuarios: "Usuários",
  validacao: "Validação de Dados",
  historico: "Histórico e Auditoria",
  configuracoes: "Configurações",
  planilha: "Atualização por Planilha",
  checklist: "Checklist de Avaliação",
};

export function PainelAdministracao({
  usuarios, validacao, perguntasChecklist,
  podeAdministrarUsuarios, podeAuditoria, podeConfigurar,
  diasAtencaoInicial, diasCriticoInicial, metaRev2Inicial,
}: {
  usuarios: Usuario[];
  validacao: { prestadores: DiagnosticoImportacao; cessionarios: DiagnosticoImportacao };
  perguntasChecklist: PerguntaChecklistAdmin[];
  podeAdministrarUsuarios: boolean;
  podeAuditoria: boolean;
  podeConfigurar: boolean;
  diasAtencaoInicial: number;
  diasCriticoInicial: number;
  metaRev2Inicial: number;
}) {
  const abasDisponiveis = useMemo(() => {
    const abas: string[] = [];
    if (podeAdministrarUsuarios) abas.push("usuarios");
    abas.push("validacao");
    if (podeAuditoria) abas.push("historico");
    if (podeConfigurar) abas.push("configuracoes", "planilha", "checklist");
    return abas;
  }, [podeAdministrarUsuarios, podeAuditoria, podeConfigurar]);

  const [aba, setAba] = useState(abasDisponiveis[0]);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Administração do Sistema</h1>

      {abasDisponiveis.length > 1 && (
        <div className="mt-6 flex flex-wrap gap-1 rounded-full border border-(--color-border) bg-(--color-surface-1) p-1 text-sm font-medium w-fit">
          {abasDisponiveis.map((a) => (
            <button
              key={a}
              onClick={() => setAba(a)}
              className={`rounded-full px-4 py-1.5 transition-colors ${aba === a ? "bg-(--color-navy) text-white" : "text-(--color-text-weak) hover:text-(--color-text)"}`}
            >
              {ABAS_LABEL[a]}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        {aba === "usuarios" && podeAdministrarUsuarios && <SecaoUsuarios usuarios={usuarios} />}
        {aba === "validacao" && <SecaoValidacaoDados validacao={validacao} />}
        {aba === "historico" && podeAuditoria && <SecaoHistorico />}
        {aba === "configuracoes" && podeConfigurar && (
          <SecaoConfiguracoes diasAtencaoInicial={diasAtencaoInicial} diasCriticoInicial={diasCriticoInicial} metaRev2Inicial={metaRev2Inicial} />
        )}
        {aba === "planilha" && podeConfigurar && <SecaoAtualizacaoPlanilha />}
        {aba === "checklist" && podeConfigurar && <SecaoChecklistPerguntas perguntasIniciais={perguntasChecklist} />}
      </div>
    </div>
  );
}
