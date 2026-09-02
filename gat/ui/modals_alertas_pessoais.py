"""Pop-up de alertas pessoais pendentes (prazo da própria carga + alertas
manuais direcionados), aberto ao entrar em Início até o usuário fechá-lo
explicitamente (botão "Fechar" ou "Ver todos em Meus Alertas") — ver
`gat.alertas_pessoais`. Não duplica a Central de Alertas nem o motor de
atraso; só decide o que mostrar e chama as mesmas funções de "marcar como
visto" usadas em "Meus Alertas"."""

from __future__ import annotations

import streamlit as st

from gat.alertas_pessoais import carregar_alertas_pessoais
from gat.database import marcar_alerta_pessoal_visto
from gat.ui.formatos import formatar_data_br

_ICONE_SITUACAO_PRAZO = {"ATRASADO": "🔴", "VENCE HOJE": "🟠", "VENCE EM BREVE": "🟡"}
_LABEL_SITUACAO_PRAZO = {"ATRASADO": "VENCIDA", "VENCE HOJE": "VENCE HOJE", "VENCE EM BREVE": "VENCE EM BREVE"}
_ICONE_PRIORIDADE_MANUAL = {"Baixa": "🔵", "Média": "🟡", "Alta": "🟠", "Urgente": "🔴"}


def _navegar_para_at(modulo: str, num_at: str | None, codigo: str | None) -> None:
    prefixo = "prest" if modulo == "prestadores" else "cess"
    if num_at:
        st.session_state[f"filtro_{prefixo}_at"] = num_at
    elif codigo:
        st.session_state[f"filtro_{prefixo}_codigo"] = codigo
    pagina = st.session_state.get("_gat_paginas", {}).get(f"{modulo}_projetos")
    if pagina is not None:
        st.switch_page(pagina)


@st.dialog("⚠️ Alertas pendentes", width="large")
def dialog_alertas_pessoais(usuario: dict, df_prest, df_cess) -> None:
    """
    Recebe os DataFrames de Prestadores/Cessionários (não a lista já
    filtrada) e recalcula os pendentes a cada rerun do próprio diálogo —
    um `@st.dialog` mantém reabrindo com os MESMOS argumentos originais a
    cada interação interna, então uma lista pré-filtrada passada por valor
    ficaria congelada no estado de quando o pop-up abriu: "Marcar como
    Visto" gravaria no banco corretamente, mas o item continuaria
    aparecendo na tela até a próxima visita à Início.
    """
    painel = carregar_alertas_pessoais(usuario, df_prest, df_cess)
    prazo_pendente = painel["prazo_pendente"]
    manuais_pendente = painel["manuais_pendente"]

    chave_popup_fechado = f"_alertas_popup_fechado_{usuario['username']}"

    if prazo_pendente.empty and manuais_pendente.empty:
        st.success("Nenhum alerta pendente.", icon=":material/check_circle:")
        if st.button("Fechar", use_container_width=True):
            st.session_state[chave_popup_fechado] = True
            st.rerun()
        return

    st.caption(f"Você tem {painel['total_pendente']} alerta(s) ainda não visualizado(s).")

    for _, linha in prazo_pendente.iterrows():
        with st.container(border=True):
            icone = _ICONE_SITUACAO_PRAZO.get(linha["situacao_prazo"], "")
            rotulo = _LABEL_SITUACAO_PRAZO.get(linha["situacao_prazo"], linha["situacao_prazo"])
            st.markdown(
                f"{icone} **Análise {rotulo}** | AT {linha['num_at'] or '—'} | "
                f"Projeto: {linha['codigo']} — {linha['nome_entidade']} | "
                f"Analista: {usuario.get('nome_completo') or usuario['username']}"
            )
            st.caption(f"Data limite: {formatar_data_br(linha['data_limite']) or '—'}")
            col1, col2 = st.columns(2)
            if col1.button("Visualizar AT", icon=":material/arrow_forward:", key=f"pop_ver_{linha['chave']}", use_container_width=True):
                st.session_state[chave_popup_fechado] = True
                _navegar_para_at(linha["modulo"], linha["num_at"], linha["codigo"])
            if col2.button("Marcar como Visto", icon=":material/visibility:", key=f"pop_visto_{linha['chave']}", use_container_width=True):
                marcar_alerta_pessoal_visto(usuario["username"], "PRAZO", linha["chave"])
                st.toast("Alerta marcado como visto.", icon=":material/check_circle:")
                st.rerun()

    for _, linha in manuais_pendente.iterrows():
        with st.container(border=True):
            icone = _ICONE_PRIORIDADE_MANUAL.get(linha.get("prioridade"), "")
            st.markdown(f"{icone} **{linha['titulo']}** — {linha.get('nome_entidade') or '—'}")
            if linha.get("observacoes"):
                st.caption(f"Observação: {linha['observacoes']}")
            st.caption(f"Direcionado por: {linha.get('atualizado_por') or linha.get('criado_por')}")
            col1, col2 = st.columns(2)
            if (linha.get("num_at") or linha.get("codigo_projeto")) and col1.button(
                "Visualizar AT", icon=":material/arrow_forward:", key=f"pop_verm_{linha['chave']}", use_container_width=True,
            ):
                st.session_state[chave_popup_fechado] = True
                _navegar_para_at(linha["modulo"], linha.get("num_at"), linha.get("codigo_projeto"))
            if col2.button("Marcar como Visto", icon=":material/visibility:", key=f"pop_vistom_{linha['chave']}", use_container_width=True):
                marcar_alerta_pessoal_visto(usuario["username"], "MANUAL", linha["chave"])
                st.toast("Alerta marcado como visto.", icon=":material/check_circle:")
                st.rerun()

    st.divider()
    if st.button("Ver todos em Meus Alertas", icon=":material/notifications:", use_container_width=True):
        st.session_state[chave_popup_fechado] = True
        pagina = st.session_state.get("_gat_paginas", {}).get("meus_alertas")
        if pagina is not None:
            st.switch_page(pagina)
    if st.button("Fechar", use_container_width=True):
        st.session_state[chave_popup_fechado] = True
        st.rerun()
