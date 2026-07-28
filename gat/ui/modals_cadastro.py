"""
Pop-ups/modais interativos (`st.dialog`) para o cadastro mestre de
Prestadores e Cessionários (empresa, PEP, RVP/RCI/LUC, obras/canteiros) —
distinto do módulo Projetos, que continua tratando cada análise técnica.
"""

from __future__ import annotations

from typing import Any

import streamlit as st

from gat.database import (
    atualizar_cadastro_cessionario,
    atualizar_cadastro_prestador,
    atualizar_obra_prestador,
    definir_status_cadastro_cessionario,
    definir_status_cadastro_prestador,
    inserir_cadastro_cessionario,
    inserir_cadastro_prestador,
    inserir_obra_prestador,
    registrar_atividade,
)

_STATUS_OPCOES = ["ATIVO", "INATIVO"]
_STATUS_OBRA_OPCOES = ["ATIVA", "CONCLUÍDA", "SUSPENSA"]


def _idx(opcoes: list[str], valor: str | None) -> int:
    return opcoes.index(valor) if valor in opcoes else 0


# ---------------------------------------------------------------------------
# Cadastro mestre de Prestadores
# ---------------------------------------------------------------------------


@st.dialog("Cadastro de Prestador", width="large")
def dialog_cadastro_prestador(usuario: str, registro: dict[str, Any] | None = None) -> None:
    editando = registro is not None
    sufixo = f"edit_{registro['id']}" if editando else "novo"
    st.caption(
        "Edite os dados cadastrais e clique em **Salvar**. Estes dados (empresa e PEP) valem para todos os "
        "projetos deste código no módulo Projetos — não é preciso repetir o PEP em cada projeto."
        if editando else
        "Cadastre um novo prestador. Os dados informados aqui (empresa e PEP) valerão para todos os projetos "
        "vinculados a este código no módulo Projetos."
    )

    col1, col2 = st.columns(2)
    with col1:
        codigo = st.text_input("Código (padrão PXXX) *", value=registro.get("codigo", "") if registro else "", key=f"cp_codigo_{sufixo}")
        nome_empresa = st.text_input("Nome da empresa *", value=registro.get("nome_empresa", "") if registro else "", key=f"cp_nome_{sufixo}")
        responsavel = st.text_input("Responsável", value=registro.get("responsavel", "") if registro else "", key=f"cp_resp_{sufixo}")
        status = st.selectbox("Status", _STATUS_OPCOES, index=_idx(_STATUS_OPCOES, registro.get("status") if registro else "ATIVO"), key=f"cp_status_{sufixo}")
    with col2:
        telefone = st.text_input("Telefone", value=registro.get("telefone", "") if registro else "", key=f"cp_tel_{sufixo}")
        email = st.text_input("E-mail", value=registro.get("email", "") if registro else "", key=f"cp_email_{sufixo}")
        contatos = st.text_input("Outros contatos", value=registro.get("contatos", "") if registro else "", key=f"cp_contatos_{sufixo}")

    st.markdown("##### PEP")
    possui_pep_atual = (registro.get("possui_pep") if registro else "NAO") or "NAO"
    possui_pep = st.radio(
        "Possui PEP?", ["Sim, possui PEP", "Ainda não possui PEP"],
        index=0 if possui_pep_atual == "SIM" else 1,
        key=f"cp_possuipep_{sufixo}", horizontal=True,
    )
    numero_pep = None
    if possui_pep == "Sim, possui PEP":
        numero_pep = st.text_input("Número do PEP", value=registro.get("numero_pep", "") if registro else "", key=f"cp_numpep_{sufixo}")
    else:
        st.caption("O cadastro pode ser concluído normalmente sem PEP — quando ele for informado futuramente, basta editar este cadastro.")

    observacoes = st.text_area("Observações", value=registro.get("observacoes", "") if registro else "", key=f"cp_obs_{sufixo}")

    col_salvar, col_cancelar = st.columns(2)
    salvar = col_salvar.button("Salvar", icon=":material/save:", type="primary", use_container_width=True, key=f"cp_salvar_{sufixo}")
    cancelar = col_cancelar.button("Cancelar", use_container_width=True, key=f"cp_cancelar_{sufixo}")

    if cancelar:
        st.rerun()

    if salvar:
        if not codigo.strip() or not nome_empresa.strip():
            st.error("Preencha ao menos Código e Nome da empresa.")
            return
        dados = {
            "codigo": codigo.strip(),
            "nome_empresa": nome_empresa.strip(),
            "possui_pep": "SIM" if possui_pep == "Sim, possui PEP" else "NAO",
            "numero_pep": numero_pep,
            "responsavel": responsavel,
            "telefone": telefone,
            "email": email,
            "contatos": contatos,
            "status": status,
            "observacoes": observacoes,
        }
        try:
            if editando:
                atualizar_cadastro_prestador(registro["id"], dados, usuario)
                registrar_atividade(usuario, None, "CADASTRO_PRESTADOR_EDITADO", modulo="prestadores", detalhe=codigo)
                st.toast("Cadastro de prestador atualizado com sucesso.", icon=":material/check_circle:")
            else:
                inserir_cadastro_prestador(dados, usuario)
                registrar_atividade(usuario, None, "CADASTRO_PRESTADOR_CRIADO", modulo="prestadores", detalhe=codigo)
                st.toast("Novo prestador cadastrado com sucesso.", icon=":material/check_circle:")
        except ValueError as exc:
            st.error(str(exc))
            return
        st.session_state["_gat_refresh"] = st.session_state.get("_gat_refresh", 0) + 1
        st.rerun()


