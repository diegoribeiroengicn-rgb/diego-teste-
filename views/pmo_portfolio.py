"""PMO — Portfólio de Projetos: tela inicial do módulo PMO (Project
Management Office), totalmente independente do GAT. Lista todos os
contratos/projetos cadastrados em cartões executivos; ao clicar em um
cartão abre a página exclusiva daquele projeto."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.config import CORES
from gat.permissions import exigir_area, pode_area
from gat.pmo_business_rules import SAUDE_AMARELO, SAUDE_VERDE, SAUDE_VERMELHO
from gat.pmo_database import listar_alertas_pmo, listar_projetos, verificar_e_gerar_lembretes_cronograma
from gat.ui.formatos import formatar_data_br
from gat.ui.modals_pmo import dialog_novo_projeto

_CHAVE_PAGINA_PROJETO = "pmo_projeto"

_COR_SAUDE = {SAUDE_VERDE: CORES["verde"], SAUDE_AMARELO: CORES["dourado"], SAUDE_VERMELHO: CORES["vermelho"]}
_ICONE_SAUDE = {SAUDE_VERDE: "🟢", SAUDE_AMARELO: "🟡", SAUDE_VERMELHO: "🔴"}
_LABEL_STATUS = {
    "EM ANDAMENTO": "Em andamento", "PAUSADO": "Pausado", "CONCLUÍDO": "Concluído", "CANCELADO": "Cancelado",
}


def _abrir_projeto(projeto_id: int) -> None:
    st.session_state["pmo_projeto_selecionado"] = projeto_id
    pagina = st.session_state.get("_gat_paginas", {}).get(_CHAVE_PAGINA_PROJETO)
    if pagina is not None:
        st.switch_page(pagina)
    else:
        st.rerun()


def _renderizar_cartao_projeto(projeto: pd.Series, qtd_alertas: int) -> None:
    saude = projeto.get("saude") or SAUDE_VERDE
    with st.container(border=True):
        st.markdown(f"**{projeto['nome']}**")
        st.caption(f"{projeto.get('cliente') or '—'} · Contratada: {projeto.get('contratada') or '—'}")
        st.write(f"**Gerente:** {projeto.get('gerente') or '—'}")

        col_status, col_saude = st.columns(2)
        col_status.metric("Status", _LABEL_STATUS.get(projeto.get("status"), projeto.get("status") or "—"))
        col_saude.markdown(
            f"<div style='font-size:0.75rem;font-weight:700;text-transform:uppercase;color:{CORES['texto_fraco']};'>Saúde</div>"
            f"<div style='font-size:1.3rem;font-weight:800;'>{_ICONE_SAUDE.get(saude, '⚪')} {saude.capitalize()}</div>",
            unsafe_allow_html=True,
        )

        col_pct, col_alertas = st.columns(2)
        col_pct.metric("% Execução", f"{projeto.get('percentual_execucao') or 0:.0f}%")
        col_alertas.metric("Alertas", qtd_alertas)

        st.caption(f"Próximo marco: {projeto.get('proximo_marco') or 'Nenhum marco pendente'}")
        st.caption(f"Término previsto: {formatar_data_br(projeto.get('data_prevista_termino'))}")

        if st.button("Abrir projeto", icon=":material/arrow_forward:", key=f"pmo_abrir_{projeto['id']}", use_container_width=True):
            _abrir_projeto(int(projeto["id"]))


def render(usuario: dict) -> None:
    exigir_area(usuario, "pmo")

    verificar_e_gerar_lembretes_cronograma()

    st.subheader(":material/dashboard_customize: PMO — Portfólio de Projetos")
    st.caption(
        "Project Management Office — gerenciamento de contratos e projetos, independente das análises "
        "técnicas do GAT. Reuniões, Planos de Ação e Alertas são compartilhados com o GAT, sempre com "
        "identificação de origem."
    )

    projeto_recem_criado = st.session_state.pop("pmo_projeto_recem_criado", None)
    if projeto_recem_criado:
        st.success(
            f"Projeto cadastrado com sucesso (ID {projeto_recem_criado}). O alerta \"Cronograma pendente de "
            "recebimento.\" foi gerado automaticamente e ficará ativo até o cronograma ser anexado.",
            icon=":material/check_circle:",
        )

    if pode_area(usuario, "pmo.cadastrar"):
        if st.button("Novo Projeto", icon=":material/add_circle:", type="primary"):
            dialog_novo_projeto(usuario["username"])

    projetos = listar_projetos()
    if projetos.empty:
        st.info("Nenhum projeto PMO cadastrado ainda.", icon=":material/inbox:")
        return

    alertas = listar_alertas_pmo()
    alertas_ativos = alertas[alertas["status"].isin(["ABERTO", "EM_TRATAMENTO", "PENDENTE"])] if not alertas.empty else pd.DataFrame()

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        col1, col2, col3 = st.columns(3)
        f_status = col1.multiselect("Status", sorted(projetos["status"].dropna().unique().tolist()), key="pmo_filtro_status")
        f_saude = col2.multiselect("Saúde", [SAUDE_VERDE, SAUDE_AMARELO, SAUDE_VERMELHO], key="pmo_filtro_saude")
        f_nome = col3.text_input("Buscar por nome/cliente/contratada", key="pmo_filtro_nome")

    filtrado = projetos
    if f_status:
        filtrado = filtrado[filtrado["status"].isin(f_status)]
    if f_saude:
        filtrado = filtrado[filtrado["saude"].isin(f_saude)]
    if f_nome.strip():
        termo = f_nome.strip().lower()
        filtrado = filtrado[
            filtrado["nome"].str.lower().str.contains(termo, na=False)
            | filtrado["cliente"].fillna("").str.lower().str.contains(termo, na=False)
            | filtrado["contratada"].fillna("").str.lower().str.contains(termo, na=False)
        ]

    col_m1, col_m2, col_m3, col_m4 = st.columns(4)
    col_m1.metric("Total de projetos", len(filtrado))
    col_m2.metric("Em andamento", int((filtrado["status"] == "EM ANDAMENTO").sum()))
    col_m3.metric("Saúde crítica", int((filtrado["saude"] == SAUDE_VERMELHO).sum()))
    col_m4.metric("Alertas ativos (PMO)", len(alertas_ativos))

    if filtrado.empty:
        st.warning("Nenhum projeto encontrado com os filtros aplicados.", icon=":material/search_off:")
        return

    st.markdown("#####")
    colunas = st.columns(3)
    for indice, (_, projeto) in enumerate(filtrado.sort_values("nome").iterrows()):
        qtd_alertas = int((alertas_ativos["projeto_id"] == projeto["id"]).sum()) if not alertas_ativos.empty else 0
        with colunas[indice % 3]:
            _renderizar_cartao_projeto(projeto, qtd_alertas)
