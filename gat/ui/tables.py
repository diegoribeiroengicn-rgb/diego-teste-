"""
Tabela dinâmica interativa: permite selecionar uma linha existente e abrir o
pop-up de edição correspondente, pré-preenchido com os dados atuais.
"""

from __future__ import annotations

from typing import Callable

import pandas as pd
import streamlit as st

from gat.arquivo_business_rules import perfil_pode_arquivar_e_restaurar
from gat.resumo_conclusao import eh_status_final_resumo
from gat.ui.modals_arquivo import dialog_arquivar
from gat.ui.modals_resumo import dialog_resumo_conclusao

_TABELAS_COM_RESUMO_CONCLUSAO = {"prestadores", "cessionarios"}


def tabela_com_edicao(
    df_exibicao: pd.DataFrame,
    df_ids: pd.Series,
    chave: str,
    abrir_dialog_edicao: Callable[[dict], None],
    obter_registro: Callable[[int], dict],
    tabela_arquivo: str | None = None,
    usuario: dict | None = None,
    descricao_arquivo: Callable[[dict], str] | None = None,
    colunas_principais: list[str] | None = None,
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
    - `colunas_principais`: opcional — subconjunto (e ordem) de colunas de
      `df_exibicao` mostradas na grade principal. Quando informado, as
      colunas restantes de `df_exibicao` não desaparecem: aparecem num
      painel "Detalhes do registro selecionado" assim que uma linha é
      selecionada, com os valores já formatados exatamente como estavam em
      `df_exibicao` (mesma fonte, só reorganizados). Quando omitido
      (padrão), o comportamento não muda em nada — todas as colunas
      continuam na grade, como sempre foi.

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

    df_grade = df_exibicao[colunas_principais] if colunas_principais else df_exibicao
    evento = st.dataframe(
        df_grade,
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
        registro_selecionado = obter_registro(registro_id)
        mostrar_arquivar = tabela_arquivo is not None and usuario is not None and perfil_pode_arquivar_e_restaurar(usuario.get("perfil"))
        mostrar_resumo = (
            tabela_arquivo in _TABELAS_COM_RESUMO_CONCLUSAO and usuario is not None
            and eh_status_final_resumo(registro_selecionado.get("status_analise"))
        )
        n_botoes = 1 + int(mostrar_arquivar) + int(mostrar_resumo)
        preenchimento = 5 if n_botoes == 1 else 4
        colunas = st.columns([1] * n_botoes + [preenchimento])
        indice = 0
        with colunas[indice]:
            if st.button("Editar selecionado", icon=":material/edit:", type="primary", key=f"btn_editar_{chave}", use_container_width=True):
                abrir_dialog_edicao(registro_selecionado)
        indice += 1
        if mostrar_resumo:
            with colunas[indice]:
                if st.button("Resumo de Conclusão", icon=":material/description:", key=f"btn_resumo_{chave}", use_container_width=True):
                    dialog_resumo_conclusao(tabela_arquivo, registro_id, usuario["username"])
            indice += 1
        if mostrar_arquivar:
            with colunas[indice]:
                if st.button("Arquivar selecionado", icon=":material/archive:", key=f"btn_arquivar_{chave}", use_container_width=True):
                    descricao = descricao_arquivo(registro_selecionado) if descricao_arquivo else f"{chave} #{registro_id}"
                    dialog_arquivar(tabela_arquivo, registro_id, descricao, usuario["username"])

        if colunas_principais:
            colunas_detalhe = [c for c in df_exibicao.columns if c not in colunas_principais]
            if colunas_detalhe:
                with st.expander("Detalhes do registro selecionado", icon=":material/list_alt:", expanded=True):
                    linha_completa = df_exibicao.iloc[posicao]
                    grade_detalhe = st.columns(3)
                    for indice_campo, campo in enumerate(colunas_detalhe):
                        valor = linha_completa[campo]
                        texto = str(valor).strip() if pd.notna(valor) else ""
                        with grade_detalhe[indice_campo % 3]:
                            st.caption(campo)
                            st.markdown(texto or "—")
    else:
        st.caption("Selecione uma linha na tabela para editar o registro.")
