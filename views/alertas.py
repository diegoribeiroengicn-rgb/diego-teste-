"""Central de Alertas — motor compartilhado pelas views por módulo
(Prestadores/Cessionários) e pela visão consolidada (apenas usuários
autorizados). Critérios: gargalo de revisão, atraso na análise, avaliação
crítica/baixa e atraso no reenvio (retorno externo fora do SLA)."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.alertas_engine import TIPO_ALERTA_LABELS, TIPO_ALERTA_MAXIMO, TIPO_AVALIACAO_OBRIGATORIA, montar_alertas_modulo
from gat.arquivo_business_rules import perfil_pode_arquivar_e_restaurar
from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores, filtrar_ativos, filtrar_por_competencia, situacao_prazo
from gat.calendario import dias_uteis_entre
from gat.config import DISCIPLINAS, PERFIL_ADMIN, PERFIL_GESTOR, RESPONSAVEIS
from gat.database import (
    STATUS_ALERTA_OPCOES,
    adiar_alerta,
    iniciar_tratamento_alerta,
    listar_alertas_manuais,
    listar_cessionarios,
    listar_historico_varios_registros,
    listar_obras_prestador,
    listar_prestadores,
    marcar_tratado_alerta,
    reabrir_alerta,
    reabrir_alerta_manual,
    retirar_do_radar,
)
from gat.devolutiva_externa import (
    SITUACAO_AGUARDANDO_PRAZO_INICIAL,
    SITUACAO_EM_HOLD,
    montar_devolutivas_pendentes,
)
from gat.horario import hoje_br
from gat.normalizacao import texto_seguro
from gat.permissions import exigir_area, pode_area, pode_modulo
from gat.ui.filtros import rotulo_competencia, seletor_competencia
from gat.ui.formatos import formatar_data_br, formatar_datahora_br, formatar_datahoras_df
from gat.ui.modals_alerta_manual import dialog_alerta_manual, dialog_encerrar_alerta_manual
from gat.ui.modals_arquivo import dialog_arquivar
from gat.ui.modals_avaliacao import dialog_avaliacao_checklist
from gat.ui.modals_devolutiva import dialog_cobranca_devolutiva

_LABEL_STATUS = {
    "PENDENTE": "Pendente", "EM_TRATAMENTO": "Em tratamento", "TRATADO": "Tratado",
    "ADIADO": "Adiado", "RETIRADO": "Retirado do radar", "REABERTO": "Reaberto",
}
_STATUS_ATIVOS = {"PENDENTE", "EM_TRATAMENTO", "REABERTO"}


def _ou_traco(valor) -> str:
    """`valor or '—'` não protege contra NaN (bool(float('nan')) é True); esta
    função trata None/NaN/vazio uniformemente antes de exibir na tela."""
    return str(valor) if pd.notna(valor) and str(valor).strip() else "—"


def _acao_avaliacao_obrigatoria(usuario: dict, alerta: pd.Series, chave_acao: str) -> None:
    """A avaliação obrigatória não tem tratamento/adiamento/retirada manual
    — a única forma de encerrar o alerta é realizar a avaliação. Assim que
    ela for salva, este alerta simplesmente deixa de ser gerado no próximo
    carregamento (ver `gat/alertas_engine.py`)."""
    rotulo_avaliacao = "avaliação de prestador" if alerta["modulo"] == "prestadores" else "avaliação do projetista do cessionário"
    st.warning(
        f"Existe uma {rotulo_avaliacao} pendente para a AT {_ou_traco(alerta.get('num_at'))}.",
        icon=":material/assignment_late:",
    )
    st.caption(f"Analista responsável: {_ou_traco(alerta.get('responsavel'))}")
    if st.button("Avaliar agora", icon=":material/fact_check:", type="primary", key=f"avaliar_{chave_acao}", use_container_width=True):
        tipo_entidade = "PRESTADOR" if alerta["modulo"] == "prestadores" else "CESSIONARIO"
        dialog_avaliacao_checklist(
            usuario["username"], tipo_entidade,
            prefill={
                "nome_entidade": alerta.get("nome"), "codigo_entidade": alerta.get("codigo"),
                "disciplina": alerta.get("disciplina"), "at_referencia": alerta.get("num_at"),
                "revisao": alerta.get("revisao"), "analista_responsavel": alerta.get("responsavel"),
                "projeto_id": alerta.get("projeto_id"),
            },
        )


def _cartao_alerta(usuario: dict, alerta: pd.Series, sufixo_chave: str) -> None:
    with st.container(border=True):
        if alerta["tipo_alerta"] == TIPO_ALERTA_MAXIMO:
            st.error(
                f"🟥 **ALERTA MÁXIMO** — {alerta['nome']} (AT {_ou_traco(alerta.get('num_at'))}): "
                f"{alerta.get('detalhe') or 'pelo menos 24 horas de atraso real, exige atuação imediata.'}",
                icon=":material/emergency_home:",
            )
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

        if alerta["tipo_alerta"] == TIPO_AVALIACAO_OBRIGATORIA:
            _acao_avaliacao_obrigatoria(usuario, alerta, chave_acao)
            return

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
            st.session_state.setdefault(f"data_adiar_{chave_acao}", None)
            adiado_para = st.date_input("Adiar para", format="DD/MM/YYYY", key=f"data_adiar_{chave_acao}")
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


_ICONE_PRIORIDADE = {"Baixa": "🔵", "Média": "🟡", "Alta": "🟠", "Urgente": "🔴"}


def _cartao_alerta_manual(usuario: dict, alerta: pd.Series, pode_gerenciar: bool) -> None:
    with st.container(border=True):
        col_info, col_prio = st.columns([4, 1])
        with col_info:
            st.markdown(f"**{alerta['titulo']}** — {_ou_traco(alerta.get('nome_entidade'))} ({_ou_traco(alerta.get('disciplina'))})")
            if alerta.get("descricao"):
                st.caption(alerta["descricao"])
            st.caption(
                f"N° AT {_ou_traco(alerta.get('num_at'))} · Código {_ou_traco(alerta.get('codigo_projeto'))} · "
                f"Revisão {_ou_traco(alerta.get('revisao'))} · Especialista: {_ou_traco(alerta.get('especialista'))} · "
                f"Criado por {alerta.get('criado_por')} em {formatar_datahora_br(alerta.get('criado_em')) or '—'}"
            )
            if alerta.get("destinatarios"):
                st.caption(f"Destinatários: {alerta['destinatarios']}")
            if alerta.get("observacoes"):
                st.caption(f"Observações: {alerta['observacoes']}")
        with col_prio:
            st.caption(f"{_ICONE_PRIORIDADE.get(alerta.get('prioridade'), '')} Prioridade: **{_ou_traco(alerta.get('prioridade'))}**")
            if alerta.get("vencimento"):
                dias = dias_uteis_entre(hoje_br(), alerta["vencimento"])
                chave = situacao_prazo(dias)
                st.caption(f"{_ICONE_SITUACAO_PRAZO_MANUAL.get(chave, '')} Vence em {formatar_data_br(alerta['vencimento'])}")

        if pode_gerenciar:
            col1, col2 = st.columns(2)
            if col1.button("Editar", key=f"am_editar_{alerta['id']}", use_container_width=True):
                dialog_alerta_manual(usuario, alerta["modulo"], registro=alerta.to_dict())
            if col2.button("Encerrar", key=f"am_encerrar_{alerta['id']}", use_container_width=True):
                dialog_encerrar_alerta_manual(usuario, alerta.to_dict())


_ICONE_SITUACAO_PRAZO_MANUAL = {
    "DENTRO DO PRAZO": "🟢", "VENCE EM BREVE": "🟡", "VENCE HOJE": "🟠", "ATRASADO": "🔴",
}


def _secao_alertas_manuais(usuario: dict, modulos_incluidos: list[str], modulo_criacao: str | None) -> None:
    pode_gerenciar = pode_area(usuario, "alertas.manual")

    with st.expander("Alertas manuais", icon=":material/campaign:", expanded=False):
        if pode_gerenciar and modulo_criacao:
            if st.button("Novo alerta manual", icon=":material/add_alert:", type="primary", key=f"am_novo_{modulo_criacao}"):
                dialog_alerta_manual(usuario, modulo_criacao)
        elif pode_gerenciar and not modulo_criacao:
            st.caption("Para criar um novo alerta manual, acesse a Central de Alertas de Prestadores ou Cessionários.")

        manuais = pd.concat(
            [listar_alertas_manuais(mod) for mod in modulos_incluidos], ignore_index=True
        ) if modulos_incluidos else pd.DataFrame()

        if manuais.empty:
            st.caption("Nenhum alerta manual cadastrado.")
            return

        opcoes_destinatario = sorted({
            d.strip() for lista in manuais["destinatarios"].dropna() for d in lista.split(",") if d.strip()
        })
        if opcoes_destinatario:
            filtro_destinatario = st.multiselect(
                "Filtrar por destinatário", opcoes_destinatario, key=f"am_filtro_dest_{modulo_criacao or 'consolidado'}",
            )
            if filtro_destinatario:
                manuais = manuais[manuais["destinatarios"].fillna("").apply(
                    lambda v: any(d in [x.strip() for x in v.split(",")] for d in filtro_destinatario)
                )]

        abertos = manuais[manuais["status"] == "ABERTO"]
        encerrados = manuais[manuais["status"] == "ENCERRADO"]

        st.caption(f"{len(abertos)} aberto(s) · {len(encerrados)} encerrado(s)")
        for _, alerta in abertos.iterrows():
            _cartao_alerta_manual(usuario, alerta, pode_gerenciar)

        if not encerrados.empty:
            with st.expander(f"Encerrados ({len(encerrados)})", icon=":material/history:"):
                historico_encerrados = listar_historico_varios_registros("alertas_manuais", encerrados["id"].astype(int).tolist())
                for _, alerta in encerrados.iterrows():
                    st.markdown(f"**{alerta['titulo']}** — {_ou_traco(alerta.get('nome_entidade'))} · *Encerrado em {formatar_datahora_br(alerta.get('encerrado_em')) or '—'} por {alerta.get('encerrado_por')}*")
                    if alerta.get("motivo_encerramento"):
                        st.caption(f"Motivo: {alerta['motivo_encerramento']}")
                    historico = historico_encerrados[historico_encerrados["registro_id"] == int(alerta["id"])]
                    if not historico.empty:
                        st.dataframe(
                            formatar_datahoras_df(historico, ["data_hora"])[["campo", "valor_anterior", "valor_novo", "usuario", "data_hora"]],
                            hide_index=True, use_container_width=True,
                        )
                    col_reabrir, col_arquivar = st.columns(2)
                    if pode_gerenciar and col_reabrir.button("Reabrir", key=f"am_reabrir_{alerta['id']}", use_container_width=True):
                        reabrir_alerta_manual(alerta["id"], usuario["username"])
                        st.toast("Alerta manual reaberto.", icon=":material/check_circle:")
                        st.rerun()
                    if perfil_pode_arquivar_e_restaurar(usuario.get("perfil")) and col_arquivar.button(
                        "Arquivar", icon=":material/archive:", key=f"am_arquivar_{alerta['id']}", use_container_width=True
                    ):
                        dialog_arquivar("alertas_manuais", int(alerta["id"]), alerta["titulo"], usuario["username"])


_ICONE_SITUACAO_DEVOLUTIVA = {
    SITUACAO_AGUARDANDO_PRAZO_INICIAL: "⚪",
    SITUACAO_EM_HOLD: "🔵",
}


def _cartao_devolutiva(usuario: dict, registro: pd.Series, mapa_obras: dict) -> None:
    with st.container(border=True):
        obra = texto_seguro(mapa_obras.get(registro.get("obra_id"), "")).strip() if registro.get("modulo") == "prestadores" else ""
        icone = _ICONE_SITUACAO_DEVOLUTIVA.get(registro["situacao"], "🟡" if not registro["acao_necessaria"] else "🟠")
        col_info, col_status = st.columns([4, 1])
        with col_info:
            titulo_obra = f" · {obra}" if obra else ""
            st.markdown(f"**{_ou_traco(registro.get('nome'))}** ({_ou_traco(registro.get('codigo'))}){titulo_obra} — {_ou_traco(registro.get('disciplina'))}")
            st.caption(
                f"N° AT {_ou_traco(registro.get('num_at'))} · Revisão {registro.get('revisao')} · "
                f"Responsável: {_ou_traco(registro.get('responsavel'))} · "
                f"Última AT em {formatar_data_br(registro.get('data_ultima_at')) or '—'} · "
                f"{registro['dias_uteis_decorridos']} dia(s) útil(eis) sem retorno"
            )
            st.caption(
                f"Cobranças realizadas: {registro['numero_cobrancas_realizadas']}" +
                (f" · Última cobrança: {formatar_data_br(registro.get('data_ultima_cobranca'))}" if pd.notna(registro.get("data_ultima_cobranca")) else "") +
                (f" · Próxima verificação prevista: {formatar_data_br(registro.get('data_prevista_proxima_verificacao'))}" if pd.notna(registro.get("data_prevista_proxima_verificacao")) else "")
            )
        with col_status:
            st.caption(f"{icone} **{registro['situacao_label']}**")

        if registro["acao_necessaria"]:
            if st.button(
                "Gerar e-mail de cobrança", icon=":material/mail:", type="primary", use_container_width=True,
                key=f"dv_gerar_{registro['modulo']}_{registro['projeto_id']}",
            ):
                dialog_cobranca_devolutiva(usuario, registro["modulo"], registro.to_dict())


def _secao_devolutivas_pendentes(usuario: dict, modulos_incluidos: list[str]) -> None:
    """Central de Alertas > Devolutivas Pendentes (itens 1-16 da regra de
    cobrança recorrente de Devolutiva Externa): projetos com a última AT
    emitida ainda aguardando retorno do Prestador/Cessionário, com a
    situação calculada 100% dinamicamente (nunca um alerta persistido) e
    a ação de gerar/confirmar a próxima cobrança quando devida."""
    with st.expander("Devolutivas Pendentes", icon=":material/mark_email_unread:", expanded=False):
        st.caption(
            "Projetos com a última AT emitida, aguardando nova revisão do Prestador/Cessionário. 10 dias úteis "
            "sem retorno geram a 1ª cobrança; a partir daí, uma nova cobrança a cada 5 dias úteis sem retorno, "
            "sem limite máximo, até o projeto voltar para Em Análise/Em Andamento. HOLD sempre pausa a contagem "
            "e nunca gera cobrança, atraso ou Alerta Máximo. Este período nunca é contado como atraso do analista."
        )

        todas_devolutivas = []
        for mod in modulos_incluidos:
            coluna_nome = "prestador" if mod == "prestadores" else "cessionario"
            df = enriquecer_prestadores(filtrar_ativos(listar_prestadores())) if mod == "prestadores" else enriquecer_cessionarios(filtrar_ativos(listar_cessionarios()))
            devolutivas_mod = montar_devolutivas_pendentes(df, mod, coluna_nome)
            if not devolutivas_mod.empty:
                todas_devolutivas.append(devolutivas_mod)

        if not todas_devolutivas:
            st.success("Nenhuma devolutiva externa pendente no momento.")
            return

        devolutivas = pd.concat(todas_devolutivas, ignore_index=True)
        obras = listar_obras_prestador()
        mapa_obras = obras.set_index("id")["nome_obra"].to_dict() if not obras.empty else {}

        col_m1, col_m2, col_m3 = st.columns(3)
        col_m1.metric("Prestadores aguardando retorno", int((devolutivas["modulo"] == "prestadores").sum()))
        col_m2.metric("Cessionários aguardando retorno", int((devolutivas["modulo"] == "cessionarios").sum()))
        col_m3.metric("Cobranças pendentes (ação necessária)", int(devolutivas["acao_necessaria"].sum()))

        devolutivas = devolutivas.sort_values(by="acao_necessaria", ascending=False)
        for _, registro in devolutivas.iterrows():
            _cartao_devolutiva(usuario, registro, mapa_obras)


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
        "Projetos com revisão ≥ REV2 sem liberação, atrasados, com avaliação Crítica/Baixa, com retorno "
        "externo fora do SLA de 10 dias úteis, ou com avaliação obrigatória (checklist) ainda pendente desde "
        "a Rev. 01. Um alerta retirado do radar sai das sugestões ativas, mas permanece no histórico e na "
        "auditoria — a avaliação obrigatória é a única exceção: ela só some quando a avaliação é realizada."
    )

    _secao_alertas_manuais(usuario, modulos_incluidos, modulo)
    _secao_devolutivas_pendentes(usuario, modulos_incluidos)

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

    if not alertas.empty and usuario.get("perfil") not in (PERFIL_ADMIN, PERFIL_GESTOR):
        # A avaliação obrigatória é a única pendência pessoal do analista —
        # ele só vê as suas; Gestor e Administrador continuam vendo todas,
        # como acompanhamento. Os demais tipos de alerta não são afetados.
        nome_usuario = (usuario.get("nome_completo") or usuario.get("username") or "").strip().casefold()
        e_avaliacao_obrigatoria = alertas["tipo_alerta"] == TIPO_AVALIACAO_OBRIGATORIA
        e_do_analista = alertas["responsavel"].fillna("").astype(str).str.strip().str.casefold() == nome_usuario
        alertas = alertas[~e_avaliacao_obrigatoria | e_do_analista]

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
        ativos = ativos.sort_values(
            by="tipo_alerta", key=lambda s: (s != TIPO_ALERTA_MAXIMO), kind="stable",
        )
        if len(ativos) > limite:
            st.caption(
                f"Exibindo os {limite} alertas mais recentes de {len(ativos)} (Alerta Máximo sempre em primeiro lugar). "
                "Use os Filtros para refinar a lista."
            )
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
