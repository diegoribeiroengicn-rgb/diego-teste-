"""
Sistema GAT 2026 — Controle de Análises Técnicas (Tecnoplano)
==============================================================

Ponto de entrada da aplicação Streamlit. Responsável por:
* Inicializar o banco de dados SQLite;
* Aplicar a identidade visual institucional Tecnoplano;
* Bloquear o acesso até autenticação válida (login seguro);
* Orquestrar a navegação entre os módulos do sistema — organizada por
  módulo (Prestadores, Cessionários, Consolidado, Gestão, Administração),
  sem bolinhas ou botões de rádio para alternar entre eles.
"""

from __future__ import annotations

from datetime import datetime

import streamlit as st

from gat.auth import (
    logout,
    precisa_trocar_senha,
    tela_login,
    tela_troca_senha_obrigatoria,
    usuario_atual,
    usuario_autenticado,
)
from gat.config import MODULOS_CONTROLADOS
from gat.database import init_db
from gat.export_excel import gerar_relatorio_excel
from gat.permissions import pode_area, pode_modulo
from gat.styles import cabecalho_institucional, injetar_css_global, logo_base64
from views import (
    administracao,
    alertas,
    avaliacao_prestadores,
    cessionarios,
    cessionarios_dashboard,
    consolidado,
    gestao_historico,
    inicio,
    lembretes_pep,
    meu_perfil,
    painel_analistas,
    planos_acao,
    prestadores,
    prestadores_dashboard,
    relatorios_mensais,
    reunioes,
)

st.set_page_config(
    page_title="GAT 2026 · Tecnoplano",
    page_icon=":material/architecture:",
    layout="wide",
    initial_sidebar_state="expanded",
)

init_db()
injetar_css_global()

if not usuario_autenticado():
    if precisa_trocar_senha():
        tela_troca_senha_obrigatoria()
    else:
        tela_login()
    st.stop()

usuario = usuario_atual()

# ---------------------------------------------------------------------------
# Sidebar — identidade institucional
# ---------------------------------------------------------------------------
with st.sidebar:
    logo_b64 = logo_base64()
    if logo_b64:
        st.markdown(
            f'<div style="text-align:center;padding:8px 0 16px 0">'
            f'<img src="data:image/png;base64,{logo_b64}" style="height:38px;object-fit:contain"/></div>',
            unsafe_allow_html=True,
        )
    st.markdown(f"**{usuario['nome_completo'] or usuario['username']}**")
    st.caption(f"Perfil: {usuario['perfil']}")
    st.divider()

# ---------------------------------------------------------------------------
# Navegação — agrupada por módulo (menu lateral, sem rádio/bolinhas)
# ---------------------------------------------------------------------------
# `st.switch_page` exige o objeto `st.Page` (não aceita a string `url_path`
# diretamente para páginas baseadas em função) — por isso cada página
# construída aqui também é indexada por `url_path` em session_state, para
# que outras views (ex.: os cartões da Início) consigam navegar até ela.
_paginas_por_caminho: dict[str, st.Page] = {}


def _pagina(render_fn, title: str, icon: str, url_path: str, default: bool = False) -> st.Page:
    pagina = st.Page(render_fn, title=title, icon=icon, url_path=url_path, default=default)
    _paginas_por_caminho[url_path] = pagina
    return pagina


paginas: dict[str, list[st.Page]] = {
    "": [
        _pagina(lambda: inicio.render(usuario), "Início", ":material/home:", "inicio", default=True),
        _pagina(lambda: meu_perfil.render(usuario), "Meu Perfil", ":material/account_circle:", "meu_perfil"),
    ],
}

