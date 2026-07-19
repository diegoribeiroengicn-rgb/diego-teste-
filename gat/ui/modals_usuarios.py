"""Editor de usuário: dados, perfil, senha e permissões granulares (módulos
e áreas). Renderizado inline na página de Administração (não como pop-up),
para comportar com folga um formulário longo com dezenas de checkboxes."""

from __future__ import annotations

from typing import Any

import streamlit as st

from gat.config import AREAS_PERMISSAO, MODULOS_CONTROLADOS, MODULOS_LABELS, PERFIS_OPCOES
from gat.database import (
    atualizar_usuario,
    ativar_usuario,
    definir_permissao_area,
    definir_permissao_modulo,
    desativar_usuario,
    exigir_troca_senha_proximo_login,
    permissoes_usuario,
    redefinir_senha_admin,
)

_GRUPOS_AREA: list[tuple[str, list[str]]] = [
    ("Prestadores", ["prestadores.cadastrar", "prestadores.editar", "prestadores.exportar"]),
    ("Cessionários", ["cessionarios.cadastrar", "cessionarios.editar", "cessionarios.exportar"]),
    ("Consolidado", ["consolidado.exportar"]),
    ("Geral", ["dashboard", "documentos", "relatorios", "avaliacoes.visualizar", "avaliacoes.cadastrar", "analistas"]),
    ("Gestão", ["alertas", "lembretes", "reunioes"]),
    ("Sistema", ["configuracoes", "auditoria", "administrar_usuarios"]),
]


def renderizar_editor_usuario(executor: dict[str, Any], alvo: dict[str, Any]) -> None:
    username = alvo["username"]
    st.markdown(f"##### Editando: {username}")
    st.caption(f"Criado em {alvo.get('criado_em', '-')} · Último acesso: {alvo.get('ultimo_acesso') or '-'}")

    with st.container(border=True):
        col1, col2 = st.columns(2)
        nome = col1.text_input("Nome completo", value=alvo.get("nome_completo") or "", key=f"edit_nome_{username}")
        perfil = col2.selectbox("Perfil", PERFIS_OPCOES, index=PERFIS_OPCOES.index(alvo["perfil"]) if alvo["perfil"] in PERFIS_OPCOES else 0, key=f"edit_perfil_{username}")

        ativo = st.checkbox("Usuário ativo", value=bool(alvo["ativo"]), key=f"edit_ativo_{username}")

        if st.button("Salvar dados básicos", icon=":material/save:", type="primary", key=f"salvar_basico_{username}"):
            atualizar_usuario(username, nome, perfil, executor["username"])
            if ativo and not alvo["ativo"]:
                ativar_usuario(username, executor["username"])
            elif not ativo and alvo["ativo"]:
                desativar_usuario(username, executor["username"])
            st.success("Dados atualizados.")
            st.rerun()

    with st.container(border=True):
        st.markdown("###### Senha")
        col_senha, col_exigir = st.columns(2)
        with col_senha:
            nova_senha = st.text_input("Redefinir senha (temporária)", type="password", key=f"nova_senha_{username}")
            if st.button("Redefinir senha", icon=":material/lock_reset:", key=f"redefinir_senha_{username}"):
                if not nova_senha or len(nova_senha) < 6:
                    st.error("Informe uma senha com pelo menos 6 caracteres.")
                else:
                    redefinir_senha_admin(username, nova_senha, executor["username"])
                    st.success("Senha redefinida. O usuário será obrigado a trocá-la no próximo login.")
                    st.rerun()
        with col_exigir:
            st.write("")
            st.write("")
            if st.button("Exigir troca de senha no próximo login", icon=":material/policy:", key=f"exigir_troca_{username}"):
                exigir_troca_senha_proximo_login(username, executor["username"])
                st.success("Troca de senha exigida no próximo login.")
                st.rerun()

    with st.container(border=True):
        st.markdown("###### Acesso por módulo")
        st.caption("Módulos bloqueados não aparecem no menu, não abrem por navegação direta e não retornam dados.")

        permissoes = permissoes_usuario(alvo["id"])
        valores_modulo: dict[str, bool] = {}
        colunas_modulo = st.columns(len(MODULOS_CONTROLADOS))
        for coluna, modulo in zip(colunas_modulo, MODULOS_CONTROLADOS):
            with coluna:
                valores_modulo[modulo] = st.checkbox(
                    MODULOS_LABELS[modulo],
                    value=permissoes["modulos"].get(modulo, True),
                    key=f"mod_{modulo}_{username}",
                )

        st.markdown("###### Acesso por área/funcionalidade")
        valores_area: dict[str, bool] = {}
        for titulo_grupo, areas in _GRUPOS_AREA:
            st.caption(titulo_grupo)
            colunas_area = st.columns(min(3, len(areas)))
            for i, area in enumerate(areas):
                with colunas_area[i % len(colunas_area)]:
                    valores_area[area] = st.checkbox(
                        AREAS_PERMISSAO[area],
                        value=permissoes["areas"].get(area, True),
                        key=f"area_{area}_{username}",
                    )

        if st.button("Salvar permissões", icon=":material/verified_user:", type="primary", key=f"salvar_permissoes_{username}", use_container_width=True):
            for modulo, permitido in valores_modulo.items():
                if permitido != permissoes["modulos"].get(modulo, True):
                    definir_permissao_modulo(alvo["id"], username, modulo, permitido, executor["username"])
            for area, permitido in valores_area.items():
                if permitido != permissoes["areas"].get(area, True):
                    definir_permissao_area(alvo["id"], username, area, permitido, executor["username"])
            st.success("Permissões atualizadas.")
            st.rerun()

    if st.button("Fechar edição", icon=":material/close:", key=f"fechar_edicao_{username}"):
        st.session_state.pop("admin_usuario_editando", None)
        st.rerun()
