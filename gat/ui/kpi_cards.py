"""Componentes de cartões de KPI no padrão visual Tecnoplano."""

from __future__ import annotations

import streamlit as st

from gat.styles import kpi_card_html


def renderizar_kpis(itens: list[tuple[str, str, str | None]]) -> None:
    """
    Renderiza uma linha de cartões de KPI.

    `itens` é uma lista de tuplas (label, valor, cor_hex_opcional).
    """
    colunas = st.columns(len(itens))
    for coluna, (label, valor, cor) in zip(colunas, itens):
        with coluna:
            st.markdown(kpi_card_html(label, valor, cor), unsafe_allow_html=True)
