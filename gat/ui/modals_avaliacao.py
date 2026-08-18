"""Pop-up de avaliação por checklist (Prestadores e Cessionários) — categorias
Qualidade de Projeto, Manuais e Normas, Documentação Geral, Revisões e
Comunicação, com 15 perguntas Sim/Não/N-A e classificação automática."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import streamlit as st

from gat.business_rules import classificar_checklist, pontuar_checklist
from gat.config import (
    ACOMPANHAMENTO_POR_FAIXA,
    CHECKLIST_AVALIACAO,
    RESPOSTA_CHECKLIST_OPCOES,
    RESPONSAVEIS,
)
from gat.database import (
    atualizar_avaliacao_checklist,
    inserir_avaliacao_checklist,
    listar_obras_prestador,
    nome_exibicao_obra,
    obter_avaliacao_checklist_por_revisao,
    obter_cadastro_prestador_por_codigo,
    registrar_atividade,
)
from gat.horario import hoje_br


def _idx(opcoes: list[str], valor: Any) -> int:
    try:
        return opcoes.index(valor)
    except (ValueError, TypeError):
        return 0


@st.dialog("Avaliação — Checklist", width="large")
def dialog_avaliacao_checklist(
    usuario: str, tipo_entidade: str, registro: dict[str, Any] | None = None,
    prefill: dict[str, Any] | None = None,
) -> None:
    editando = registro is not None
    sufixo = f"edit_{registro['id']}" if editando else "novo"
    prefill = prefill or {}
    rotulo_tipo = "Prestador" if tipo_entidade == "PRESTADOR" else "Cessionário"

    st.caption(
        f"Checklist de avaliação de {rotulo_tipo.lower()}, preferencialmente utilizado a partir da "
        "1ª revisão. Cada pergunta conta 1 ponto quando respondida \"Sim\" (0 a 15 pontos)."
    )

    col1, col2 = st.columns(2)
    with col1:
        nome_entidade = st.text_input(
            f"{rotulo_tipo} *",
            value=registro.get("nome_entidade", "") if editando else prefill.get("nome_entidade", ""),
            key=f"av_nome_{sufixo}",
        )
        codigo_entidade = st.text_input(
            f"Código do {rotulo_tipo}",
            value=registro.get("codigo_entidade", "") if editando else prefill.get("codigo_entidade", ""),
            key=f"av_codigo_{sufixo}",
        )
        disciplina = st.text_input(
            "Disciplina",
            value=registro.get("disciplina", "") if editando else prefill.get("disciplina", ""),
            key=f"av_disc_{sufixo}",
        )
    with col2:
        at_referencia = st.text_input(
            "N° AT de referência",
            value=registro.get("at_referencia", "") if editando else prefill.get("at_referencia", ""),
            key=f"av_at_{sufixo}",
        )
        revisao = st.number_input(
            "Revisão avaliada", min_value=0, step=1,
            value=int(registro.get("revisao") or 1) if editando else int(prefill.get("revisao") or 1),
            key=f"av_rev_{sufixo}",
        )
        analista_responsavel = st.selectbox(
            "Analista responsável", RESPONSAVEIS,
            index=_idx(RESPONSAVEIS, registro.get("analista_responsavel") if editando else prefill.get("analista_responsavel")),
            key=f"av_analista_{sufixo}",
        )

    data_avaliacao = st.date_input(
        "Data da avaliação", format="DD/MM/YYYY",
        value=datetime.fromisoformat(registro["data_avaliacao"][:10]).date() if editando and registro.get("data_avaliacao") else hoje_br(),
        key=f"av_data_{sufixo}",
    )

    obra_id_atual = registro.get("obra_id") if editando else prefill.get("obra_id")
    obra_id = obra_id_atual
    if tipo_entidade == "PRESTADOR" and codigo_entidade.strip():
        cadastro_prestador = obter_cadastro_prestador_por_codigo(codigo_entidade.strip())
        if cadastro_prestador:
            obras_df = listar_obras_prestador(cadastro_prestador["id"])
            if not obras_df.empty:
                obras_df = obras_df[(obras_df["status"] == "ATIVA") | (obras_df["id"] == obra_id_atual)]
            mapa_obra = {nome_exibicao_obra(o): o for o in obras_df.to_dict("records")}
            opcoes_obra = ["— Nenhuma —"] + list(mapa_obra.keys())
            rotulo_obra_atual = next((r for r, o in mapa_obra.items() if o["id"] == obra_id_atual), "— Nenhuma —")
            rotulo_obra = st.selectbox(
                "Obra/Canteiro avaliado (opcional)", opcoes_obra,
                index=_idx(opcoes_obra, rotulo_obra_atual),
                key=f"av_obra_{sufixo}_{cadastro_prestador['id']}",
                help="Obras/canteiros cadastrados para este código de prestador em Prestadores → Cadastro.",
            )
            obra_selecionada = mapa_obra.get(rotulo_obra)
            obra_id = obra_selecionada["id"] if obra_selecionada else None
        else:
            obra_id = None

    respostas_atuais: dict[str, dict[str, str]] = {}
    if editando and registro.get("respostas_json"):
        import json
        try:
            respostas_atuais = json.loads(registro["respostas_json"])
        except (ValueError, TypeError):
            respostas_atuais = {}

    st.markdown("##### Checklist")
    st.caption("Todas as perguntas devem ser respondidas antes de salvar — nenhuma vem pré-marcada.")
    respostas: dict[str, dict[str, str]] = {}
    for categoria, perguntas in CHECKLIST_AVALIACAO.items():
        with st.expander(categoria, expanded=True):
            for chave, texto in perguntas:
                anterior = respostas_atuais.get(chave, {})
                col_r, col_j = st.columns([1, 2])
                indice_previo = RESPOSTA_CHECKLIST_OPCOES.index(anterior["resposta"]) if anterior.get("resposta") in RESPOSTA_CHECKLIST_OPCOES else None
                resposta = col_r.radio(
                    texto, RESPOSTA_CHECKLIST_OPCOES, horizontal=True,
                    index=indice_previo,
                    key=f"av_{chave}_{sufixo}",
                )
                justificativa = col_j.text_input(
                    "Justificativa/observação (opcional)", value=anterior.get("justificativa", ""),
                    key=f"av_{chave}_just_{sufixo}", label_visibility="visible" if resposta != "SIM" else "collapsed",
                )
                respostas[chave] = {"resposta": resposta, "justificativa": justificativa}

    observacoes_gerais = st.text_area(
        "Observações gerais", value=registro.get("observacoes_gerais", "") if editando else "",
        key=f"av_obsgerais_{sufixo}",
    )

    pontuacao = pontuar_checklist(respostas)
    classificacao, interpretacao = classificar_checklist(pontuacao)
    acompanhamento = ACOMPANHAMENTO_POR_FAIXA.get(classificacao, "")

    st.markdown("##### Resultado")
    m1, m2, m3 = st.columns(3)
    m1.metric("Pontuação", f"{pontuacao} / 15")
    m2.metric("Classificação", classificacao)
    m3.metric("Acompanhamento", acompanhamento)
    if interpretacao:
        st.caption(interpretacao)

    col_salvar, col_cancelar = st.columns(2)
    salvar = col_salvar.button("Salvar", icon=":material/save:", type="primary", use_container_width=True, key=f"av_salvar_{sufixo}")
    cancelar = col_cancelar.button("Cancelar", use_container_width=True, key=f"av_cancelar_{sufixo}")

    if cancelar:
        st.rerun()

    if salvar:
        if not nome_entidade:
            st.error(f"Preencha ao menos o nome do {rotulo_tipo.lower()}.")
            return
        nao_respondidas = [texto for cat in CHECKLIST_AVALIACAO.values() for chave, texto in cat if respostas.get(chave, {}).get("resposta") is None]
        if nao_respondidas:
            st.error("Responda todas as perguntas do checklist antes de salvar. Pendente(s): " + "; ".join(nao_respondidas))
            return
        import json
        dados = {
            "tipo_entidade": tipo_entidade,
            "codigo_entidade": codigo_entidade or None,
            "nome_entidade": nome_entidade,
            "disciplina": disciplina or None,
            "projeto_id": prefill.get("projeto_id") if not editando else registro.get("projeto_id"),
            "at_referencia": at_referencia or None,
            "revisao": int(revisao),
            "data_avaliacao": data_avaliacao.isoformat(),
            "analista_responsavel": analista_responsavel,
            "respostas_json": json.dumps(respostas, ensure_ascii=False),
            "pontuacao": pontuacao,
            "classificacao": classificacao,
            "acompanhamento": acompanhamento,
            "observacoes_gerais": observacoes_gerais,
            "obra_id": obra_id,
        }
        if editando:
            atualizar_avaliacao_checklist(registro["id"], dados, usuario)
            registrar_atividade(usuario, None, "AVALIACAO_EDITADA", modulo=tipo_entidade, detalhe=nome_entidade)
            st.toast("Avaliação atualizada com sucesso.", icon=":material/check_circle:")
        else:
            existente = obter_avaliacao_checklist_por_revisao(tipo_entidade, at_referencia, disciplina, int(revisao), analista_responsavel)
            if existente:
                atualizar_avaliacao_checklist(existente["id"], dados, usuario)
                registrar_atividade(usuario, None, "AVALIACAO_EDITADA", modulo=tipo_entidade, detalhe=nome_entidade)
                st.toast(
                    f"Já existia uma avaliação para a AT {at_referencia} — Revisão {int(revisao)}: o registro existente foi atualizado (nenhuma duplicidade criada).",
                    icon=":material/info:",
                )
            else:
                inserir_avaliacao_checklist(dados, usuario)
                registrar_atividade(usuario, None, "AVALIACAO_REALIZADA", modulo=tipo_entidade, detalhe=nome_entidade)
                st.toast("Avaliação registrada com sucesso.", icon=":material/check_circle:")
        st.session_state["_gat_refresh"] = st.session_state.get("_gat_refresh", 0) + 1
        st.rerun()
