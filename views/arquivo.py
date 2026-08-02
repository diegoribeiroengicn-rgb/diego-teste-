"""View: Arquivo — arquivamento lógico (nunca exclusão) e exclusão
definitiva controlada de registros do GAT e do PMO. Módulo independente,
compartilhado por todos os perfis exceto Consulta (ver
`gat/arquivo_business_rules.py`)."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.arquivo_business_rules import CATEGORIAS, perfil_pode_arquivar_e_restaurar, perfil_pode_excluir_definitivamente
from gat.arquivo_database import listar_arquivados, listar_auditoria, listar_codigos_gat_arquivados, restaurar_projeto_gat
from gat.arquivo_relatorios import TITULOS_RELATORIO_ARQUIVO, gerar_relatorio_arquivo, nome_arquivo_relatorio_arquivo
from gat.permissions import exigir_area
from gat.ui.formatos import formatar_datahora_br, formatar_datahoras_df
from gat.ui.modals_arquivo import dialog_excluir_definitivamente, dialog_restaurar

_COLUNAS_EXIBICAO = {
    "pmo_projetos": ["nome", "cliente", "contratada"],
    "prestadores": ["codigo", "prestador", "num_at", "revisao_at"],
    "cessionarios": ["codigo", "cessionario", "num_at", "revisao_at"],
    "cadastro_prestadores": ["codigo", "nome_empresa"],
    "cadastro_cessionarios": ["codigo", "nome_empresa"],
    "usuarios": ["username", "nome_completo", "perfil"],
    "reunioes": ["titulo", "data_prevista"],
    "planos_acao": ["descricao", "responsavel", "prazo"],
    "alertas_manuais": ["titulo", "codigo_projeto"],
    "pmo_cronograma_arquivos": ["nome_arquivo", "formato"],
}

_COLUNAS_SENSIVEIS_OU_PESADAS = {"senha_hash", "conteudo"}


def _descricao_linha(tabela: str, linha: dict) -> str:
    campos = _COLUNAS_EXIBICAO.get(tabela, [])
    partes = [str(linha[c]) for c in campos if linha.get(c) not in (None, "")]
    return " — ".join(partes) if partes else f"{tabela} #{linha.get('id')}"


def _remover_colunas_sensiveis(df: pd.DataFrame) -> pd.DataFrame:
    colunas_presentes = [c for c in _COLUNAS_SENSIVEIS_OU_PESADAS if c in df.columns]
    return df.drop(columns=colunas_presentes) if colunas_presentes else df


def _aplicar_filtros(df: pd.DataFrame, texto: str, usuario_filtro: str, apenas_teste: bool, data_de, data_ate) -> pd.DataFrame:
    if df.empty:
        return df
    filtrado = df.copy()
    if texto.strip():
        alvo = texto.strip().lower()
        mascara = filtrado.apply(lambda linha: alvo in " ".join(str(v) for v in linha.values).lower(), axis=1)
        filtrado = filtrado[mascara]
    if usuario_filtro.strip():
        filtrado = filtrado[filtrado["arquivado_por"].fillna("").str.contains(usuario_filtro.strip(), case=False, na=False, regex=False)]
    if apenas_teste:
        filtrado = filtrado[filtrado["arquivado_teste"] == 1]
    if data_de:
        filtrado = filtrado[pd.to_datetime(filtrado["arquivado_em"], errors="coerce").dt.date >= data_de]
    if data_ate:
        filtrado = filtrado[pd.to_datetime(filtrado["arquivado_em"], errors="coerce").dt.date <= data_ate]
    return filtrado


def _cartao_registro(tabela: str, linha_dict: dict, usuario: dict, sufixo_chave: str = "") -> None:
    descricao = _descricao_linha(tabela, linha_dict)
    with st.expander(descricao, icon=":material/inventory_2:"):
        detalhe = f"Arquivado em {formatar_datahora_br(linha_dict.get('arquivado_em'))} por {linha_dict.get('arquivado_por') or '—'}"
        if linha_dict.get("motivo_arquivamento"):
            detalhe += f" · Motivo: {linha_dict['motivo_arquivamento']}"
        if linha_dict.get("arquivado_teste"):
            detalhe += " · Registro de teste"
        st.caption(detalhe)
        col_a, col_b = st.columns(2)
        chave = f"{tabela}{sufixo_chave}_{linha_dict['id']}"
        if perfil_pode_arquivar_e_restaurar(usuario.get("perfil")) and col_a.button(
            "Restaurar", icon=":material/restore:", key=f"arq_restaurar_{chave}", use_container_width=True
        ):
            dialog_restaurar(tabela, int(linha_dict["id"]), descricao, usuario["username"])
        if perfil_pode_excluir_definitivamente(usuario.get("perfil")) and col_b.button(
            "Excluir Definitivamente", icon=":material/delete_forever:", key=f"arq_excluir_{chave}", use_container_width=True
        ):
            dialog_excluir_definitivamente(tabela, int(linha_dict["id"]), descricao, usuario["username"])


def _renderizar_filtros() -> tuple[str, str, bool, object, object]:
    with st.expander("Filtros", icon=":material/filter_list:"):
        col1, col2, col3 = st.columns(3)
        texto = col1.text_input(
            "Buscar (projeto, analista, prestador, cessionário, código...)", key="arquivo_f_texto",
            help="Busca em todos os campos do registro arquivado.",
        )
        usuario_filtro = col2.text_input("Usuário que arquivou", key="arquivo_f_usuario")
        apenas_teste = col3.checkbox("Somente registros de teste", key="arquivo_f_teste")
        col4, col5 = st.columns(2)
        data_de = col4.date_input("Arquivado a partir de", value=None, format="DD/MM/YYYY", key="arquivo_f_data_de")
        data_ate = col5.date_input("Arquivado até", value=None, format="DD/MM/YYYY", key="arquivo_f_data_ate")
    return texto, usuario_filtro, apenas_teste, data_de, data_ate


def _tab_registros(usuario: dict) -> None:
    opcoes_categoria = {c.rotulo: c for c in CATEGORIAS}
    rotulo_escolhido = st.selectbox("Categoria (tipo de registro)", list(opcoes_categoria.keys()), key="arquivo_categoria")
    categoria = opcoes_categoria[rotulo_escolhido]

    if categoria.reservada:
        st.info(categoria.mensagem_reservada, icon=":material/info:")
        return

    texto, usuario_filtro, apenas_teste, data_de, data_ate = _renderizar_filtros()

    if categoria.granularidade == "projeto_codigo":
        df = listar_codigos_gat_arquivados()
        st.caption(f"{len(df)} projeto(s) GAT totalmente arquivado(s) (todas as análises de Prestadores e Cessionários daquele código).")
        if df.empty:
            st.caption("Nenhum projeto GAT arquivado.")
            return
        pode_restaurar = perfil_pode_arquivar_e_restaurar(usuario.get("perfil"))
        for _, linha in df.iterrows():
            with st.expander(f"Projeto {linha['codigo']}", icon=":material/inventory_2:"):
                st.caption(f"Arquivado em {formatar_datahora_br(linha['arquivado_em'])}")
                if pode_restaurar and st.button("Restaurar projeto", icon=":material/restore:", key=f"arq_restaurar_projeto_{linha['codigo']}"):
                    restaurar_projeto_gat(linha["codigo"], usuario["username"])
                    st.rerun()
        st.caption(
            "A exclusão definitiva de projetos GAT é feita análise por análise, na categoria "
            "\"Análises Arquivadas\" — evita excluir em lote acidentalmente todo o histórico de um projeto."
        )
        return

    if categoria.chave == "analises":
        partes = []
        for tabela_origem in ("prestadores", "cessionarios"):
            parte = listar_arquivados(tabela_origem)
            if not parte.empty:
                parte = parte.copy()
                parte["_tabela_origem"] = tabela_origem
                partes.append(parte)
        df = pd.concat(partes, ignore_index=True) if partes else pd.DataFrame()
        df = _aplicar_filtros(df, texto, usuario_filtro, apenas_teste, data_de, data_ate)
        st.caption(f"{len(df)} análise(s) arquivada(s) (Prestadores + Cessionários).")
        if df.empty:
            st.caption("Nenhuma análise arquivada com os filtros atuais.")
            return
        for _, linha in df.iterrows():
            linha_dict = linha.to_dict()
            _cartao_registro(linha_dict.pop("_tabela_origem"), linha_dict, usuario, sufixo_chave="_analise")
        return

    df = _remover_colunas_sensiveis(listar_arquivados(categoria.tabela))
    df = _aplicar_filtros(df, texto, usuario_filtro, apenas_teste, data_de, data_ate)
    st.caption(f"{len(df)} registro(s) arquivado(s) com os filtros atuais.")
    if df.empty:
        st.caption("Nenhum registro arquivado nesta categoria.")
        return
    for _, linha in df.iterrows():
        _cartao_registro(categoria.tabela, linha.to_dict(), usuario)


def _tab_auditoria(usuario: dict) -> None:
    st.caption("Trilha completa de arquivamentos, restaurações e exclusões definitivas — nunca é apagada.")
    col1, col2 = st.columns(2)
    tipo = col1.selectbox("Tipo de operação", ["Todas", "ARQUIVAMENTO", "RESTAURACAO", "EXCLUSAO_DEFINITIVA"], key="arquivo_aud_tipo")
    origem = col2.selectbox("Origem", ["Todas", "GAT", "PMO"], key="arquivo_aud_origem")
    df = listar_auditoria(
        tipo_operacao=None if tipo == "Todas" else tipo,
        origem=None if origem == "Todas" else origem,
    )
    if df.empty:
        st.caption("Nenhuma operação registrada ainda.")
        return
    st.dataframe(
        formatar_datahoras_df(df, ["data_hora"])[
            ["data_hora", "tipo_operacao", "tabela", "descricao_registro", "usuario", "origem", "justificativa"]
        ].rename(columns={
            "data_hora": "Data/Hora", "tipo_operacao": "Operação", "tabela": "Tabela",
            "descricao_registro": "Registro", "usuario": "Usuário", "origem": "Origem", "justificativa": "Justificativa",
        }),
        use_container_width=True, hide_index=True,
    )

    st.markdown("###### Relatórios (Word)")
    st.caption("Quem executou, quando, o que foi afetado e a justificativa — por tipo de operação.")
    for tipo_relatorio, titulo_relatorio in TITULOS_RELATORIO_ARQUIVO.items():
        auditoria_tipo = listar_auditoria(tipo_operacao=tipo_relatorio)
        if st.button(f"Gerar {titulo_relatorio}", icon=":material/description:", key=f"arquivo_gerar_rel_{tipo_relatorio}"):
            conteudo = gerar_relatorio_arquivo(tipo_relatorio, auditoria_tipo, usuario["username"])
            st.download_button(
                f"Baixar {titulo_relatorio}", data=conteudo, file_name=nome_arquivo_relatorio_arquivo(tipo_relatorio),
                icon=":material/download:", key=f"arquivo_baixar_rel_{tipo_relatorio}",
            )


def render(usuario: dict) -> None:
    exigir_area(usuario, "arquivo")

    st.subheader(":material/inventory_2: Arquivo")
    st.caption(
        "Registros arquivados saem da operação do dia a dia — não aparecem em listas, dashboards, KPIs, "
        "relatórios ou alertas ativos — mas continuam guardados e podem ser restaurados a qualquer momento, "
        "sem perda de dados. A exclusão definitiva só é possível para um registro já arquivado."
    )

    aba_registros, aba_auditoria = st.tabs(["Registros Arquivados", "Auditoria"])
    with aba_registros:
        _tab_registros(usuario)
    with aba_auditoria:
        _tab_auditoria(usuario)