@st.dialog("Inativar/Reativar Prestador")
def dialog_status_cadastro_prestador(usuario: str, registro: dict[str, Any]) -> None:
    ativo = registro.get("status") == "ATIVO"
    if ativo:
        st.warning(
            f"Inativar o prestador **{registro['codigo']} — {registro['nome_empresa']}**? "
            "O histórico e os projetos já vinculados são preservados; o cadastro deixa de aparecer "
            "como opção para novos projetos.",
            icon=":material/warning:",
        )
        rotulo, novo_status = "Confirmar inativação", "INATIVO"
    else:
        st.info(f"Reativar o prestador **{registro['codigo']} — {registro['nome_empresa']}**?")
        rotulo, novo_status = "Confirmar reativação", "ATIVO"

    col1, col2 = st.columns(2)
    if col1.button(rotulo, type="primary", use_container_width=True, key=f"cp_confirma_status_{registro['id']}"):
        definir_status_cadastro_prestador(registro["id"], novo_status, usuario)
        registrar_atividade(usuario, None, "CADASTRO_PRESTADOR_STATUS", modulo="prestadores", detalhe=f"{registro['codigo']} -> {novo_status}")
        st.toast("Status atualizado.", icon=":material/check_circle:")
        st.session_state["_gat_refresh"] = st.session_state.get("_gat_refresh", 0) + 1
        st.rerun()
    if col2.button("Cancelar", use_container_width=True, key=f"cp_cancela_status_{registro['id']}"):
        st.rerun()


# ---------------------------------------------------------------------------
# Obras / Áreas vinculadas a um prestador
# ---------------------------------------------------------------------------


