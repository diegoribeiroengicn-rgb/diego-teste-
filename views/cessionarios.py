"""View: Análise de Cessionários (Aba B)."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.business_rules import (
    acima_da_meta_revisao,
    enriquecer_cessionarios,
    filtrar_por_competencia,
    situacao_prazo,
    status_avaliacao_obrigatoria,
)
from gat.config import COLUNAS_EXIBICAO_CESSIONARIOS, RESPONSAVEIS, STATUS_ANALISE_OPCOES, TIPO_CESSIONARIO_OPCOES
from gat.database import listar_cessionarios, obter_cessionario, registrar_atividade
from gat.export_projetos import gerar_csv_bytes, gerar_excel_bytes, montar_exportacao_cessionarios, nome_arquivo_exportacao
from gat.permissions import exigir_area, exigir_modulo, pode_area
from gat.ui.filtros import rotulo_competencia, seletor_competencia
from gat.ui.modals import dialog_cessionario
from gat.ui.tables import tabela_com_edicao

_ICONE_SITUACAO_PRAZO = {
    "DENTRO DO PRAZO": "🟢",
    "VENCE EM BREVE": "🟡",
    "VENCE HOJE": "🟠",
    "ATRASADO": "🔴",
}
_LABEL_SITUACAO_PRAZO = {
    "DENTRO DO PRAZO": "Dentro do prazo",
    "VENCE EM BREVE": "Vence em breve",
    "VENCE HOJE": "Vence hoje",
    "ATRASADO": "Atrasado",
}


def _rotulo_situacao_prazo(dias_restantes, revisao) -> str:
    chave = situacao_prazo(int(dias_restantes) if pd.notna(dias_restantes) else None)
    rotulo = f"{_ICONE_SITUACAO_PRAZO[chave]} {_LABEL_SITUACAO_PRAZO[chave]}"
    if acima_da_meta_revisao(revisao):
        rotulo += " · 🟣 Acima da REV2"
    return rotulo


_CHAVES_FILTRO = [
    "filtro_cess_resp", "filtro_cess_status", "filtro_cess_tipo",
    "filtro_cess_pendentes", "filtro_cess_cancelados",
    "filtro_cess_at", "filtro_cess_codigo", "filtro_cess_nome", "filtro_cess_revisao",
]


def render(usuario: dict) -> None:
    exigir_modulo(usuario, "cessionarios")

    st.subheader("Projetos de Cessionários")
    st.caption("Cadastro, edição e consulta. Para indicadores e gráficos, veja Cessionários → Dashboard.")

    if pode_area(usuario, "cessionarios.cadastrar"):
        col_novo, _ = st.columns([1, 4])
        with col_novo:
            if st.button("Novo Cadastro", icon=":material/add:", type="primary", key="novo_cessionario", use_container_width=True):
                dialog_cessionario(usuario["username"])

    if st.session_state.pop("abrir_novo_cessionario", False):
        exigir_area(usuario, "cessionarios.cadastrar")
        dialog_cessionario(usuario["username"])

    df = listar_cessionarios()
    if df.empty:
        st.info("Nenhum registro de cessionário cadastrado ainda. Utilize o botão acima para iniciar.")
        return

    df = enriquecer_cessionarios(df)

    status_default = st.session_state.pop("filtro_cess_status_default", None)
    if status_default is not None:
        st.session_state["filtro_cess_status"] = status_default

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        col1, col2, col3, col4, col5 = st.columns(5)
        f_resp = col1.multiselect("Responsável", RESPONSAVEIS, key="filtro_cess_resp")
        f_status = col2.multiselect("Status Análise", STATUS_ANALISE_OPCOES, key="filtro_cess_status")
        f_tipo = col3.multiselect("Tipo", TIPO_CESSIONARIO_OPCOES, key="filtro_cess_tipo")
        f_pendentes = col4.checkbox("Somente Pendente de Reunião", key="filtro_cess_pendentes")
        f_cancelados = col5.checkbox("Incluir cancelados", value=False, key="filtro_cess_cancelados")

        col7, col8, col9, col10 = st.columns(4)
        f_at = col7.text_input("N° AT", key="filtro_cess_at", placeholder="Ex.: 1524 (busca exata ou parcial)")
        f_codigo = col8.text_input("Código do Cessionário", key="filtro_cess_codigo", placeholder="Ex.: L270 (busca exata ou parcial)")
        f_nome = col9.text_input("Cessionário (nome)", key="filtro_cess_nome", placeholder="Ex.: Empresa ABC")
        f_revisao = col10.text_input("Revisão", key="filtro_cess_revisao", placeholder="Ex.: 2")

        mes, ano = seletor_competencia("filtro_cess_comp")

        col_pesquisar, col_limpar = st.columns([1, 1])
        col_pesquisar.button("Pesquisar", icon=":material/search:", type="primary", key="pesquisar_cess", use_container_width=True)
        if col_limpar.button("Limpar filtros", icon=":material/filter_alt_off:", key="limpar_filtros_cess", use_container_width=True):
            for chave in _CHAVES_FILTRO:
                st.session_state.pop(chave, None)
            st.session_state.pop("filtro_cess_comp_mes", None)
            st.session_state.pop("filtro_cess_comp_ano", None)
            st.rerun()

    df_filtrado = df.copy()
    if not f_cancelados:
        df_filtrado = df_filtrado[df_filtrado["status_analise"] != "CANCELADO"]
    if f_resp:
        df_filtrado = df_filtrado[df_filtrado["responsavel"].isin(f_resp)]
    if f_status:
        df_filtrado = df_filtrado[df_filtrado["status_analise"].isin(f_status)]
    if f_tipo:
        df_filtrado = df_filtrado[df_filtrado["tipo"].isin(f_tipo)]
    if f_pendentes:
        df_filtrado = df_filtrado[df_filtrado["pendente_reuniao"]]
    if f_at.strip():
        df_filtrado = df_filtrado[df_filtrado["num_at"].fillna("").astype(str).str.contains(f_at.strip(), case=False, na=False, regex=False)]
    if f_codigo.strip():
        df_filtrado = df_filtrado[df_filtrado["codigo"].fillna("").astype(str).str.contains(f_codigo.strip(), case=False, na=False, regex=False)]
    if f_nome.strip():
        df_filtrado = df_filtrado[df_filtrado["cessionario"].fillna("").astype(str).str.contains(f_nome.strip(), case=False, na=False, regex=False)]
    if f_revisao.strip():
        df_filtrado = df_filtrado[df_filtrado["revisao"].astype(str).str.strip() == f_revisao.strip()]
    if mes or ano:
        df_filtrado = filtrar_por_competencia(df_filtrado, "data_solicitacao", mes, ano)
        st.caption(f"Competência: **{rotulo_competencia(mes, ano)}** (baseado na Data de Solicitação)")

    df_filtrado = df_filtrado.reset_index(drop=True)

    if df_filtrado.empty:
        st.warning("Nenhum registro encontrado com os filtros aplicados.", icon=":material/search_off:")
        return

    st.caption(f"{len(df_filtrado)} registro(s) encontrados. Ordenação padrão: Item (ordem de chegada).")

    df_filtrado["_situacao_avaliacao"] = status_avaliacao_obrigatoria(df_filtrado, "CESSIONARIO", "cessionario", "codigo", "cessionarios")
    df_filtrado["Avaliação"] = df_filtrado["_situacao_avaliacao"].map(
        {"PENDENTE": "🔴 Avaliação pendente (Rev.01)", "CONCLUIDA": "🟢 Avaliação em dia", "": ""}
    )
    df_filtrado["Situação do Prazo"] = df_filtrado.apply(
        lambda r: _rotulo_situacao_prazo(r["saldo_dias_uteis"], r.get("revisao")), axis=1
    )

    colunas = list(COLUNAS_EXIBICAO_CESSIONARIOS.keys())
    df_exibicao = df_filtrado[[*colunas[:3], "Avaliação", "Situação do Prazo", *colunas[3:]]].rename(columns=COLUNAS_EXIBICAO_CESSIONARIOS)

    def _abrir_edicao(registro: dict) -> None:
        exigir_area(usuario, "cessionarios.editar")
        dialog_cessionario(usuario["username"], registro)

    tabela_com_edicao(
        df_exibicao,
        df_filtrado["id"],
        chave="cessionarios",
        abrir_dialog_edicao=_abrir_edicao,
        obter_registro=obter_cessionario,
    )

    if pode_area(usuario, "cessionarios.exportar"):
        st.markdown("---")
        st.markdown("##### Exportar dados")
        pode_completo = pode_area(usuario, "cessionarios.exportar_completo")
        col_escopo, col_formato = st.columns(2)
        opcoes_escopo = ["Dados filtrados"] + (["Base completa"] if pode_completo else [])
        escopo = col_escopo.selectbox("Escopo da exportação", opcoes_escopo, key="export_cess_escopo")
        formato = col_formato.selectbox("Formato", ["Excel (.xlsx)", "CSV (.csv)"], key="export_cess_formato")

        filtrado = escopo == "Dados filtrados"
        base_exportacao = df_filtrado if filtrado else df
        st.caption(f"Você está prestes a baixar: **{escopo}** — {len(base_exportacao)} registro(s).")

        if st.button("Baixar Projetos de Cessionários", icon=":material/description:", key="export_cess_gerar"):
            exigir_area(usuario, "cessionarios.exportar" if filtrado else "cessionarios.exportar_completo")
            exportacao = montar_exportacao_cessionarios(base_exportacao)
            rotulo_periodo = rotulo_competencia(mes, ano) if (filtrado and (mes or ano)) else None
            if formato.startswith("Excel"):
                conteudo = gerar_excel_bytes(exportacao, "Cessionarios")
                arquivo = nome_arquivo_exportacao("Cessionarios", "xlsx", filtrado, rotulo_periodo)
                mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            else:
                conteudo = gerar_csv_bytes(exportacao)
                arquivo = nome_arquivo_exportacao("Cessionarios", "csv", filtrado, rotulo_periodo)
                mime = "text/csv"
            st.download_button(
                f"Confirmar download — {escopo}", data=conteudo, file_name=arquivo, mime=mime,
                icon=":material/download:", type="primary", use_container_width=True, key="export_cess_baixar",
            )
            registrar_atividade(usuario["username"], usuario.get("perfil"), "EXPORTACAO_PROJETOS", modulo="cessionarios", detalhe=f"{escopo} · {formato}")
