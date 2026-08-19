"""Pop-up "Gerar e-mail de cobrança" da Devolutiva Externa (itens 2-3 e
10-11 da regra de cobrança recorrente) — mostra a minuta do e-mail
(assunto + corpo, diferente a partir da 2ª cobrança) para o usuário
copiar/enviar por fora do sistema, e só registra a cobrança na Linha do
Tempo/no histórico após a confirmação explícita "Confirmar cobrança
realizada" (nunca envia nada automaticamente)."""

from __future__ import annotations

from typing import Any

import streamlit as st

from gat.database import registrar_cobranca_devolutiva
from gat.devolutiva_externa import gerar_minuta_cobranca
from gat.normalizacao import texto_seguro
from gat.ui.pos_mutacao import atualizar_apos_mutacao


@st.dialog("Cobrança de Devolutiva Externa", width="large")
def dialog_cobranca_devolutiva(usuario: dict, modulo: str, registro: dict[str, Any]) -> None:
    rotulo_modulo = "Prestador" if modulo == "prestadores" else "Cessionário"
    nome = texto_seguro(registro.get("nome")).strip() or "—"
    codigo = texto_seguro(registro.get("codigo")).strip() or "—"
    disciplina = texto_seguro(registro.get("disciplina")).strip() or "—"
    num_at = texto_seguro(registro.get("num_at")).strip() or "—"
    numero_cobranca = int(registro.get("numero_proxima_cobranca") or (registro.get("numero_cobrancas_realizadas", 0) + 1))
    projeto_id = int(registro["projeto_id"])

    st.write(f"**{nome}** ({codigo}) — {disciplina}")
    st.caption(f"{rotulo_modulo} · N° AT {num_at} · {numero_cobranca}ª cobrança")

    minuta = gerar_minuta_cobranca(
        numero_cobranca, registro.get("codigo"), registro.get("nome"), registro.get("disciplina"),
        registro.get("num_at"), registro.get("data_ultima_at"),
        data_primeira_cobranca=registro.get("data_primeira_cobranca"),
    )

    st.text_input("Assunto", value=minuta["assunto"], disabled=True, key=f"dv_assunto_{modulo}_{projeto_id}")
    st.text_area("Corpo do e-mail (copie e envie pelo seu canal de e-mail habitual)", value=minuta["corpo"], height=260, key=f"dv_corpo_{modulo}_{projeto_id}")

    st.caption(
        "O sistema não envia este e-mail automaticamente. Após enviá-lo pelo seu canal de e-mail, confirme "
        "abaixo para registrar a cobrança na Linha do Tempo e iniciar a contagem dos próximos 5 dias úteis."
    )

    canal = st.selectbox("Canal utilizado", ["E-mail", "Telefone", "Reunião", "Outro"], key=f"dv_canal_{modulo}_{projeto_id}")
    observacao = st.text_input("Observação (opcional)", key=f"dv_obs_{modulo}_{projeto_id}")

    col_confirmar, col_cancelar = st.columns(2)
    if col_confirmar.button("Confirmar cobrança realizada", icon=":material/check_circle:", type="primary", use_container_width=True, key=f"dv_confirmar_{modulo}_{projeto_id}"):
        registrar_cobranca_devolutiva(modulo, projeto_id, numero_cobranca, usuario["username"], canal, observacao.strip() or None)
        st.toast(f"{numero_cobranca}ª cobrança de devolutiva registrada.", icon=":material/check_circle:")
        atualizar_apos_mutacao()
    if col_cancelar.button("Cancelar", use_container_width=True, key=f"dv_cancelar_{modulo}_{projeto_id}"):
        st.rerun()
