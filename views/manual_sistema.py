"""Manual do Sistema (item 16 do módulo de SLA/Prioridades) — novo módulo
independente com 28 capítulos, filtrado por perfil, com pesquisa, confirmação
de leitura obrigatória por versão publicada, exportação em Word/PDF e
administração completa de conteúdo (capítulos, anexos, versões)."""

from __future__ import annotations

import streamlit as st

from gat.config import PERFIS_OPCOES
from gat.database import (
    TIPOS_ANEXO_MANUAL,
    adicionar_anexo_manual,
    atualizar_manual_capitulo,
    confirmar_leitura_manual,
    criar_manual_capitulo,
    excluir_manual_capitulo,
    listar_anexos_manual,
    listar_confirmacoes_leitura_manual,
    listar_manual_capitulos,
    listar_manual_versoes,
    obter_anexo_manual,
    publicar_nova_versao_manual,
    registrar_atividade,
    reordenar_manual_capitulos,
    remover_anexo_manual,
    usuario_confirmou_leitura_manual,
    versao_ativa_manual,
)
from gat.permissions import exigir_area, pode_area
from gat.relatorios_manual import gerar_pdf_manual, gerar_word_manual, nome_arquivo_manual
from gat.ui.formatos import formatar_data_br, formatar_datahora_br, formatar_datahoras_df

_TAMANHO_MAXIMO_ANEXO = 5 * 1024 * 1024  # 5 MB por anexo


def _secao_leitura(usuario: dict) -> None:
    capitulos = listar_manual_capitulos(usuario.get("perfil"))
    versao = versao_ativa_manual()

    st.subheader(":material/menu_book: Manual do Sistema")
    if versao:
        st.caption(f"Versão {versao['numero_versao']} · Publicado em {formatar_data_br(versao['publicado_em'])} por {versao['publicado_por']}")

    if versao and not usuario_confirmou_leitura_manual(usuario["username"], versao["numero_versao"]):
        with st.container(border=True):
            st.warning(
                f"Esta é a versão {versao['numero_versao']} do Manual do Sistema. Leia o conteúdo relevante "
                "para o seu perfil e confirme a leitura.",
                icon=":material/menu_book:",
            )
            if st.button("Li e estou ciente", type="primary", key="manual_li_ciente"):
                confirmar_leitura_manual(usuario["username"], versao["numero_versao"])
                registrar_atividade(usuario["username"], usuario.get("perfil"), "CONFIRMACAO_LEITURA_MANUAL", modulo="manual_sistema", detalhe=f"Versão {versao['numero_versao']}")
                st.toast("Leitura confirmada.", icon=":material/check_circle:")
                st.rerun()

    if capitulos.empty:
        st.info("Nenhum capítulo cadastrado ainda.")
        return

    busca = st.text_input("Pesquisar no manual", key="manual_busca", placeholder="Ex.: SLA, avaliação, backup...")
    capitulos_filtrados = capitulos
    if busca.strip():
        termo = busca.strip().casefold()
        mascara = capitulos["titulo"].str.casefold().str.contains(termo, na=False) | capitulos["conteudo"].fillna("").str.casefold().str.contains(termo, na=False)
        capitulos_filtrados = capitulos[mascara]
        if capitulos_filtrados.empty:
            st.warning("Nenhum capítulo encontrado para a pesquisa.")
            return

    col_indice, col_conteudo = st.columns([1, 3])
    with col_indice:
        st.markdown("###### Índice")
        opcoes = {f"{int(row['ordem'])}. {row['titulo']}": int(row["id"]) for _, row in capitulos_filtrados.iterrows()}
        escolha = st.radio("Capítulos", list(opcoes.keys()), key="manual_capitulo_escolhido", label_visibility="collapsed")
        capitulo_id = opcoes[escolha]

    with col_conteudo:
        capitulo = capitulos[capitulos["id"] == capitulo_id].iloc[0]
        st.markdown(f"##### {capitulo['titulo']}")
        st.markdown(capitulo.get("conteudo") or "_Sem conteúdo cadastrado._")

        anexos = listar_anexos_manual(capitulo_id)
        if not anexos.empty:
            st.markdown("---")
            st.caption("Anexos deste capítulo")
            for _, anexo in anexos.iterrows():
                registro = obter_anexo_manual(int(anexo["id"]))
                if anexo["tipo"] == "imagem":
                    st.image(registro["conteudo"], caption=anexo["nome_arquivo"], use_container_width=True)
                else:
                    st.download_button(
                        f"Baixar {anexo['tipo']}: {anexo['nome_arquivo']}", data=registro["conteudo"],
                        file_name=anexo["nome_arquivo"], key=f"manual_anexo_{anexo['id']}",
                    )

        st.markdown("---")
        col_docx, col_pdf = st.columns(2)
        if col_docx.button("Baixar este capítulo (Word)", icon=":material/description:", key="manual_docx_cap"):
            conteudo_docx = gerar_word_manual(capitulos, versao["numero_versao"] if versao else 1, usuario["username"], capitulo_unico=capitulo.to_dict())
            col_docx.download_button(
                "Confirmar download (Word)", data=conteudo_docx,
                file_name=nome_arquivo_manual(versao["numero_versao"] if versao else 1, capitulo["titulo"]),
                mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document", key="manual_docx_cap_confirma",
            )
        if col_pdf.button("Baixar este capítulo (PDF)", icon=":material/description:", key="manual_pdf_cap"):
            conteudo_pdf = gerar_pdf_manual(capitulos, versao["numero_versao"] if versao else 1, capitulo_unico=capitulo.to_dict())
            col_pdf.download_button(
                "Confirmar download (PDF)", data=conteudo_pdf,
                file_name=nome_arquivo_manual(versao["numero_versao"] if versao else 1, capitulo["titulo"]).replace(".docx", ".pdf"),
                mime="application/pdf", key="manual_pdf_cap_confirma",
            )

    st.markdown("---")
    st.markdown("##### Manual completo")
    col_docx_full, col_pdf_full = st.columns(2)
    if col_docx_full.button("Gerar manual completo (Word)", icon=":material/menu_book:", key="manual_docx_full"):
        conteudo_docx = gerar_word_manual(capitulos, versao["numero_versao"] if versao else 1, usuario["username"])
        col_docx_full.download_button(
            "Baixar manual completo (Word)", data=conteudo_docx,
            file_name=nome_arquivo_manual(versao["numero_versao"] if versao else 1),
            mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document", key="manual_docx_full_confirma",
        )
    if col_pdf_full.button("Gerar manual completo (PDF)", icon=":material/menu_book:", key="manual_pdf_full"):
        conteudo_pdf = gerar_pdf_manual(capitulos, versao["numero_versao"] if versao else 1)
        col_pdf_full.download_button(
            "Baixar manual completo (PDF)", data=conteudo_pdf,
            file_name=nome_arquivo_manual(versao["numero_versao"] if versao else 1).replace(".docx", ".pdf"),
            mime="application/pdf", key="manual_pdf_full_confirma",
        )


