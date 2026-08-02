"""Painel de KPIs de Indicadores de Atraso (item 4/5 da modificação de
indicadores de atraso e Alerta Máximo) — reaproveitado pelos dashboards de
Prestadores, Cessionários e Consolidado."""

from __future__ import annotations

import streamlit as st

from gat.business_rules import resumo_indicadores_atraso
from gat.config import CORES
from gat.ui.kpi_cards import renderizar_kpis


def renderizar_kpis_atraso(df, modulo: str, url_path_lista: str | None = None, chave_prefixo: str = "") -> None:
    """
    Renderiza a sequência de KPIs de atraso na ordem exigida: Em análise,
    Dentro do prazo, Próximos do vencimento, Atrasados em análise (com
    destaque visual superior e link para a lista filtrada), Concluídos no
    prazo, Concluídos com atraso, e por último o Total de Projetos
    Atrasados (soma dos ativos atrasados com os concluídos com atraso).
    """
    resumo = resumo_indicadores_atraso(df, modulo)

    st.markdown("##### Indicadores de Atraso")
    renderizar_kpis([
        ("Em Análise", str(resumo["em_analise"]), CORES["azul_2"]),
        ("Dentro do Prazo", str(resumo["dentro_prazo"]), CORES["verde"]),
        ("Próximos do Vencimento", str(resumo["proximo_vencimento"]), CORES["dourado"]),
    ])

    col_card, col_acao = st.columns([3, 1])
    with col_card:
        st.markdown(
            f"""
            <div style="border:2px solid {CORES['vermelho']};border-radius:10px;padding:14px 16px;
                        background:#FEF2F2;">
                <div style="font-size:0.8rem;color:#7F1D1D;font-weight:700;text-transform:uppercase;">
                    🟥 Atrasados em Análise — requer ação imediata
                </div>
                <div style="font-size:2.1rem;font-weight:800;color:{CORES['vermelho']};line-height:1.2;">
                    {resumo['atrasados_em_analise']}
                </div>
                <div style="font-size:0.8rem;color:#7F1D1D;">
                    {resumo['percentual_atrasados_em_analise']}% dos projetos ativos deste módulo
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with col_acao:
        st.write("")
        st.write("")
        if url_path_lista and st.button(
            "Ver lista", icon=":material/arrow_forward:", type="primary", key=f"{chave_prefixo}_ver_atrasados",
            use_container_width=True, disabled=resumo["atrasados_em_analise"] == 0,
        ):
            st.session_state[f"filtro_atraso_{modulo}_default"] = True
            pagina = st.session_state.get("_gat_paginas", {}).get(url_path_lista)
            if pagina is not None:
                st.switch_page(pagina)
            else:
                st.rerun()

    renderizar_kpis([
        ("Concluídos no Prazo", str(resumo["concluidos_no_prazo"]), CORES["verde"]),
        ("Concluídos com Atraso", str(resumo["concluidos_com_atraso"]), CORES["laranja"]),
    ])

    st.markdown(
        f"""
        <div style="border:1px solid {CORES['borda_forte']};border-radius:10px;padding:12px 16px;margin-top:4px;">
            <div style="font-size:0.8rem;color:{CORES['texto_fraco']};font-weight:700;text-transform:uppercase;">
                Total de Projetos Atrasados
            </div>
            <div style="font-size:1.7rem;font-weight:800;color:{CORES['texto']};">
                {resumo['total_atrasados']}
            </div>
            <div style="font-size:0.75rem;color:{CORES['texto_fraco']};">
                Atrasados em análise ({resumo['atrasados_em_analise']}) + Concluídos com atraso ({resumo['concluidos_com_atraso']})
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
