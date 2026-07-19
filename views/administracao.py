"""View: Administração — usuários, permissões, validação de dados e auditoria."""

from __future__ import annotations

import streamlit as st

from gat.config import PERFIS_OPCOES
from gat.database import (
    criar_usuario,
    definir_configuracao,
    listar_historico,
    listar_usuarios,
    obter_configuracao,
    relatorio_validacao_importacao,
)
from gat.permissions import exigir_area, pode_area
from gat.ui.modals_usuarios import renderizar_editor_usuario

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
            _renderizar_configuracoes()
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
        criar = st.form_submit_button("Cadastrar usuário", icon=":material/person_add:", type="primary")

    if criar:
        if not novo_username or not nova_senha:
            st.error("Informe usuário e senha.")
        elif len(nova_senha) < 6:
            st.error("A senha temporária deve ter pelo menos 6 caracteres.")
        else:
            try:
                criar_usuario(novo_username.strip(), nova_senha, novo_nome, novo_perfil, usuario["username"])
                st.success(f"Usuário '{novo_username}' cadastrado com sucesso.")
                st.rerun()
            except Exception as exc:  # username duplicado, etc.
                st.error(f"Não foi possível cadastrar o usuário: {exc}")

    st.markdown("##### Usuários cadastrados")
    df_usuarios = listar_usuarios()
    st.dataframe(
        df_usuarios.rename(columns={
            "username": "Usuário", "nome_completo": "Nome", "perfil": "Perfil", "ativo": "Ativo",
            "deve_trocar_senha": "Deve trocar senha", "ultimo_acesso": "Último acesso", "criado_em": "Criado em",
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

    if st.button("Editar usuário selecionado", icon=":material/manage_accounts:", type="primary", key="abrir_editar_usuario"):
        st.session_state["admin_usuario_editando"] = alvo_username

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
                df_hist_usuario.rename(columns={
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
    st.dataframe(df_hist, use_container_width=True, hide_index=True)


def _renderizar_configuracoes() -> None:
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
