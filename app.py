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
from gat.database import init_db, registrar_atividade
from gat.export_excel import gerar_relatorio_excel
from gat.permissions import pode_area, pode_modulo
from gat.styles import cabecalho_institucional, injetar_css_global, logo_base64
from views import (
    administracao,
    alertas,
    alertas_cessionarios,
    alertas_prestadores,
    avaliacao_analistas,
    avaliacao_prestadores,
    cadastro_cessionarios,
    cadastro_prestadores,
    canteiros,
    cessionarios,
    cessionarios_dashboard,
    consolidado,
    gestao_historico,
    historico_atividades,
    inicio,
    kpis_analistas_prazo,
    lembretes_pep,
    linha_tempo,
    lista_prioridades,
    manual_sistema,
    meu_perfil,
    painel_analistas,
    planos_acao,
    pmo_portfolio,
    pmo_projeto,
    prestadores,
    prestadores_dashboard,
    relatorios_mensais,
    reunioes,
    visao_gestor,
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
    grupo_prestadores.append(_pagina(lambda: cadastro_prestadores.render(usuario), "Cadastro", ":material/badge:", "prestadores_cadastro"))
    grupo_prestadores.append(_pagina(lambda: canteiros.render(usuario), "Canteiros", ":material/construction:", "prestadores_canteiros"))
    if pode_area(usuario, "avaliacoes.visualizar"):
        grupo_prestadores.append(_pagina(lambda: avaliacao_prestadores.render(usuario), "Avaliação", ":material/grade:", "prestadores_avaliacao"))
    paginas["Prestadores"] = grupo_prestadores

if pode_modulo(usuario, "cessionarios"):
    grupo_cessionarios = []
    if pode_area(usuario, "dashboard"):
        grupo_cessionarios.append(_pagina(lambda: cessionarios_dashboard.render(usuario), "Dashboard", ":material/dashboard:", "cessionarios_dashboard"))
    grupo_cessionarios.append(_pagina(lambda: cessionarios.render(usuario), "Projetos", ":material/store:", "cessionarios_projetos"))
    grupo_cessionarios.append(_pagina(lambda: cadastro_cessionarios.render(usuario), "Cadastro", ":material/badge:", "cessionarios_cadastro"))
    # A tela de Avaliação cobre Prestadores e Cessionários numa única view —
    # já aparece no grupo Prestadores quando esse módulo está liberado; aqui
    # só é adicionada para não deixar um usuário só-Cessionários sem acesso.
    if pode_area(usuario, "avaliacoes.visualizar") and not pode_modulo(usuario, "prestadores"):
        grupo_cessionarios.append(_pagina(lambda: avaliacao_prestadores.render(usuario), "Avaliação", ":material/grade:", "cessionarios_avaliacao"))
    paginas["Cessionários"] = grupo_cessionarios

if pode_modulo(usuario, "consolidado"):
    grupo_consolidado = [
        _pagina(lambda: consolidado.render(usuario), "Visão Geral", ":material/insights:", "consolidado_visao"),
    ]
    if pode_area(usuario, "linha_tempo"):
        grupo_consolidado.append(_pagina(lambda: linha_tempo.render(usuario), "Linha do Tempo", ":material/timeline:", "linha_tempo"))
    paginas["Consolidado"] = grupo_consolidado

if pode_area(usuario, "pmo"):
    paginas["PMO"] = [
        _pagina(lambda: pmo_portfolio.render(usuario), "Portfólio de Projetos", ":material/dashboard_customize:", "pmo_portfolio"),
        _pagina(lambda: pmo_projeto.render(usuario), "Projeto", ":material/folder_open:", "pmo_projeto"),
    ]

grupo_gestao = []
if pode_area(usuario, "alertas"):
    if pode_modulo(usuario, "prestadores"):
        grupo_gestao.append(_pagina(lambda: alertas_prestadores.render(usuario), "Alertas — Prestadores", ":material/notifications_active:", "gestao_alertas_prestadores"))
    if pode_modulo(usuario, "cessionarios"):
        grupo_gestao.append(_pagina(lambda: alertas_cessionarios.render(usuario), "Alertas — Cessionários", ":material/notifications_active:", "gestao_alertas_cessionarios"))
    if pode_area(usuario, "alertas.consolidado"):
        grupo_gestao.append(_pagina(lambda: alertas.render(usuario, modulo=None), "Alertas — Consolidado", ":material/notifications_active:", "gestao_alertas_consolidado"))
if pode_area(usuario, "lista_prioridades"):
    grupo_gestao.append(_pagina(lambda: lista_prioridades.render(usuario), "Lista de Prioridades", ":material/priority_high:", "gestao_lista_prioridades"))
if pode_area(usuario, "lembretes"):
    grupo_gestao.append(_pagina(lambda: lembretes_pep.render(usuario), "Lembretes (Sem PEP)", ":material/pending_actions:", "gestao_lembretes"))
if pode_area(usuario, "reunioes"):
    grupo_gestao.append(_pagina(lambda: reunioes.render(usuario), "Reuniões", ":material/groups:", "gestao_reunioes"))
    grupo_gestao.append(_pagina(lambda: planos_acao.render(usuario), "Planos de Ação", ":material/task_alt:", "gestao_planos_acao"))
    grupo_gestao.append(_pagina(lambda: gestao_historico.render(usuario), "Histórico", ":material/history:", "gestao_historico"))
if grupo_gestao:
    paginas["Gestão"] = grupo_gestao

if pode_area(usuario, "visao_gestor"):
    paginas["Visão do Gestor"] = [
        _pagina(lambda: visao_gestor.render(usuario), "Visão do Gestor", ":material/dashboard:", "visao_gestor"),
    ]

grupo_relatorios = []
if pode_area(usuario, "analistas"):
    grupo_relatorios.append(_pagina(lambda: painel_analistas.render(usuario), "Painel de Analistas", ":material/groups_2:", "painel_analistas"))
if pode_area(usuario, "analistas.notas"):
    grupo_relatorios.append(_pagina(lambda: avaliacao_analistas.render(usuario), "Avaliação de Analistas", ":material/military_tech:", "avaliacao_analistas"))
if pode_area(usuario, "analistas.kpis_prazo"):
    grupo_relatorios.append(_pagina(lambda: kpis_analistas_prazo.render(usuario), "KPIs de Prazo dos Analistas", ":material/schedule:", "kpis_analistas_prazo"))
if pode_area(usuario, "relatorios"):
    grupo_relatorios.append(_pagina(lambda: relatorios_mensais.render(usuario), "Relatórios Mensais", ":material/summarize:", "relatorios_mensais"))
if grupo_relatorios:
    paginas["Relatórios"] = grupo_relatorios

if pode_area(usuario, "manual_sistema"):
    paginas["Manual do Sistema"] = [
        _pagina(lambda: manual_sistema.render(usuario), "Manual do Sistema", ":material/menu_book:", "manual_sistema"),
    ]

if pode_area(usuario, "administrar_usuarios") or pode_area(usuario, "configuracoes") or pode_area(usuario, "auditoria"):
    grupo_sistema = [
        _pagina(lambda: administracao.render(usuario), "Administração", ":material/settings:", "administracao"),
    ]
    if pode_area(usuario, "historico_atividades"):
        grupo_sistema.append(_pagina(lambda: historico_atividades.render(usuario), "Histórico de Atividades", ":material/manage_history:", "historico_atividades"))
    paginas["Sistema"] = grupo_sistema
elif pode_area(usuario, "historico_atividades"):
    paginas["Sistema"] = [
        _pagina(lambda: historico_atividades.render(usuario), "Histórico de Atividades", ":material/manage_history:", "historico_atividades"),
    ]

st.session_state["_gat_paginas"] = _paginas_por_caminho

pagina_atual = st.navigation(paginas, position="sidebar")

# Histórico de atividades: registra a navegação para a página apenas quando
# ela muda (evita duplicar a cada rerun disparado por widgets na mesma página).
if st.session_state.get("_gat_ultima_pagina_logada") != pagina_atual.url_path:
    registrar_atividade(usuario["username"], usuario.get("perfil"), "PAGINA", modulo=pagina_atual.url_path, detalhe=pagina_atual.title)
    st.session_state["_gat_ultima_pagina_logada"] = pagina_atual.url_path

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
    st.markdown(
        '<div style="text-align:center;margin-top:28px;opacity:0.22;font-size:0.62rem;line-height:1;">'
        "Feito e desenvolvido por Ki-suCode</div>",
        unsafe_allow_html=True,
    )

# ---------------------------------------------------------------------------
# Cabeçalho institucional + conteúdo da página selecionada
# ---------------------------------------------------------------------------
cabecalho_institucional(subtitulo=f"{usuario['nome_completo'] or usuario['username']} · {datetime.now().strftime('%d/%m/%Y')}")
pagina_atual.run()
