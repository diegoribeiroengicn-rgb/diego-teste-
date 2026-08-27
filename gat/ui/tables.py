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

# Mapeia o ícone colorido já usado em texto (ex.: "🟢 LIBERADO", de
# gat.ui.formatos.rotulo_status_analise e dos rótulos de Situação do
# Prazo/Avaliação/Status Entrega) para a cor equivalente de `st.badge` —
# assim, qualquer valor desse padrão que caia no painel de detalhes vira
# um selo nativo de verdade, não só texto com emoji na frente.
_EMOJI_PARA_COR_BADGE = {
    "🟢": "green", "🟡": "orange", "🟠": "orange", "🔴": "red",
    "🔵": "blue", "🟣": "violet", "⚫": "gray", "⚪": "gray",
}


def _sem_icone(texto: str) -> str:
    """"🔴 NÃO LIBERADO" -> "NÃO LIBERADO" (texto original se não tiver ícone)."""
    icone, _, resto = texto.partition(" ")
    return resto if icone in _EMOJI_PARA_COR_BADGE and resto else texto


def _renderizar_valor_ou_badge(texto: str) -> None:
    """Renderiza `texto`: se seguir o padrão "🟢 TEXTO" (usado por
    gat.ui.formatos.rotulo_status_analise e pelos rótulos de Situação do
    Prazo/Avaliação/Status Entrega/Nível de Atraso), vira um st.badge
    nativo; senão, texto simples."""
    icone, _, resto = texto.partition(" ")
    if icone in _EMOJI_PARA_COR_BADGE and resto:
        st.badge(resto, icon=icone, color=_EMOJI_PARA_COR_BADGE[icone])
    else:
        st.markdown(texto or "—")


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
                            _renderizar_valor_ou_badge(texto)
    else:
        st.caption("Selecione uma linha na tabela para editar o registro.")


_CAMPOS_CARD_FIXOS = ("Item", "Código", "Disciplina", "Status Análise", "Situação do Prazo")
_CARDS_POR_PAGINA = 25