def _formulario_capitulo(usuario: dict, capitulo: dict | None = None) -> None:
    editando = capitulo is not None
    sufixo = f"edit_{capitulo['id']}" if editando else "novo"
    titulo = st.text_input("Título do capítulo *", value=capitulo.get("titulo", "") if editando else "", key=f"manual_titulo_{sufixo}")
    conteudo = st.text_area("Conteúdo (aceita **negrito** e quebras de linha)", value=capitulo.get("conteudo", "") if editando else "", height=220, key=f"manual_conteudo_{sufixo}")
    perfis_atuais = (capitulo.get("perfis_visiveis") or "").split(",") if editando and capitulo.get("perfis_visiveis") else []
    perfis_visiveis = st.multiselect(
        "Restringir a perfis específicos (vazio = visível a todos)", PERFIS_OPCOES,
        default=[p for p in perfis_atuais if p in PERFIS_OPCOES], key=f"manual_perfis_{sufixo}",
    )
    if st.button("Salvar capítulo", type="primary", key=f"manual_salvar_{sufixo}"):
        if not titulo.strip():
            st.error("O título é obrigatório.")
            return
        perfis_texto = ",".join(perfis_visiveis) if perfis_visiveis else None
        if editando:
            atualizar_manual_capitulo(capitulo["id"], titulo.strip(), conteudo, perfis_texto, usuario["username"])
            st.toast("Capítulo atualizado.", icon=":material/check_circle:")
        else:
            criar_manual_capitulo(titulo.strip(), conteudo, perfis_texto, usuario["username"])
            st.toast("Capítulo criado.", icon=":material/check_circle:")
        registrar_atividade(usuario["username"], usuario.get("perfil"), "EDICAO_MANUAL_SISTEMA", modulo="manual_sistema", detalhe=titulo.strip())
        st.rerun()