if pode_modulo(usuario, "prestadores"):
    grupo_prestadores = []
    if pode_area(usuario, "dashboard"):
        grupo_prestadores.append(_pagina(lambda: prestadores_dashboard.render(usuario), "Dashboard", ":material/dashboard:", "prestadores_dashboard"))
    grupo_prestadores.append(_pagina(lambda: prestadores.render(usuario), "Projetos", ":material/folder_open:", "prestadores_projetos"))
    if pode_area(usuario, "avaliacoes.visualizar"):
        grupo_prestadores.append(_pagina(lambda: avaliacao_prestadores.render(usuario), "Avaliação", ":material/grade:", "prestadores_avaliacao"))
    paginas["Prestadores"] = grupo_prestadores

if pode_modulo(usuario, "cessionarios"):
    grupo_cessionarios = []
    if pode_area(usuario, "dashboard"):
        grupo_cessionarios.append(_pagina(lambda: cessionarios_dashboard.render(usuario), "Dashboard", ":material/dashboard:", "cessionarios_dashboard"))
    grupo_cessionarios.append(_pagina(lambda: cessionarios.render(usuario), "Projetos", ":material/store:", "cessionarios_projetos"))
    paginas["Cessionários"] = grupo_cessionarios

if pode_modulo(usuario, "consolidado"):
    paginas["Consolidado"] = [
        _pagina(lambda: consolidado.render(usuario), "Visão Geral", ":material/insights:", "consolidado_visao"),
    ]

grupo_gestao = []
if pode_area(usuario, "alertas"):
    grupo_gestao.append(_pagina(lambda: alertas.render(usuario), "Central de Alertas", ":material/notifications_active:", "gestao_alertas"))
if pode_area(usuario, "lembretes"):
    grupo_gestao.append(_pagina(lambda: lembretes_pep.render(usuario), "Lembretes (Sem PEP)", ":material/pending_actions:", "gestao_lembretes"))
if pode_area(usuario, "reunioes"):
    grupo_gestao.append(_pagina(lambda: reunioes.render(usuario), "Reuniões", ":material/groups:", "gestao_reunioes"))
    grupo_gestao.append(_pagina(lambda: planos_acao.render(usuario), "Planos de Ação", ":material/task_alt:", "gestao_planos_acao"))
    grupo_gestao.append(_pagina(lambda: gestao_historico.render(usuario), "Histórico", ":material/history:", "gestao_historico"))
if grupo_gestao:
    paginas["Gestão"] = grupo_gestao

grupo_relatorios = []
if pode_area(usuario, "analistas"):
    grupo_relatorios.append(_pagina(lambda: painel_analistas.render(usuario), "Painel de Analistas", ":material/groups_2:", "painel_analistas"))
if pode_area(usuario, "relatorios"):
    grupo_relatorios.append(_pagina(lambda: relatorios_mensais.render(usuario), "Relatórios Mensais", ":material/summarize:", "relatorios_mensais"))
if grupo_relatorios:
    paginas["Relatórios"] = grupo_relatorios

if pode_area(usuario, "administrar_usuarios") or pode_area(usuario, "configuracoes") or pode_area(usuario, "auditoria"):
    paginas["Sistema"] = [
        _pagina(lambda: administracao.render(usuario), "Administração", ":material/settings:", "administracao"),
    ]

st.session_state["_gat_paginas"] = _paginas_por_caminho

pagina_atual = st.navigation(paginas, position="sidebar")

with st.sidebar:
    st.divider()
    if pode_area(usuario, "relatorios"):
        modulos_permitidos = {m for m in MODULOS_CONTROLADOS if pode_modulo(usuario, m)}
        st.download_button(
            "Exportar Relatório Excel",
            data=gerar_relatorio_excel(modulos_permitidos),
            file_name=f"GAT_2026_Relatorio_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            icon=":material/download:",
            type="primary",
            use_container_width=True,
        )
    if st.button("Sair", icon=":material/logout:", use_container_width=True):
        logout()

# ---------------------------------------------------------------------------
# Cabeçalho institucional + conteúdo da página selecionada
# ---------------------------------------------------------------------------
cabecalho_institucional(subtitulo=f"{usuario['nome_completo'] or usuario['username']} · {datetime.now().strftime('%d/%m/%Y')}")
pagina_atual.run()
