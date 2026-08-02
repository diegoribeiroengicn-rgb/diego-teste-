"""View: Análise de Prestadores (Aba A)."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.business_rules import (
    acima_da_meta_revisao,
    enriquecer_prestadores,
    filtrar_por_competencia,
    situacao_prazo,
    status_avaliacao_obrigatoria,
)
from gat.config import COLUNAS_EXIBICAO_PRESTADORES, RESPONSAVEIS, SLA_PRESTADORES_DIAS_UTEIS, STATUS_ANALISE_OPCOES
from gat.database import listar_prestadores, obter_prestador, registrar_atividade
from gat.export_projetos import gerar_csv_bytes, gerar_excel_bytes, montar_exportacao_prestadores, nome_arquivo_exportacao
from gat.permissions import exigir_area, exigir_modulo, pode_area
from gat.ui.filtros import rotulo_competencia, seletor_competencia
from gat.ui.modals import dialog_prestador
from gat.ui.tables import tabela_com_edicao

SITUACAO_PEP_OPCOES = ["Todos", "Com PEP", "Sem PEP"]

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
    "filtro_prest_resp", "filtro_prest_status", "filtro_prest_pep",
    "filtro_prest_pendentes", "filtro_prest_cancelados",
    "filtro_prest_at", "filtro_prest_codigo", "filtro_prest_nome", "filtro_prest_revisao",
]


def render(usuario: dict) -> None:
    exigir_modulo(usuario, "prestadores")

    st.subheader("Projetos de Prestadores de Serviço")
    st.caption("Cadastro, edição e consulta. Para indicadores e gráficos, veja Prestadores → Dashboard.")

    pode_cadastrar = pode_area(usuario, "prestadores.cadastrar")
    if pode_cadastrar:
        col_novo, _ = st.columns([1, 4])
        with col_novo:
            if st.button("Novo Cadastro", icon=":material/add:", type="primary", key="novo_prestador", use_container_width=True):
                dialog_prestador(usuario["username"])

    if st.session_state.pop("abrir_novo_prestador", False):
        exigir_area(usuario, "prestadores.cadastrar")
        dialog_prestador(usuario["username"])

    df = listar_prestadores()
    if df.empty:
        st.info("Nenhum registro de prestador cadastrado ainda. Utilize o botão acima para iniciar.")
        return

    df = enriquecer_prestadores(df)

    status_default = st.session_state.pop("filtro_prest_status_default", None)
    if status_default is not None:
        st.session_state["filtro_prest_status"] = status_default

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        col1, col2, col3, col4, col5 = st.columns(5)
        f_resp = col1.multiselect("Responsável", RESPONSAVEIS, key="filtro_prest_resp")
        f_status = col2.multiselect("Status Análise", STATUS_ANALISE_OPCOES, key="filtro_prest_status")
        f_pep = col3.selectbox("Situação do PEP", SITUACAO_PEP_OPCOES, key="filtro_prest_pep")
        f_pendentes = col4.checkbox("Somente Pendente de Reunião", key="filtro_prest_pendentes")
        f_cancelados = col5.checkbox("Incluir cancelados", value=False, key="filtro_prest_cancelados")

        col6, col7, col8, col9 = st.columns(4)
        f_at = col6.text_input("N° AT", key="filtro_prest_at", placeholder="Ex.: 1524 (busca exata ou parcial)")
        f_codigo = col7.text_input("Código do Prestador", key="filtro_prest_codigo", placeholder="Ex.: P144 (busca exata ou parcial)")
        f_nome = col8.text_input("Prestador (nome)", key="filtro_prest_nome", placeholder="Ex.: Empresa ABC")
        f_revisao = col9.text_input("Revisão", key="filtro_prest_revisao", placeholder="Ex.: 2")

        mes, ano = seletor_competencia("filtro_prest_comp")

        col_pesquisar, col_limpar = st.columns([1, 1])
        col_pesquisar.button("Pesquisar", icon=":material/search:", type="primary", key="pesquisar_prest", use_container_width=True)
        if col_limpar.button("Limpar filtros", icon=":material/filter_alt_off:", key="limpar_filtros_prest", use_container_width=True):
            for chave in _CHAVES_FILTRO:
                st.session_state.pop(chave, None)
            st.session_state.pop("filtro_prest_comp_mes", None)
            st.session_state.pop("filtro_prest_comp_ano", None)
            st.rerun()

    df_filtrado = df.copy()
    if not f_cancelados:
        df_filtrado = df_filtrado[df_filtrado["status_analise"] != "CANCELADO"]
    if f_resp:
        df_filtrado = df_filtrado[df_filtrado["responsavel"].isin(f_resp)]
    if f_status:
        df_filtrado = df_filtrado[df_filtrado["status_analise"].isin(f_status)]
    if f_pep == "Com PEP":
        df_filtrado = df_filtrado[df_filtrado["tem_pep"]]
    elif f_pep == "Sem PEP":
        df_filtrado = df_filtrado[~df_filtrado["tem_pep"]]
    if f_pendentes:
        df_filtrado = df_filtrado[df_filtrado["pendente_reuniao"]]
    if f_at.strip():
        df_filtrado = df_filtrado[df_filtrado["num_at"].fillna("").astype(str).str.contains(f_at.strip(), case=False, na=False, regex=False)]
    if f_codigo.strip():
        df_filtrado = df_filtrado[df_filtrado["codigo"].fillna("").astype(str).str.contains(f_codigo.strip(), case=False, na=False, regex=False)]
    if f_nome.strip():
        df_filtrado = df_filtrado[df_filtrado["prestador"].fillna("").astype(str).str.contains(f_nome.strip(), case=False, na=False, regex=False)]
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

    df_filtrado["_situacao_avaliacao"] = status_avaliacao_obrigatoria(df_filtrado, "PRESTADOR", "prestador", "codigo", "prestadores")
    df_filtrado["Avaliação"] = df_filtrado["_situacao_avaliacao"].map(
        {"PENDENTE": "🔴 Avaliação pendente (Rev.01)", "CONCLUIDA": "🟢 Avaliação em dia", "": ""}
    )
    df_filtrado["_dias_restantes"] = df_filtrado["sla_dias"].fillna(SLA_PRESTADORES_DIAS_UTEIS) - df_filtrado["dias_uteis_decorridos"]
    df_filtrado["Situação do Prazo"] = df_filtrado.apply(
        lambda r: _rotulo_situacao_prazo(r["_dias_restantes"], r.get("revisao")), axis=1
    )

    colunas = list(COLUNAS_EXIBICAO_PRESTADORES.keys())
    df_exibicao = df_filtrado[[*colunas[:3], "Avaliação", "Situação do Prazo", *colunas[3:]]].rename(columns=COLUNAS_EXIBICAO_PRESTADORES)

    def _abrir_edicao(registro: dict) -> None:
        exigir_area(usuario, "prestadores.editar")
        dialog_prestador(usuario["username"], registro)

    tabela_com_edicao(
        df_exibicao,
        df_filtrado["id"],
        chave="prestadores",
        abrir_dialog_edicao=_abrir_edicao,
        obter_registro=obter_prestador,
    )

    if pode_area(usuario, "prestadores.exportar"):
        st.markdown("---")
        st.markdown("##### Exportar dados")
        pode_completo = pode_area(usuario, "prestadores.exportar_completo")
        col_escopo, col_formato = st.columns(2)
        opcoes_escopo = ["Dados filtrados"] + (["Base completa"] if pode_completo else [])
        escopo = col_escopo.selectbox("Escopo da exportação", opcoes_escopo, key="export_prest_escopo")
        formato = col_formato.selectbox("Formato", ["Excel (.xlsx)", "CSV (.csv)"], key="export_prest_formato")

        filtrado = escopo == "Dados filtrados"
        base_exportacao = df_filtrado if filtrado else df
        st.caption(f"Você está prestes a baixar: **{escopo}** — {len(base_exportacao)} registro(s).")

        if st.button("Baixar Projetos de Prestadores", icon=":material/description:", key="export_prest_gerar"):
            exigir_area(usuario, "prestadores.exportar" if filtrado else "prestadores.exportar_completo")
            exportacao = montar_exportacao_prestadores(base_exportacao)
            rotulo_periodo = rotulo_competencia(mes, ano) if (filtrado and (mes or ano)) else None
            if formato.startswith("Excel"):
                conteudo = gerar_excel_bytes(exportacao, "Prestadores")
                arquivo = nome_arquivo_exportacao("Prestadores", "xlsx", filtrado, rotulo_periodo)
                mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            else:
                conteudo = gerar_csv_bytes(exportacao)
                arquivo = nome_arquivo_exportacao("Prestadores", "csv", filtrado, rotulo_periodo)
                mime = "text/csv"
            st.download_button(
                f"Confirmar download — {escopo}", data=conteudo, file_name=arquivo, mime=mime,
                icon=":material/download:", type="primary", use_container_width=True, key="export_prest_baixar",
            )
            registrar_atividade(usuario["username"], usuario.get("perfil"), "EXPORTACAO_PROJETOS", modulo="prestadores", detalhe=f"{escopo} · {formato}")
