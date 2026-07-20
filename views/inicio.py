"""View: Início — portal de acesso aos módulos do Sistema GAT 2026."""

from __future__ import annotations

import streamlit as st

import pandas as pd

from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores, filtrar_ativos, filtrar_por_competencia
from gat.config import CORES
from gat.database import listar_cessionarios, listar_prestadores
from gat.permissions import pode_area, pode_modulo
from gat.ui.filtros import rotulo_competencia, seletor_competencia

_CARTOES = [
    {
        "titulo": "Prestadores",
        "icone": ":material/architecture:",
        "descricao": "Projetos, revisões, SLA e avaliação de prestadores de serviço.",
        "pagina": "prestadores_dashboard",
        "cor": CORES["navy"],
    },
    {
        "titulo": "Cessionários",
        "icone": ":material/store:",
        "descricao": "Projetos, prazos e análises de cessionários.",
        "pagina": "cessionarios_dashboard",
        "cor": CORES["azul_2"],
    },
    {
        "titulo": "Consolidado",
        "icone": ":material/insights:",
        "descricao": "Visão executiva integrada de Prestadores e Cessionários.",
        "pagina": "consolidado_visao",
        "cor": CORES["ceu"],
    },
    {
        "titulo": "Gestão",
        "icone": ":material/task_alt:",
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
    st.subheader(f"Bem-vindo(a), {usuario['nome_completo'] or usuario['username']}")
    st.caption("Portal do Sistema GAT 2026 · Controle de Análises Técnicas · Tecnoplano")

    pode_prest = pode_modulo(usuario, "prestadores")
    pode_cess = pode_modulo(usuario, "cessionarios")

    # Módulos sem permissão não fornecem dados nem para os indicadores
    # agregados desta página — nenhuma consulta é feita para eles.
    df_prest = enriquecer_prestadores(filtrar_ativos(listar_prestadores())) if pode_prest else pd.DataFrame()
    df_cess = enriquecer_cessionarios(filtrar_ativos(listar_cessionarios())) if pode_cess else pd.DataFrame()

    with st.expander("Filtro de competência", icon=":material/calendar_month:", expanded=False):
        mes, ano = seletor_competencia("inicio")
    if mes or ano:
        st.caption(f"Competência: **{rotulo_competencia(mes, ano)}** (baseado na Data de Solicitação)")
        df_prest = filtrar_por_competencia(df_prest, "data_solicitacao", mes, ano)
        df_cess = filtrar_por_competencia(df_cess, "data_solicitacao", mes, ano)

    total_ativos_prest = len(df_prest)
    total_ativos_cess = len(df_cess)
    total_atrasados = int((df_prest["status_entrega_calc"] == "ATRASADO").sum() if not df_prest.empty else 0) + \
        int((df_cess["status_entrega_calc"] == "ATRASADO").sum() if not df_cess.empty else 0)
    total_pendente_reuniao = int(df_prest["pendente_reuniao"].sum() if not df_prest.empty else 0) + \
        int(df_cess["pendente_reuniao"].sum() if not df_cess.empty else 0)
    total_sem_pep = int((~df_prest["tem_pep"]).sum() if not df_prest.empty else 0) + \
        int((~df_cess["tem_pep"]).sum() if not df_cess.empty else 0)

    st.markdown("##### Indicadores gerais")
    col1, col2, col3 = st.columns(3)
    col1.metric("Projetos Ativos", total_ativos_prest + total_ativos_cess)
    col2.metric("Atrasados", total_atrasados)
    col3.metric("Pendente de Reunião", total_pendente_reuniao)
    # PEP ausente é um alerta discreto, não um indicador principal — não tem
    # card próprio aqui; aparece na linha/detalhe do projeto e na área de
    # Alertas/Lembretes.
    if total_sem_pep:
        st.caption(f":material/info: {total_sem_pep} projeto(s) aguardando PEP — veja em Lembretes (Sem PEP).")

    if pode_prest or pode_cess:
        st.markdown("##### Projetos ativos por módulo")
        colunas_a = st.columns(1 + pode_prest + pode_cess)
        colunas_a[0].metric("Total", total_ativos_prest + total_ativos_cess)
        idx = 1
        if pode_prest:
            with colunas_a[idx]:
                st.metric("Prestadores", total_ativos_prest)
                if st.button("Ver lista", icon=":material/arrow_forward:", type="tertiary", key="ver_ativos_prest"):
                    _navegar_para("prestadores_projetos")
            idx += 1
        if pode_cess:
            with colunas_a[idx]:
                st.metric("Cessionários", total_ativos_cess)
                if st.button("Ver lista", icon=":material/arrow_forward:", type="tertiary", key="ver_ativos_cess"):
                    _navegar_para("cessionarios_projetos")

    em_analise_prest = int((df_prest["status_analise"] == "EM ANÁLISE").sum()) if not df_prest.empty else 0
    em_analise_cess = int((df_cess["status_analise"] == "EM ANÁLISE").sum()) if not df_cess.empty else 0

    if pode_prest or pode_cess:
        st.markdown("##### Projetos em análise por módulo")
        colunas_b = st.columns(1 + pode_prest + pode_cess)
        colunas_b[0].metric("Total", em_analise_prest + em_analise_cess)
        idx = 1
        if pode_prest:
            with colunas_b[idx]:
                st.metric("Prestadores", em_analise_prest)
                if st.button("Ver lista", icon=":material/arrow_forward:", type="tertiary", key="ver_analise_prest"):
                    st.session_state["filtro_prest_status_default"] = ["EM ANÁLISE"]
                    _navegar_para("prestadores_projetos")
            idx += 1
        if pode_cess:
            with colunas_b[idx]:
                st.metric("Cessionários", em_analise_cess)
                if st.button("Ver lista", icon=":material/arrow_forward:", type="tertiary", key="ver_analise_cess"):
                    st.session_state["filtro_cess_status_default"] = ["EM ANÁLISE"]
                    _navegar_para("cessionarios_projetos")

    pagina_gestao = next(
        (pagina for area, pagina in (
            ("alertas", "gestao_alertas"), ("lembretes", "gestao_lembretes"), ("reunioes", "gestao_reunioes"),
        ) if pode_area(usuario, area)),
        None,
    )
    cartoes_visiveis = [
        {**cartao, "pagina": pagina_gestao} if cartao["titulo"] == "Gestão" and pagina_gestao else cartao
        for cartao in _CARTOES
        if (cartao["titulo"] != "Prestadores" or pode_prest)
        and (cartao["titulo"] != "Cessionários" or pode_cess)
        and (cartao["titulo"] != "Consolidado" or pode_modulo(usuario, "consolidado"))
        and (cartao["titulo"] != "Gestão" or pagina_gestao is not None)
    ]

    if cartoes_visiveis:
        st.markdown("#####")
        st.markdown("##### Módulos")

        colunas = st.columns(len(cartoes_visiveis))
        for coluna, cartao in zip(colunas, cartoes_visiveis):
            with coluna:
                with st.container(border=True):
                    st.markdown(cartao["icone"])
                    st.markdown(f"**{cartao['titulo']}**")
                    st.caption(cartao["descricao"])
                    if st.button("Acessar", key=f"acessar_{cartao['pagina']}", type="primary", use_container_width=True):
                        _navegar_para(cartao["pagina"])

    acoes_rapidas = []
    if pode_prest and pode_area(usuario, "prestadores.cadastrar"):
        acoes_rapidas.append("prestador")
    if pode_cess and pode_area(usuario, "cessionarios.cadastrar"):
        acoes_rapidas.append("cessionario")
    if pode_area(usuario, "lembretes"):
        acoes_rapidas.append("lembretes")

    if acoes_rapidas:
        st.markdown("#####")
        st.markdown("##### Acesso rápido")
        colunas_rapidas = st.columns(len(acoes_rapidas))
        for coluna, acao in zip(colunas_rapidas, acoes_rapidas):
            with coluna:
                if acao == "prestador" and st.button("Novo Prestador", icon=":material/add:", use_container_width=True):
                    st.session_state["abrir_novo_prestador"] = True
                    _navegar_para("prestadores_projetos")
                if acao == "cessionario" and st.button("Novo Cessionário", icon=":material/add:", use_container_width=True):
                    st.session_state["abrir_novo_cessionario"] = True
                    _navegar_para("cessionarios_projetos")
                if acao == "lembretes" and st.button("Ver Lembretes (Sem PEP)", icon=":material/pending_actions:", use_container_width=True):
                    _navegar_para("gestao_lembretes")
