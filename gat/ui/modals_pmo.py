"""Modais de cadastro/configuração do módulo PMO — cadastro do projeto
seguido, como especificado, pela etapa de Configuração dos Indicadores
(o gerente escolhe apenas os KPIs que deseja monitorar)."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.horario import hoje_br
from gat.pmo_business_rules import BIBLIOTECA_KPIS, KPI_ORDEM, KPI_PADRAO_HABILITADO
from gat.pmo_database import atualizar_projeto, criar_projeto, definir_kpis_projeto, kpis_habilitados_projeto

TIPOS_CONTRATO_PMO = ["Empreitada Global", "Empreitada por Preço Unitário", "Administração", "Turnkey", "Outro"]


def _renderizar_checkboxes_kpis(projeto_id: int, chave_prefixo: str, habilitados_atuais: set[str]) -> set[str]:
    escolhidos: set[str] = set()
    colunas = st.columns(2)
    for indice, chave in enumerate(KPI_ORDEM):
        with colunas[indice % 2]:
            marcado = st.checkbox(
                BIBLIOTECA_KPIS[chave]["nome"], value=chave in habilitados_atuais,
                key=f"{chave_prefixo}_{projeto_id}_{chave}",
                help=BIBLIOTECA_KPIS[chave]["objetivo"],
            )
            if marcado:
                escolhidos.add(chave)
    return escolhidos


def _avancar_wizard_novo_projeto(usuario: str) -> None:
    """Executado via `on_click` — reruns automáticos disparados por um
    clique não fecham o `st.dialog` (só um `st.rerun()` manual fecharia),
    e um `on_click` roda antes desse rerun automático, garantindo que a
    Etapa 2 já apareça na mesma interação (mesmo padrão já usado em
    `gat/ui/modals.py::_confirmar_descarte`)."""
    nome = st.session_state.get("pmo_novo_nome", "").strip()
    cliente = st.session_state.get("pmo_novo_cliente", "").strip()
    contratada = st.session_state.get("pmo_novo_contratada", "").strip()
    gerente = st.session_state.get("pmo_novo_gerente", "").strip()
    if not (nome and cliente and contratada and gerente):
        st.session_state["pmo_wizard_erro"] = "Preencha Nome, Cliente, Contratada e Gerente do projeto."
        return
    st.session_state["pmo_wizard_erro"] = None
    data_inicio = st.session_state.get("pmo_novo_data_inicio")
    data_prevista_termino = st.session_state.get("pmo_novo_data_termino")
    valor_contratual = st.session_state.get("pmo_novo_valor")
    projeto_id = criar_projeto(
        {
            "nome": nome, "cliente": cliente, "contratada": contratada, "gerente": gerente,
            "data_inicio": data_inicio.isoformat() if data_inicio else None,
            "data_prevista_termino": data_prevista_termino.isoformat() if data_prevista_termino else None,
            "valor_contratual": valor_contratual or None, "tipo_contrato": st.session_state.get("pmo_novo_tipo"),
            "observacoes": (st.session_state.get("pmo_novo_obs") or "").strip() or None,
        },
        None, usuario,
    )
    st.session_state["pmo_wizard_projeto_id"] = projeto_id
    st.session_state["pmo_wizard_step"] = 2


@st.dialog("Novo Projeto PMO", width="large")
def dialog_novo_projeto(usuario: str) -> None:
    st.session_state.setdefault("pmo_wizard_step", 1)
    st.session_state.setdefault("pmo_wizard_projeto_id", None)

    if st.session_state["pmo_wizard_step"] == 1:
        st.caption("Etapa 1 de 2 — Cadastro do projeto")
        st.text_input("Nome do projeto *", key="pmo_novo_nome")
        col1, col2 = st.columns(2)
        col1.text_input("Cliente *", key="pmo_novo_cliente")
        col2.text_input("Contratada *", key="pmo_novo_contratada")
        col3, col4 = st.columns(2)
        col3.text_input("Gerente do projeto *", key="pmo_novo_gerente")
        col4.selectbox("Tipo do contrato", TIPOS_CONTRATO_PMO, key="pmo_novo_tipo")
        col5, col6 = st.columns(2)
        col5.date_input("Data de início", value=hoje_br(), format="DD/MM/YYYY", key="pmo_novo_data_inicio")
        col6.date_input("Data prevista de término", value=None, format="DD/MM/YYYY", key="pmo_novo_data_termino")
        st.number_input("Valor contratual (opcional)", min_value=0.0, step=1000.0, format="%.2f", key="pmo_novo_valor")
        st.text_area("Observações", key="pmo_novo_obs")

        if st.session_state.get("pmo_wizard_erro"):
            st.error(st.session_state["pmo_wizard_erro"], icon=":material/error:")
        st.button(
            "Avançar para Configuração dos Indicadores", icon=":material/arrow_forward:", type="primary",
            on_click=_avancar_wizard_novo_projeto, args=(usuario,),
        )

    else:
        projeto_id = st.session_state["pmo_wizard_projeto_id"]
        st.caption("Etapa 2 de 2 — Configuração dos Indicadores")
        st.info(
            "Selecione apenas os indicadores que deseja monitorar neste projeto. Os não selecionados não "
            "aparecem no Dashboard nem ocupam espaço — podem ser habilitados a qualquer momento depois, sem "
            "perda de dados.",
            icon=":material/tune:",
        )
        habilitados_padrao = {k for k, v in KPI_PADRAO_HABILITADO.items() if v}
        escolhidos = _renderizar_checkboxes_kpis(projeto_id, "pmo_kpi_wizard", habilitados_padrao)

        if st.button("Concluir cadastro", icon=":material/check_circle:", type="primary"):
            definir_kpis_projeto(projeto_id, escolhidos, usuario)
            st.session_state.pop("pmo_wizard_step", None)
            st.session_state.pop("pmo_wizard_projeto_id", None)
            st.session_state["pmo_projeto_recem_criado"] = projeto_id
            st.rerun()


@st.dialog("Editar Projeto", width="large")
def dialog_editar_projeto(usuario: str, projeto: dict) -> None:
    nome = st.text_input("Nome do projeto *", value=projeto.get("nome") or "", key=f"pmo_edit_nome_{projeto['id']}")
    col1, col2 = st.columns(2)
    cliente = col1.text_input("Cliente *", value=projeto.get("cliente") or "", key=f"pmo_edit_cliente_{projeto['id']}")
    contratada = col2.text_input("Contratada *", value=projeto.get("contratada") or "", key=f"pmo_edit_contratada_{projeto['id']}")
    col3, col4 = st.columns(2)
    gerente = col3.text_input("Gerente do projeto *", value=projeto.get("gerente") or "", key=f"pmo_edit_gerente_{projeto['id']}")
    tipo_contrato = col4.selectbox(
        "Tipo do contrato", TIPOS_CONTRATO_PMO,
        index=TIPOS_CONTRATO_PMO.index(projeto["tipo_contrato"]) if projeto.get("tipo_contrato") in TIPOS_CONTRATO_PMO else 0,
        key=f"pmo_edit_tipo_{projeto['id']}",
    )
    col5, col6 = st.columns(2)
    data_inicio_atual = pd.to_datetime(projeto.get("data_inicio"), errors="coerce")
    data_termino_atual = pd.to_datetime(projeto.get("data_prevista_termino"), errors="coerce")
    data_inicio = col5.date_input(
        "Data de início", value=data_inicio_atual.date() if pd.notna(data_inicio_atual) else None,
        format="DD/MM/YYYY", key=f"pmo_edit_data_inicio_{projeto['id']}",
    )
    data_prevista_termino = col6.date_input(
        "Data prevista de término", value=data_termino_atual.date() if pd.notna(data_termino_atual) else None,
        format="DD/MM/YYYY", key=f"pmo_edit_data_termino_{projeto['id']}",
    )
    valor_contratual = st.number_input(
        "Valor contratual (opcional)", min_value=0.0, step=1000.0, format="%.2f",
        value=float(projeto.get("valor_contratual") or 0), key=f"pmo_edit_valor_{projeto['id']}",
    )
    observacoes = st.text_area("Observações", value=projeto.get("observacoes") or "", key=f"pmo_edit_obs_{projeto['id']}")

    if st.button("Salvar alterações", icon=":material/save:", type="primary", key=f"pmo_edit_salvar_{projeto['id']}"):
        if not (nome.strip() and cliente.strip() and contratada.strip() and gerente.strip()):
            st.error("Preencha Nome, Cliente, Contratada e Gerente do projeto.", icon=":material/error:")
            return
        atualizar_projeto(
            projeto["id"],
            {
                "nome": nome.strip(), "cliente": cliente.strip(), "contratada": contratada.strip(),
                "gerente": gerente.strip(), "data_inicio": data_inicio.isoformat() if data_inicio else None,
                "data_prevista_termino": data_prevista_termino.isoformat() if data_prevista_termino else None,
                "valor_contratual": valor_contratual or None, "tipo_contrato": tipo_contrato,
                "observacoes": observacoes.strip() or None,
            },
            usuario,
        )
        st.rerun()


@st.dialog("Configuração dos Indicadores", width="large")
def dialog_configurar_kpis(usuario: str, projeto_id: int) -> None:
    st.info(
        "Indicadores desabilitados somem do Dashboard mas nenhum dado lançado neles é apagado — podem ser "
        "reabilitados a qualquer momento.",
        icon=":material/tune:",
    )
    habilitados_atuais = kpis_habilitados_projeto(projeto_id)
    escolhidos = _renderizar_checkboxes_kpis(projeto_id, "pmo_kpi_config", habilitados_atuais)
    if st.button("Salvar configuração", icon=":material/save:", type="primary", key=f"pmo_kpi_salvar_{projeto_id}"):
        definir_kpis_projeto(projeto_id, escolhidos, usuario)
        st.rerun()