def lista_cards_com_edicao(
    df_exibicao: pd.DataFrame,
    df_ids: pd.Series,
    chave: str,
    campo_nome_entidade: str,
    abrir_dialog_edicao: Callable[[dict], None],
    obter_registro: Callable[[int], dict],
    tabela_arquivo: str | None = None,
    usuario: dict | None = None,
    descricao_arquivo: Callable[[dict], str] | None = None,
    campo_destaque_extra: str | None = None,
    agrupar_por: str | None = None,
) -> None:
    """
    Alternativa a `tabela_com_edicao` para listas de projeto (Prestadores/
    Cessionários): em vez de um grid (`st.dataframe`), renderiza um card
    por registro — cada um já com o botão "Editar" (e Resumo/Arquivar,
    quando aplicável), sem precisar selecionar uma linha antes.

    - `df_exibicao`: mesmo DataFrame já formatado que `tabela_com_edicao`
      recebe, com as colunas fixas "Item", "Código", "Disciplina",
      "Status Análise", "Situação do Prazo" (mesmos nomes/valores em
      Prestadores e Cessionários) — as demais colunas viram os campos do
      "Ver mais" de cada card.
    - `campo_nome_entidade`: nome da coluna com o nome da entidade
      ("Prestador de Serviço" ou "Cessionário") — é a única coluna de
      identificação que difere entre os dois módulos.
    - `df_ids`/`tabela_arquivo`/`usuario`/`descricao_arquivo`: mesmo
      significado de `tabela_com_edicao`.
    - `campo_destaque_extra`: opcional — nome de uma coluna adicional de
      `df_exibicao` a destacar em cada card (ex.: "Responsável"), além
      das colunas fixas. Some do "Ver mais" (já aparece em destaque).
    - `agrupar_por`: opcional — nome de coluna (normalmente igual a
      `campo_destaque_extra`) usada para agrupar os cards visualmente sob
      um cabeçalho de seção sempre que o valor mudar de uma linha para a
      próxima. Pressupõe que `df_exibicao` já chegue ordenado por essa
      coluna — a função não reordena nada.

    Paginado (25 cards por página) — os módulos têm várias centenas de
    registros ativos, e renderizar todos de uma vez pesaria a rolagem.
    "Restaurar ordem de chegada" aqui não desfaz nenhuma reordenação
    visual (cards não têm cabeçalho clicável como o grid) — só volta a
    lista pra página 1, na ordenação que `df_exibicao` já chega pronta
    (por Item, ou por `agrupar_por` quando informado).
    """
    chave_pagina = f"_pagina_cards_{chave}"
    chave_total_anterior = f"_pagina_cards_{chave}_total"
    total_registros = len(df_exibicao)
    total_paginas = max(1, -(-total_registros // _CARDS_POR_PAGINA))

    # Se o total mudou (filtro aplicado/alterado), volta pra página 1 —
    # senão o usuário pode ficar "preso" numa página que não existe mais.
    if st.session_state.get(chave_total_anterior) != total_registros:
        st.session_state[chave_pagina] = 0
        st.session_state[chave_total_anterior] = total_registros
    pagina = st.session_state.get(chave_pagina, 0)
    pagina = min(pagina, total_paginas - 1)

    col_ordem, _ = st.columns([1, 5])
    with col_ordem:
        if st.button("Restaurar ordem de chegada", icon=":material/restart_alt:", key=f"btn_restaurar_ordem_{chave}", use_container_width=True):
            st.session_state[chave_pagina] = 0
            st.rerun()

    if total_registros == 0:
        st.caption("Nenhum registro encontrado.")
        return

    inicio = pagina * _CARDS_POR_PAGINA
    fim = min(inicio + _CARDS_POR_PAGINA, total_registros)
    campos_fixos_extra = (campo_destaque_extra,) if campo_destaque_extra else ()
    colunas_detalhe = [c for c in df_exibicao.columns if c not in (*_CAMPOS_CARD_FIXOS, campo_nome_entidade, *campos_fixos_extra)]

    grupo_anterior = None
    for posicao in range(inicio, fim):
        linha = df_exibicao.iloc[posicao]
        registro_id = int(df_ids.iloc[posicao])

        if agrupar_por:
            valor_grupo = str(linha[agrupar_por]).strip() or "—"
            if valor_grupo != grupo_anterior:
                st.subheader(f":material/person: {valor_grupo}", divider="gray")
                grupo_anterior = valor_grupo

        with st.container(border=True):
            st.markdown(f"**{linha['Código']} — {linha[campo_nome_entidade]}**")
            st.caption(f"{linha['Disciplina']} · Item {linha['Item']}")
            if campo_destaque_extra:
                valor_destaque = str(linha[campo_destaque_extra]).strip() or "—"
                st.markdown(f":material/person: **{campo_destaque_extra}:** {valor_destaque}")

            col_badge1, col_badge2, _resto = st.columns([1, 1, 3])
            with col_badge1:
                _renderizar_valor_ou_badge(str(linha["Status Análise"]).strip())
            with col_badge2:
                _renderizar_valor_ou_badge(str(linha["Situação do Prazo"]).strip())

            chave_expandido = f"_card_expandido_{chave}_{registro_id}"
            expandido = st.session_state.get(chave_expandido, False)

            registro_selecionado = None
            mostrar_resumo = False
            if tabela_arquivo in _TABELAS_COM_RESUMO_CONCLUSAO and usuario is not None:
                status_bruto = _sem_icone(str(linha["Status Análise"]).strip())
                mostrar_resumo = eh_status_final_resumo(status_bruto)
            mostrar_arquivar = tabela_arquivo is not None and usuario is not None and perfil_pode_arquivar_e_restaurar(usuario.get("perfil"))

            n_botoes = 1 + int(mostrar_resumo) + int(mostrar_arquivar)
            preenchimento = 5 if n_botoes == 1 else 4
            colunas_acao = st.columns([1] * n_botoes + [preenchimento])
            indice = 0
            with colunas_acao[indice]:
                if st.button("Editar", icon=":material/edit:", type="primary", key=f"card_editar_{chave}_{registro_id}", use_container_width=True):
                    abrir_dialog_edicao(obter_registro(registro_id))
            indice += 1
            if mostrar_resumo:
                with colunas_acao[indice]:
                    if st.button("Resumo", icon=":material/description:", key=f"card_resumo_{chave}_{registro_id}", use_container_width=True):
                        dialog_resumo_conclusao(tabela_arquivo, registro_id, usuario["username"])
                indice += 1
            if mostrar_arquivar:
                with colunas_acao[indice]:
                    if st.button("Arquivar", icon=":material/archive:", key=f"card_arquivar_{chave}_{registro_id}", use_container_width=True):
                        if registro_selecionado is None:
                            registro_selecionado = obter_registro(registro_id)
                        descricao = descricao_arquivo(registro_selecionado) if descricao_arquivo else f"{chave} #{registro_id}"
                        dialog_arquivar(tabela_arquivo, registro_id, descricao, usuario["username"])
                indice += 1

            if colunas_detalhe:
                rotulo = "Ver menos" if expandido else "Ver mais"
                icone_ver_mais = ":material/expand_less:" if expandido else ":material/expand_more:"
                if st.button(rotulo, icon=icone_ver_mais, key=f"card_vermais_{chave}_{registro_id}"):
                    st.session_state[chave_expandido] = not expandido
                    st.rerun()

            if expandido and colunas_detalhe:
                st.divider()
                grade_detalhe = st.columns(3)
                for indice_campo, campo in enumerate(colunas_detalhe):
                    valor = linha[campo]
                    texto = str(valor).strip() if pd.notna(valor) else ""
                    with grade_detalhe[indice_campo % 3]:
                        st.caption(campo)
                        _renderizar_valor_ou_badge(texto)

    st.markdown("")
    col_ant, col_meio, col_prox = st.columns([1, 2, 1])
    with col_ant:
        if st.button("← Anterior", key=f"card_pag_ant_{chave}", disabled=pagina <= 0, use_container_width=True):
            st.session_state[chave_pagina] = pagina - 1
            st.rerun()
    with col_meio:
        st.markdown(f"<div style='text-align:center'>Página {pagina + 1} de {total_paginas} ({total_registros} registro(s))</div>", unsafe_allow_html=True)
    with col_prox:
        if st.button("Próxima →", key=f"card_pag_prox_{chave}", disabled=pagina >= total_paginas - 1, use_container_width=True):
            st.session_state[chave_pagina] = pagina + 1
            st.rerun()
