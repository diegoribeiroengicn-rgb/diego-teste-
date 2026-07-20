"""Central de Alertas — motor compartilhado pelas views por módulo
(Prestadores/Cessionários) e pela visão consolidada (apenas usuários
autorizados). Critérios: gargalo de revisão, atraso na análise, avaliação
crítica/baixa e atraso no reenvio (retorno externo fora do SLA)."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.alertas_engine import TIPO_ALERTA_LABELS, montar_alertas_modulo
from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores, filtrar_ativos, filtrar_por_competencia
from gat.config import DISCIPLINAS, RESPONSAVEIS
from gat.database import (
    STATUS_ALERTA_OPCOES,
    adiar_alerta,
    iniciar_tratamento_alerta,
    listar_cessionarios,
    listar_prestadores,
    marcar_tratado_alerta,
    reabrir_alerta,
    retirar_do_radar,
)
from gat.permissions import exigir_area, pode_modulo
from gat.ui.filtros import rotulo_competencia, seletor_competencia

_LABEL_STATUS = {
    "PENDENTE": "Pendente", "EM_TRATAMENTO": "Em tratamento", "TRATADO": "Tratado",
    "ADIADO": "Adiado", "RETIRADO": "Retirado do radar", "REABERTO": "Reaberto",
}
_STATUS_ATIVOS = {"PENDENTE", "EM_TRATAMENTO", "REABERTO"}


def _ou_traco(valor) -> str:
    """`valor or '—'` não protege contra NaN (bool(float('nan')) é True); esta
    função trata None/NaN/vazio uniformemente antes de exibir na tela."""
    return str(valor) if pd.notna(valor) and str(valor).strip() else "—"


def _cartao_alerta(usuario: dict, alerta: pd.Series, sufixo_chave: str) -> None:
    with st.container(border=True):
        col_info, col_status = st.columns([4, 1])
        with col_info:
            st.markdown(f"**{alerta['nome']}** ({_ou_traco(alerta.get('disciplina'))}) — {alerta['motivo_label']}")
            if pd.notna(alerta.get("detalhe")) and alerta.get("detalhe"):
                st.caption(alerta["detalhe"])
            st.caption(
                f"Item {alerta.get('item')} · Código {_ou_traco(alerta.get('codigo'))} · N° AT {_ou_traco(alerta.get('num_at'))} · "
                f"Revisão {alerta.get('revisao')} · Responsável: {_ou_traco(alerta.get('responsavel'))}"
            )
        with col_status:
            st.caption(f"Status: **{_LABEL_STATUS.get(alerta['status'], alerta['status'])}**")

        chave_acao = f"{alerta['modulo']}_{alerta['projeto_id']}_{alerta['tipo_alerta']}_{sufixo_chave}"
        col1, col2, col3, col4 = st.columns(4)
        if col1.button("Iniciar tratamento", key=f"iniciar_{chave_acao}", use_container_width=True, disabled=alerta["status"] == "EM_TRATAMENTO"):
            iniciar_tratamento_alerta(alerta["modulo"], alerta["projeto_id"], alerta["tipo_alerta"], usuario["username"])
            st.rerun()
        if col2.button("Marcar como tratado", key=f"tratar_{chave_acao}", use_container_width=True):
            st.session_state[f"_form_tratar_{chave_acao}"] = True
        if col3.button("Adiar", key=f"adiar_{chave_acao}", use_container_width=True):
            st.session_state[f"_form_adiar_{chave_acao}"] = True
        if col4.button("Retirar do radar", key=f"retirar_{chave_acao}", use_container_width=True):
            st.session_state[f"_form_retirar_{chave_acao}"] = True

        if st.session_state.get(f"_form_tratar_{chave_acao}"):
            providencia = st.text_area("Providência adotada (obrigatória)", key=f"prov_{chave_acao}")
            responsavel = st.text_input("Responsável pelo tratamento", value=usuario.get("nome_completo") or usuario["username"], key=f"resp_{chave_acao}")
            observacao = st.text_input("Observação (opcional)", key=f"obs_trat_{chave_acao}")
            col_c, col_x = st.columns(2)
            if col_c.button("Confirmar tratamento", key=f"confirma_trat_{chave_acao}", type="primary"):
                if not providencia.strip():
                    st.error("A providência adotada é obrigatória.")
                else:
                    marcar_tratado_alerta(alerta["modulo"], alerta["projeto_id"], alerta["tipo_alerta"], providencia, responsavel, observacao, usuario["username"])
                    st.session_state.pop(f"_form_tratar_{chave_acao}", None)
                    st.toast("Alerta marcado como tratado.", icon=":material/check_circle:")
                    st.rerun()
            if col_x.button("Cancelar", key=f"cancela_trat_{chave_acao}"):
                st.session_state.pop(f"_form_tratar_{chave_acao}", None)
                st.rerun()

        if st.session_state.get(f"_form_adiar_{chave_acao}"):
            adiado_para = st.date_input("Adiar para", value=None, format="DD/MM/YYYY", key=f"data_adiar_{chave_acao}")
            observacao = st.text_input("Observação (opcional)", key=f"obs_adiar_{chave_acao}")
            col_c, col_x = st.columns(2)
            if col_c.button("Confirmar adiamento", key=f"confirma_adiar_{chave_acao}", type="primary"):
                adiar_alerta(alerta["modulo"], alerta["projeto_id"], alerta["tipo_alerta"], adiado_para.isoformat() if adiado_para else None, observacao, usuario["username"])
                st.session_state.pop(f"_form_adiar_{chave_acao}", None)
                st.toast("Alerta adiado.", icon=":material/check_circle:")
                st.rerun()
            if col_x.button("Cancelar", key=f"cancela_adiar_{chave_acao}"):
                st.session_state.pop(f"_form_adiar_{chave_acao}", None)
                st.rerun()

        if st.session_state.get(f"_form_retirar_{chave_acao}"):
            justificativa = st.text_area("Justificativa (obrigatória)", key=f"just_ret_{chave_acao}")
            col_c, col_x = st.columns(2)
            if col_c.button("Confirmar retirada", key=f"confirma_ret_{chave_acao}", type="primary"):
                if not justificativa.strip():
                    st.error("A justificativa é obrigatória para retirar um alerta do radar.")
                else:
                    retirar_do_radar(alerta["modulo"], alerta["projeto_id"], alerta["tipo_alerta"], justificativa, usuario["username"])
                    st.session_state.pop(f"_form_retirar_{chave_acao}", None)
                    st.toast("Alerta retirado do radar.", icon=":material/check_circle:")
                    st.rerun()
            if col_x.button("Cancelar", key=f"cancela_ret_{chave_acao}"):
                st.session_state.pop(f"_form_retirar_{chave_acao}", None)
                st.rerun()

        if alerta["tipo_alerta"] == "ATRASO_REENVIO" and alerta["status"] in _STATUS_ATIVOS:
            st.warning(
                "Retorno externo fora do SLA. O prazo de 10 dias úteis para o envio da próxima revisão foi "
                "ultrapassado. Recomenda-se contato com a Administração Contratual para cobrança e acompanhamento.",
                icon=":material/warning:",
            )


def _historico_alerta(alerta: pd.Series) -> None:
    with st.expander("Consultar histórico", icon=":material/history:"):
        detalhes = []
        if alerta.get("providencia"):
            detalhes.append(f"Providência: {alerta['providencia']}")
        if alerta.get("responsavel_tratamento"):
            detalhes.append(f"Responsável: {alerta['responsavel_tratamento']}")
        if alerta.get("data_tratamento"):
            detalhes.append(f"Data do tratamento: {alerta['data_tratamento']}")
        if alerta.get("justificativa"):
            detalhes.append(f"Justificativa: {alerta['justificativa']}")
        if alerta.get("observacao"):
            detalhes.append(f"Observação: {alerta['observacao']}")
        st.write("\n\n".join(detalhes) if detalhes else "Sem histórico registrado ainda.")


def render(usuario: dict, modulo: str | None = None) -> None:
    """`modulo` = 'prestadores' | 'cessionarios' | None (consolidado, apenas
    usuários autorizados)."""
    exigir_area(usuario, "alertas")

    if modulo is None:
        titulo = "Central de Alertas — Consolidado"
        modulos_incluidos = [m for m in ("prestadores", "cessionarios") if pode_modulo(usuario, m)]
    else:
        titulo = f"Central de Alertas — {'Prestadores' if modulo == 'prestadores' else 'Cessionários'}"
        modulos_incluidos = [modulo]

    st.subheader(f":material/notifications_active: {titulo}")
    st.caption(
        "Projetos com revisão ≥ REV2 sem liberação, atrasados, com avaliação Crítica/Baixa, ou com retorno "
        "externo fora do SLA de 10 dias úteis. Um alerta retirado do radar sai das sugestões ativas, mas "
        "permanece no histórico e na auditoria."
    )

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        col1, col2, col3 = st.columns(3)
        f_codigo = col1.text_input("Código", key=f"filtro_alertas_codigo_{modulo}")
        f_nome = col2.text_input("Nome (busca parcial)", key=f"filtro_alertas_nome_{modulo}")
        f_at = col3.text_input("N° AT", key=f"filtro_alertas_at_{modulo}")
        col4, col5, col6 = st.columns(3)
        f_disciplina = col4.multiselect("Disciplina", DISCIPLINAS, key=f"filtro_alertas_disc_{modulo}")
        f_analista = col5.multiselect("Analista", RESPONSAVEIS, key=f"filtro_alertas_analista_{modulo}")
        f_tipo = col6.multiselect("Tipo de alerta", list(TIPO_ALERTA_LABELS.values()), key=f"filtro_alertas_tipo_{modulo}")
        col7, col8 = st.columns(2)
        f_status = col7.multiselect("Status", [_LABEL_STATUS[s] for s in STATUS_ALERTA_OPCOES], key=f"filtro_alertas_status_{modulo}")
        f_revisao = col8.text_input("Revisão", key=f"filtro_alertas_rev_{modulo}")
        mes, ano = seletor_competencia(f"filtro_alertas_comp_{modulo}")

    todos_alertas = []
    for mod in modulos_incluidos:
        df = enriquecer_prestadores(filtrar_ativos(listar_prestadores())) if mod == "prestadores" else enriquecer_cessionarios(filtrar_ativos(listar_cessionarios()))
        if mes or ano:
            df = filtrar_por_competencia(df, "data_solicitacao", mes, ano)
        coluna_nome = "prestador" if mod == "prestadores" else "cessionario"
        alertas_mod = montar_alertas_modulo(df, mod, coluna_nome)
        if not alertas_mod.empty:
            todos_alertas.append(alertas_mod)

    alertas = pd.concat(todos_alertas, ignore_index=True) if todos_alertas else pd.DataFrame()

    if not alertas.empty:
        if f_codigo.strip():
            alertas = alertas[alertas["codigo"].fillna("").astype(str).str.contains(f_codigo.strip(), case=False, na=False, regex=False)]
        if f_nome.strip():
            alertas = alertas[alertas["nome"].fillna("").astype(str).str.contains(f_nome.strip(), case=False, na=False, regex=False)]
        if f_at.strip():
            alertas = alertas[alertas["num_at"].fillna("").astype(str).str.contains(f_at.strip(), case=False, na=False, regex=False)]
        if f_disciplina:
            alertas = alertas[alertas["disciplina"].isin(f_disciplina)]
        if f_analista:
            alertas = alertas[alertas["responsavel"].isin(f_analista)]
        if f_tipo:
            alertas = alertas[alertas["motivo_label"].isin(f_tipo)]
        if f_status:
            chaves_status = [k for k, v in _LABEL_STATUS.items() if v in f_status]
            alertas = alertas[alertas["status"].isin(chaves_status)]
        if f_revisao.strip():
            alertas = alertas[alertas["revisao"].astype(str) == f_revisao.strip()]

    if alertas.empty:
        st.success("Nenhum alerta encontrado com os filtros aplicados.")
        return

    ativos = alertas[alertas["status"].isin(_STATUS_ATIVOS)]
    inativos = alertas[~alertas["status"].isin(_STATUS_ATIVOS)]

    col_m1, col_m2, col_m3 = st.columns(3)
    col_m1.metric("Alertas ativos", len(ativos))
    col_m2.metric("Tratados/Adiados/Retirados", len(inativos))
    col_m3.metric("Atraso no reenvio (ativos)", int((ativos["tipo_alerta"] == "ATRASO_REENVIO").sum()))

    if ativos.empty:
        st.success("Nenhum alerta ativo no momento.")
    else:
        limite = 30
        if len(ativos) > limite:
            st.caption(f"Exibindo os {limite} alertas mais recentes de {len(ativos)}. Use os Filtros para refinar a lista.")
            ativos = ativos.head(limite)
        for idx, (_, alerta) in enumerate(ativos.iterrows()):
            _cartao_alerta(usuario, alerta, f"{modulo}_{idx}")

    if not inativos.empty:
        with st.expander(f"Tratados / Adiados / Retirados ({len(inativos)})", icon=":material/history:"):
            for idx, (_, alerta) in enumerate(inativos.iterrows()):
                col_info, col_acao = st.columns([4, 1])
                with col_info:
                    st.markdown(f"**{alerta['nome']}** ({_ou_traco(alerta.get('disciplina'))}) — {alerta['motivo_label']} — *{_LABEL_STATUS.get(alerta['status'], alerta['status'])}*")
                    _historico_alerta(alerta)
                with col_acao:
                    if st.button("Reabrir", key=f"reabrir_{modulo}_{idx}_{alerta['projeto_id']}_{alerta['tipo_alerta']}", use_container_width=True):
                        reabrir_alerta(alerta["modulo"], alerta["projeto_id"], alerta["tipo_alerta"], usuario["username"])
                        st.toast("Alerta reaberto.", icon=":material/check_circle:")
                        st.rerun()
