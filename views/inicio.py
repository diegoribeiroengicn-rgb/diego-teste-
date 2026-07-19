"""View: Início — portal de acesso aos módulos do Sistema GAT 2026."""

from __future__ import annotations

import streamlit as st

from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores, filtrar_ativos
from gat.config import CORES
from gat.database import listar_cessionarios, listar_prestadores

_CARTOES = [
    {
        "titulo": "Prestadores",
        "icone": "📐",
        "descricao": "Projetos, revisões, SLA e avaliação de prestadores de serviço.",
        "pagina": "prestadores_dashboard",
        "cor": CORES["navy"],
    },
    {
        "titulo": "Cessionários",
        "icone": "🏬",
        "descricao": "Projetos, prazos e análises de cessionários.",
        "pagina": "cessionarios_dashboard",
        "cor": CORES["azul_2"],
    },
    {
        "titulo": "Consolidado",
        "icone": "📊",
        "descricao": "Visão executiva integrada de Prestadores e Cessionários.",
        "pagina": "consolidado_visao",
        "cor": CORES["ceu"],
    },
    {
        "titulo": "Gestão",
        "icone": "🗂",
        "descricao": "Alertas críticos, lembretes de PEP e reuniões pendentes.",
        "pagina": "gestao_alertas",
        "cor": CORES["laranja"],
    },
]


def _navegar_para(url_path: str) -> None:
    """Troca de página usando o objeto `st.Page` indexado em session_state pelo app.py."""
    pagina = st.session_state.get("_gat_paginas", {}).get(url_path)
    if pagina is not None:
        st.switch_page(pagina)


def render(usuario: dict) -> None:
    st.subheader(f"👋 Bem-vindo(a), {usuario['nome_completo'] or usuario['username']}")
    st.caption("Portal do Sistema GAT 2026 · Controle de Análises Técnicas · Tecnoplano")

    df_prest = enriquecer_prestadores(filtrar_ativos(listar_prestadores()))
    df_cess = enriquecer_cessionarios(filtrar_ativos(listar_cessionarios()))

    total_ativos = len(df_prest) + len(df_cess)
    total_atrasados = int((df_prest["status_entrega_calc"] == "ATRASADO").sum() if not df_prest.empty else 0) + \
        int((df_cess["status_entrega_calc"] == "ATRASADO").sum() if not df_cess.empty else 0)
    total_pendente_reuniao = int(df_prest["pendente_reuniao"].sum() if not df_prest.empty else 0) + \
        int(df_cess["pendente_reuniao"].sum() if not df_cess.empty else 0)
    total_sem_pep = int((~df_prest["tem_pep"]).sum() if not df_prest.empty else 0) + \
        int((~df_cess["tem_pep"]).sum() if not df_cess.empty else 0)

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Projetos Ativos", total_ativos)
    col2.metric("Atrasados", total_atrasados)
    col3.metric("Pendente de Reunião", total_pendente_reuniao)
    col4.metric("Sem PEP", total_sem_pep)

    st.markdown("#####")
    st.markdown("##### Módulos")

    colunas = st.columns(4)
    for coluna, cartao in zip(colunas, _CARTOES):
        with coluna:
            st.markdown(
                f"""
                <div class="gat-kpi-card" style="border-left-color:{cartao['cor']}; min-height:150px;">
                    <div style="font-size:28px">{cartao['icone']}</div>
                    <div style="font-weight:700; font-size:16px; color:{cartao['cor']}; margin-top:6px;">{cartao['titulo']}</div>
                    <div style="font-size:12px; color:#64748B; margin-top:4px;">{cartao['descricao']}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
            if st.button("Acessar", key=f"acessar_{cartao['pagina']}", use_container_width=True):
                _navegar_para(cartao["pagina"])

    st.markdown("#####")
    st.markdown("##### Acesso rápido")
    col_a, col_b, col_c = st.columns(3)
    with col_a:
        if st.button("➕ Novo Prestador", use_container_width=True):
            st.session_state["abrir_novo_prestador"] = True
            _navegar_para("prestadores_projetos")
    with col_b:
        if st.button("➕ Novo Cessionário", use_container_width=True):
            st.session_state["abrir_novo_cessionario"] = True
            _navegar_para("cessionarios_projetos")
    with col_c:
        if st.button("🧷 Ver Lembretes (Sem PEP)", use_container_width=True):
            _navegar_para("gestao_lembretes")
