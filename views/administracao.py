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
        abas_disponiveis.append("Importar Planilha")

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

    if "Importar Planilha" in abas_disponiveis:
        with abas[indice]:
            _renderizar_importar_planilha(usuario)
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


def _renderizar_importar_planilha(usuario: dict) -> None:
    st.markdown("##### Atualizar dados a partir da planilha oficial")
    st.caption(
        "Lê as abas PROJ_PREST e PROJ_CESS da planilha \"Controle GAT Projetos\" e atualiza Prestadores e "
        "Cessionários de forma incremental: um registro já existente (mesmo código + disciplina + revisão + "
        "nº AT) é **atualizado**, nunca duplicado; um campo vazio na planilha nunca apaga um dado já "
        "cadastrado no sistema; nada é excluído. Um backup automático é criado antes de aplicar qualquer "
        "mudança."
    )
    arquivo = st.file_uploader("Planilha (.xlsx / .xlsm)", type=["xlsx", "xlsm"], key="admin_upload_planilha")

    if arquivo is not None and st.button("Importar planilha", icon=":material/upload_file:", type="primary", key="admin_importar_planilha_btn"):
        from gat.planilha_import import importar_cessionarios, importar_prestadores

        conteudo = arquivo.getvalue()
        with st.spinner("Criando backup de segurança..."):
            criar_backup()
        try:
            with st.spinner("Importando Prestadores (aba PROJ_PREST)..."):
                relatorio_prest = importar_prestadores(conteudo, usuario["username"])
            with st.spinner("Importando Cessionários (aba PROJ_CESS)..."):
                relatorio_cess = importar_cessionarios(conteudo, usuario["username"])
        except Exception as exc:
            st.error(f"Falha ao importar a planilha: {exc}")
            return

        registrar_atividade(
            usuario["username"], usuario.get("perfil"), "IMPORTACAO_PLANILHA",
            detalhe=f"{relatorio_prest.resumo_texto()} | {relatorio_cess.resumo_texto()}",
        )
        st.session_state["admin_ultimo_relatorio_importacao"] = (relatorio_prest, relatorio_cess)
        st.success("Importação concluída — veja o relatório abaixo.")
        atualizar_apos_mutacao()

    relatorios = st.session_state.get("admin_ultimo_relatorio_importacao")
    if relatorios:
        for relatorio in relatorios:
            st.markdown(f"###### {relatorio.origem}")
            col1, col2, col3, col4 = st.columns(4)
            col1.metric("Lidos", relatorio.lidos)
            col2.metric("Novos", relatorio.novos)
            col3.metric("Atualizados", relatorio.atualizados)
            col4.metric("Sem mudança", relatorio.ignorados_sem_mudanca)
            col1.metric("Já arquivados (ignorados)", relatorio.ignorados_arquivados)
            col2.metric("Com inconsistência", relatorio.inconsistentes)
            if relatorio.colunas_nao_mapeadas:
                st.caption(f"Colunas da planilha não reconhecidas (ignoradas): {', '.join(relatorio.colunas_nao_mapeadas)}")
            if relatorio.detalhes_inconsistencia:
                with st.expander(f"Detalhe das {relatorio.inconsistentes} inconsistências"):
                    for detalhe in relatorio.detalhes_inconsistencia:
                        st.caption(f"• {detalhe}")

    st.divider()
    _renderizar_persistencia_dados(usuario)


def _renderizar_persistencia_dados(usuario: dict) -> None:
    st.markdown("##### Persistência e backup dos dados")
    st.caption(
        "O banco de dados deste ambiente fica em um disco temporário — ele pode ser apagado quando o ambiente "
        "é reiniciado. Use os recursos abaixo para não perder o que for cadastrado pela interface (perfis, "
        "reuniões, avaliações, etc.)."
    )

    col_backup, col_restaurar = st.columns(2)
    with col_backup:
        st.markdown("**Baixar cópia de segurança**")
        st.caption("Baixe o banco de dados agora e guarde o arquivo em um local seguro (seu computador, e-mail, nuvem).")
        conteudo_db = exportar_banco_bytes()
        if conteudo_db:
            nome_arquivo_backup = f"backup_gat_2026_{agora_br().strftime('%Y-%m-%d_%H%M%S')}.db"
            st.download_button(
                "Baixar backup agora", data=conteudo_db, file_name=nome_arquivo_backup,
                mime="application/octet-stream", icon=":material/download:", type="primary", use_container_width=True,
            )
        else:
            st.info("Banco de dados ainda não encontrado.")

    with col_restaurar:
        st.markdown("**Restaurar de um backup**")
        st.caption(
            "Envie um arquivo `.db` baixado anteriormente para restaurar os dados — substitui os dados atuais "
            "(um backup de segurança do estado atual é criado automaticamente antes)."
        )
        arquivo_restauracao = st.file_uploader("Arquivo de backup (.db)", type=["db"], key="admin_restaurar_upload")
        if arquivo_restauracao is not None and st.button("Restaurar este backup", icon=":material/restore:", key="admin_restaurar_botao"):
            st.session_state["admin_confirmar_restauracao"] = arquivo_restauracao.getvalue()
            st.rerun()

    if st.session_state.get("admin_confirmar_restauracao"):
        _dialog_confirmar_restauracao(usuario)

    st.divider()
    st.markdown("**Backups automáticos**")
    st.caption(
        "O sistema cria backups automaticamente: antes de qualquer migração de banco de dados, pelo menos "
        "uma vez por dia de uso, e sempre que a versão da aplicação em execução muda (a aproximação mais "
        "próxima possível de \"antes de uma atualização\" para um processo sem acesso ao pipeline de deploy). "
        f"São mantidos os {MAX_BACKUPS} backups mais recentes."
    )
    backups = listar_backups()
    if backups:
        col_b1, col_b2, col_b3 = st.columns(3)
        col_b1.metric("Total de backups", len(backups))
        col_b2.metric("Mais recente", formatar_datahora_br(backups[0]["criado_em"]))
        col_b3.metric("Mais antigo mantido", formatar_datahora_br(backups[-1]["criado_em"]))
        with st.expander("Ver todos os backups", icon=":material/history:"):
            st.dataframe(
                formatar_datahoras_df(pd.DataFrame(backups), ["criado_em"]).rename(
                    columns={"arquivo": "Arquivo", "tamanho_bytes": "Tamanho (bytes)", "criado_em": "Criado em"}
                ),
                use_container_width=True, hide_index=True,
            )
    else:
        st.info("Nenhum backup automático criado ainda.")

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
    st.warning(
        "Isso vai substituir todos os dados atuais pelos dados do arquivo de backup enviado. Um backup de "
        "segurança do estado atual é criado automaticamente antes, mas esta ação não pode ser desfeita pela "
        "interface.",
        icon=":material/warning:",
    )
    col1, col2 = st.columns(2)
    if col1.button("Cancelar", use_container_width=True):
        del st.session_state["admin_confirmar_restauracao"]
        st.rerun()
    if col2.button("Confirmar restauração", type="primary", use_container_width=True):
        conteudo = st.session_state.pop("admin_confirmar_restauracao")
        try:
            restaurar_banco_de_bytes(conteudo)
            registrar_atividade(usuario["username"], usuario.get("perfil"), "RESTAURACAO_BACKUP")
            st.success("Backup restaurado com sucesso.")
            st.rerun()
        except Exception as exc:
            st.error(f"Não foi possível restaurar o backup: {exc}")
