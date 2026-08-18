"""
UI do "Resumo de Conclusão da Análise": pop-up oferecido automaticamente ao
concluir uma análise (Prestador ou Cessionário) com status final, e acesso
manual posterior para reabrir, editar os canais de disponibilização e
baixar novamente — sem exigir nenhuma digitação de dado já cadastrado.
"""

from __future__ import annotations

from typing import Any

import streamlit as st

from gat.database import (
    obter_cessionario,
    obter_prestador,
    registrar_atividade,
    registrar_download_resumo,
    salvar_selecao_resumo,
)
from gat.resumo_conclusao import montar_dados_resumo
from gat.resumo_conclusao_render import gerar_card_resumo, imagem_para_pdf_bytes, imagem_para_png_bytes


def _obter_registro(tabela: str, registro_id: int) -> dict[str, Any] | None:
    return obter_prestador(registro_id) if tabela == "prestadores" else obter_cessionario(registro_id)


def _confirmar_geracao(
    tabela: str, registro_id: int, mfiles: bool, drive: bool, email: bool,
    usuario: str, numero_at: str, confirmado_key: str,
) -> None:
    """
    Executado via `on_click` (não dentro de um `if st.button(): ...`) para
    que o pop-up permaneça aberto na etapa seguinte (botões de download) —
    ver nota em `gat/ui/modals_arquivo.py` sobre o comportamento de
    `st.dialog` com fluxos de mais de uma etapa.
    """
    salvar_selecao_resumo(tabela, registro_id, mfiles, drive, email, usuario)
    registrar_atividade(usuario, None, "RESUMO_CONCLUSAO_GERADO", modulo=tabela, detalhe=numero_at)
    st.session_state[confirmado_key] = True


def renderizar_nucleo_resumo(tabela: str, registro_id: int, dados: dict[str, Any], usuario: str, chave_prefixo: str) -> None:
    """
    Núcleo de UI comum ao fluxo automático (logo após salvar a análise) e
    ao acesso manual posterior: seleção de canais, prévia do card e, após
    confirmar, os botões de download (PNG/PDF) e "Baixar novamente".
    """
    st.markdown("##### Onde esta análise foi disponibilizada?")
    st.caption("Marque quantas opções fizerem sentido — nenhuma é obrigatória.")
    col1, col2, col3 = st.columns(3)
    mfiles = col1.checkbox("M-Files", value=bool(dados.get("resumo_mfiles")), key=f"{chave_prefixo}_mfiles")
    drive = col2.checkbox("Drive", value=bool(dados.get("resumo_drive")), key=f"{chave_prefixo}_drive")
    email = col3.checkbox("E-mail", value=bool(dados.get("resumo_email")), key=f"{chave_prefixo}_email")

    dados_card = montar_dados_resumo(tabela, dados, mfiles, drive, email)
    imagem = gerar_card_resumo(dados_card)

    st.markdown("###### Prévia do Resumo de Conclusão")
    st.image(imagem, use_container_width=True)

    confirmado_key = f"{chave_prefixo}_confirmado"
    if not st.session_state.get(confirmado_key):
        st.button(
            "Confirmar e gerar Resumo de Conclusão", type="primary", icon=":material/description:",
            use_container_width=True, key=f"{chave_prefixo}_btn_confirmar",
            on_click=_confirmar_geracao,
            args=(tabela, registro_id, mfiles, drive, email, usuario, dados_card["numero_at"], confirmado_key),
        )
        return

    st.success("Resumo de Conclusão gerado com sucesso — pronto para compartilhar.", icon=":material/check_circle:")
    png_bytes = imagem_para_png_bytes(imagem)
    pdf_bytes = imagem_para_pdf_bytes(imagem)
    nome_base = dados_card["numero_at"].replace("/", "-")

    col_png, col_pdf = st.columns(2)
    with col_png:
        if st.download_button(
            "Baixar PNG (recomendado)", data=png_bytes, file_name=f"Resumo_Conclusao_{nome_base}.png",
            mime="image/png", type="primary", use_container_width=True, key=f"{chave_prefixo}_dl_png",
        ):
            registrar_download_resumo(tabela, registro_id, usuario)
    with col_pdf:
        if st.download_button(
            "Baixar PDF (compacto)", data=pdf_bytes, file_name=f"Resumo_Conclusao_{nome_base}.pdf",
            mime="application/pdf", use_container_width=True, key=f"{chave_prefixo}_dl_pdf",
        ):
            registrar_download_resumo(tabela, registro_id, usuario)

    st.button(
        "Editar canais / baixar novamente", icon=":material/refresh:",
        use_container_width=True, key=f"{chave_prefixo}_btn_reabrir",
        on_click=lambda: st.session_state.update({confirmado_key: False}),
    )


@st.dialog("Resumo de Conclusão da Análise", width="large")
def dialog_resumo_conclusao(tabela: str, registro_id: int, usuario: str) -> None:
    """Acesso manual (item 15 da solicitação): reabre o Resumo de Conclusão
    de uma análise já concluída a qualquer momento, para revisar/editar os
    canais de disponibilização e baixar novamente."""
    dados = _obter_registro(tabela, registro_id)
    if not dados:
        st.error("Registro não encontrado.")
        return

    nome_entidade = dados.get("prestador") if tabela == "prestadores" else dados.get("cessionario")
    st.caption(f"{nome_entidade} · {dados.get('disciplina') or '-'} · Rev. {dados.get('revisao')}")

    with st.expander("Histórico deste Resumo de Conclusão", expanded=False):
        from gat.database import listar_historico_resumo
        historico = listar_historico_resumo(tabela, registro_id)
        if historico.empty:
            st.caption("Nenhum registro de geração/edição ainda.")
        else:
            for _, linha in historico.iterrows():
                rotulo_evento = {
                    "GERACAO_INICIAL": "Geração inicial",
                    "EDICAO_CANAIS": "Canais editados",
                    "DOWNLOAD_REPETIDO": "Novo download",
                }.get(linha["evento"], linha["evento"])
                detalhe = f" (antes: {linha['selecao_anterior']})" if linha.get("selecao_anterior") else ""
                st.caption(f"**{rotulo_evento}** — {linha['usuario']} — {linha['data_hora'][:16].replace('T', ' ')}{detalhe}")

    renderizar_nucleo_resumo(tabela, registro_id, dados, usuario, chave_prefixo=f"resumo_manual_{tabela}_{registro_id}")
