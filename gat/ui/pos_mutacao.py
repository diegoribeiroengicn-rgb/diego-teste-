"""
Ponto único de atualização pós-mutação: chamado depois de qualquer
gravação (criação, edição, arquivamento, restauração, exclusão) em
Prestadores ou Cessionários para garantir que a tela — e, por
consequência, os dashboards, a Visão Geral, o Consolidado e os KPIs dos
Analistas, todos lidos diretamente do banco a cada execução do script —
reflitam imediatamente o novo estado.

A grande maioria das telas não usa `st.cache_data`/`st.cache_resource`:
cada uma já busca os dados novamente do banco a cada rerun, então
`st.rerun()` já é suficiente. A exceção é `gat.export_excel.gerar_relatorio_excel`
(o relatório da barra lateral, cacheado por ser pesado e recalculado em
toda navegação) — este é o único cache hoje no sistema, então é invalidado
aqui explicitamente. Se novos caches forem introduzidos no futuro, este é
o lugar único para limpá-los, em vez de precisar caçar cada tela que grava
dados.
"""

from __future__ import annotations

import streamlit as st


def atualizar_apos_mutacao() -> None:
    """Chamar imediatamente após confirmar no banco a criação, edição,
    arquivamento, restauração ou exclusão de um registro."""
    from gat.export_excel import gerar_relatorio_excel

    gerar_relatorio_excel.clear()
    st.rerun()
