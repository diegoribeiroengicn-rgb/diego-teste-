"""
Pop-ups/modais interativos (`st.dialog`) para cadastro e edição de
registros das abas de Prestadores e Cessionários.

Cada modal permite tanto a criação de um novo registro quanto a edição de
um registro já existente (pré-preenchido), calculando automaticamente e em
tempo real os campos derivados (data limite sugerida, dias úteis
decorridos/saldo e status de entrega), antes de persistir no banco SQLite.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

import pandas as pd
import streamlit as st

from gat.alertas_engine import chaves_avaliadas_obrigatoria, rev1_concluida
from gat.business_rules import (
    NIVEIS_PRIORIDADE_LABELS,
    calcular_sla_cessionario,
    calcular_sla_efetivo,
    classificar_nota,
    status_entrega_cessionario,
    status_entrega_prestador,
)
from gat.calendario import calcular_data_limite, calcular_hold_dias
from gat.config import (
    DISCIPLINAS,
    DISCIPLINAS_SLA,
    ETG_OPCOES,
    RESPONSAVEIS,
    SLA_PRESTADORES_DIAS_UTEIS,
    STATUS_ANALISE_OPCOES,
    TIPO_CESSIONARIO_OPCOES,
)
from gat.database import (
    atualizar_avaliacao,
    atualizar_cessionario,
    atualizar_prestador,
    inserir_avaliacao,
    inserir_cessionario,
    inserir_prestador,
    listar_avaliacao_obrigatoria_isentos,
    listar_avaliacoes_checklist,
    listar_cadastro_cessionarios,
    listar_cadastro_prestadores,
    listar_obras_prestador,
    listar_repactuacoes_prazo,
    nome_exibicao_obra,
    registrar_atividade,
    registrar_repactuacao_prazo,
)


def _parse_data(valor: Any) -> date | None:
    if not valor:
        return None
    if isinstance(valor, date):
        return valor
    if isinstance(valor, str):
        try:
            return datetime.fromisoformat(valor[:10]).date()
        except ValueError:
            return None
    return None


def _tentativa_salvar_iniciada(chave_tentativa: str, clicou_salvar: bool) -> bool:
    """
    Mantém, via `session_state`, a intenção de salvar entre reruns.

    Necessário porque o botão de confirmação "sem PEP" é renderizado em um
    rerun POSTERIOR ao clique em "Salvar" — se a checagem dependesse
    diretamente do retorno de `st.button("Salvar")` (válido apenas no run
    em que ele foi clicado), o clique subsequente no botão de confirmação
    seria perdido, pois o bloco que o define nunca seria reexecutado.
    """
    if clicou_salvar:
        st.session_state[chave_tentativa] = True
    return bool(st.session_state.get(chave_tentativa))


def _pode_persistir_com_pep(valor_pep: str, chave_confirmacao: str) -> bool:
    """
    Retorna True quando o registro já pode ser persistido: PEP preenchido,
    ou o usuário confirmou explicitamente o cadastro sem PEP neste run.

    Quando o PEP está vazio, exibe a mensagem de atenção e o botão
    "Confirmar cadastro sem PEP" (o cadastro não é bloqueado, apenas exige
    confirmação explícita antes de gravar).
    """
    if valor_pep and str(valor_pep).strip():
        return True
    st.warning(
        "Atenção: este projeto será cadastrado sem PEP. O cadastro poderá ser "
        "concluído, mas o projeto permanecerá sinalizado como pendente (com "
        "lembrete automático) até que o PEP seja informado.",
        icon=":material/warning:",
    )
    return st.button("Confirmar cadastro sem PEP", key=f"{chave_confirmacao}_botao", type="primary")


def _pode_repactuar(repactuando: bool, motivo: str) -> bool:
    """Bloqueia o salvamento até que o motivo da repactuação seja informado,
    quando a Data de Entrega Acordada/Prevista de um projeto já existente é
    alterada em relação ao valor gravado."""
    if not repactuando:
        return True
    if motivo and motivo.strip():
        return True
    st.error("Informe o motivo da repactuação de prazo para salvar.", icon=":material/error:")
    return False


def _historico_repactuacoes(tabela: str, registro_id: int) -> None:
    historico = listar_repactuacoes_prazo(tabela, registro_id)
    if historico.empty:
        return
    with st.expander(f"Histórico de repactuações de prazo ({len(historico)})", icon=":material/history:"):
        exibicao = historico[["data_anterior", "data_nova", "motivo", "usuario", "data_hora"]].copy()
        for coluna in ("data_anterior", "data_nova"):
            exibicao[coluna] = pd.to_datetime(exibicao[coluna], errors="coerce").dt.strftime("%d/%m/%Y")
        exibicao["data_hora"] = pd.to_datetime(exibicao["data_hora"], errors="coerce").dt.strftime("%d/%m/%Y %H:%M")
        st.dataframe(
            exibicao.rename(columns={
                "data_anterior": "Data anterior", "data_nova": "Nova data", "motivo": "Motivo",
                "usuario": "Usuário", "data_hora": "Quando",
            }),
            use_container_width=True, hide_index=True,
        )


def _houve_alteracoes_nao_salvas(chave_snapshot: str, valores_atuais: dict) -> bool:
    """
    Compara o estado atual dos campos do formulário com o "instantâneo"
    capturado na primeira renderização deste modal (antes de qualquer
    digitação do usuário) — feito via `session_state` porque o valor
    inicial só é conhecido no primeiro run, e precisa sobreviver aos
    reruns seguintes disparados por cada tecla digitada.

    Limitação conhecida: só é possível interceptar o botão "Cancelar" do
    próprio formulário — o "X" nativo do `st.dialog` e o fechamento por
    clique fora do modal não passam pelo código Python e não podem ser
    interceptados por este mecanismo.
    """
    if chave_snapshot not in st.session_state:
        st.session_state[chave_snapshot] = dict(valores_atuais)
        return False
    return st.session_state[chave_snapshot] != valores_atuais


def _confirmar_descarte(chave_confirmacao: str, houve_alteracoes: bool, cancelar_clicado: bool) -> bool:
    """
    Gerencia a confirmação de descarte ao clicar em "Cancelar" quando há
    alterações não salvas. Retorna True quando o fechamento do modal deve
    de fato prosseguir (sem alterações, ou descarte explicitamente
    confirmado pelo usuário) — quem chama é responsável por só então
    limpar o estado e chamar `st.rerun()`.

    Os botões usam `on_click` (executado antes do rerun automático do
    próprio clique) em vez de checar o valor de retorno do `st.button`:
    chamar `st.rerun()` manualmente fecharia o `st.dialog` também no
    caminho "Continuar editando", que deve apenas ocultar o aviso e manter
    o modal aberto — reruns automáticos disparados por um clique não
    fecham o dialog, só os manuais fecham.
    """
    chave_pendente = f"{chave_confirmacao}_pendente"
    chave_confirmado = f"{chave_confirmacao}_confirmado"

    if cancelar_clicado:
        if not houve_alteracoes:
            return True
        st.session_state[chave_pendente] = True

    if st.session_state.get(chave_pendente):
        st.warning("Existem alterações não salvas neste formulário. Deseja realmente descartá-las?", icon=":material/warning:")
        col_sim, col_nao = st.columns(2)
        col_sim.button(
            "Descartar alterações", type="primary", use_container_width=True, key=f"{chave_confirmacao}_sim",
            on_click=lambda: st.session_state.update({chave_pendente: False, chave_confirmado: True}),
        )
        col_nao.button(
            "Continuar editando", use_container_width=True, key=f"{chave_confirmacao}_nao",
            on_click=lambda: st.session_state.update({chave_pendente: False}),
        )

    return st.session_state.pop(chave_confirmado, False)


def _calcular_campos_sla_persistidos(
    registro: dict[str, Any] | None, editando: bool, sla_padrao: int, sla_efetivo: int,
    sla_reduzido: bool, nivel_prioridade: int | None, justificativa_sla: str,
    sugestao_limite_padrao, usuario: str,
) -> dict[str, Any]:
    """
    Monta os campos de SLA/prioridade a persistir, preservando o SLA e a
    data limite "originais" (padrão, sem redução/prioridade) para sempre,
    mesmo que a análise seja editada várias vezes depois — nunca
    recalculados nem sobrescritos uma vez gravados (item 4 da alteração
    de SLA/prioridades). `nivel_prioridade` é `None` para Cessionários
    (a quem os níveis 1/2/3 de Prestadores não se aplicam automaticamente).
    """
    sla_original = int(registro.get("sla_original")) if editando and registro.get("sla_original") is not None else int(sla_padrao)
    data_limite_original = (
        registro.get("data_limite_original") if editando and registro.get("data_limite_original")
        else (sugestao_limite_padrao.isoformat() if sugestao_limite_padrao else None)
    )
    prioritaria = sla_reduzido or nivel_prioridade is not None
    mudou = (
        not editando
        or bool(registro.get("sla_reduzido")) != sla_reduzido
        or (registro.get("nivel_prioridade") if editando else None) != nivel_prioridade
        or int(registro.get("sla_dias") or -1) != int(sla_efetivo)
    )
    if mudou and prioritaria:
        sla_alterado_por, sla_alterado_em = usuario, datetime.now().isoformat()
    else:
        sla_alterado_por = registro.get("sla_alterado_por") if editando else None
        sla_alterado_em = registro.get("sla_alterado_em") if editando else None
    return {
        "sla_dias": int(sla_efetivo),
        "sla_original": sla_original,
        "sla_reduzido": 1 if sla_reduzido else 0,
        "nivel_prioridade": nivel_prioridade,
        "justificativa_sla": justificativa_sla.strip() if justificativa_sla and justificativa_sla.strip() else None,
        "data_limite_original": data_limite_original,
        "sla_alterado_por": sla_alterado_por,
        "sla_alterado_em": sla_alterado_em,
    }


def _detectar_pendencia_avaliacao(tipo_entidade: str, modulo: str, dados: dict[str, Any], projeto_id: int, coluna_nome: str) -> dict[str, Any] | None:
    """Verifica, logo após salvar uma análise técnica (Prestador ou
    Cessionário), se ela deixa uma avaliação obrigatória da Rev.01
    pendente — mesmo critério do alerta/selo (`rev1_concluida` +
    `chaves_avaliadas_obrigatoria`), para que as três telas nunca
    divirjam sobre o que está pendente."""
    if not rev1_concluida(dados.get("revisao"), dados.get("data_analise")):
        return None
    if int(projeto_id) in listar_avaliacao_obrigatoria_isentos(modulo):
        return None
    nome_entidade = dados.get(coluna_nome)
    chave = (dados.get("codigo") or nome_entidade, dados.get("disciplina") or "")
    if chave in chaves_avaliadas_obrigatoria(listar_avaliacoes_checklist(tipo_entidade)):
        return None
    return {
        "tipo_entidade": tipo_entidade, "nome_entidade": nome_entidade, "codigo_entidade": dados.get("codigo"),
        "disciplina": dados.get("disciplina"), "at_referencia": dados.get("num_at"),
        "revisao": dados.get("revisao"), "analista_responsavel": dados.get("responsavel"),
        "projeto_id": int(projeto_id),
    }


def _renderizar_confirmacao_avaliacao(pendencia: dict[str, Any], chave_confirmacao: str) -> None:
    """Pergunta obrigatória do item 5/6 da alteração de alertas de
    avaliação: ao salvar uma análise que deixa a avaliação obrigatória
    pendente, oferece realizá-la imediatamente (redireciona para a área de
    Avaliações com os dados já preenchidos) ou deixá-la na lista de
    pendências/Central de Alertas para depois."""
    rotulo = "de prestador" if pendencia["tipo_entidade"] == "PRESTADOR" else "do projetista do cessionário"
    st.success("Análise salva com sucesso.", icon=":material/check_circle:")
    st.warning(f"Esta análise possui uma avaliação {rotulo} pendente. Deseja realizá-la agora?", icon=":material/assignment_late:")
    col_sim, col_nao = st.columns(2)
    if col_sim.button("Sim", type="primary", use_container_width=True, key=f"{chave_confirmacao}_sim"):
        st.session_state.pop(chave_confirmacao, None)
        st.session_state["_gat_avaliacao_auto_abrir"] = pendencia
        pagina = st.session_state.get("_gat_paginas", {}).get("prestadores_avaliacao")
        if pagina is not None:
            st.switch_page(pagina)
        else:
            st.rerun()
    if col_nao.button("Não", use_container_width=True, key=f"{chave_confirmacao}_nao"):
        st.session_state.pop(chave_confirmacao, None)
        st.rerun()


# ---------------------------------------------------------------------------
# Modal de Prestadores (Aba A)
# ---------------------------------------------------------------------------


@st.dialog("Análise de Prestadores", width="large")
def dialog_prestador(usuario: str, registro: dict[str, Any] | None = None) -> None:
    editando = registro is not None
    sufixo = f"edit_{registro['id']}" if editando else "novo"

    chave_confirmacao_avaliacao = f"pr_confirmar_avaliacao_{sufixo}"
    pendencia_avaliacao = st.session_state.get(chave_confirmacao_avaliacao)
    if pendencia_avaliacao:
        _renderizar_confirmacao_avaliacao(pendencia_avaliacao, chave_confirmacao_avaliacao)
        return

    st.caption("Edite os campos e clique em **Salvar**. A data limite sugerida e o prazo são calculados automaticamente pelo calendário oficial de feriados do RJ." if editando else
               "Preencha os dados da análise. A data limite sugerida e o prazo são calculados automaticamente pelo calendário oficial de feriados do RJ.")

    cadastro_id_atual = registro.get("prestador_cadastro_id") if registro else None
    cadastros_df = listar_cadastro_prestadores()
    if not cadastros_df.empty:
        cadastros_df = cadastros_df[(cadastros_df["status"] == "ATIVO") | (cadastros_df["id"] == cadastro_id_atual)]
    mapa_cadastro = {f"{linha['codigo']} – {linha['nome_empresa']}": linha.to_dict() for _, linha in cadastros_df.iterrows()}
    opcoes_cadastro = ["— Digitar manualmente —"] + list(mapa_cadastro.keys())
    rotulo_atual = next((rotulo for rotulo, linha in mapa_cadastro.items() if linha["id"] == cadastro_id_atual), "— Digitar manualmente —")
    rotulo_selecionado = st.selectbox(
        "Vincular ao Cadastro de Prestador (opcional)",
        opcoes_cadastro,
        index=_idx(opcoes_cadastro, rotulo_atual),
        key=f"pr_cadastro_{sufixo}",
        help="Ao vincular, código, nome e PEP são preenchidos automaticamente a partir do Cadastro de Prestadores.",
    )
    cadastro_selecionado = mapa_cadastro.get(rotulo_selecionado)
    # Sufixo dedicado (inclui o id do cadastro) para os campos derivados abaixo:
    # evita que o `value=` de um novo cadastro selecionado seja ignorado pelo
    # Streamlit por reaproveitar uma key já presente no session_state.
    sufixo_cad = f"{sufixo}_{cadastro_selecionado['id']}" if cadastro_selecionado else sufixo

    col1, col2 = st.columns(2)
    with col1:
        if cadastro_selecionado:
            prestador = cadastro_selecionado["nome_empresa"]
            codigo = cadastro_selecionado["codigo"]
            st.text_input("Prestador de Serviço *", value=prestador, disabled=True, key=f"pr_prestador_cad_{sufixo_cad}")
            st.text_input("Código", value=codigo, disabled=True, key=f"pr_codigo_cad_{sufixo_cad}")
        else:
            prestador = st.text_input("Prestador de Serviço *", value=registro.get("prestador", "") if registro else "", key=f"pr_prestador_{sufixo}")
            codigo = st.text_input("Código", value=registro.get("codigo", "") if registro else "", key=f"pr_codigo_{sufixo}")
        disciplina = st.selectbox("Disciplina", DISCIPLINAS, index=_idx(DISCIPLINAS, registro.get("disciplina") if registro else None), key=f"pr_disc_{sufixo}")
        disciplina_sla = st.selectbox("Disciplina (SLA)", DISCIPLINAS_SLA, index=_idx(DISCIPLINAS_SLA, registro.get("disciplina_sla") if registro else None), key=f"pr_discsla_{sufixo}")
        if cadastro_selecionado:
            peps = cadastro_selecionado.get("numero_pep") or ""
            st.text_input(
                "PEP'S", value=peps, disabled=True, key=f"pr_peps_cad_{sufixo_cad}",
                help="Preenchido automaticamente pelo Cadastro de Prestador. Para alterar, atualize o PEP no Cadastro de Prestadores.",
            )
        else:
            peps = st.text_input("PEP'S", value=registro.get("peps", "") if registro else "", key=f"pr_peps_{sufixo}")
        if cadastro_selecionado:
            obras_df = listar_obras_prestador(cadastro_selecionado["id"])
            obra_id_atual = registro.get("obra_id") if registro else None
            if not obras_df.empty:
                obras_df = obras_df[(obras_df["status"] == "ATIVA") | (obras_df["id"] == obra_id_atual)]
            mapa_obra = {nome_exibicao_obra(o): o for o in obras_df.to_dict("records")}
            opcoes_obra = ["— Nenhuma —"] + list(mapa_obra.keys())
            rotulo_obra_atual = next((r for r, o in mapa_obra.items() if o["id"] == obra_id_atual), "— Nenhuma —")
            rotulo_obra = st.selectbox(
                "Obra/Canteiro vinculado", opcoes_obra, index=_idx(opcoes_obra, rotulo_obra_atual), key=f"pr_obraid_cad_{sufixo_cad}",
            )
            obra_selecionada = mapa_obra.get(rotulo_obra)
            obra_id = obra_selecionada["id"] if obra_selecionada else None
            obra_referencia = nome_exibicao_obra(obra_selecionada) if obra_selecionada else ""
        else:
            obra_referencia = st.text_input("Obra de Referência", value=registro.get("obra_referencia", "") if registro else "", key=f"pr_obra_{sufixo}")
            obra_id = registro.get("obra_id") if registro else None
        num_at = st.text_input("N° AT", value=registro.get("num_at", "") if registro else "", key=f"pr_at_{sufixo}")
    with col2:
        revisao = st.number_input("Revisão", min_value=0, step=1, value=int(registro.get("revisao", 0)) if registro else 0, key=f"pr_rev_{sufixo}")
        revisao_at = st.number_input("REV. AT", min_value=0, step=1, value=int(registro.get("revisao_at") or 0) if registro else 0, key=f"pr_revat_{sufixo}")
        num_documentos = st.number_input("N° de Doc.", min_value=0, step=1, value=int(registro.get("num_documentos", 0)) if registro else 0, key=f"pr_ndoc_{sufixo}")
        responsavel = st.selectbox("Responsável (Analista)", RESPONSAVEIS, index=_idx(RESPONSAVEIS, registro.get("responsavel") if registro else None), key=f"pr_resp_{sufixo}")
        status_analise = st.selectbox("Status Análise", STATUS_ANALISE_OPCOES, index=_idx(STATUS_ANALISE_OPCOES, registro.get("status_analise") if registro else "EM ANÁLISE"), key=f"pr_status_{sufixo}")

    st.markdown("##### Prioridade e SLA")
    col_p1, col_p2 = st.columns(2)
    with col_p1:
        opcoes_nivel = ["Nenhum"] + [NIVEIS_PRIORIDADE_LABELS[n] for n in (3, 2, 1)]
        rotulo_nivel_atual = NIVEIS_PRIORIDADE_LABELS.get(registro.get("nivel_prioridade")) if editando else None
        rotulo_nivel = st.selectbox("Nível de prioridade", opcoes_nivel, index=_idx(opcoes_nivel, rotulo_nivel_atual or "Nenhum"), key=f"pr_nivel_{sufixo}")
        nivel_prioridade = next((n for n, r in NIVEIS_PRIORIDADE_LABELS.items() if r == rotulo_nivel), None)
        dias_nivel1 = None
        if nivel_prioridade == 1:
            dias_nivel1 = st.number_input(
                "Dias úteis (Nível 1)", min_value=1, max_value=3, step=1,
                value=int(registro.get("sla_dias") or 3) if editando and registro.get("nivel_prioridade") == 1 else 3,
                key=f"pr_diasnivel1_{sufixo}",
            )
    with col_p2:
        sla_reduzido = st.checkbox(
            "SLA reduzido (personalizado)", value=bool(registro.get("sla_reduzido")) if editando else False,
            key=f"pr_slareduzido_{sufixo}", disabled=nivel_prioridade is not None,
            help="Desabilitado quando um nível de prioridade está selecionado — escolha um ou outro.",
        )
        dias_reduzidos = None
        if sla_reduzido:
            dias_reduzidos = st.number_input(
                "Quantidade de dias úteis para entrega", min_value=1, step=1,
                value=int(registro.get("sla_dias") or SLA_PRESTADORES_DIAS_UTEIS) if editando and registro.get("sla_reduzido") else SLA_PRESTADORES_DIAS_UTEIS,
                key=f"pr_diasreduzidos_{sufixo}",
            )

    justificativa_sla = ""
    if sla_reduzido:
        justificativa_sla = st.text_area(
            "Justificativa do SLA reduzido *", value=registro.get("justificativa_sla", "") if editando and registro.get("sla_reduzido") else "",
            key=f"pr_justsla_{sufixo}",
        )

    sla_padrao = SLA_PRESTADORES_DIAS_UTEIS
    sla_efetivo = int(dias_nivel1) if nivel_prioridade == 1 and dias_nivel1 else calcular_sla_efetivo(sla_padrao, sla_reduzido, dias_reduzidos, nivel_prioridade)
    if nivel_prioridade is not None or sla_reduzido:
        st.caption(f"SLA aplicado a esta análise: **{sla_efetivo} dia(s) útil(eis)** (padrão: {sla_padrao}). Esta análise entrará na Lista de Prioridades.")

    st.markdown("##### Datas e prazos")
    col3, col4, col5 = st.columns(3)
    with col3:
        data_solicitacao = st.date_input("Data de Solicitação *", value=_parse_data(registro.get("data_solicitacao")) if registro else date.today(), format="DD/MM/YYYY", key=f"pr_dsol_{sufixo}")
    sugestao_limite_padrao = calcular_data_limite(data_solicitacao, sla_padrao)
    sugestao_limite = calcular_data_limite(data_solicitacao, sla_efetivo)
    if not editando:
        chave_gatilho = f"pr_dlim_gatilho_{sufixo}"
        gatilho_atual = (data_solicitacao, sla_efetivo)
        if st.session_state.get(chave_gatilho) != gatilho_atual:
            st.session_state[f"pr_dlim_{sufixo}"] = sugestao_limite
            st.session_state[chave_gatilho] = gatilho_atual
    with col4:
        data_limite = st.date_input(
            "Data de Entrega Acordada/Prevista *",
            value=_parse_data(registro.get("data_limite")) if editando else sugestao_limite,
            format="DD/MM/YYYY",
            help=f"Sugestão automática (SLA de {sla_efetivo} dias úteis): {sugestao_limite.strftime('%d/%m/%Y') if sugestao_limite else '-'}. Pode ser repactuada manualmente.",
            key=f"pr_dlim_{sufixo}",
        )
    with col5:
        data_analise = st.date_input("Data Análise (se concluída)", value=_parse_data(registro.get("data_analise")) if registro else None, format="DD/MM/YYYY", key=f"pr_dana_{sufixo}")

    col6, col7 = st.columns(2)
    with col6:
        hold_inicio = st.date_input("Hold (Início)", value=_parse_data(registro.get("hold_inicio")) if registro else None, format="DD/MM/YYYY", key=f"pr_hi_{sufixo}")
    with col7:
        hold_fim = st.date_input("Hold (Fim)", value=_parse_data(registro.get("hold_fim")) if registro else None, format="DD/MM/YYYY", key=f"pr_hf_{sufixo}")

    hold_dias = calcular_hold_dias(hold_inicio, hold_fim)
    status_calc, dias_decorridos = status_entrega_prestador(data_solicitacao, data_analise, hold_dias)

    data_limite_original = _parse_data(registro.get("data_limite")) if editando else None
    repactuando = editando and data_limite_original is not None and data_limite is not None and data_limite != data_limite_original
    motivo_repactuacao = ""
    if repactuando:
        st.warning(
            f"Data de Entrega alterada de **{data_limite_original.strftime('%d/%m/%Y')}** para "
            f"**{data_limite.strftime('%d/%m/%Y')}**. Informe o motivo da repactuação de prazo.",
            icon=":material/event_repeat:",
        )
        motivo_repactuacao = st.text_input("Motivo da repactuação de prazo *", key=f"pr_motivo_repac_{sufixo}")
    if editando:
        _historico_repactuacoes("prestadores", registro["id"])

    st.markdown("##### Cálculo automático (dias úteis · calendário RJ)")
    m1, m2, m3 = st.columns(3)
    m1.metric("Dias úteis decorridos", dias_decorridos)
    m2.metric("Dias em Hold", hold_dias)
    m3.metric("Status de Entrega", status_calc)

    col8, col9, col10 = st.columns(3)
    with col8:
        natureza_revisao = st.text_input("Natureza da Revisão", value=registro.get("natureza_revisao", "") if registro else "", key=f"pr_natrev_{sufixo}")
    with col9:
        num_erros = st.number_input("N° de erros encontrados", min_value=0, step=1, value=int(registro.get("num_erros") or 0) if registro else 0, key=f"pr_nerros_{sufixo}")
    with col10:
        etg = st.selectbox("ETG", ETG_OPCOES, index=_idx(ETG_OPCOES, registro.get("etg") if registro else "NÃO"), key=f"pr_etg_{sufixo}")

    observacoes = st.text_area("Observações", value=registro.get("observacoes", "") if registro else "", key=f"pr_obs_{sufixo}")

    valores_atuais = {
        "prestador": prestador, "codigo": codigo, "disciplina": disciplina, "disciplina_sla": disciplina_sla,
        "peps": peps, "obra_referencia": obra_referencia, "obra_id": obra_id, "num_at": num_at,
        "revisao": revisao, "revisao_at": revisao_at, "num_documentos": num_documentos,
        "responsavel": responsavel, "status_analise": status_analise, "data_solicitacao": data_solicitacao,
        "data_limite": data_limite, "data_analise": data_analise, "hold_inicio": hold_inicio, "hold_fim": hold_fim,
        "natureza_revisao": natureza_revisao, "num_erros": num_erros, "etg": etg, "observacoes": observacoes,
        "motivo_repactuacao": motivo_repactuacao,
        "prestador_cadastro_id": cadastro_selecionado["id"] if cadastro_selecionado else None,
    }
    houve_alteracoes = _houve_alteracoes_nao_salvas(f"pr_snapshot_{sufixo}", valores_atuais)

    col_salvar, col_cancelar = st.columns(2)
    salvar = col_salvar.button("Salvar", icon=":material/save:", type="primary", use_container_width=True, key=f"pr_salvar_{sufixo}")
    cancelar = col_cancelar.button("Cancelar", use_container_width=True, key=f"pr_cancelar_{sufixo}")

    chave_tentativa = f"pr_tentativa_salvar_{sufixo}"

    if _confirmar_descarte(f"pr_descarte_{sufixo}", houve_alteracoes, cancelar):
        st.session_state[chave_tentativa] = False
        st.session_state.pop(f"pr_snapshot_{sufixo}", None)
        st.rerun()

    if salvar and (not prestador or not data_solicitacao):
        st.error("Preencha ao menos Prestador de Serviço e Data de Solicitação.")
        salvar = False
    if salvar and sla_reduzido and not justificativa_sla.strip():
        st.error("Informe a justificativa do SLA reduzido para salvar.")
        salvar = False

    if (
        _tentativa_salvar_iniciada(chave_tentativa, salvar)
        and _pode_persistir_com_pep(peps, f"pr_confirma_sem_pep_{sufixo}")
        and _pode_repactuar(repactuando, motivo_repactuacao)
    ):
        campos_sla = _calcular_campos_sla_persistidos(
            registro, editando, sla_padrao, sla_efetivo, sla_reduzido, nivel_prioridade,
            justificativa_sla, sugestao_limite_padrao, usuario,
        )
        dados = {
            "item": registro.get("item") if editando else None,
            "codigo": codigo,
            "prestador": prestador,
            "disciplina": disciplina,
            "disciplina_sla": disciplina_sla,
            "peps": peps,
            "obra_referencia": obra_referencia,
            "revisao": int(revisao),
            "num_documentos": int(num_documentos),
            "data_solicitacao": data_solicitacao.isoformat(),
            "data_limite": data_limite.isoformat() if data_limite else None,
            "data_analise": data_analise.isoformat() if data_analise else None,
            "hold_inicio": hold_inicio.isoformat() if hold_inicio else None,
            "hold_fim": hold_fim.isoformat() if hold_fim else None,
            "num_at": num_at,
            "revisao_at": int(revisao_at),
            "responsavel": responsavel,
            "status_analise": status_analise,
            "observacoes": observacoes,
            "natureza_revisao": natureza_revisao,
            "num_erros": int(num_erros),
            "etg": etg,
            "prestador_cadastro_id": cadastro_selecionado["id"] if cadastro_selecionado else None,
            "obra_id": obra_id,
            **campos_sla,
        }
        if editando:
            atualizar_prestador(registro["id"], dados, usuario)
            if repactuando:
                registrar_repactuacao_prazo(
                    "prestadores", registro["id"], data_limite_original.isoformat(), data_limite.isoformat(),
                    motivo_repactuacao.strip(), usuario,
                )
            registrar_atividade(usuario, None, "PROJETO_EDITADO", modulo="prestadores", detalhe=prestador)
            st.toast("Registro de prestador atualizado com sucesso.", icon=":material/check_circle:")
            projeto_id_salvo = registro["id"]
        else:
            projeto_id_salvo = inserir_prestador(dados, usuario)
            registrar_atividade(usuario, None, "PROJETO_CRIADO", modulo="prestadores", detalhe=prestador)
            st.toast("Novo registro de prestador cadastrado com sucesso.", icon=":material/check_circle:")
        st.session_state[chave_tentativa] = False
        st.session_state.pop(f"pr_snapshot_{sufixo}", None)
        st.session_state["_gat_refresh"] = st.session_state.get("_gat_refresh", 0) + 1

        pendencia_avaliacao = _detectar_pendencia_avaliacao("PRESTADOR", "prestadores", dados, projeto_id_salvo, "prestador")
        if pendencia_avaliacao:
            st.session_state[chave_confirmacao_avaliacao] = pendencia_avaliacao
            _renderizar_confirmacao_avaliacao(pendencia_avaliacao, chave_confirmacao_avaliacao)
            return
        st.rerun()


# ---------------------------------------------------------------------------
# Modal de Cessionários (Aba B)
# ---------------------------------------------------------------------------


@st.dialog("Análise de Cessionários", width="large")
def dialog_cessionario(usuario: str, registro: dict[str, Any] | None = None) -> None:
    editando = registro is not None
    sufixo = f"edit_{registro['id']}" if editando else "novo"

    chave_confirmacao_avaliacao = f"ce_confirmar_avaliacao_{sufixo}"
    pendencia_avaliacao = st.session_state.get(chave_confirmacao_avaliacao)
    if pendencia_avaliacao:
        _renderizar_confirmacao_avaliacao(pendencia_avaliacao, chave_confirmacao_avaliacao)
        return

    st.caption("Edite os campos e clique em **Salvar**. O saldo de dias úteis é calculado automaticamente pelo calendário oficial de feriados do RJ." if editando else
               "Preencha os dados da análise. O saldo de dias úteis é calculado automaticamente pelo calendário oficial de feriados do RJ.")

    cadastro_cess_id_atual = registro.get("cessionario_cadastro_id") if registro else None
    cadastros_cess_df = listar_cadastro_cessionarios()
    if not cadastros_cess_df.empty:
        cadastros_cess_df = cadastros_cess_df[(cadastros_cess_df["status"] == "ATIVO") | (cadastros_cess_df["id"] == cadastro_cess_id_atual)]
    mapa_cadastro_cess = {f"{linha['codigo']} – {linha['nome_empresa']}": linha.to_dict() for _, linha in cadastros_cess_df.iterrows()}
    opcoes_cadastro_cess = ["— Digitar manualmente —"] + list(mapa_cadastro_cess.keys())
    rotulo_cess_atual = next((rotulo for rotulo, linha in mapa_cadastro_cess.items() if linha["id"] == cadastro_cess_id_atual), "— Digitar manualmente —")
    rotulo_cess_selecionado = st.selectbox(
        "Vincular ao Cadastro de Cessionário (opcional)",
        opcoes_cadastro_cess,
        index=_idx(opcoes_cadastro_cess, rotulo_cess_atual),
        key=f"ce_cadastro_{sufixo}",
        help="Ao vincular, código e nome são preenchidos automaticamente a partir do Cadastro de Cessionários.",
    )
    cadastro_cess_selecionado = mapa_cadastro_cess.get(rotulo_cess_selecionado)
    if cadastro_cess_selecionado:
        st.caption(
            f"RVP: **{cadastro_cess_selecionado.get('rvp') or '—'}** · "
            f"RCI: **{cadastro_cess_selecionado.get('rci') or '—'}** · "
            f"LUC: **{cadastro_cess_selecionado.get('luc') or '—'}**"
        )
    # Sufixo dedicado (inclui o id do cadastro) para os campos derivados abaixo:
    # evita que o `value=` de um novo cadastro selecionado seja ignorado pelo
    # Streamlit por reaproveitar uma key já presente no session_state.
    sufixo_cad_cess = f"{sufixo}_{cadastro_cess_selecionado['id']}" if cadastro_cess_selecionado else sufixo

    col1, col2 = st.columns(2)
    with col1:
        if cadastro_cess_selecionado:
            cessionario = cadastro_cess_selecionado["nome_empresa"]
            codigo = cadastro_cess_selecionado["codigo"]
            st.text_input("Cessionário *", value=cessionario, disabled=True, key=f"ce_cess_cad_{sufixo_cad_cess}")
            st.text_input("Código", value=codigo, disabled=True, key=f"ce_codigo_cad_{sufixo_cad_cess}")
        else:
            cessionario = st.text_input("Cessionário *", value=registro.get("cessionario", "") if registro else "", key=f"ce_cess_{sufixo}")
            codigo = st.text_input("Código", value=registro.get("codigo", "") if registro else "", key=f"ce_codigo_{sufixo}")
        disciplina = st.selectbox("Disciplina", DISCIPLINAS, index=_idx(DISCIPLINAS, registro.get("disciplina") if registro else None), key=f"ce_disc_{sufixo}")
        disciplina_sla = st.selectbox("Disciplina (SLA)", DISCIPLINAS_SLA, index=_idx(DISCIPLINAS_SLA, registro.get("disciplina_sla") if registro else None), key=f"ce_discsla_{sufixo}")
        tipo = st.selectbox("Tipo", TIPO_CESSIONARIO_OPCOES, index=_idx(TIPO_CESSIONARIO_OPCOES, registro.get("tipo") if registro else None), key=f"ce_tipo_{sufixo}")
        num_at = st.text_input("N° AT", value=registro.get("num_at", "") if registro else "", key=f"ce_at_{sufixo}")
        luc = st.text_input("LUC", value=registro.get("luc", "") if registro else "", key=f"ce_luc_{sufixo}")
    with col2:
        revisao = st.number_input("Revisão", min_value=0, step=1, value=int(registro.get("revisao", 0)) if registro else 0, key=f"ce_rev_{sufixo}")
        revisao_at = st.number_input("REV. AT", min_value=0, step=1, value=int(registro.get("revisao_at") or 0) if registro else 0, key=f"ce_revat_{sufixo}")
        num_documentos = st.number_input("N° de Doc.", min_value=0, step=1, value=int(registro.get("num_documentos", 0)) if registro else 0, key=f"ce_ndoc_{sufixo}")
        responsavel = st.selectbox("Responsável (Analista)", RESPONSAVEIS, index=_idx(RESPONSAVEIS, registro.get("responsavel") if registro else None), key=f"ce_resp_{sufixo}")
        status_analise = st.selectbox("Status Análise", STATUS_ANALISE_OPCOES, index=_idx(STATUS_ANALISE_OPCOES, registro.get("status_analise") if registro else "EM ANÁLISE"), key=f"ce_status_{sufixo}")

    st.markdown("##### RCI e RVP")
    st.caption("Informe apenas o RCI, apenas o RVP, ou ambos — nenhum dos dois é obrigatório.")
    col_rci, col_rvp = st.columns(2)
    with col_rci:
        numero_rci = st.text_input("N° RCI", value=registro.get("numero_rci", "") if registro else "", key=f"ce_rci_{sufixo}")
        data_atualizacao_rci = st.date_input(
            "Data de Atualização do RCI", value=_parse_data(registro.get("data_atualizacao_rci")) if registro else None,
            format="DD/MM/YYYY", key=f"ce_data_rci_{sufixo}",
        )
    with col_rvp:
        numero_rvp = st.text_input("N° RVP", value=registro.get("numero_rvp", "") if registro else "", key=f"ce_rvp_{sufixo}")
        data_atualizacao_rvp = st.date_input(
            "Data de Atualização do RVP", value=_parse_data(registro.get("data_atualizacao_rvp")) if registro else None,
            format="DD/MM/YYYY", key=f"ce_data_rvp_{sufixo}",
        )

    sla_padrao = calcular_sla_cessionario(tipo, int(revisao))

    st.markdown("##### Prioridade e SLA")
    col_p1, col_p2 = st.columns(2)
    with col_p1:
        sla_reduzido = st.checkbox(
            "SLA reduzido", value=bool(registro.get("sla_reduzido")) if editando else False, key=f"ce_slareduzido_{sufixo}",
        )
        dias_reduzidos = None
        if sla_reduzido:
            dias_reduzidos = st.number_input(
                "Quantidade de dias úteis para entrega", min_value=1, step=1,
                value=int(registro.get("sla_dias") or sla_padrao) if editando and registro.get("sla_reduzido") else sla_padrao,
                key=f"ce_diasreduzidos_{sufixo}",
            )
    with col_p2:
        justificativa_sla = ""
        if sla_reduzido:
            justificativa_sla = st.text_area(
                "Justificativa do SLA reduzido *", value=registro.get("justificativa_sla", "") if editando and registro.get("sla_reduzido") else "",
                key=f"ce_justsla_{sufixo}",
            )

    sla_efetivo = calcular_sla_efetivo(sla_padrao, sla_reduzido, dias_reduzidos, None)
    if sla_reduzido:
        st.caption(f"SLA aplicado a esta análise: **{sla_efetivo} dia(s) útil(eis)** (padrão: {sla_padrao}). Esta análise entrará na Lista de Prioridades.")

    st.markdown("##### Datas e prazos")
    col3, col4, col5 = st.columns(3)
    with col3:
        data_solicitacao = st.date_input("Data de Solicitação *", value=_parse_data(registro.get("data_solicitacao")) if registro else date.today(), format="DD/MM/YYYY", key=f"ce_dsol_{sufixo}")
    sugestao_limite_padrao = calcular_data_limite(data_solicitacao, sla_padrao)
    sugestao_limite = calcular_data_limite(data_solicitacao, sla_efetivo)
    if not editando:
        chave_gatilho = f"ce_dlim_gatilho_{sufixo}"
        gatilho_atual = (data_solicitacao, tipo, int(revisao), sla_efetivo)
        if st.session_state.get(chave_gatilho) != gatilho_atual:
            st.session_state[f"ce_dlim_{sufixo}"] = sugestao_limite
            st.session_state[chave_gatilho] = gatilho_atual
    with col4:
        data_limite = st.date_input(
            "Data de Entrega Acordada/Prevista *",
            value=_parse_data(registro.get("data_limite")) if editando else sugestao_limite,
            format="DD/MM/YYYY",
            help=f"Sugestão automática (SLA de {sla_efetivo} dias úteis): {sugestao_limite.strftime('%d/%m/%Y') if sugestao_limite else '-'}. Pode ser repactuada manualmente.",
            key=f"ce_dlim_{sufixo}",
        )
    with col5:
        data_analise = st.date_input("Data Análise (se concluída)", value=_parse_data(registro.get("data_analise")) if registro else None, format="DD/MM/YYYY", key=f"ce_dana_{sufixo}")

    col6, col7 = st.columns(2)
    with col6:
        hold_inicio = st.date_input("Hold (Início)", value=_parse_data(registro.get("hold_inicio")) if registro else None, format="DD/MM/YYYY", key=f"ce_hi_{sufixo}")
    with col7:
        hold_fim = st.date_input("Hold (Fim)", value=_parse_data(registro.get("hold_fim")) if registro else None, format="DD/MM/YYYY", key=f"ce_hf_{sufixo}")

    hold_dias = calcular_hold_dias(hold_inicio, hold_fim)
    status_calc, saldo = status_entrega_cessionario(data_solicitacao, data_analise, hold_dias, sla_efetivo)

    data_limite_original = _parse_data(registro.get("data_limite")) if editando else None
    repactuando = editando and data_limite_original is not None and data_limite is not None and data_limite != data_limite_original
    motivo_repactuacao = ""
    if repactuando:
        st.warning(
            f"Data de Entrega alterada de **{data_limite_original.strftime('%d/%m/%Y')}** para "
            f"**{data_limite.strftime('%d/%m/%Y')}**. Informe o motivo da repactuação de prazo.",
            icon=":material/event_repeat:",
        )
        motivo_repactuacao = st.text_input("Motivo da repactuação de prazo *", key=f"ce_motivo_repac_{sufixo}")
    if editando:
        _historico_repactuacoes("cessionarios", registro["id"])

    st.markdown("##### Cálculo automático (dias úteis · calendário RJ)")
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("SLA (dias úteis)", sla_efetivo)
    m2.metric("Saldo de dias úteis", saldo)
    m3.metric("Dias em Hold", hold_dias)
    m4.metric("Status de Entrega", status_calc)

    col8, col9, col10 = st.columns(3)
    with col8:
        natureza_revisao = st.text_input("Natureza da Revisão", value=registro.get("natureza_revisao", "") if registro else "", key=f"ce_natrev_{sufixo}")
    with col9:
        num_erros = st.number_input("N° de erros encontrados", min_value=0, step=1, value=int(registro.get("num_erros") or 0) if registro else 0, key=f"ce_nerros_{sufixo}")
    with col10:
        etg = st.selectbox("ETG", ETG_OPCOES, index=_idx(ETG_OPCOES, registro.get("etg") if registro else "NÃO"), key=f"ce_etg_{sufixo}")

    observacoes = st.text_area("Observações", value=registro.get("observacoes", "") if registro else "", key=f"ce_obs_{sufixo}")

    valores_atuais = {
        "cessionario": cessionario, "codigo": codigo, "disciplina": disciplina, "disciplina_sla": disciplina_sla,
        "tipo": tipo, "num_at": num_at, "luc": luc, "numero_rci": numero_rci, "numero_rvp": numero_rvp,
        "data_atualizacao_rci": data_atualizacao_rci, "data_atualizacao_rvp": data_atualizacao_rvp,
        "revisao": revisao, "revisao_at": revisao_at,
        "num_documentos": num_documentos, "responsavel": responsavel, "status_analise": status_analise,
        "data_solicitacao": data_solicitacao, "data_limite": data_limite, "data_analise": data_analise,
        "hold_inicio": hold_inicio, "hold_fim": hold_fim, "natureza_revisao": natureza_revisao,
        "num_erros": num_erros, "etg": etg, "observacoes": observacoes, "motivo_repactuacao": motivo_repactuacao,
        "cessionario_cadastro_id": cadastro_cess_selecionado["id"] if cadastro_cess_selecionado else None,
        "sla_reduzido": sla_reduzido, "dias_reduzidos": dias_reduzidos, "justificativa_sla": justificativa_sla,
    }
    houve_alteracoes = _houve_alteracoes_nao_salvas(f"ce_snapshot_{sufixo}", valores_atuais)

    col_salvar, col_cancelar = st.columns(2)
    salvar = col_salvar.button("Salvar", icon=":material/save:", type="primary", use_container_width=True, key=f"ce_salvar_{sufixo}")
    cancelar = col_cancelar.button("Cancelar", use_container_width=True, key=f"ce_cancelar_{sufixo}")

    chave_tentativa = f"ce_tentativa_salvar_{sufixo}"

    if _confirmar_descarte(f"ce_descarte_{sufixo}", houve_alteracoes, cancelar):
        st.session_state[chave_tentativa] = False
        st.session_state.pop(f"ce_snapshot_{sufixo}", None)
        st.rerun()

    if salvar and (not cessionario or not data_solicitacao):
        st.error("Preencha ao menos Cessionário e Data de Solicitação.")
        salvar = False
    if salvar and sla_reduzido and not justificativa_sla.strip():
        st.error("Informe a justificativa do SLA reduzido para salvar.")
        salvar = False

    if (
        _tentativa_salvar_iniciada(chave_tentativa, salvar)
        and _pode_repactuar(repactuando, motivo_repactuacao)
    ):
        campos_sla = _calcular_campos_sla_persistidos(
            registro, editando, sla_padrao, sla_efetivo, sla_reduzido, None,
            justificativa_sla, sugestao_limite_padrao, usuario,
        )
        dados = {
            "item": registro.get("item") if editando else None,
            "codigo": codigo,
            "luc": luc,
            "numero_rci": numero_rci,
            "numero_rvp": numero_rvp,
            "data_atualizacao_rci": data_atualizacao_rci.isoformat() if data_atualizacao_rci else None,
            "data_atualizacao_rvp": data_atualizacao_rvp.isoformat() if data_atualizacao_rvp else None,
            "cessionario": cessionario,
            "disciplina": disciplina,
            "disciplina_sla": disciplina_sla,
            "revisao": int(revisao),
            "num_documentos": int(num_documentos),
            "data_solicitacao": data_solicitacao.isoformat(),
            "tipo": tipo,
            "data_limite": data_limite.isoformat() if data_limite else None,
            "data_analise": data_analise.isoformat() if data_analise else None,
            "hold_inicio": hold_inicio.isoformat() if hold_inicio else None,
            "hold_fim": hold_fim.isoformat() if hold_fim else None,
            "num_at": num_at,
            "revisao_at": int(revisao_at),
            "responsavel": responsavel,
            "status_analise": status_analise,
            "observacoes": observacoes,
            "natureza_revisao": natureza_revisao,
            "num_erros": int(num_erros),
            "etg": etg,
            "cessionario_cadastro_id": cadastro_cess_selecionado["id"] if cadastro_cess_selecionado else None,
            **campos_sla,
        }
        if editando:
            atualizar_cessionario(registro["id"], dados, usuario)
            if repactuando:
                registrar_repactuacao_prazo(
                    "cessionarios", registro["id"], data_limite_original.isoformat(), data_limite.isoformat(),
                    motivo_repactuacao.strip(), usuario,
                )
            registrar_atividade(usuario, None, "PROJETO_EDITADO", modulo="cessionarios", detalhe=cessionario)
            st.toast("Registro de cessionário atualizado com sucesso.", icon=":material/check_circle:")
            projeto_id_salvo = registro["id"]
        else:
            projeto_id_salvo = inserir_cessionario(dados, usuario)
            registrar_atividade(usuario, None, "PROJETO_CRIADO", modulo="cessionarios", detalhe=cessionario)
            st.toast("Novo registro de cessionário cadastrado com sucesso.", icon=":material/check_circle:")
        st.session_state[chave_tentativa] = False
        st.session_state.pop(f"ce_snapshot_{sufixo}", None)
        st.session_state["_gat_refresh"] = st.session_state.get("_gat_refresh", 0) + 1

        pendencia_avaliacao = _detectar_pendencia_avaliacao("CESSIONARIO", "cessionarios", dados, projeto_id_salvo, "cessionario")
        if pendencia_avaliacao:
            st.session_state[chave_confirmacao_avaliacao] = pendencia_avaliacao
            _renderizar_confirmacao_avaliacao(pendencia_avaliacao, chave_confirmacao_avaliacao)
            return
        st.rerun()


# ---------------------------------------------------------------------------
# Modal de Avaliação de Prestadores
# ---------------------------------------------------------------------------


@st.dialog("Avaliação de Prestador", width="large")
def dialog_avaliacao(usuario: str, registro: dict[str, Any] | None = None) -> None:
    editando = registro is not None
    sufixo = f"edit_{registro['id']}" if editando else "novo"

    col1, col2 = st.columns(2)
    with col1:
        nome_prestador = st.text_input("Nome do Prestador *", value=registro.get("nome_prestador", "") if registro else "", key=f"av_nome_{sufixo}")
        codigo_prestador = st.text_input("Cód. Prestador", value=registro.get("codigo_prestador", "") if registro else "", key=f"av_codigo_{sufixo}")
        nome_projeto = st.text_input("Nome do Projeto", value=registro.get("nome_projeto", "") if registro else "", key=f"av_projeto_{sufixo}")
        at_referencia = st.text_input("AT de Referência", value=registro.get("at_referencia", "") if registro else "", key=f"av_at_{sufixo}")
    with col2:
        data_avaliacao = st.date_input("Data da Avaliação *", value=_parse_data(registro.get("data_avaliacao")) if registro else date.today(), format="DD/MM/YYYY", key=f"av_data_{sufixo}")
        nota = st.slider("Nota (1-15)", min_value=1, max_value=15, value=int(registro.get("nota", 8)) if registro else 8, key=f"av_nota_{sufixo}")
        analista_responsavel = st.selectbox("Analista Responsável", RESPONSAVEIS, index=_idx(RESPONSAVEIS, registro.get("analista_responsavel") if registro else None), key=f"av_analista_{sufixo}")

    classificacao, interpretacao = classificar_nota(nota)
    from gat.config import CORES_CLASSIFICACAO_AVALIACAO
    cor = CORES_CLASSIFICACAO_AVALIACAO.get(classificacao, "#64748B")
    st.markdown(
        f'<div style="padding:10px 14px;border-radius:8px;background:{cor}22;border-left:4px solid {cor};">'
        f'<strong style="color:{cor}">{classificacao}</strong> — {interpretacao}</div>',
        unsafe_allow_html=True,
    )

    observacoes = st.text_area("Observações", value=registro.get("observacoes", "") if registro else "", key=f"av_obs_{sufixo}")

    col_salvar, col_cancelar = st.columns(2)
    salvar = col_salvar.button("Salvar", icon=":material/save:", type="primary", use_container_width=True, key=f"av_salvar_{sufixo}")
    cancelar = col_cancelar.button("Cancelar", use_container_width=True, key=f"av_cancelar_{sufixo}")

    if cancelar:
        st.rerun()

    if salvar:
        if not nome_prestador or not data_avaliacao:
            st.error("Preencha ao menos Nome do Prestador e Data da Avaliação.")
            return
        dados = {
            "codigo_prestador": codigo_prestador,
            "nome_prestador": nome_prestador,
            "data_avaliacao": data_avaliacao.isoformat(),
            "nome_projeto": nome_projeto,
            "at_referencia": at_referencia,
            "nota": int(nota),
            "analista_responsavel": analista_responsavel,
            "observacoes": observacoes,
        }
        if editando:
            atualizar_avaliacao(registro["id"], dados, usuario)
            st.toast("Avaliação atualizada com sucesso.", icon=":material/check_circle:")
        else:
            inserir_avaliacao(dados, usuario)
            st.toast("Nova avaliação registrada com sucesso.", icon=":material/check_circle:")
        st.session_state["_gat_refresh"] = st.session_state.get("_gat_refresh", 0) + 1
        st.rerun()


def _idx(opcoes: list[str], valor: str | None) -> int:
    """Retorna o índice de `valor` em `opcoes` (0 se não encontrado), para pré-selecionar selectbox."""
    if valor in opcoes:
        return opcoes.index(valor)
    return 0
