"""Pop-up "Registrar tratativa" de um projeto em HOLD (itens 16-18 do
módulo de HOLD) — confirma o contato com o especialista, exige o registro
do que foi resolvido e decide se o projeto permanece em HOLD ou é
retirado (o que encerra o HOLD e recalcula SLA/prazo automaticamente)."""

from __future__ import annotations

from datetime import date
from typing import Any

import streamlit as st

from gat.database import DECISAO_HOLD_OPCOES, registrar_tratativa_hold
from gat.horario import hoje_br
from gat.normalizacao import texto_seguro
from gat.ui.pos_mutacao import atualizar_apos_mutacao

_LABEL_DECISAO = {"MANTER": "Permanece em HOLD", "RETIRADO": "Retirar do HOLD"}


@st.dialog("Registrar tratativa — HOLD")
def dialog_tratativa_hold(usuario: dict, modulo: str, registro: dict[str, Any]) -> None:
    rotulo_modulo = "Prestador" if modulo == "prestadores" else "Cessionário"
    coluna_nome = "prestador" if modulo == "prestadores" else "cessionario"
    nome = texto_seguro(registro.get(coluna_nome)).strip() or "—"
    codigo = texto_seguro(registro.get("codigo")).strip() or "—"
    disciplina = texto_seguro(registro.get("disciplina")).strip() or "—"
    num_at = texto_seguro(registro.get("num_at")).strip() or "—"
    st.write(f"**{nome}** ({codigo}) — {disciplina}")
    st.caption(f"{rotulo_modulo} · N° AT {num_at}")

    especialista = st.text_input("Especialista contatado *", key=f"hold_esp_{modulo}_{registro['id']}")
    data_contato = st.date_input("Data do contato *", value=hoje_br(), format="DD/MM/YYYY", key=f"hold_data_{modulo}_{registro['id']}")
    resolucao = st.text_area("O que foi resolvido *", key=f"hold_res_{modulo}_{registro['id']}", help="Registro obrigatório da tratativa realizada.")
    decisao = st.radio(
        "Decisão", DECISAO_HOLD_OPCOES, format_func=lambda d: _LABEL_DECISAO[d],
        key=f"hold_dec_{modulo}_{registro['id']}",
    )
    if decisao == "RETIRADO":
        st.caption("Ao retirar do HOLD, o SLA e o prazo do projeto são recalculados automaticamente a partir de hoje.")

    col_salvar, col_cancelar = st.columns(2)
    if col_salvar.button("Confirmar tratativa", icon=":material/check_circle:", type="primary", use_container_width=True, key=f"hold_salvar_{modulo}_{registro['id']}"):
        if not especialista.strip():
            st.error("Informe o especialista contatado.")
        elif not data_contato:
            st.error("Informe a data do contato.")
        elif not resolucao.strip():
            st.error("O registro do que foi resolvido é obrigatório.")
        else:
            registrar_tratativa_hold(
                modulo, registro["id"], especialista.strip(), data_contato.isoformat() if isinstance(data_contato, date) else str(data_contato),
                resolucao.strip(), decisao, usuario["username"],
            )
            st.toast("Tratativa registrada.", icon=":material/check_circle:")
            atualizar_apos_mutacao()
    if col_cancelar.button("Cancelar", use_container_width=True, key=f"hold_cancelar_{modulo}_{registro['id']}"):
        st.rerun()
