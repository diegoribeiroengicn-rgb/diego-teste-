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

import streamlit as st

from gat.business_rules import (
    calcular_sla_cessionario,
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
    listar_cadastro_cessionarios,
    listar_cadastro_prestadores,
    listar_obras_prestador,
    nome_exibicao_obra,
    registrar_atividade,
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


# ---------------------------------------------------------------------------
# Modal de Prestadores (Aba A)
# ---------------------------------------------------------------------------


@st.dialog("Análise de Prestadores", width="large")
def dialog_prestador(usuario: str, registro: dict[str, Any] | None = None) -> None:
    editando = registro is not None
    sufixo = f"edit_{registro['id']}" if editando else "novo"
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

    st.markdown("##### Datas e prazos")
    col3, col4, col5 = st.columns(3)
    with col3:
        data_solicitacao = st.date_input("Data de Solicitação *", value=_parse_data(registro.get("data_solicitacao")) if registro else date.today(), format="DD/MM/YYYY", key=f"pr_dsol_{sufixo}")
    sugestao_limite = calcular_data_limite(data_solicitacao, SLA_PRESTADORES_DIAS_UTEIS)
    if not editando:
        chave_gatilho = f"pr_dlim_gatilho_{sufixo}"
        if st.session_state.get(chave_gatilho) != data_solicitacao:
            st.session_state[f"pr_dlim_{sufixo}"] = sugestao_limite
            st.session_state[chave_gatilho] = data_solicitacao
    with col4:
        data_limite = st.date_input(
            "Data de Entrega Acordada/Prevista *",
            value=_parse_data(registro.get("data_limite")) if editando else sugestao_limite,
            format="DD/MM/YYYY",
            help=f"Sugestão automática (SLA de {SLA_PRESTADORES_DIAS_UTEIS} dias úteis): {sugestao_limite.strftime('%d/%m/%Y') if sugestao_limite else '-'}. Pode ser repactuada manualmente.",
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

    col_salvar, col_cancelar = st.columns(2)
    salvar = col_salvar.button("Salvar", icon=":material/save:", type="primary", use_container_width=True, key=f"pr_salvar_{sufixo}")
    cancelar = col_cancelar.button("Cancelar", use_container_width=True, key=f"pr_cancelar_{sufixo}")

    chave_tentativa = f"pr_tentativa_salvar_{sufixo}"

    if cancelar:
        st.session_state[chave_tentativa] = False
        st.rerun()

    if salvar and (not prestador or not data_solicitacao):
        st.error("Preencha ao menos Prestador de Serviço e Data de Solicitação.")
        salvar = False

    if _tentativa_salvar_iniciada(chave_tentativa, salvar) and _pode_persistir_com_pep(peps, f"pr_confirma_sem_pep_{sufixo}"):
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
        }
        if editando:
            atualizar_prestador(registro["id"], dados, usuario)
            registrar_atividade(usuario, None, "PROJETO_EDITADO", modulo="prestadores", detalhe=prestador)
            st.toast("Registro de prestador atualizado com sucesso.", icon=":material/check_circle:")
        else:
            inserir_prestador(dados, usuario)
            registrar_atividade(usuario, None, "PROJETO_CRIADO", modulo="prestadores", detalhe=prestador)
            st.toast("Novo registro de prestador cadastrado com sucesso.", icon=":material/check_circle:")
        st.session_state[chave_tentativa] = False
        st.session_state["_gat_refresh"] = st.session_state.get("_gat_refresh", 0) + 1
        st.rerun()


# ---------------------------------------------------------------------------
# Modal de Cessionários (Aba B)
# ---------------------------------------------------------------------------


@st.dialog("Análise de Cessionários", width="large")
def dialog_cessionario(usuario: str, registro: dict[str, Any] | None = None) -> None:
    editando = registro is not None
    sufixo = f"edit_{registro['id']}" if editando else "novo"
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
        pep = st.text_input("PEP", value=registro.get("pep", "") if registro else "", help="Não obrigatório para concluir o cadastro. Se ficar vazio, o projeto gera pendência e lembrete automáticos.", key=f"ce_pep_{sufixo}")
    with col2:
        revisao = st.number_input("Revisão", min_value=0, step=1, value=int(registro.get("revisao", 0)) if registro else 0, key=f"ce_rev_{sufixo}")
        revisao_at = st.number_input("REV. AT", min_value=0, step=1, value=int(registro.get("revisao_at") or 0) if registro else 0, key=f"ce_revat_{sufixo}")
        num_documentos = st.number_input("N° de Doc.", min_value=0, step=1, value=int(registro.get("num_documentos", 0)) if registro else 0, key=f"ce_ndoc_{sufixo}")
        responsavel = st.selectbox("Responsável (Analista)", RESPONSAVEIS, index=_idx(RESPONSAVEIS, registro.get("responsavel") if registro else None), key=f"ce_resp_{sufixo}")
        status_analise = st.selectbox("Status Análise", STATUS_ANALISE_OPCOES, index=_idx(STATUS_ANALISE_OPCOES, registro.get("status_analise") if registro else "EM ANÁLISE"), key=f"ce_status_{sufixo}")

    sla_dias = calcular_sla_cessionario(tipo, int(revisao))

    st.markdown("##### Datas e prazos")
    col3, col4, col5 = st.columns(3)
    with col3:
        data_solicitacao = st.date_input("Data de Solicitação *", value=_parse_data(registro.get("data_solicitacao")) if registro else date.today(), format="DD/MM/YYYY", key=f"ce_dsol_{sufixo}")
    sugestao_limite = calcular_data_limite(data_solicitacao, sla_dias)
    if not editando:
        chave_gatilho = f"ce_dlim_gatilho_{sufixo}"
        gatilho_atual = (data_solicitacao, tipo, int(revisao))
        if st.session_state.get(chave_gatilho) != gatilho_atual:
            st.session_state[f"ce_dlim_{sufixo}"] = sugestao_limite
            st.session_state[chave_gatilho] = gatilho_atual
    with col4:
        data_limite = st.date_input(
            "Data de Entrega Acordada/Prevista *",
            value=_parse_data(registro.get("data_limite")) if editando else sugestao_limite,
            format="DD/MM/YYYY",
            help=f"Sugestão automática (SLA de {sla_dias} dias úteis conforme tipo/revisão): {sugestao_limite.strftime('%d/%m/%Y') if sugestao_limite else '-'}. Pode ser repactuada manualmente.",
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
    status_calc, saldo = status_entrega_cessionario(data_solicitacao, data_analise, hold_dias, sla_dias)

    st.markdown("##### Cálculo automático (dias úteis · calendário RJ)")
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("SLA (dias úteis)", sla_dias)
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

    col_salvar, col_cancelar = st.columns(2)
    salvar = col_salvar.button("Salvar", icon=":material/save:", type="primary", use_container_width=True, key=f"ce_salvar_{sufixo}")
    cancelar = col_cancelar.button("Cancelar", use_container_width=True, key=f"ce_cancelar_{sufixo}")

    chave_tentativa = f"ce_tentativa_salvar_{sufixo}"

    if cancelar:
        st.session_state[chave_tentativa] = False
        st.rerun()

    if salvar and (not cessionario or not data_solicitacao):
        st.error("Preencha ao menos Cessionário e Data de Solicitação.")
        salvar = False

    if _tentativa_salvar_iniciada(chave_tentativa, salvar) and _pode_persistir_com_pep(pep, f"ce_confirma_sem_pep_{sufixo}"):
        dados = {
            "item": registro.get("item") if editando else None,
            "codigo": codigo,
            "pep": pep,
            "cessionario": cessionario,
            "disciplina": disciplina,
            "disciplina_sla": disciplina_sla,
            "revisao": int(revisao),
            "num_documentos": int(num_documentos),
            "data_solicitacao": data_solicitacao.isoformat(),
            "tipo": tipo,
            "sla_dias": int(sla_dias),
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
        }
        if editando:
            atualizar_cessionario(registro["id"], dados, usuario)
            registrar_atividade(usuario, None, "PROJETO_EDITADO", modulo="cessionarios", detalhe=cessionario)
            st.toast("Registro de cessionário atualizado com sucesso.", icon=":material/check_circle:")
        else:
            inserir_cessionario(dados, usuario)
            registrar_atividade(usuario, None, "PROJETO_CRIADO", modulo="cessionarios", detalhe=cessionario)
            st.toast("Novo registro de cessionário cadastrado com sucesso.", icon=":material/check_circle:")
        st.session_state[chave_tentativa] = False
        st.session_state["_gat_refresh"] = st.session_state.get("_gat_refresh", 0) + 1
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