@st.dialog("Obra / Área Vinculada")
def dialog_obra_prestador(usuario: str, prestador_id: int, registro: dict[str, Any] | None = None) -> None:
    editando = registro is not None
    sufixo = f"edit_{registro['id']}" if editando else "novo"
    st.caption(
        "Obras marcadas como canteiro aparecem automaticamente no Painel de Canteiros e são exibidas como "
        "\"CANTEIRO – <nome da obra>\" em todo o sistema, sem alterar o nome original cadastrado aqui."
    )

    nome_obra = st.text_input("Nome da obra *", value=registro.get("nome_obra", "") if registro else "", key=f"ob_nome_{sufixo}")
    codigo_referencia = st.text_input("Código ou referência (quando existir)", value=registro.get("codigo_referencia", "") if registro else "", key=f"ob_codref_{sufixo}")
    status = st.selectbox("Status", _STATUS_OBRA_OPCOES, index=_idx(_STATUS_OBRA_OPCOES, registro.get("status") if registro else "ATIVA"), key=f"ob_status_{sufixo}")
    e_canteiro = st.checkbox("É canteiro?", value=bool(registro.get("e_canteiro")) if registro else False, key=f"ob_canteiro_{sufixo}")
    observacoes = st.text_area("Observações", value=registro.get("observacoes", "") if registro else "", key=f"ob_obs_{sufixo}")

    if e_canteiro and nome_obra.strip():
        st.caption(f"Nome de exibição: **CANTEIRO – {nome_obra.strip()}**")

    col_salvar, col_cancelar = st.columns(2)
    salvar = col_salvar.button("Salvar", icon=":material/save:", type="primary", use_container_width=True, key=f"ob_salvar_{sufixo}")
    cancelar = col_cancelar.button("Cancelar", use_container_width=True, key=f"ob_cancelar_{sufixo}")

    if cancelar:
        st.rerun()

    if salvar:
        if not nome_obra.strip():
            st.error("Informe o nome da obra.")
            return
        dados = {
            "prestador_id": prestador_id,
            "nome_obra": nome_obra.strip(),
            "codigo_referencia": codigo_referencia,
            "status": status,
            "e_canteiro": e_canteiro,
            "observacoes": observacoes,
        }
        try:
            if editando:
                atualizar_obra_prestador(registro["id"], dados, usuario)
                st.toast("Obra atualizada com sucesso.", icon=":material/check_circle:")
            else:
                inserir_obra_prestador(dados, usuario)
                st.toast("Nova obra cadastrada com sucesso.", icon=":material/check_circle:")
        except ValueError as exc:
            st.error(str(exc))
            return
        registrar_atividade(usuario, None, "OBRA_PRESTADOR_SALVA", modulo="prestadores", detalhe=nome_obra)
        st.session_state["_gat_refresh"] = st.session_state.get("_gat_refresh", 0) + 1
        st.rerun()


# ---------------------------------------------------------------------------
# Cadastro mestre de Cessionários
# ---------------------------------------------------------------------------


