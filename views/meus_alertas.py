"""View: Meus Alertas — prazos da própria carga (vencido/vence hoje/vence
em breve) e alertas manuais direcionados a este usuário. Camada pessoal de
notificação por cima da mesma engine de atraso e da mesma tabela
`alertas_manuais` já usadas em Projetos/Dashboards e na Central de Alertas —
não duplica nenhuma das duas."""

from __future__ import annotations

import streamlit as st

from gat.alertas_pessoais import carregar_alertas_pessoais
from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores, filtrar_ativos
from gat.database import listar_cessionarios, listar_prestadores, marcar_alerta_pessoal_visto
from gat.ui.formatos import formatar_data_br, formatar_datahora_br

_ICONE_SITUACAO_PRAZO = {"ATRASADO": "🔴", "VENCE HOJE": "🟠", "VENCE EM BREVE": "🟡"}
_LABEL_SITUACAO_PRAZO = {"ATRASADO": "Vencido", "VENCE HOJE": "Vence hoje", "VENCE EM BREVE": "Vence em breve"}
_ICONE_PRIORIDADE = {"Alta": "🔴", "Média": "🟡", "Baixa": "🔵"}
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
    else:
        st.rerun()


def _cartao_prazo(usuario: dict, linha) -> None:
    with st.container(border=True):
        col_info, col_acao = st.columns([4, 1])
        with col_info:
            icone = _ICONE_SITUACAO_PRAZO.get(linha["situacao_prazo"], "")
            rotulo = _LABEL_SITUACAO_PRAZO.get(linha["situacao_prazo"], linha["situacao_prazo"])
            rotulo_modulo = "Prestador" if linha["modulo"] == "prestadores" else "Cessionário"
            st.markdown(f"{icone} **Análise {rotulo}** — AT {linha['num_at'] or '—'}")
            st.caption(
                f"{linha['codigo']} — {linha['nome_entidade']} ({linha['disciplina'] or '—'}) · {rotulo_modulo} · "
                f"Data limite: {formatar_data_br(linha['data_limite']) or '—'}"
            )
            st.caption(f"{_ICONE_PRIORIDADE.get(linha['prioridade'], '')} Prioridade: **{linha['prioridade']}** · Analista: {usuario.get('nome_completo') or usuario['username']}")
        with col_acao:
            if st.button("Ver AT", icon=":material/arrow_forward:", key=f"map_ver_{linha['chave']}", use_container_width=True):
                _navegar_para_at(linha["modulo"], linha["num_at"], linha["codigo"])
            if st.button("Marcar como visto", icon=":material/visibility:", key=f"map_visto_{linha['chave']}", use_container_width=True):
                marcar_alerta_pessoal_visto(usuario["username"], "PRAZO", linha["chave"])
                st.toast("Alerta marcado como visto.", icon=":material/check_circle:")
                st.rerun()


def _cartao_manual(usuario: dict, linha) -> None:
    with st.container(border=True):
        col_info, col_acao = st.columns([4, 1])
        with col_info:
            icone = _ICONE_PRIORIDADE_MANUAL.get(linha.get("prioridade"), "")
            st.markdown(f"{icone} **{linha['titulo']}** — {linha.get('nome_entidade') or '—'}")
            if linha.get("descricao"):
                st.caption(linha["descricao"])
            if linha.get("observacoes"):
                st.caption(f"Observação: {linha['observacoes']}")
            quando = linha.get("atualizado_em") or linha.get("criado_em")
            quem = linha.get("atualizado_por") or linha.get("criado_por")
            st.caption(f"Direcionado por: {quem} em {formatar_datahora_br(quando) or '—'} · Prioridade: **{linha.get('prioridade') or '—'}**")
        with col_acao:
            if (linha.get("num_at") or linha.get("codigo_projeto")) and st.button(
                "Ver AT", icon=":material/arrow_forward:", key=f"mam_ver_{linha['chave']}", use_container_width=True,
            ):
                _navegar_para_at(linha["modulo"], linha.get("num_at"), linha.get("codigo_projeto"))
            if st.button("Marcar como visto", icon=":material/visibility:", key=f"mam_visto_{linha['chave']}", use_container_width=True):
                marcar_alerta_pessoal_visto(usuario["username"], "MANUAL", linha["chave"])
                st.toast("Alerta marcado como visto.", icon=":material/check_circle:")
                st.rerun()


def render(usuario: dict) -> None:
    st.subheader(":material/notifications: Meus Alertas")
    st.caption(
        "Prazos da sua carga vencidos ou vencendo em breve, e alertas direcionados a você por um gestor/administrador. "
        "Alertas de prazo somem sozinhos quando a análise é concluída ou o prazo deixa de estar próximo."
    )

    df_prest = enriquecer_prestadores(filtrar_ativos(listar_prestadores()))
    df_cess = enriquecer_cessionarios(filtrar_ativos(listar_cessionarios()))
    painel = carregar_alertas_pessoais(usuario, df_prest, df_cess)

    if not usuario.get("analista_vinculado"):
        st.info(
            "Sua conta não tem um analista vinculado (Administração > Usuários) — por isso, alertas automáticos de "
            "prazo da sua carga não aparecem aqui. Alertas direcionados manualmente continuam funcionando normalmente.",
            icon=":material/info:",
        )

    prazo_pendente = painel["prazo_pendente"]
    manuais_pendente = painel["manuais_pendente"]

    col1, col2, col3 = st.columns(3)
    col1.metric("Vencidos", int((prazo_pendente["situacao_prazo"] == "ATRASADO").sum()) if not prazo_pendente.empty else 0)
    col2.metric("Vencem hoje/em breve", int((prazo_pendente["situacao_prazo"] != "ATRASADO").sum()) if not prazo_pendente.empty else 0)
    col3.metric("Direcionados a mim", len(manuais_pendente))

    if prazo_pendente.empty and manuais_pendente.empty:
        st.success("Nenhum alerta pendente no momento.", icon=":material/check_circle:")
        return

    if not prazo_pendente.empty:
        st.markdown("##### Prazos da minha carga")
        for _, linha in prazo_pendente.iterrows():
            _cartao_prazo(usuario, linha)

    if not manuais_pendente.empty:
        st.markdown("##### Direcionados a mim")
        for _, linha in manuais_pendente.iterrows():
            _cartao_manual(usuario, linha)
