"""
Tabela dinâmica interativa: permite selecionar uma linha existente e abrir o
pop-up de edição correspondente, pré-preenchido com os dados atuais.
"""

from __future__ import annotations

from typing import Callable

import pandas as pd
import streamlit as st

from gat.arquivo_business_rules import perfil_pode_arquivar_e_restaurar
from gat.ui.modals_arquivo import dialog_arquivar


def tabela_com_edicao(
    df_exibicao: pd.DataFrame,
    df_ids: pd.Series,
    chave: str,
    abrir_dialog_edicao: Callable[[dict], None],
    obter_registro: Callable[[int], dict],
    tabela_arquivo: str | None = None,
    usuario: dict | None = None,
    descricao_arquivo: Callable[[dict], str] | None = None,
) -> None:
    """
    Renderiza uma tabela com seleção de linha única. Ao selecionar um
    registro e clicar em "Editar selecionado", abre o pop-up de edição
    pré-preenchido com os dados atuais do banco.

    - `df_exibicao`: DataFrame já formatado para exibição (sem a coluna id),
      já ordenado pelo Item (ordem de chegada) por padrão.
    - `df_ids`: Series com o id do banco de dados, na mesma ordem/índice de `df_exibicao`.
    - `tabela_arquivo`/`usuario`/`descricao_arquivo`: opcionais — quando
      informados, adiciona o botão "Arquivar selecionado" (módulo Arquivo),
      visível apenas para perfis com permissão de arquivar.

    O usuário pode ordenar visualmente a tabela clicando no cabeçalho de
    qualquer coluna (recurso nativo do componente) — essa ordenação é
    apenas visual e não altera o Item nem a ordem real dos registros no
    banco. O botão "Restaurar ordem de chegada" força a recriação da
    grade, descartando qualquer ordenação visual aplicada pelo usuário.
    """
    chave_versao = f"_ordem_versao_{chave}"
    versao = st.session_state.get(chave_versao, 0)

    col_ordem, _ = st.columns([1, 5])
    with col_ordem:
        if st.button("Restaurar ordem de chegada", icon=":material/restart_alt:", key=f"btn_restaurar_ordem_{chave}", use_container_width=True):
            st.session_state[chave_versao] = versao + 1
            st.rerun()

    evento = st.dataframe(
        df_exibicao,
        use_container_width=True,
        hide_index=True,
        on_select="rerun",
        selection_mode="single-row",
        key=f"tabela_{chave}_{versao}",
    )

    linhas_selecionadas = evento.selection.rows if evento and evento.selection else []
    if linhas_selecionadas:
        posicao = linhas_selecionadas[0]
        registro_id = int(df_ids.iloc[posicao])
        mostrar_arquivar = tabela_arquivo is not None and usuario is not None and perfil_pode_arquivar_e_restaurar(usuario.get("perfil"))
        colunas = st.columns([1, 1, 4]) if mostrar_arquivar else st.columns([1, 5])
        col_a, col_arq = colunas[0], (colunas[1] if mostrar_arquivar else None)
        with col_a:
            if st.button("Editar selecionado", icon=":material/edit:", type="primary", key=f"btn_editar_{chave}", use_container_width=True):
                abrir_dialog_edicao(obter_registro(registro_id))
        if mostrar_arquivar:
            with col_arq:
                if st.button("Arquivar selecionado", icon=":material/archive:", key=f"btn_arquivar_{chave}", use_container_width=True):
                    registro = obter_registro(registro_id)
                    descricao = descricao_arquivo(registro) if descricao_arquivo else f"{chave} #{registro_id}"
                    dialog_arquivar(tabela_arquivo, registro_id, descricao, usuario["username"])
    else:
        st.caption("Selecione uma linha na tabela para editar o registro.")
