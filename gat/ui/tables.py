"""
Tabela dinâmica interativa: permite selecionar uma linha existente e abrir o
pop-up de edição correspondente, pré-preenchido com os dados atuais.
"""

from __future__ import annotations

from typing import Callable

import pandas as pd
import streamlit as st


def tabela_com_edicao(
    df_exibicao: pd.DataFrame,
    df_ids: pd.Series,
    chave: str,
    abrir_dialog_edicao: Callable[[dict], None],
    obter_registro: Callable[[int], dict],
) -> None:
    """
    Renderiza uma tabela com seleção de linha única. Ao selecionar um
    registro e clicar em "Editar selecionado", abre o pop-up de edição
    pré-preenchido com os dados atuais do banco.

    - `df_exibicao`: DataFrame já formatado para exibição (sem a coluna id).
    - `df_ids`: Series com o id do banco de dados, na mesma ordem/índice de `df_exibicao`.
    """
    evento = st.dataframe(
        df_exibicao,
        use_container_width=True,
        hide_index=True,
        on_select="rerun",
        selection_mode="single-row",
        key=f"tabela_{chave}",
    )

    linhas_selecionadas = evento.selection.rows if evento and evento.selection else []
    if linhas_selecionadas:
        posicao = linhas_selecionadas[0]
        registro_id = int(df_ids.iloc[posicao])
        col_a, col_b = st.columns([1, 5])
        with col_a:
            if st.button("✏️ Editar selecionado", key=f"btn_editar_{chave}", use_container_width=True):
                abrir_dialog_edicao(obter_registro(registro_id))
    else:
        st.caption("Selecione uma linha na tabela para editar o registro.")