@st.dialog("Cadastro de Cessionário", width="large")
def dialog_cadastro_cessionario(usuario: str, registro: dict[str, Any] | None = None) -> None:
    editando = registro is not None
    sufixo = f"edit_{registro['id']}" if editando else "novo"
    st.caption(
        "Edite os dados cadastrais e clique em **Salvar**. RVP, RCI e LUC valem para todos os projetos e "
        "disciplinas deste código no módulo Projetos."
        if editando else
        "Cadastre um novo cessionário. RVP, RCI e LUC informados aqui valerão para todos os projetos "
        "vinculados a este código."
    )

    col1, col2 = st.columns(2)
    with col1:
        codigo = st.text_input("Código (padrão FXXX ou LXXX) *", value=registro.get("codigo", "") if registro else "", key=f"cc_codigo_{sufixo}")
        nome_empresa = st.text_input("Nome da empresa/operação *", value=registro.get("nome_empresa", "") if registro else "", key=f"cc_nome_{sufixo}")
        responsavel = st.text_input("Responsável", value=registro.get("responsavel", "") if registro else "", key=f"cc_resp_{sufixo}")
        status = st.selectbox("Status", _STATUS_OPCOES, index=_idx(_STATUS_OPCOES, registro.get("status") if registro else "ATIVO"), key=f"cc_status_{sufixo}")
    with col2:
        telefone = st.text_input("Telefone", value=registro.get("telefone", "") if registro else "", key=f"cc_tel_{sufixo}")
        email = st.text_input("E-mail", value=registro.get("email", "") if registro else "", key=f"cc_email_{sufixo}")
        contatos = st.text_input("Outros contatos", value=registro.get("contatos", "") if registro else "", key=f"cc_contatos_{sufixo}")

    st.markdown("##### RVP / RCI / LUC")
    col3, col4, col5 = st.columns(3)
    with col3:
        rvp = st.text_input("RVP", value=registro.get("rvp", "") if registro else "", key=f"cc_rvp_{sufixo}")
    with col4:
        rci = st.text_input("RCI", value=registro.get("rci", "") if registro else "", key=f"cc_rci_{sufixo}")
    with col5:
        luc = st.text_input("LUC (quando aplicável)", value=registro.get("luc", "") if registro else "", key=f"cc_luc_{sufixo}")

    observacoes = st.text_area("Observações", value=registro.get("observacoes", "") if registro else "", key=f"cc_obs_{sufixo}")

    col_salvar, col_cancelar = st.columns(2)
    salvar = col_salvar.button("Salvar", icon=":material/save:", type="primary", use_container_width=True, key=f"cc_salvar_{sufixo}")
    cancelar = col_cancelar.button("Cancelar", use_container_width=True, key=f"cc_cancelar_{sufixo}")

    if cancelar:
        st.rerun()

    if salvar:
        if not codigo.strip() or not nome_empresa.strip():
            st.error("Preencha ao menos Código e Nome da empresa/operação.")
            return
        dados = {
            "codigo": codigo.strip(),
            "nome_empresa": nome_empresa.strip(),
            "luc": luc,
            "rvp": rvp,
            "rci": rci,
            "responsavel": responsavel,
            "telefone": telefone,
            "email": email,
            "contatos": contatos,
            "status": status,
            "observacoes": observacoes,
        }
        try:
            if editando:
                atualizar_cadastro_cessionario(registro["id"], dados, usuario)
                registrar_atividade(usuario, None, "CADASTRO_CESSIONARIO_EDITADO", modulo="cessionarios", detalhe=codigo)
                st.toast("Cadastro de cessionário atualizado com sucesso.", icon=":material/check_circle:")
            else:
                inserir_cadastro_cessionario(dados, usuario)
                registrar_atividade(usuario, None, "CADASTRO_CESSIONARIO_CRIADO", modulo="cessionarios", detalhe=codigo)
                st.toast("Novo cessionário cadastrado com sucesso.", icon=":material/check_circle:")
        except ValueError as exc:
            st.error(str(exc))
            return
        st.session_state["_gat_refresh"] = st.session_state.get("_gat_refresh", 0) + 1
        st.rerun()


@st.dialog("Inativar/Reativar Cessionário")
def dialog_status_cadastro_cessionario(usuario: str, registro: dict[str, Any]) -> None:
    ativo = registro.get("status") == "ATIVO"
    if ativo:
        st.warning(
            f"Inativar o cessionário **{registro['codigo']} — {registro['nome_empresa']}**? "
            "O histórico e os projetos já vinculados são preservados; o cadastro deixa de aparecer "
            "como opção para novos projetos.",
            icon=":material/warning:",
        )
        rotulo, novo_status = "Confirmar inativação", "INATIVO"
    else:
        st.info(f"Reativar o cessionário **{registro['codigo']} — {registro['nome_empresa']}**?")
        rotulo, novo_status = "Confirmar reativação", "ATIVO"

    col1, col2 = st.columns(2)
    if col1.button(rotulo, type="primary", use_container_width=True, key=f"cc_confirma_status_{registro['id']}"):
        definir_status_cadastro_cessionario(registro["id"], novo_status, usuario)
        registrar_atividade(usuario, None, "CADASTRO_CESSIONARIO_STATUS", modulo="cessionarios", detalhe=f"{registro['codigo']} -> {novo_status}")
        st.toast("Status atualizado.", icon=":material/check_circle:")
        st.session_state["_gat_refresh"] = st.session_state.get("_gat_refresh", 0) + 1
        st.rerun()
    if col2.button("Cancelar", use_container_width=True, key=f"cc_cancela_status_{registro['id']}"):
        st.rerun()