def _secao_administracao(usuario: dict) -> None:
    st.markdown("---")
    st.markdown("#### Administração do Manual")
    capitulos = listar_manual_capitulos()

    aba_capitulos, aba_anexos, aba_versoes = st.tabs(["Capítulos", "Anexos", "Versões e leitura"])

    with aba_capitulos:
        with st.expander("Novo capítulo", icon=":material/add:"):
            _formulario_capitulo(usuario)

        for _, cap in capitulos.iterrows():
            with st.expander(f"{int(cap['ordem'])}. {cap['titulo']}", icon=":material/article:"):
                _formulario_capitulo(usuario, cap.to_dict())
                if st.button("Excluir capítulo", key=f"manual_excluir_{cap['id']}"):
                    excluir_manual_capitulo(int(cap["id"]), usuario["username"])
                    st.toast("Capítulo excluído.", icon=":material/check_circle:")
                    st.rerun()

        st.markdown("###### Reordenar capítulos")
        ordem_atual = capitulos["titulo"].tolist()
        nova_ordem_labels = st.multiselect(
            "Clique na ordem desejada (selecione todos, na nova sequência)", ordem_atual, default=[], key="manual_reordenar",
            help="Selecione os capítulos na ordem final desejada, um por um.",
        )
        if len(nova_ordem_labels) == len(ordem_atual) and st.button("Aplicar nova ordem", key="manual_aplicar_ordem"):
            mapa_titulo_id = {row["titulo"]: int(row["id"]) for _, row in capitulos.iterrows()}
            reordenar_manual_capitulos([mapa_titulo_id[t] for t in nova_ordem_labels], usuario["username"])
            st.toast("Ordem atualizada.", icon=":material/check_circle:")
            st.rerun()

    with aba_anexos:
        opcoes_cap = {f"{int(row['ordem'])}. {row['titulo']}": int(row["id"]) for _, row in capitulos.iterrows()}
        escolha_cap = st.selectbox("Capítulo", list(opcoes_cap.keys()), key="manual_anexo_capitulo")
        capitulo_id = opcoes_cap[escolha_cap]
        tipo_anexo = st.selectbox("Tipo de anexo", TIPOS_ANEXO_MANUAL, key="manual_anexo_tipo")
        arquivo = st.file_uploader("Arquivo (máx. 5 MB)", key="manual_anexo_upload")
        if arquivo is not None and st.button("Anexar", key="manual_anexo_confirmar"):
            conteudo_bytes = arquivo.read()
            if len(conteudo_bytes) > _TAMANHO_MAXIMO_ANEXO:
                st.error("Arquivo maior que 5 MB — utilize um arquivo menor ou um link externo no conteúdo do capítulo.")
            else:
                adicionar_anexo_manual(capitulo_id, tipo_anexo, arquivo.name, conteudo_bytes, usuario["username"])
                st.toast("Anexo adicionado.", icon=":material/check_circle:")
                st.rerun()

        anexos_capitulo = listar_anexos_manual(capitulo_id)
        for _, anexo in anexos_capitulo.iterrows():
            col_nome, col_remover = st.columns([4, 1])
            col_nome.caption(f"{anexo['tipo']} — {anexo['nome_arquivo']} ({formatar_data_br(anexo['criado_em'])})")
            if col_remover.button("Remover", key=f"manual_remover_anexo_{anexo['id']}"):
                remover_anexo_manual(int(anexo["id"]))
                st.rerun()

    with aba_versoes:
        st.markdown("###### Publicar nova versão")
        notas = st.text_area("Notas da nova versão (o que mudou)", key="manual_notas_versao")
        if st.button("Publicar nova versão", type="primary", key="manual_publicar_versao"):
            nova = publicar_nova_versao_manual(notas.strip() or "Atualização de conteúdo.", usuario["username"])
            registrar_atividade(usuario["username"], usuario.get("perfil"), "PUBLICACAO_MANUAL_SISTEMA", modulo="manual_sistema", detalhe=f"Versão {nova}")
            st.toast(f"Versão {nova} publicada.", icon=":material/check_circle:")
            st.rerun()

        st.markdown("###### Histórico de versões")
        versoes = formatar_datahoras_df(listar_manual_versoes(), ["publicado_em"]).rename(columns={
            "numero_versao": "Versão", "notas": "Notas", "publicado_em": "Publicado em",
            "publicado_por": "Publicado por", "ativa": "Ativa",
        })
        st.dataframe(versoes[["Versão", "Notas", "Publicado em", "Publicado por", "Ativa"]], hide_index=True, use_container_width=True)

        st.markdown("###### Confirmações de leitura")
        versao_atual = versao_ativa_manual()
        if versao_atual:
            confirmacoes = listar_confirmacoes_leitura_manual(versao_atual["numero_versao"])
            st.caption(f"{len(confirmacoes)} usuário(s) confirmaram a leitura da versão {versao_atual['numero_versao']}.")
            confirmacoes_exibicao = formatar_datahoras_df(confirmacoes, ["confirmado_em"]).rename(columns={
                "usuario": "Usuário", "versao": "Versão", "confirmado_em": "Confirmado em",
            })
            st.dataframe(confirmacoes_exibicao[["Usuário", "Versão", "Confirmado em"]], hide_index=True, use_container_width=True)


def render(usuario: dict) -> None:
    exigir_area(usuario, "manual_sistema")
    _secao_leitura(usuario)
    if pode_area(usuario, "manual_sistema.administrar"):
        _secao_administracao(usuario)
