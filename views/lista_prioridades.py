"""Lista de Prioridades (item 7 do módulo de SLA/Prioridades) — único lugar
do sistema em que Prestadores e Cessionários aparecem juntos: reúne todos
os projetos atualmente com nível de prioridade ou SLA reduzido em vigor,
ainda em andamento, com o mapa de calor de prazos (item 9)."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores, filtrar_ativos, montar_lista_prioridades
from gat.config import DISCIPLINAS, RESPONSAVEIS
from gat.database import listar_cessionarios, listar_prestadores, registrar_atividade
from gat.export_pdf import gerar_relatorio_prioridades_pdf
from gat.permissions import exigir_area, pode_area
from gat.ui.formatos import formatar_data_br, formatar_datas_df
from gat.relatorios_prioridades import (
    COLUNAS_RELATORIO_PRIORIDADES,
    gerar_excel_prioridades,
    gerar_word_prioridades_coletivo,
    gerar_word_prioridades_individual,
    nome_arquivo_prioridades,
)

_ICONE_MAPA_CALOR = {"verde": "🟢", "amarelo": "🟡", "laranja": "🟠", "vermelho": "🔴", "roxo": "🟣", "azul": "🔵"}
_LABEL_SITUACAO = {
    "DENTRO DO PRAZO": "Dentro do prazo", "VENCE EM BREVE": "Vence em breve",
    "VENCE HOJE": "Vence hoje", "ATRASADO": "Atrasado", "EM HOLD": "Em HOLD",
}

_CHAVES_FILTRO = [
    "filtro_prio_tipo", "filtro_prio_disciplina", "filtro_prio_responsavel",
    "filtro_prio_origem", "filtro_prio_cor", "filtro_prio_at",
]


def render(usuario: dict) -> None:
    exigir_area(usuario, "lista_prioridades")

    st.subheader(":material/priority_high: Lista de Prioridades")
    st.caption(
        "Único painel do sistema com Prestadores e Cessionários juntos: projetos com Nível de Prioridade "
        "ou SLA reduzido em vigor, ou a até 2 dias úteis do vencimento (vence em 2/1 dia, vence hoje ou já "
        "atrasado), ainda em andamento. Sai automaticamente da lista assim que a análise é concluída "
        "(liberado, não liberado, obsoleto ou cancelado). Ordenada pela condição mais crítica: vencidos, "
        "vence hoje, vence em 1 dia, vence em 2 dias, Nível 1, Nível 2, Nível 3, SLA reduzido, data prevista "
        "mais próxima. Mapa de calor: 🟢 dentro do prazo · 🟡 vence em breve · 🟠 vence hoje · 🔴 atrasado · "
        "🟣 reforço (SLA reduzido ou Nível 1) · 🔵 em HOLD (prioridade formal pausada — nunca conta como atraso)."
    )

    df_prestadores = enriquecer_prestadores(filtrar_ativos(listar_prestadores()))
    df_cessionarios = enriquecer_cessionarios(filtrar_ativos(listar_cessionarios()))
    lista = montar_lista_prioridades(df_prestadores, df_cessionarios)

    if lista.empty:
        st.success("Nenhum projeto prioritário em andamento no momento.")
        return

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        col1, col2, col3 = st.columns(3)
        f_tipo = col1.multiselect("Tipo", ["Prestador", "Cessionário"], key="filtro_prio_tipo")
        f_disciplina = col2.multiselect("Disciplina", DISCIPLINAS, key="filtro_prio_disciplina")
        f_responsavel = col3.multiselect("Responsável", RESPONSAVEIS, key="filtro_prio_responsavel")
        col4, col5, col6 = st.columns(3)
        f_origem = col4.multiselect(
            "Origem da prioridade",
            sorted(lista["origem_prioridade"].dropna().unique().tolist()),
            key="filtro_prio_origem",
        )
        f_cor = col5.multiselect(
            "Mapa de calor", list(_ICONE_MAPA_CALOR.keys()),
            format_func=lambda c: f"{_ICONE_MAPA_CALOR[c]} {c.capitalize()}", key="filtro_prio_cor",
        )
        f_at = col6.text_input("N° AT", key="filtro_prio_at")

        if st.button("Limpar filtros", icon=":material/filter_alt_off:", key="limpar_filtros_prio"):
            for chave in _CHAVES_FILTRO:
                st.session_state.pop(chave, None)
            st.rerun()

    filtrada = lista.copy()
    if f_tipo:
        filtrada = filtrada[filtrada["tipo"].isin(f_tipo)]
    if f_disciplina:
        filtrada = filtrada[filtrada["disciplina"].isin(f_disciplina)]
    if f_responsavel:
        filtrada = filtrada[filtrada["responsavel"].isin(f_responsavel)]
    if f_origem:
        filtrada = filtrada[filtrada["origem_prioridade"].isin(f_origem)]
    if f_cor:
        filtrada = filtrada[filtrada["cor_mapa_calor"].isin(f_cor)]
    if f_at.strip():
        filtrada = filtrada[filtrada["num_at"].fillna("").astype(str).str.contains(f_at.strip(), case=False, na=False, regex=False)]

    if filtrada.empty:
        st.warning("Nenhum registro encontrado com os filtros aplicados.", icon=":material/search_off:")
        return

    col_m1, col_m2, col_m3, col_m4, col_m5 = st.columns(5)
    col_m1.metric("Total prioritários", len(filtrada))
    col_m2.metric("Prestadores", int((filtrada["tipo"] == "Prestador").sum()))
    col_m3.metric("Cessionários", int((filtrada["tipo"] == "Cessionário").sum()))
    col_m4.metric("Atrasados", int((filtrada["situacao_prazo"] == "ATRASADO").sum()))
    col_m5.metric("Em HOLD", int((filtrada["situacao_prazo"] == "EM HOLD").sum()))

    exibicao = formatar_datas_df(filtrada, ["data_solicitacao", "data_limite"])
    exibicao["Mapa de calor"] = exibicao["cor_mapa_calor"].map(_ICONE_MAPA_CALOR)
    exibicao["Situação do prazo"] = exibicao["situacao_prazo"].map(_LABEL_SITUACAO)
    exibicao["SLA reduzido?"] = exibicao["sla_reduzido"].map({True: "Sim", False: "Não"})

    colunas_exibicao = {
        "Mapa de calor": "Mapa de calor", "tipo": "Tipo", "nome_entidade": "Prestador/Cessionário",
        "codigo": "Código", "num_at": "N° AT", "disciplina": "Disciplina", "revisao": "Revisão",
        "responsavel": "Responsável", "motivos_entrada_label": "Motivo(s) de entrada",
        "origem_prioridade": "Origem da prioridade",
        "SLA reduzido?": "SLA reduzido?", "sla_dias": "SLA vigente (dias)", "sla_original": "SLA original (dias)",
        "data_limite": "Data prevista", "dias_restantes": "Dias úteis restantes",
        "Situação do prazo": "Situação do prazo",
        "justificativa_sla": "Justificativa", "status_analise": "Status de análise",
    }
    st.dataframe(
        exibicao.rename(columns=colunas_exibicao)[list(colunas_exibicao.values())],
        hide_index=True, use_container_width=True,
    )

    if pode_area(usuario, "lista_prioridades.relatorios"):
        st.markdown("---")
        st.markdown("##### Relatórios de Prioridades")
        kpis = {
            "Total prioritários": len(filtrada), "Prestadores": int((filtrada["tipo"] == "Prestador").sum()),
            "Cessionários": int((filtrada["tipo"] == "Cessionário").sum()),
            "Atrasados": int((filtrada["situacao_prazo"] == "ATRASADO").sum()),
        }
        aba_coletivo, aba_individual = st.tabs(["Relatório coletivo", "Relatório individual"])

        with aba_coletivo:
            col_xlsx, col_docx, col_pdf = st.columns(3)
            if col_xlsx.button("Gerar Excel", icon=":material/description:", key="prio_gerar_xlsx", use_container_width=True):
                conteudo = gerar_excel_prioridades(filtrada)
                col_xlsx.download_button(
                    "Baixar Excel", data=conteudo, file_name=nome_arquivo_prioridades("coletivo").replace(".docx", ".xlsx"),
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", key="prio_baixar_xlsx",
                )
            if col_docx.button("Gerar Word", icon=":material/description:", key="prio_gerar_docx", use_container_width=True):
                conteudo = gerar_word_prioridades_coletivo(filtrada, kpis, usuario["username"])
                col_docx.download_button(
                    "Baixar Word", data=conteudo, file_name=nome_arquivo_prioridades("coletivo"),
                    mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document", key="prio_baixar_docx",
                )
            if col_pdf.button("Gerar PDF", icon=":material/description:", key="prio_gerar_pdf", use_container_width=True):
                exibicao_pdf = formatar_datas_df(filtrada, ["data_limite"]).rename(columns=COLUNAS_RELATORIO_PRIORIDADES)[list(COLUNAS_RELATORIO_PRIORIDADES.values())]
                conteudo = gerar_relatorio_prioridades_pdf(exibicao_pdf, kpis)
                col_pdf.download_button(
                    "Baixar PDF", data=conteudo, file_name=nome_arquivo_prioridades("coletivo").replace(".docx", ".pdf"),
                    mime="application/pdf", key="prio_baixar_pdf",
                )
            registrar_atividade(usuario["username"], usuario.get("perfil"), "RELATORIO_PRIORIDADES_COLETIVO", modulo="gestao")

        with aba_individual:
            opcoes = {f"{r['tipo']} · {r['nome_entidade']} · AT {r.get('num_at') or '—'}": idx for idx, r in filtrada.iterrows()}
            escolha = st.selectbox("Selecione o projeto", list(opcoes.keys()), key="prio_individual_escolha")
            if escolha:
                registro = filtrada.loc[opcoes[escolha]].to_dict()
                registro_pdf = dict(registro)
                registro_pdf.pop("motivos_entrada", None)
                if registro_pdf.get("data_limite"):
                    registro_pdf["data_limite"] = formatar_data_br(registro_pdf["data_limite"])
                col_docx2, col_pdf2 = st.columns(2)
                if col_docx2.button("Gerar Word", icon=":material/description:", key="prio_gerar_docx_ind", use_container_width=True):
                    conteudo = gerar_word_prioridades_individual(registro, usuario["username"])
                    col_docx2.download_button(
                        "Baixar Word", data=conteudo,
                        file_name=nome_arquivo_prioridades("individual", str(registro.get("codigo") or registro.get("num_at") or "projeto")),
                        mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document", key="prio_baixar_docx_ind",
                    )
                if col_pdf2.button("Gerar PDF", icon=":material/description:", key="prio_gerar_pdf_ind", use_container_width=True):
                    conteudo = gerar_relatorio_prioridades_pdf(pd.DataFrame(), {}, individual=registro_pdf)
                    col_pdf2.download_button(
                        "Baixar PDF", data=conteudo,
                        file_name=nome_arquivo_prioridades("individual", str(registro.get("codigo") or registro.get("num_at") or "projeto")).replace(".docx", ".pdf"),
                        mime="application/pdf", key="prio_baixar_pdf_ind",
                    )
                registrar_atividade(usuario["username"], usuario.get("perfil"), "RELATORIO_PRIORIDADES_INDIVIDUAL", modulo="gestao", detalhe=escolha)
