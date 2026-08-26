"""View: Administração — usuários, permissões, validação de dados e auditoria."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat import backup_externo
from gat.arquivo_business_rules import perfil_pode_arquivar_e_restaurar
from gat.config import DISCIPLINAS, MAX_BACKUPS, PERFIS_OPCOES, RESPONSAVEIS
from gat.database import (
    criar_backup,
    criar_usuario,
    definir_codigo_disciplina,
    definir_configuracao,
    exportar_banco_bytes,
    ler_backup_bytes,
    listar_backups,
    listar_codigos_disciplina,
    listar_historico,
    listar_usuarios,
    obter_configuracao,
    registrar_atividade,
    relatorio_validacao_importacao,
    restaurar_banco_de_bytes,
    sincronizar_para_persistencia,
)
from gat.horario import agora_br
from gat.permissions import exigir_area, pode_area
from gat.ui.formatos import formatar_datahora_br, formatar_datahoras_df
from gat.ui.modals_arquivo import dialog_arquivar
from gat.ui.modals_usuarios import renderizar_editor_usuario
from gat.ui.pos_mutacao import atualizar_apos_mutacao

_TIPOS_HISTORICO = ["Todas", "prestadores", "cessionarios", "reunioes", "planos_acao", "seguranca"]


def render(usuario: dict) -> None:
    st.subheader(":material/settings: Administração do Sistema")

    abas_disponiveis = []
    if pode_area(usuario, "administrar_usuarios"):
        abas_disponiveis.append("Usuários")
    abas_disponiveis.append("Validação de Dados")
    if pode_area(usuario, "auditoria"):
        abas_disponiveis.append("Histórico e Auditoria")
    if pode_area(usuario, "configuracoes"):
        abas_disponiveis.append("Configurações")
        abas_disponiveis.append("Central de Codificação")

    abas = st.tabs(abas_disponiveis)
    indice = 0

    if "Usuários" in abas_disponiveis:
        with abas[indice]:
            _renderizar_usuarios(usuario)
        indice += 1

    with abas[indice]:
        _renderizar_validacao_dados()
    indice += 1

    if "Histórico e Auditoria" in abas_disponiveis:
        with abas[indice]:
            _renderizar_historico()
        indice += 1

    if "Configurações" in abas_disponiveis:
        with abas[indice]:
            _renderizar_configuracoes(usuario)
        indice += 1

    if "Central de Codificação" in abas_disponiveis:
        with abas[indice]:
            _renderizar_central_codificacao(usuario)
        indice += 1


def _renderizar_usuarios(usuario: dict) -> None:
    exigir_area(usuario, "administrar_usuarios")

    st.markdown("##### Cadastrar novo usuário")
    st.caption("O usuário receberá uma senha inicial temporária e será obrigado a defini-la novamente no primeiro acesso.")
    with st.form("form_novo_usuario", clear_on_submit=True):
        col1, col2, col3 = st.columns(3)
        novo_username = col1.text_input("Usuário")
        nova_senha = col2.text_input("Senha temporária", type="password")
        novo_perfil = col3.selectbox("Perfil", PERFIS_OPCOES)
        novo_nome = st.text_input("Nome completo")
        novo_analista_vinculado = st.selectbox(
            "Analista vinculado (RESPONSAVEIS) — apenas para perfil ANALISTA",
            ["— Nenhum —"] + RESPONSAVEIS,
            help="Necessário para o usuário conseguir ver seus próprios KPIs de prazo (item 16.1). Ignorado para perfis que não sejam ANALISTA.",
        )
        criar = st.form_submit_button("Cadastrar usuário", icon=":material/person_add:", type="primary")

    if criar:
        if not novo_username or not nova_senha:
            st.error("Informe usuário e senha.")
        elif len(nova_senha) < 6:
            st.error("A senha temporária deve ter pelo menos 6 caracteres.")
        else:
            try:
                analista_vinculado = novo_analista_vinculado if (novo_perfil == "ANALISTA" and novo_analista_vinculado != "— Nenhum —") else None
                criar_usuario(novo_username.strip(), nova_senha, novo_nome, novo_perfil, usuario["username"], analista_vinculado)
                st.success(f"Usuário '{novo_username}' cadastrado com sucesso.")
                st.rerun()
            except Exception as exc:  # username duplicado, etc.
                st.error(f"Não foi possível cadastrar o usuário: {exc}")

    st.markdown("##### Usuários cadastrados")
    df_usuarios = listar_usuarios()
    st.dataframe(
        formatar_datahoras_df(df_usuarios, ["ultimo_acesso", "criado_em"]).rename(columns={
            "username": "Usuário", "nome_completo": "Nome", "perfil": "Perfil", "ativo": "Ativo",
            "deve_trocar_senha": "Deve trocar senha", "ultimo_acesso": "Último acesso", "criado_em": "Criado em",
            "analista_vinculado": "Analista vinculado",
        }),
        use_container_width=True,
        hide_index=True,
    )

    st.markdown("##### Editar usuário / permissões")
    lista_usuarios = df_usuarios["username"].tolist()
    if not lista_usuarios:
        return

    alvo_username = st.selectbox("Selecionar usuário", options=lista_usuarios, key="admin_selecionar_usuario")
    linha_alvo = df_usuarios[df_usuarios["username"] == alvo_username].iloc[0].to_dict()

    col_editar, col_arquivar = st.columns(2)
    if col_editar.button("Editar usuário selecionado", icon=":material/manage_accounts:", type="primary", key="abrir_editar_usuario"):
        st.session_state["admin_usuario_editando"] = alvo_username

    if perfil_pode_arquivar_e_restaurar(usuario.get("perfil")):
        if alvo_username == usuario["username"]:
            col_arquivar.caption("Não é possível arquivar o próprio usuário logado.")
        elif col_arquivar.button("Arquivar usuário (Analista)", icon=":material/archive:", key="admin_arquivar_usuario"):
            dialog_arquivar(
                "usuarios", int(linha_alvo["id"]), f"{linha_alvo['username']} — {linha_alvo.get('nome_completo') or ''}", usuario["username"]
            )

    if st.session_state.get("admin_usuario_editando") == alvo_username:
        renderizar_editor_usuario(usuario, linha_alvo)

    with st.expander("Histórico de alterações de acesso deste usuário", icon=":material/history:"):
        df_hist_usuario = listar_historico("seguranca")
        if not df_hist_usuario.empty:
            df_hist_usuario = df_hist_usuario[df_hist_usuario["valor_novo"].astype(str).str.startswith(f"[{alvo_username}]")]
        if df_hist_usuario.empty:
            st.caption("Nenhum evento de segurança registrado para este usuário.")
        else:
            st.dataframe(
                formatar_datahoras_df(df_hist_usuario, ["data_hora"]).rename(columns={
                    "campo": "Evento", "valor_novo": "Detalhes", "usuario": "Executado por", "data_hora": "Data/Hora",
                })[["Evento", "Detalhes", "Executado por", "Data/Hora"]],
                use_container_width=True,
                hide_index=True,
            )


def _renderizar_validacao_dados() -> None:
    st.markdown("##### Validação da importação dos dados históricos")
    st.caption(
        "Calculado a partir dos registros efetivamente gravados no banco (não depende do arquivo de origem estar "
        "disponível). A numeração de Item é preservada exatamente como veio da planilha — nunca renumerada."
    )

    relatorio = relatorio_validacao_importacao()

    for modulo, titulo in (("prestadores", "Prestadores"), ("cessionarios", "Cessionários")):
        dados = relatorio[modulo]
        st.markdown(f"**{titulo}**")
        col1, col2, col3 = st.columns(3)
        col1.metric("Registros importados", dados["total_importados"])
        col2.metric("Item mínimo", dados["item_minimo"] if dados["item_minimo"] is not None else "-")
        col3.metric("Item máximo", dados["item_maximo"] if dados["item_maximo"] is not None else "-")

        faltantes = dados["itens_ausentes_na_origem"]
        if faltantes:
            st.warning(
                f"A numeração de Item vai de {dados['item_minimo']} a {dados['item_maximo']} "
                f"({dados['item_maximo'] - dados['item_minimo'] + 1} números), mas **{len(faltantes)}** "
                f"número(s) de Item não possuem nenhuma linha correspondente na planilha de origem: "
                f"**{', '.join(str(i) for i in faltantes)}**. Isso indica que essas linhas já não existiam "
                "fisicamente na planilha (removidas na origem antes da importação, sem reaproveitamento de "
                "numeração) — todas as demais linhas foram importadas sem nenhum filtro de status, PEP ou "
                "duplicidade.",
                icon=":material/report:",
            )
        else:
            st.success("Numeração de Item contígua — nenhuma linha da planilha de origem ficou de fora da importação.", icon=":material/check_circle:")
        st.divider()

    total = relatorio["prestadores"]["total_importados"] + relatorio["cessionarios"]["total_importados"]
    st.metric("Total geral importado (Prestadores + Cessionários)", total)


def _renderizar_historico() -> None:
    st.markdown("##### Histórico de edições e auditoria de segurança")
    filtro_tabela = st.selectbox("Tabela", _TIPOS_HISTORICO)
    df_hist = listar_historico(None if filtro_tabela == "Todas" else filtro_tabela)
    st.dataframe(formatar_datahoras_df(df_hist, ["data_hora"]), use_container_width=True, hide_index=True)


def _renderizar_configuracoes(usuario: dict) -> None:
    aba_geral, aba_planilha, aba_backup = st.tabs(["Geral", "Atualização por Planilha", "Backup do Sistema"])
    with aba_geral:
        _renderizar_configuracoes_gerais(usuario)
    with aba_planilha:
        _renderizar_atualizacao_planilha(usuario)
    with aba_backup:
        _renderizar_backup_sistema(usuario)


def _renderizar_configuracoes_gerais(usuario: dict) -> None:
    st.markdown("##### Criticidade de projetos sem PEP")
    st.caption(
        "Define, em dias corridos desde a Data de Solicitação, quando um projeto sem PEP passa a ser "
        "classificado como Atenção ou Crítico nos Lembretes e nos KPIs dos dashboards."
    )
    dias_atencao_atual = int(obter_configuracao("pep_dias_atencao", "3"))
    dias_critico_atual = int(obter_configuracao("pep_dias_critico", "6"))

    with st.form("form_config_pep"):
        col1, col2 = st.columns(2)
        dias_atencao = col1.number_input("Dias para 'Atenção'", min_value=1, step=1, value=dias_atencao_atual)
        dias_critico = col2.number_input("Dias para 'Crítico'", min_value=1, step=1, value=dias_critico_atual)
        salvar_config = st.form_submit_button("Salvar limiares", icon=":material/save:", type="primary")

    if salvar_config:
        if dias_critico <= dias_atencao:
            st.error("O limiar de 'Crítico' deve ser maior que o de 'Atenção'.")
        else:
            definir_configuracao("pep_dias_atencao", str(int(dias_atencao)))
            definir_configuracao("pep_dias_critico", str(int(dias_critico)))
            st.success("Limiares atualizados com sucesso.")
            st.rerun()

    st.markdown("##### Meta de aprovação até a REV2")
    st.caption(
        "Percentual de projetos aprovados (LIBERADO/LIBERADO C/ REST.) que devem estar aprovados até a "
        "Revisão 2, entre o total de projetos aprovados. Usado nos Dashboards, OPRs e relatórios."
    )
    meta_atual = float(obter_configuracao("meta_aprovacao_rev2", "80"))
    with st.form("form_config_meta_rev2"):
        meta_rev2 = st.number_input("Meta de aprovação até REV2 (%)", min_value=0.0, max_value=100.0, step=1.0, value=meta_atual)
        salvar_meta = st.form_submit_button("Salvar meta", icon=":material/save:", type="primary")

    if salvar_meta:
        definir_configuracao("meta_aprovacao_rev2", str(meta_rev2))
        st.success("Meta atualizada com sucesso.")
        st.rerun()


def _renderizar_central_codificacao(usuario: dict) -> None:
    st.markdown("##### Central de Codificação — código de disciplina")
    st.caption(
        "Código numérico de especialidade (procedimento PR-PRO-002 \"Codificação de Documentação Técnica\") "
        "usado para montar o segmento de disciplina (DDD) do número da AT no Resumo de Conclusão: "
        "AT-NNN-AA-PPP-DDD-RR. Uma disciplina sem código cadastrado não trava o Resumo — o segmento fica "
        "apenas omitido no número da AT até que o código seja definido aqui."
    )

    df_codigos = listar_codigos_disciplina()
    disciplinas_sem_codigo = sorted(set(DISCIPLINAS) - set(df_codigos["disciplina"]))
    for disciplina in disciplinas_sem_codigo:
        df_codigos = pd.concat(
            [df_codigos, pd.DataFrame([{"disciplina": disciplina, "codigo": None, "descricao": None}])],
            ignore_index=True,
        )
    df_codigos = df_codigos.sort_values("disciplina").reset_index(drop=True)

    editado = st.data_editor(
        df_codigos[["disciplina", "codigo", "descricao"]],
        column_config={
            "disciplina": st.column_config.TextColumn("Disciplina", disabled=True),
            "codigo": st.column_config.TextColumn("Código (DDD)", help="Ex.: 400. Deixe em branco para omitir o segmento no número da AT."),
            "descricao": st.column_config.TextColumn("Descrição (PR-PRO-002)"),
        },
        hide_index=True, use_container_width=True, key="admin_codigos_disciplina_editor",
    )

    if st.button("Salvar códigos de disciplina", icon=":material/save:", type="primary", key="admin_salvar_codigos_disciplina"):
        for _, linha in editado.iterrows():
            definir_codigo_disciplina(linha["disciplina"], linha.get("codigo"), linha.get("descricao"), usuario["username"])
        registrar_atividade(usuario["username"], usuario.get("perfil"), "CENTRAL_CODIFICACAO_ATUALIZADA")
        st.success("Códigos de disciplina atualizados com sucesso.")
        st.rerun()


def _renderizar_atualizacao_planilha(usuario: dict) -> None:
    from gat.database import listar_importacoes_planilha, obter_ultima_importacao_planilha

    st.markdown("##### Atualização por Planilha")
    st.caption(
        "Alternativa para quando os analistas ainda não atualizaram diretamente o sistema: envie a planilha "
        "\"Controle GAT Projetos\" (abas PROJ_PREST e PROJ_CESS) para sincronizar Prestadores e Cessionários. "
        "A planilha é a referência — o sistema é atualizado para acompanhá-la. Nada é apagado nem duplicado, "
        "um campo vazio na planilha nunca apaga um valor já cadastrado, e nenhuma mudança é aplicada sem você "
        "revisar e confirmar a prévia."
    )

    ultima = obter_ultima_importacao_planilha()
    if ultima:
        st.info(
            f"Última atualização por planilha: {formatar_datahora_br(ultima['data_hora'])} — {ultima['usuario']} "
            f"— arquivo \"{ultima['nome_arquivo']}\".",
            icon=":material/history:",
        )

    arquivo = st.file_uploader("Planilha (.xlsx / .xlsm)", type=["xlsx", "xlsm"], key="admin_upload_planilha_v2")

    if arquivo is not None and st.button("Validar planilha", icon=":material/fact_check:", type="primary", key="admin_validar_planilha_btn"):
        from gat.planilha_import import planejar_importacao_cessionarios, planejar_importacao_prestadores

        conteudo = arquivo.getvalue()
        try:
            with st.spinner("Lendo e validando a planilha..."):
                plano_p = planejar_importacao_prestadores(conteudo)
                plano_c = planejar_importacao_cessionarios(conteudo)
        except Exception as exc:
            st.error(f"Não foi possível ler a planilha \"{arquivo.name}\": {exc}. Nenhuma alteração foi realizada.")
            st.session_state.pop("admin_plano_importacao", None)
            return
        st.session_state["admin_plano_importacao"] = {"nome_arquivo": arquivo.name, "plano_p": plano_p, "plano_c": plano_c}
        st.session_state.pop("admin_resultado_importacao", None)
        st.rerun()

    plano_estado = st.session_state.get("admin_plano_importacao")
    if plano_estado:
        _renderizar_previa_importacao(plano_estado, usuario)

    resultado = st.session_state.get("admin_resultado_importacao")
    if resultado:
        st.success("Importação concluída — veja o relatório abaixo.", icon=":material/check_circle:")
        for relatorio in resultado:
            _renderizar_relatorio_importacao(relatorio)

    with st.expander("Histórico de importações"):
        historico = listar_importacoes_planilha()
        if historico.empty:
            st.caption("Nenhuma importação registrada ainda.")
        else:
            exibicao = formatar_datahoras_df(historico, ["data_hora"])[[
                "data_hora", "usuario", "nome_arquivo", "origem", "resultado",
                "lidos", "novos", "atualizados", "conflitos_tratados", "inconsistencias", "backup_ref",
            ]].rename(columns={
                "data_hora": "Data/Hora", "usuario": "Usuário", "nome_arquivo": "Arquivo", "origem": "Origem",
                "resultado": "Resultado", "lidos": "Lidos", "novos": "Novos", "atualizados": "Atualizados",
                "conflitos_tratados": "Conflitos", "inconsistencias": "Inconsistências",
                "backup_ref": "Backup pré-importação",
            })
            st.dataframe(exibicao, use_container_width=True, hide_index=True)
            st.caption(
                "\"Backup pré-importação\" é o backup criado automaticamente logo antes desta importação — em "
                "Backup do Sistema, é possível baixar ou restaurar exatamente esse ponto para desfazê-la."
            )


def _renderizar_previa_importacao(plano_estado: dict, usuario: dict) -> None:
    from gat.planilha_import import confirmar_importacao

    plano_p, plano_c, nome_arquivo = plano_estado["plano_p"], plano_estado["plano_c"], plano_estado["nome_arquivo"]

    st.markdown("###### Prévia da atualização")
    for plano, tabela in ((plano_p, "prestadores"), (plano_c, "cessionarios")):
        st.markdown(f"**{plano.origem}**")
        col1, col2, col3, col4, col5 = st.columns(5)
        col1.metric("Lidos", plano.lidos)
        col2.metric("Novos", plano.novos)
        col3.metric("Atualizados", plano.atualizados)
        col4.metric("Sem mudança", plano.sem_mudanca)
        col5.metric("Com conflito", plano.total_conflitos)
        if plano.arquivados:
            st.caption(f"{plano.arquivados} já arquivado(s) — ignorado(s), arquivamento é decisão manual separada.")
        if plano.inconsistentes:
            with st.expander(f"{plano.inconsistentes} linha(s) com inconsistência — não puderam ser processadas"):
                for item in plano.itens:
                    if item.tipo == "inconsistente":
                        st.caption(
                            f"• Linha {item.linha_planilha or '?'} da planilha — Item {item.item_origem or '?'} "
                            f"({item.identificacao}): {item.motivo_inconsistencia}."
                        )
        if plano.colunas_nao_mapeadas:
            st.caption(f"Colunas da planilha não reconhecidas (ignoradas): {', '.join(plano.colunas_nao_mapeadas)}")
        if plano.registros_nao_encontrados:
            _renderizar_registros_nao_encontrados(plano, tabela, usuario)

    resolucoes_p: dict[tuple, dict[str, str]] = {}
    resolucoes_c: dict[tuple, dict[str, str]] = {}
    total_conflitos = plano_p.total_conflitos + plano_c.total_conflitos

    if total_conflitos:
        st.markdown(f"###### Conflito de informação — {total_conflitos} registro(s)")
        st.caption(
            "A planilha é a referência: por padrão, o valor da planilha atualiza o sistema. Escolha "
            "\"Manter sistema\" só onde quiser preservar o valor já cadastrado em vez de aplicar a planilha."
        )
        for plano, resolucoes, prefixo in ((plano_p, resolucoes_p, "p"), (plano_c, resolucoes_c, "c")):
            for indice, item in enumerate(plano.itens_com_conflito):
                with st.expander(f"{plano.origem} — {item.identificacao} (linha {item.linha_planilha or '?'} da planilha, item {item.item_origem or '?'})"):
                    escolhas_item: dict[str, str] = {}
                    for campo, (valor_sistema, valor_planilha) in item.conflitos.items():
                        escolha = st.radio(
                            f"**{campo}** — sistema: `{valor_sistema}` · planilha: `{valor_planilha}`",
                            ["Usar planilha", "Manter sistema"], horizontal=True,
                            key=f"admin_conflito_{prefixo}_{indice}_{campo}",
                        )
                        if escolha == "Manter sistema":
                            escolhas_item[campo] = "sistema"
                    if escolhas_item:
                        resolucoes[item.chave] = escolhas_item

    col_confirmar, col_cancelar = st.columns(2)
    if col_confirmar.button("Confirmar atualização", type="primary", icon=":material/check:", use_container_width=True, key="admin_confirmar_importacao"):
        try:
            with st.spinner("Aplicando atualização..."):
                relatorio_p, relatorio_c = confirmar_importacao(nome_arquivo, plano_p, resolucoes_p, plano_c, resolucoes_c, usuario["username"])
        except Exception as exc:
            st.error(f"Falha ao aplicar a importação — nenhuma alteração foi mantida (estado anterior restaurado). Detalhe: {exc}")
            return
        registrar_atividade(
            usuario["username"], usuario.get("perfil"), "IMPORTACAO_PLANILHA",
            detalhe=f"{relatorio_p.resumo_texto()} | {relatorio_c.resumo_texto()}",
        )
        st.session_state.pop("admin_plano_importacao", None)
        st.session_state["admin_resultado_importacao"] = (relatorio_p, relatorio_c)
        atualizar_apos_mutacao()
    if col_cancelar.button("Cancelar", icon=":material/close:", use_container_width=True, key="admin_cancelar_importacao"):
        st.session_state.pop("admin_plano_importacao", None)
        st.rerun()


def _renderizar_registros_nao_encontrados(plano, tabela: str, usuario: dict) -> None:
    """Registros ativos com status "em andamento" (Em Análise/Em Hold) que
    não bateram com nenhuma linha da planilha atual — normalmente análises
    sem N° AT cuja chave de identificação (código+disciplina+revisão+data)
    mudou um pouco na planilha antes da AT ser emitida. A importação nunca
    apaga nem atualiza sozinha o que não está na planilha, então esses
    registros ficam "presos" no status antigo indefinidamente até alguém
    revisar — por isso aparecem aqui à parte, nunca arquivados
    automaticamente."""
    pode_arquivar = perfil_pode_arquivar_e_restaurar(usuario.get("perfil"))
    with st.expander(
        f":material/warning: {len(plano.registros_nao_encontrados)} registro(s) \"em andamento\" sem correspondência "
        "na planilha atual",
        icon=":material/warning:",
    ):
        st.caption(
            "Estes registros continuam com o status antigo porque nenhuma linha da planilha bate mais com eles "
            "(normalmente por não terem N° AT ainda). Não são apagados nem alterados automaticamente — revise e "
            "arquive manualmente os que não existirem mais. Quando há uma única linha na planilha com o mesmo "
            "código/nome e disciplina, ela aparece como sugestão de continuação — é só uma dica para conferir, "
            "nunca aplicada sozinha."
        )
        for registro in plano.registros_nao_encontrados:
            col_info, col_acao = st.columns([4, 1])
            with col_info:
                st.markdown(
                    f"**{registro['identificacao'] or '—'}** — {registro.get('disciplina') or '—'} — "
                    f"REV{int(registro['revisao'] or 0):02d} — AT: {registro.get('num_at') or '— (sem AT)'} — "
                    f"Status: {registro.get('status_analise') or '—'}"
                )
                st.caption(f"Data de Solicitação: {registro.get('data_solicitacao') or '—'} · id #{registro['id']}")
                if registro.get("sugestao_continuacao"):
                    st.caption(f":material/lightbulb: Possível continuação na planilha: {registro['sugestao_continuacao']}")
            with col_acao:
                if pode_arquivar and st.button(
                    "Arquivar", icon=":material/archive:", key=f"admin_arquivar_orfao_{tabela}_{registro['id']}",
                    use_container_width=True,
                ):
                    dialog_arquivar(
                        tabela, int(registro["id"]),
                        f"{registro['identificacao'] or '—'} — {registro.get('disciplina') or '—'}", usuario["username"],
                    )


def _renderizar_relatorio_importacao(relatorio) -> None:
    st.markdown(f"###### {relatorio.origem}")
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Lidos", relatorio.lidos)
    col2.metric("Novos", relatorio.novos)
    col3.metric("Atualizados", relatorio.atualizados)
    col4.metric("Conflitos tratados", relatorio.conflitos_tratados)
    col1.metric("Sem mudança", relatorio.ignorados_sem_mudanca)
    col2.metric("Já arquivados", relatorio.ignorados_arquivados)
    col3.metric("Inconsistências", relatorio.inconsistentes)
    if relatorio.colunas_nao_mapeadas:
        st.caption(f"Colunas da planilha não reconhecidas (ignoradas): {', '.join(relatorio.colunas_nao_mapeadas)}")
    if relatorio.detalhes_inconsistencia:
        with st.expander(f"Detalhe das {relatorio.inconsistentes} inconsistências"):
            for detalhe in relatorio.detalhes_inconsistencia:
                st.caption(f"• {detalhe}")


_NOMES_TIPO_BACKUP = {
    "MANUAL": "Manual", "AUTOMATICO": "Automático", "PRE_IMPORTACAO": "Pré-importação",
    "PRE_RESTAURACAO": "Pré-restauração", "PRE_MIGRACAO": "Pré-migração",
}


def _renderizar_backup_sistema(usuario: dict) -> None:
    st.markdown("##### Backup do Sistema")
    st.caption(
        "O banco de dados deste ambiente fica em um disco temporário — ele pode ser apagado quando o ambiente "
        "é reiniciado. Gere um backup manual quando quiser um ponto de restauração garantido, além dos "
        "automáticos que o sistema já cria sozinho (pelo menos uma vez por dia de uso, e sempre antes de uma "
        "migração de banco, uma importação por planilha ou uma restauração)."
    )

    col_gerar, col_baixar = st.columns(2)
    with col_gerar:
        st.markdown("**Gerar Backup Agora**")
        st.caption("Cria imediatamente uma cópia de segurança do banco atual, registrada no histórico abaixo com seu usuário.")
        if st.button("Gerar Backup Agora", icon=":material/backup:", type="primary", use_container_width=True, key="admin_gerar_backup_manual"):
            caminho = criar_backup(tipo="MANUAL", usuario=usuario["username"])
            if caminho is not None:
                registrar_atividade(usuario["username"], usuario.get("perfil"), "BACKUP_MANUAL_GERADO", detalhe=caminho.name)
                st.success(f"Backup gerado com sucesso: {caminho.name}")
                st.rerun()
            else:
                st.error("Não foi possível gerar o backup — banco de dados atual não encontrado.")

    with col_baixar:
        st.markdown("**Baixar cópia do estado atual**")
        st.caption("Baixe o banco de dados agora (sem passar pelo histórico) e guarde o arquivo em um local seguro.")
        conteudo_db = exportar_banco_bytes()
        if conteudo_db:
            nome_arquivo_backup = f"backup_gat_2026_{agora_br().strftime('%Y-%m-%d_%H%M%S')}.db"
            st.download_button(
                "Baixar agora", data=conteudo_db, file_name=nome_arquivo_backup,
                mime="application/octet-stream", icon=":material/download:", use_container_width=True,
                key="admin_baixar_atual",
            )
        else:
            st.info("Banco de dados ainda não encontrado.")

    st.divider()
    st.markdown("**Restaurar de um arquivo enviado**")
    st.caption(
        "Envie um arquivo `.db` baixado anteriormente para restaurar os dados — substitui os dados atuais "
        "(um backup de segurança do estado atual é criado automaticamente antes)."
    )
    arquivo_restauracao = st.file_uploader("Arquivo de backup (.db)", type=["db"], key="admin_restaurar_upload")
    if arquivo_restauracao is not None and st.button("Restaurar este arquivo", icon=":material/restore:", key="admin_restaurar_botao"):
        st.session_state["admin_confirmar_restauracao"] = {"conteudo": arquivo_restauracao.getvalue(), "origem": arquivo_restauracao.name}
        st.rerun()

    if st.session_state.get("admin_confirmar_restauracao"):
        _dialog_confirmar_restauracao(usuario)

    st.divider()
    st.markdown("**Histórico de backups**")
    st.caption(
        f"Manual (botão acima), Automático (diário/por versão), Pré-importação, Pré-restauração e "
        f"Pré-migração (criados automaticamente antes de cada uma dessas operações). "
        f"São mantidos os {MAX_BACKUPS} backups mais recentes — um backup criado antes desta funcionalidade "
        f"aparece aqui como Automático, sem usuário associado."
    )
    backups = listar_backups()
    if not backups:
        st.info("Nenhum backup criado ainda.")
    else:
        col_b1, col_b2, col_b3 = st.columns(3)
        col_b1.metric("Total de backups", len(backups))
        col_b2.metric("Mais recente", formatar_datahora_br(backups[0]["criado_em"]))
        col_b3.metric("Mais antigo mantido", formatar_datahora_br(backups[-1]["criado_em"]))
        with st.expander("Ver todos os backups", icon=":material/history:", expanded=True):
            for backup in backups:
                col_info, col_down, col_rest = st.columns([4, 1, 1])
                with col_info:
                    linha = (
                        f"**{backup['arquivo']}** — {_NOMES_TIPO_BACKUP.get(backup['tipo'], backup['tipo'])} — "
                        f"{formatar_datahora_br(backup['criado_em'])} — {backup['tamanho_bytes'] / 1024:.0f} KB"
                    )
                    if backup.get("usuario"):
                        linha += f" — {backup['usuario']}"
                    st.markdown(linha)
                    if backup.get("observacoes"):
                        st.caption(backup["observacoes"])
                    if backup.get("situacao") and backup["situacao"] != "OK":
                        st.caption(f"Situação: {backup['situacao']}")
                conteudo_backup = ler_backup_bytes(backup["arquivo"])
                with col_down:
                    if conteudo_backup:
                        st.download_button(
                            "Baixar", data=conteudo_backup, file_name=backup["arquivo"],
                            mime="application/octet-stream", icon=":material/download:",
                            key=f"admin_baixar_backup_{backup['arquivo']}", use_container_width=True,
                        )
                with col_rest:
                    if conteudo_backup is not None and st.button(
                        "Restaurar", icon=":material/restore:", key=f"admin_restaurar_backup_{backup['arquivo']}",
                        use_container_width=True,
                    ):
                        st.session_state["admin_confirmar_restauracao"] = {"conteudo": conteudo_backup, "origem": backup["arquivo"]}
                        st.rerun()
                st.divider()

    st.divider()
    st.markdown("**Sincronizar para persistência entre reinícios (manual)**")
    st.caption(
        "Atualiza o banco de sementes do repositório com os dados atuais, para que um reinício futuro do "
        "ambiente já comece a partir deste estado, em vez do estado original da importação. Depois de "
        "sincronizar, peça ao assistente para confirmar e salvar (\"commit/push\") essa atualização no "
        "repositório — só assim ela realmente sobrevive a um reinício. **Se o backup automático abaixo "
        "estiver configurado, isto não é mais necessário** — ele já faz isso sozinho a cada gravação."
    )
    if st.button("Sincronizar dados atuais para persistência", icon=":material/cloud_sync:"):
        if sincronizar_para_persistencia():
            registrar_atividade(usuario["username"], usuario.get("perfil"), "SINCRONIZACAO_PERSISTENCIA", detalhe="Banco de sementes atualizado")
            st.success("Dados sincronizados. Agora peça ao assistente para salvar (commit/push) essa atualização no repositório.")
        else:
            st.error("Não foi possível sincronizar — banco de dados atual não encontrado.")

    st.divider()
    st.markdown("**Backup automático no GitHub (recomendado)**")
    st.caption(
        "Publica automaticamente, a cada gravação feita pela interface, o estado atual do banco direto no "
        "repositório — sem precisar clicar em nada nem pedir commit/push manual. Requer configurar os "
        "segredos `GAT_BACKUP_GITHUB_TOKEN` e `GAT_BACKUP_GITHUB_REPO` em Settings → Secrets do app no "
        "Streamlit Cloud (veja o README para o passo a passo)."
    )
    if backup_externo.configurado():
        st.success("Backup automático configurado.", icon=":material/cloud_done:")
    else:
        st.warning("Backup automático ainda não configurado — os dados continuam vulneráveis a reinícios do ambiente.", icon=":material/cloud_off:")

    status_backup = backup_externo.status()
    if status_backup["em"]:
        icone = ":material/check_circle:" if status_backup["sucesso"] else ":material/error:"
        st.caption(f"{icone} Última tentativa ({status_backup['em']}): {status_backup['mensagem']}")

    if st.button("Testar backup automático agora", icon=":material/cloud_upload:", key="admin_testar_backup_externo"):
        with st.spinner("Enviando backup para o GitHub..."):
            sincronizar_para_persistencia()
            sucesso = backup_externo.enviar_backup_agora()
        if sucesso:
            registrar_atividade(usuario["username"], usuario.get("perfil"), "BACKUP_EXTERNO_TESTADO", detalhe="Sucesso")
            st.success(backup_externo.status()["mensagem"])
        else:
            registrar_atividade(usuario["username"], usuario.get("perfil"), "BACKUP_EXTERNO_TESTADO", detalhe="Falha")
            st.error(backup_externo.status()["mensagem"])


@st.dialog("Confirmar restauração de backup")
def _dialog_confirmar_restauracao(usuario: dict) -> None:
    pendente = st.session_state["admin_confirmar_restauracao"]
    origem = pendente["origem"]
    st.warning(
        f"Isso vai substituir todos os dados atuais pelos dados de \"{origem}\". Um backup de segurança do "
        "estado atual é criado automaticamente antes (tipo Pré-restauração), mas esta ação não pode ser "
        "desfeita pela interface.",
        icon=":material/warning:",
    )
    col1, col2 = st.columns(2)
    if col1.button("Cancelar", use_container_width=True):
        del st.session_state["admin_confirmar_restauracao"]
        st.rerun()
    if col2.button("Confirmar restauração", type="primary", use_container_width=True):
        pendente = st.session_state.pop("admin_confirmar_restauracao")
        try:
            restaurar_banco_de_bytes(pendente["conteudo"], usuario=usuario["username"])
            registrar_atividade(usuario["username"], usuario.get("perfil"), "RESTAURACAO_BACKUP", detalhe=origem)
            st.success("Backup restaurado com sucesso.")
            st.rerun()
        except Exception as exc:
            st.error(f"Não foi possível restaurar o backup: {exc}")
