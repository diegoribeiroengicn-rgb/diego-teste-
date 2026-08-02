"""Modal genérico de "Arquivar registro", reaproveitado por todos os
módulos que ganharam a ação de arquivamento (Prestadores, Cessionários,
Cadastros, Administração, Reuniões, Planos de Ação, Alertas, PMO) — evita
duplicar o mesmo formulário em cada view."""

from __future__ import annotations

from typing import Callable

import streamlit as st

from gat.arquivo_business_rules import TEXTO_CONFIRMACAO_1, TEXTO_CONFIRMACAO_2
from gat.arquivo_database import arquivar_projeto_gat, arquivar_registro, excluir_definitivamente, restaurar_registro


@st.dialog("Arquivar registro")
def dialog_arquivar(tabela: str, registro_id: int, descricao: str, usuario: str, ao_concluir: Callable[[], None] | None = None) -> None:
    st.write(f"Arquivar: **{descricao}**")
    st.caption(
        "O registro sai das telas e indicadores operacionais, mas continua guardado — pode ser "
        "restaurado a qualquer momento pelo módulo Arquivo, sem perda de dados."
    )
    motivo = st.text_area("Motivo (opcional)", key=f"arquivo_motivo_{tabela}_{registro_id}")
    teste = st.checkbox("Este é um registro de teste (área Testes do módulo Arquivo)", key=f"arquivo_teste_{tabela}_{registro_id}")
    if st.button("Confirmar arquivamento", icon=":material/archive:", type="primary", key=f"arquivo_confirmar_{tabela}_{registro_id}"):
        arquivar_registro(tabela, registro_id, usuario, motivo=motivo.strip() or None, teste=teste)
        st.success("Registro arquivado.", icon=":material/check_circle:")
        if ao_concluir:
            ao_concluir()
        st.rerun()


@st.dialog("Arquivar projeto GAT")
def dialog_arquivar_projeto_gat(codigo: str, usuario: str, ao_concluir: Callable[[], None] | None = None) -> None:
    st.write(f"Arquivar todas as análises do projeto **{codigo}** (Prestadores e Cessionários)?")
    st.caption(
        "O projeto sai do Portfólio/listas ativas e dos indicadores, mas todo o histórico, "
        "avaliações e revisões continuam preservados — pode ser restaurado a qualquer momento."
    )
    motivo = st.text_area("Motivo (opcional)", key=f"arquivo_motivo_projeto_{codigo}")
    teste = st.checkbox("Este é um projeto de teste (área Testes do módulo Arquivo)", key=f"arquivo_teste_projeto_{codigo}")
    if st.button("Confirmar arquivamento do projeto", icon=":material/archive:", type="primary", key=f"arquivo_confirmar_projeto_{codigo}"):
        qtd = arquivar_projeto_gat(codigo, usuario, motivo=motivo.strip() or None, teste=teste)
        st.success(f"Projeto {codigo} arquivado ({qtd} análise(s)).", icon=":material/check_circle:")
        if ao_concluir:
            ao_concluir()
        st.rerun()


@st.dialog("Restaurar registro")
def dialog_restaurar(tabela: str, registro_id: int, descricao: str, usuario: str) -> None:
    st.write(f"Restaurar: **{descricao}**")
    st.caption("O registro volta a aparecer nas telas, KPIs e indicadores operacionais normalmente, sem perda de dados.")
    justificativa = st.text_area("Justificativa (opcional)", key=f"arquivo_restaurar_just_{tabela}_{registro_id}")
    if st.button("Confirmar restauração", icon=":material/restore:", type="primary", key=f"arquivo_restaurar_confirmar_{tabela}_{registro_id}"):
        restaurar_registro(tabela, registro_id, usuario, justificativa=justificativa.strip() or None)
        st.success("Registro restaurado.", icon=":material/check_circle:")
        st.rerun()


def _avancar_exclusao(tabela: str, registro_id: int) -> None:
    """Callback de on_click: roda antes do rerun automático do clique, então
    a Etapa 2 já aparece na mesma interação sem fechar o dialog (mesmo
    padrão de `gat/ui/modals_pmo.py::_avancar_wizard_novo_projeto`)."""
    st.session_state[f"arquivo_exclusao_etapa_{tabela}_{registro_id}"] = 2


@st.dialog("Excluir definitivamente")
def dialog_excluir_definitivamente(tabela: str, registro_id: int, descricao: str, usuario: str) -> None:
    chave_etapa = f"arquivo_exclusao_etapa_{tabela}_{registro_id}"
    st.session_state.setdefault(chave_etapa, 1)

    st.error(f"Registro: **{descricao}**", icon=":material/warning:")

    if st.session_state[chave_etapa] == 1:
        st.write(TEXTO_CONFIRMACAO_1)
        st.button(
            "Sim, continuar", icon=":material/arrow_forward:", type="primary",
            key=f"arquivo_exclusao_avancar_{tabela}_{registro_id}",
            on_click=_avancar_exclusao, args=(tabela, registro_id),
        )
    else:
        st.warning(TEXTO_CONFIRMACAO_2, icon=":material/warning:")
        justificativa = st.text_area("Justificativa da exclusão (obrigatória)", key=f"arquivo_exclusao_just_{tabela}_{registro_id}")
        if st.button(
            "Confirmar exclusão definitiva", icon=":material/delete_forever:", type="primary",
            key=f"arquivo_exclusao_confirmar_{tabela}_{registro_id}",
        ):
            if not justificativa.strip():
                st.error("Informe a justificativa da exclusão definitiva.", icon=":material/error:")
            else:
                excluir_definitivamente(tabela, registro_id, usuario, justificativa.strip())
                st.session_state.pop(chave_etapa, None)
                st.success("Registro excluído definitivamente.", icon=":material/check_circle:")
                st.rerun()
