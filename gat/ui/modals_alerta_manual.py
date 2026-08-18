"""Pop-up de criação/edição de Alertas Manuais (item 1 do módulo de
SLA/Prioridades) — alertas livres, associados a um projeto de Prestador ou
Cessionário, independentes do motor automático de gargalo/atraso."""

from __future__ import annotations

from datetime import date
from typing import Any

import pandas as pd
import streamlit as st

from gat.config import DISCIPLINAS, RESPONSAVEIS
from gat.database import (
    PRIORIDADE_ALERTA_MANUAL_OPCOES,
    atualizar_alerta_manual,
    criar_alerta_manual,
    listar_usuarios,
    registrar_atividade,
)
from gat.normalizacao import inteiro_seguro


def _idx(opcoes: list[str], valor: Any) -> int:
    try:
        return opcoes.index(valor)
    except (ValueError, TypeError):
        return 0


def _data(valor: str | None) -> date | None:
    if not valor:
        return None
    try:
        return date.fromisoformat(str(valor)[:10])
    except ValueError:
        return None


@st.dialog("Alerta manual", width="large")
def dialog_alerta_manual(
    usuario: dict, modulo: str, registro: dict[str, Any] | None = None,
    prefill: dict[str, Any] | None = None,
) -> None:
    editando = registro is not None
    sufixo = f"edit_{registro['id']}" if editando else "novo"
    prefill = prefill or {}
    rotulo_modulo = "Prestador" if modulo == "prestadores" else "Cessionário"

    st.caption(
        "Alerta criado manualmente para acompanhamento de um projeto específico — independente dos "
        "alertas automáticos de gargalo/atraso. Fica visível na Central de Alertas até ser encerrado."
    )

    def _val(campo: str, padrao: Any = "") -> Any:
        origem = registro if editando else prefill
        valor = origem.get(campo, padrao)
        return padrao if valor is None or (isinstance(valor, float) and pd.isna(valor)) else valor

    titulo = st.text_input("Título *", value=_val("titulo", ""), key=f"am_titulo_{sufixo}")
    descricao = st.text_area("Descrição", value=_val("descricao", "") or "", key=f"am_descricao_{sufixo}")

    col1, col2, col3 = st.columns(3)
    with col1:
        num_at = st.text_input("N° AT", value=_val("num_at", "") or "", key=f"am_at_{sufixo}")
    with col2:
        codigo_projeto = st.text_input("Código do projeto", value=_val("codigo_projeto", "") or "", key=f"am_codigo_{sufixo}")
    with col3:
        nome_entidade = st.text_input(f"{rotulo_modulo} *", value=_val("nome_entidade", "") or "", key=f"am_nome_{sufixo}")

    col4, col5, col6 = st.columns(3)
    with col4:
        disciplina = st.selectbox(
            "Disciplina", ["—"] + DISCIPLINAS, index=_idx(["—"] + DISCIPLINAS, _val("disciplina", "—")) or 0,
            key=f"am_disciplina_{sufixo}",
        )
    with col5:
        revisao = st.number_input("Revisão", min_value=0, step=1, value=inteiro_seguro(_val("revisao", 0), 0), key=f"am_revisao_{sufixo}")
    with col6:
        especialista = st.selectbox(
            "Especialista responsável", ["—"] + RESPONSAVEIS,
            index=_idx(["—"] + RESPONSAVEIS, _val("especialista", "—")) or 0,
            key=f"am_especialista_{sufixo}",
        )

    col7, col8 = st.columns(2)
    with col7:
        prioridade = st.selectbox(
            "Prioridade", PRIORIDADE_ALERTA_MANUAL_OPCOES,
            index=_idx(PRIORIDADE_ALERTA_MANUAL_OPCOES, _val("prioridade", "Média")),
            key=f"am_prioridade_{sufixo}",
        )
    with col8:
        vencimento = st.date_input("Vencimento", value=_data(_val("vencimento")), format="DD/MM/YYYY", key=f"am_vencimento_{sufixo}")

    observacoes = st.text_area("Observações", value=_val("observacoes", "") or "", key=f"am_obs_{sufixo}")

    usuarios_df = listar_usuarios()
    opcoes_destinatarios = usuarios_df["username"].tolist() if not usuarios_df.empty else []
    destinatarios_atuais = (_val("destinatarios", "") or "").split(",") if _val("destinatarios", "") else []
    destinatarios_atuais = [d for d in destinatarios_atuais if d in opcoes_destinatarios]
    destinatarios = st.multiselect("Destinatários (notificação/ciência)", opcoes_destinatarios, default=destinatarios_atuais, key=f"am_dest_{sufixo}")

    col_salvar, col_cancelar = st.columns(2)
    salvar = col_salvar.button("Salvar", icon=":material/save:", type="primary", use_container_width=True, key=f"am_salvar_{sufixo}")
    cancelar = col_cancelar.button("Cancelar", use_container_width=True, key=f"am_cancelar_{sufixo}")

    if cancelar:
        st.rerun()

    if salvar:
        if not titulo.strip():
            st.error("O título é obrigatório.")
            return
        if not nome_entidade.strip():
            st.error(f"O campo {rotulo_modulo} é obrigatório.")
            return

        projeto_id = _val("projeto_id", None)
        dados = {
            "modulo": modulo,
            "projeto_id": int(projeto_id) if projeto_id else None,
            "titulo": titulo.strip(),
            "descricao": descricao.strip() or None,
            "num_at": num_at.strip() or None,
            "codigo_projeto": codigo_projeto.strip() or None,
            "nome_entidade": nome_entidade.strip(),
            "disciplina": None if disciplina == "—" else disciplina,
            "revisao": int(revisao),
            "especialista": None if especialista == "—" else especialista,
            "prioridade": prioridade,
            "vencimento": vencimento.isoformat() if vencimento else None,
            "observacoes": observacoes.strip() or None,
            "destinatarios": ",".join(destinatarios) if destinatarios else None,
        }

        if editando:
            atualizar_alerta_manual(registro["id"], dados, usuario["username"])
            registrar_atividade(usuario["username"], usuario.get("perfil"), "EDICAO_ALERTA_MANUAL", modulo=modulo, detalhe=f"Alerta manual #{registro['id']} editado.")
            st.toast("Alerta manual atualizado.", icon=":material/check_circle:")
        else:
            alerta_id = criar_alerta_manual(dados, usuario["username"])
            registrar_atividade(usuario["username"], usuario.get("perfil"), "CRIACAO_ALERTA_MANUAL", modulo=modulo, detalhe=f"Alerta manual #{alerta_id} criado: {titulo.strip()}")
            st.toast("Alerta manual criado.", icon=":material/check_circle:")
        st.rerun()


@st.dialog("Encerrar alerta manual")
def dialog_encerrar_alerta_manual(usuario: dict, alerta: dict[str, Any]) -> None:
    from gat.database import encerrar_alerta_manual

    st.write(f"**{alerta['titulo']}** — {alerta.get('nome_entidade') or '—'}")
    motivo = st.text_area("Motivo do encerramento (obrigatório)", key=f"am_motivo_enc_{alerta['id']}")
    col_c, col_x = st.columns(2)
    if col_c.button("Confirmar encerramento", type="primary", use_container_width=True, key=f"am_confirma_enc_{alerta['id']}"):
        if not motivo.strip():
            st.error("O motivo do encerramento é obrigatório.")
        else:
            encerrar_alerta_manual(alerta["id"], motivo.strip(), usuario["username"])
            registrar_atividade(usuario["username"], usuario.get("perfil"), "ENCERRAMENTO_ALERTA_MANUAL", modulo=alerta["modulo"], detalhe=f"Alerta manual #{alerta['id']} encerrado.")
            st.toast("Alerta manual encerrado.", icon=":material/check_circle:")
            st.rerun()
    if col_x.button("Cancelar", use_container_width=True, key=f"am_cancela_enc_{alerta['id']}"):
        st.rerun()
