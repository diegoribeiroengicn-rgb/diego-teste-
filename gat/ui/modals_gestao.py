"""
Pop-ups/modais interativos (`st.dialog`) da Central de Gestão: cadastro e
edição de Reuniões (com vínculo N:N a projetos de Prestadores e
Cessionários) e de Planos de Ação.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

import streamlit as st

from gat.config import RESPONSAVEIS, STATUS_PLANO_ACAO_OPCOES
from gat.database import (
    atualizar_plano_acao,
    atualizar_reuniao,
    inserir_plano_acao,
    inserir_reuniao,
    listar_cessionarios,
    listar_prestadores,
    listar_reunioes,
)


def _parse_data(valor: Any) -> date | None:
    if not valor:
        return None
    if isinstance(valor, date):
        return valor
    if isinstance(valor, str):
        try:
            return datetime.fromisoformat(valor[:10]).date()
        except ValueError:
            return None
    return None


def _idx(opcoes: list[str], valor: str | None) -> int:
    if valor in opcoes:
        return opcoes.index(valor)
    return 0


# ---------------------------------------------------------------------------
# Modal de Reuniões
# ---------------------------------------------------------------------------


@st.dialog("Reunião", width="large")
def dialog_reuniao(usuario: str, registro: dict[str, Any] | None = None) -> None:
    editando = registro is not None
    sufixo = f"edit_{registro['id']}" if editando else "novo"

    titulo = st.text_input("Título *", value=registro.get("titulo", "") if registro else "", key=f"reu_titulo_{sufixo}")
    pauta = st.text_area("Pauta", value=registro.get("pauta", "") if registro else "", key=f"reu_pauta_{sufixo}")

    col1, col2 = st.columns(2)
    with col1:
        data_prevista = st.date_input("Data Prevista", value=_parse_data(registro.get("data_prevista")) if registro else date.today(), format="DD/MM/YYYY", key=f"reu_dprev_{sufixo}")
    with col2:
        data_realizada = st.date_input("Data Realizada", value=_parse_data(registro.get("data_realizada")) if registro else None, format="DD/MM/YYYY", key=f"reu_dreal_{sufixo}")

    st.markdown("##### Projetos vinculados")
    df_prest = listar_prestadores()
    df_cess = listar_cessionarios()
    opcoes_prest = {f"Item {r['item']} — {r['prestador']}": r["id"] for _, r in df_prest.iterrows()} if not df_prest.empty else {}
    opcoes_cess = {f"Item {r['item']} — {r['cessionario']}": r["id"] for _, r in df_cess.iterrows()} if not df_cess.empty else {}

    projetos_atuais = registro.get("projetos", []) if registro else []
    default_prest = [k for k, v in opcoes_prest.items() if any(p["modulo"] == "prestadores" and p["projeto_id"] == v for p in projetos_atuais)]
    default_cess = [k for k, v in opcoes_cess.items() if any(p["modulo"] == "cessionarios" and p["projeto_id"] == v for p in projetos_atuais)]

    col3, col4 = st.columns(2)
    with col3:
        sel_prest = st.multiselect("Prestadores", list(opcoes_prest.keys()), default=default_prest, key=f"reu_prest_{sufixo}")
    with col4:
        sel_cess = st.multiselect("Cessionários", list(opcoes_cess.keys()), default=default_cess, key=f"reu_cess_{sufixo}")

    participantes_default = "\n".join(registro.get("participantes", [])) if registro else ""
    participantes_txt = st.text_area("Participantes (um por linha)", value=participantes_default, key=f"reu_part_{sufixo}", height=100)

    ata = st.text_area("Ata", value=registro.get("ata", "") if registro else "", key=f"reu_ata_{sufixo}")
    decisoes = st.text_area("Decisões", value=registro.get("decisoes", "") if registro else "", key=f"reu_dec_{sufixo}")

    col_salvar, col_cancelar = st.columns(2)
    salvar = col_salvar.button("Salvar", icon=":material/save:", type="primary", use_container_width=True, key=f"reu_salvar_{sufixo}")
    cancelar = col_cancelar.button("Cancelar", use_container_width=True, key=f"reu_cancelar_{sufixo}")

    if cancelar:
        st.rerun()

    if salvar:
        if not titulo:
            st.error("Informe o título da reunião.")
            return
        dados = {
            "titulo": titulo,
            "pauta": pauta,
            "data_prevista": data_prevista.isoformat() if data_prevista else None,
            "data_realizada": data_realizada.isoformat() if data_realizada else None,
            "ata": ata,
            "decisoes": decisoes,
        }
        projetos = [("prestadores", opcoes_prest[k]) for k in sel_prest] + [("cessionarios", opcoes_cess[k]) for k in sel_cess]
        participantes = [linha for linha in participantes_txt.splitlines() if linha.strip()]

        if editando:
            atualizar_reuniao(registro["id"], dados, projetos, participantes, usuario)
            st.toast("Reunião atualizada com sucesso.", icon=":material/check_circle:")
        else:
            inserir_reuniao(dados, projetos, participantes, usuario)
            st.toast("Reunião registrada com sucesso.", icon=":material/check_circle:")
        st.session_state["_gat_refresh"] = st.session_state.get("_gat_refresh", 0) + 1
        st.rerun()


# ---------------------------------------------------------------------------
# Modal de Planos de Ação
# ---------------------------------------------------------------------------


@st.dialog("Plano de Ação")
def dialog_plano_acao(usuario: str, registro: dict[str, Any] | None = None, reuniao_id_padrao: int | None = None) -> None:
    editando = registro is not None
    sufixo = f"edit_{registro['id']}" if editando else "novo"

    df_reunioes = listar_reunioes()
    opcoes_reuniao = {"Nenhuma": None}
    opcoes_reuniao.update({f"{r['titulo']} ({(r['data_prevista'] or '-')})": r["id"] for _, r in df_reunioes.iterrows()})

    reuniao_atual = registro.get("reuniao_id") if registro else reuniao_id_padrao
    label_atual = next((k for k, v in opcoes_reuniao.items() if v == reuniao_atual), "Nenhuma")

    descricao = st.text_area("Descrição *", value=registro.get("descricao", "") if registro else "", key=f"plano_desc_{sufixo}")

    col1, col2 = st.columns(2)
    with col1:
        responsavel = st.selectbox("Responsável", RESPONSAVEIS, index=_idx(RESPONSAVEIS, registro.get("responsavel") if registro else None), key=f"plano_resp_{sufixo}")
    with col2:
        prazo = st.date_input("Prazo", value=_parse_data(registro.get("prazo")) if registro else None, format="DD/MM/YYYY", key=f"plano_prazo_{sufixo}")

    status = st.selectbox("Status", STATUS_PLANO_ACAO_OPCOES, index=_idx(STATUS_PLANO_ACAO_OPCOES, registro.get("status") if registro else "PENDENTE"), key=f"plano_status_{sufixo}")
    reuniao_label = st.selectbox("Reunião vinculada", list(opcoes_reuniao.keys()), index=list(opcoes_reuniao.keys()).index(label_atual), key=f"plano_reuniao_{sufixo}")

    col_salvar, col_cancelar = st.columns(2)
    salvar = col_salvar.button("Salvar", icon=":material/save:", type="primary", use_container_width=True, key=f"plano_salvar_{sufixo}")
    cancelar = col_cancelar.button("Cancelar", use_container_width=True, key=f"plano_cancelar_{sufixo}")

    if cancelar:
        st.rerun()

    if salvar:
        if not descricao:
            st.error("Descreva a ação.")
            return
        dados = {
            "reuniao_id": opcoes_reuniao[reuniao_label],
            "descricao": descricao,
            "responsavel": responsavel,
            "prazo": prazo.isoformat() if prazo else None,
            "status": status,
        }
        if editando:
            atualizar_plano_acao(registro["id"], dados, usuario)
            st.toast("Plano de ação atualizado com sucesso.", icon=":material/check_circle:")
        else:
            inserir_plano_acao(dados, usuario)
            st.toast("Plano de ação registrado com sucesso.", icon=":material/check_circle:")
        st.session_state["_gat_refresh"] = st.session_state.get("_gat_refresh", 0) + 1
        st.rerun()
