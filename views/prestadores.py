"""View: Análise de Prestadores (Aba A)."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.business_rules import (
    NIVEL_ALERTA_ATRASO_ICONES,
    NIVEL_ALERTA_ATRASO_LABELS,
    acima_da_meta_revisao,
    classificacao_atraso,
    dias_restantes_prioridade,
    enriquecer_prestadores,
    filtrar_por_competencia,
    filtrar_por_intervalo_datas,
    nivel_alerta_atraso,
    situacao_prazo,
    status_avaliacao_obrigatoria,
)
from gat.config import COLUNAS_EXIBICAO_PRESTADORES, RESPONSAVEIS, SLA_PRESTADORES_DIAS_UTEIS, STATUS_ANALISE_OPCOES
from gat.database import listar_prestadores, obter_prestador, registrar_atividade
from gat.export_projetos import gerar_csv_bytes, gerar_excel_bytes, montar_exportacao_prestadores, nome_arquivo_exportacao
from gat.normalizacao import booleano_seguro, calculo_seguro
from gat.permissions import exigir_area, exigir_modulo, pode_area
from gat.ui.filtros import rotulo_periodo_filtro, seletor_periodo
from gat.ui.formatos import formatar_datas_df
from gat.ui.modals import dialog_prestador
from gat.ui.tables import tabela_com_edicao

_COLUNAS_DATA_PRESTADORES = ["data_solicitacao", "data_limite", "data_analise", "hold_inicio", "hold_fim"]

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


def _rotulo_nivel_alerta_atraso(status_analise, status_entrega_calc, dias_restantes, em_hold=False) -> str:
    if booleano_seguro(em_hold):
        return "Em HOLD"
    classificacao = classificacao_atraso(status_analise, status_entrega_calc)
    if classificacao == "CONCLUIDO_COM_ATRASO":
        return "🟠 Concluído com atraso"
    if classificacao == "CONCLUIDO_NO_PRAZO":
        return "🟢 Concluído no prazo"
    if classificacao == "FORA_DA_CONTAGEM":
        return "—"
    nivel = nivel_alerta_atraso(int(dias_restantes) if pd.notna(dias_restantes) else None)
    return f"{NIVEL_ALERTA_ATRASO_ICONES[nivel]} {NIVEL_ALERTA_ATRASO_LABELS[nivel]}"

_CHAVES_FILTRO = [
    "filtro_prest_resp", "filtro_prest_status", "filtro_prest_pep",
    "filtro_prest_pendentes", "filtro_prest_cancelados", "filtro_prest_atraso",
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
                dialog_prestador(usuario["username"], pode_definir_prioridade=pode_area(usuario, "prioridades.definir"))

    if st.session_state.pop("abrir_novo_prestador", False):
        exigir_area(usuario, "prestadores.cadastrar")
        dialog_prestador(usuario["username"], pode_definir_prioridade=pode_area(usuario, "prioridades.definir"))

    df = listar_prestadores()
    if df.empty:
        st.info("Nenhum registro de prestador cadastrado ainda. Utilize o botão acima para iniciar.")
        return

    df = enriquecer_prestadores(df)

    status_default = st.session_state.pop("filtro_prest_status_default", None)
    if status_default is not None:
        st.session_state["filtro_prest_status"] = status_default
    if st.session_state.pop("filtro_atraso_prestadores_default", False):
        st.session_state["filtro_prest_atraso"] = True

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        col1, col2, col3, col4, col5 = st.columns(5)
        f_resp = col1.multiselect("Responsável", RESPONSAVEIS, key="filtro_prest_resp")
        f_status = col2.multiselect("Status Análise", STATUS_ANALISE_OPCOES, key="filtro_prest_status")
        f_pep = col3.selectbox("Situação do PEP", SITUACAO_PEP_OPCOES, key="filtro_prest_pep")
        f_pendentes = col4.checkbox("Somente Pendente de Reunião", key="filtro_prest_pendentes")
        f_cancelados = col5.checkbox("Incluir cancelados", value=False, key="filtro_prest_cancelados")
        f_atraso = st.checkbox("🟥 Somente atrasados em análise", key="filtro_prest_atraso")

        col6, col7, col8, col9 = st.columns(4)
        f_at = col6.text_input("N° AT", key="filtro_prest_at", placeholder="Ex.: 1524 (busca exata ou parcial)")
        f_codigo = col7.text_input("Código do Prestador", key="filtro_prest_codigo", placeholder="Ex.: P144 (busca exata ou parcial)")
        f_nome = col8.text_input("Prestador (nome)", key="filtro_prest_nome", placeholder="Ex.: Empresa ABC")
        f_revisao = col9.text_input("Revisão", key="filtro_prest_revisao", placeholder="Ex.: 2")

        mes, ano, data_inicio, data_fim = seletor_periodo("filtro_prest_comp", "Data de Solicitação")

        col_pesquisar, col_limpar = st.columns([1, 1])
        col_pesquisar.button("Pesquisar", icon=":material/search:", type="primary", key="pesquisar_prest", use_container_width=True)
        if col_limpar.button("Limpar filtros", icon=":material/filter_alt_off:", key="limpar_filtros_prest", use_container_width=True):
            for chave in _CHAVES_FILTRO:
                st.session_state.pop(chave, None)
            for sufixo in ("_tipo", "_mes", "_ano", "_data_ini", "_data_fim"):
                st.session_state.pop(f"filtro_prest_comp{sufixo}", None)
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
    if data_inicio or data_fim:
        df_filtrado = filtrar_por_intervalo_datas(df_filtrado, "data_solicitacao", data_inicio, data_fim)
        st.caption(f"Período: **{rotulo_periodo_filtro(mes, ano, data_inicio, data_fim)}** (baseado na Data de Solicitação)")
    elif mes or ano:
        df_filtrado = filtrar_por_competencia(df_filtrado, "data_solicitacao", mes, ano)
        st.caption(f"Competência: **{rotulo_periodo_filtro(mes, ano, data_inicio, data_fim)}** (baseado na Data de Solicitação)")

    if f_atraso:
        mascara_atrasado = df_filtrado.apply(
            lambda r: classificacao_atraso(
                r.get("status_analise"), r.get("status_entrega_calc"), em_hold=booleano_seguro(r.get("em_hold")),
            ) == "ATIVO_ATRASADO",
            axis=1,
        )
        df_filtrado = df_filtrado[mascara_atrasado]

    df_filtrado = df_filtrado.reset_index(drop=True)

    if df_filtrado.empty:
        st.warning("Nenhum registro encontrado com os filtros aplicados.", icon=":material/search_off:")
        return

    if f_atraso:
        df_filtrado["_dias_restantes_ordenacao"] = df_filtrado.apply(
            lambda r: calculo_seguro(dias_restantes_prioridade, r, "prestadores", contexto="dias_restantes_prioridade"), axis=1,
        )
        df_filtrado["_dias_atraso_ordenacao"] = -df_filtrado["_dias_restantes_ordenacao"].fillna(0).astype(int)
        df_filtrado["_ordem_nivel"] = df_filtrado["nivel_prioridade"].map({1: 0, 2: 1, 3: 2}).fillna(3)
        df_filtrado["_ordem_sla_reduzido"] = (~df_filtrado["sla_reduzido"].fillna(False).astype(bool)).astype(int)
        df_filtrado = df_filtrado.sort_values(
            by=["_dias_atraso_ordenacao", "_ordem_nivel", "_ordem_sla_reduzido", "data_limite"],
            ascending=[False, True, True, True],
        ).drop(columns=["_dias_restantes_ordenacao", "_dias_atraso_ordenacao", "_ordem_nivel", "_ordem_sla_reduzido"]).reset_index(drop=True)
        st.caption(f"{len(df_filtrado)} registro(s) atrasados. Ordenação: maior atraso primeiro, depois prioridade (Nível 1/2/3) e SLA reduzido.")
    else:
        st.caption(f"{len(df_filtrado)} registro(s) encontrados. Ordenação padrão: Item (ordem de chegada).")

    df_filtrado["_situacao_avaliacao"] = status_avaliacao_obrigatoria(df_filtrado, "PRESTADOR", "prestador", "codigo", "prestadores")
    df_filtrado["Avaliação"] = df_filtrado["_situacao_avaliacao"].map(
        {"PENDENTE": "🔴 Avaliação pendente (Rev.01)", "CONCLUIDA": "🟢 Avaliação em dia", "": ""}
    )
    df_filtrado["_dias_restantes"] = df_filtrado["sla_dias"].fillna(SLA_PRESTADORES_DIAS_UTEIS) - df_filtrado["dias_uteis_decorridos"]
    df_filtrado["Situação do Prazo"] = df_filtrado.apply(
        lambda r: _rotulo_situacao_prazo(r["_dias_restantes"], r.get("revisao")), axis=1
    )
    df_filtrado["Nível de Atraso"] = df_filtrado.apply(
        lambda r: _rotulo_nivel_alerta_atraso(r.get("status_analise"), r.get("status_entrega_calc"), r["_dias_restantes"], r.get("em_hold")), axis=1
    )

    colunas = list(COLUNAS_EXIBICAO_PRESTADORES.keys())
    df_para_exibicao = formatar_datas_df(df_filtrado, _COLUNAS_DATA_PRESTADORES)
    df_exibicao = df_para_exibicao[[*colunas[:3], "Avaliação", "Situação do Prazo", "Nível de Atraso", *colunas[3:]]].rename(columns=COLUNAS_EXIBICAO_PRESTADORES)

    def _abrir_edicao(registro: dict) -> None:
        exigir_area(usuario, "prestadores.editar")
        dialog_prestador(usuario["username"], registro, pode_definir_prioridade=pode_area(usuario, "prioridades.definir"))

    tabela_com_edicao(
        df_exibicao,
        df_filtrado["id"],
        chave="prestadores",
        abrir_dialog_edicao=_abrir_edicao,
        obter_registro=obter_prestador,
        tabela_arquivo="prestadores",
        usuario=usuario,
        descricao_arquivo=lambda r: f"{r.get('codigo')} — {r.get('prestador')} (AT {r.get('num_at')})",
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
            tem_periodo = filtrado and (mes or ano or data_inicio or data_fim)
            rotulo_periodo = rotulo_periodo_filtro(mes, ano, data_inicio, data_fim) if tem_periodo else None
            cabecalho_periodo = f"Período analisado: {rotulo_periodo}" if tem_periodo else None
            if formato.startswith("Excel"):
                conteudo = gerar_excel_bytes(exportacao, "Prestadores", cabecalho=cabecalho_periodo)
                arquivo = nome_arquivo_exportacao("Prestadores", "xlsx", filtrado, rotulo_periodo)
                mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            else:
                conteudo = gerar_csv_bytes(exportacao, cabecalho=cabecalho_periodo)
                arquivo = nome_arquivo_exportacao("Prestadores", "csv", filtrado, rotulo_periodo)
                mime = "text/csv"
            st.download_button(
                f"Confirmar download — {escopo}", data=conteudo, file_name=arquivo, mime=mime,
                icon=":material/download:", type="primary", use_container_width=True, key="export_prest_baixar",
            )
            registrar_atividade(usuario["username"], usuario.get("perfil"), "EXPORTACAO_PROJETOS", modulo="prestadores", detalhe=f"{escopo} · {formato}")
