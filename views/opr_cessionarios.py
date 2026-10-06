"""View: One Page Report — Cessionários (infográfico mensal), reproduzindo
o modelo de referência enviado pelo usuário: Contribuição das Disciplinas,
Projetos Liberados no Mês, Cessionários Ativos, Resumo e Acumulado do Ano
(ano selecionado × ano anterior)."""

from __future__ import annotations

import streamlit as st

from gat.business_rules import enriquecer_cessionarios, filtrar_ativos, filtrar_por_competencia
from gat.config import CORES, MESES_PT
from gat.database import listar_cessionarios, listar_cessionarios_ativos, registrar_atividade
from gat.export_pdf import gerar_opr_infografico_cessionarios_pdf
from gat.export_word import figura_para_imagem
from gat.opr_cessionarios_infografico import (
    acumulado_documentos_por_mes,
    grafico_acumulado_ano,
    grafico_disciplinas,
    grafico_liberado_nao_liberado,
    grafico_liberados_por_revisao,
    indicadores_disciplinas,
    indicadores_liberados_por_revisao,
    resumo_mensal,
)
from gat.permissions import exigir_area, exigir_modulo
from gat.ui.filtros import seletor_competencia
from gat.ui.kpi_cards import renderizar_kpis


def render(usuario: dict) -> None:
    exigir_modulo(usuario, "cessionarios")
    exigir_area(usuario, "opr.cessionarios")

    st.subheader(":material/picture_as_pdf: One Page Report — Cessionários")
    st.caption(
        "Infográfico mensal no modelo institucional \"GAT Cessionários\" — selecione o mês/ano desejado."
    )

    mes, ano = seletor_competencia("opr_cess")
    if mes is None or ano is None:
        st.warning("Selecione um Mês e um Ano específicos (não é possível gerar para \"Todos\").", icon=":material/info:")
        return

    df_completo = enriquecer_cessionarios(filtrar_ativos(listar_cessionarios()))
    if df_completo.empty:
        st.info("Nenhum registro ativo de cessionário para exibir.")
        return

    titulo_mes_ano = f"{MESES_PT[mes - 1].upper()} {ano}"

    resumo = resumo_mensal(df_completo, mes, ano)
    df_mes_solicitado = filtrar_por_competencia(df_completo, "data_solicitacao", mes, ano)
    df_mes_concluido = filtrar_por_competencia(df_completo, "data_analise", mes, ano)

    disciplinas = indicadores_disciplinas(df_mes_solicitado)
    por_revisao = indicadores_liberados_por_revisao(df_mes_concluido)
    cessionarios_ativos_df = listar_cessionarios_ativos()
    cessionarios_ativos = list(zip(cessionarios_ativos_df["categoria"], cessionarios_ativos_df["quantidade"])) if not cessionarios_ativos_df.empty else []

    acumulado_atual = acumulado_documentos_por_mes(df_completo, ano)
    acumulado_anterior = acumulado_documentos_por_mes(df_completo, ano - 1)

    st.markdown(f"##### {titulo_mes_ano}")
    renderizar_kpis([
        ("Análises Emitidas", str(resumo["analises_emitidas"]), CORES["navy"]),
        ("Docs Analisados", str(resumo["documentos"]), CORES["azul_2"]),
        ("Adiantados", f"{resumo['adiantados']} ({resumo['adiantados_pct']}%)", CORES["verde"]),
        ("No Prazo", f"{resumo['no_prazo']} ({resumo['no_prazo_pct']}%)", CORES["dourado"]),
        ("Atrasados", f"{resumo['atrasados']} ({resumo['atrasados_pct']}%)", CORES["vermelho"]),
    ])

    col1, col2, col3 = st.columns([1, 1, 1])
    with col1:
        st.plotly_chart(grafico_disciplinas(disciplinas), use_container_width=True)
    with col2:
        st.plotly_chart(grafico_liberados_por_revisao(por_revisao), use_container_width=True)
    with col3:
        st.plotly_chart(grafico_liberado_nao_liberado(resumo["liberados"], resumo["nao_liberados"]), use_container_width=True)
        st.caption("Cessionários Ativos")
        if cessionarios_ativos:
            for categoria, qtd in cessionarios_ativos:
                st.caption(f"• {qtd} {categoria}")
        else:
            st.caption("Nenhum cadastrado — gerencie em Cessionários > Cessionários Ativos.")

    col4, col5 = st.columns(2)
    with col4:
        st.plotly_chart(grafico_acumulado_ano(acumulado_atual, ano), use_container_width=True)
    with col5:
        st.plotly_chart(grafico_acumulado_ano(acumulado_anterior, ano - 1), use_container_width=True)

    if st.button("Gerar PDF", icon=":material/picture_as_pdf:", type="primary", key="opr_cess_gerar_pdf"):
        with st.spinner("Gerando PDF..."):
            imagens = {
                "disciplinas": figura_para_imagem(grafico_disciplinas(disciplinas), largura_px=1100, altura_px=800),
                "revisao": figura_para_imagem(grafico_liberados_por_revisao(por_revisao), largura_px=1100, altura_px=800),
                "liberado_donut": figura_para_imagem(grafico_liberado_nao_liberado(resumo["liberados"], resumo["nao_liberados"]), largura_px=700, altura_px=800),
                "acumulado_atual": figura_para_imagem(grafico_acumulado_ano(acumulado_atual, ano), largura_px=1700, altura_px=750),
                "acumulado_anterior": figura_para_imagem(grafico_acumulado_ano(acumulado_anterior, ano - 1), largura_px=1700, altura_px=750),
            }
            pdf_bytes = gerar_opr_infografico_cessionarios_pdf(titulo_mes_ano, imagens, cessionarios_ativos, resumo)
        st.session_state["opr_cess_pdf"] = pdf_bytes

    pdf_pronto = st.session_state.get("opr_cess_pdf")
    if pdf_pronto:
        if st.download_button(
            "Baixar PDF", data=pdf_pronto, file_name=f"GAT_Cessionarios_OPR_{ano}_{mes:02d}.pdf",
            mime="application/pdf", icon=":material/download:", use_container_width=True, key="opr_cess_baixar",
        ):
            registrar_atividade(usuario["username"], usuario.get("perfil"), "OPR_GERADO", modulo="cessionarios", detalhe=titulo_mes_ano)
