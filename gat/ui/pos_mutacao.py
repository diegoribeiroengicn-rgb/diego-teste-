"""
Ponto único de atualização pós-mutação: chamado depois de qualquer
gravação (criação, edição, arquivamento, restauração, exclusão) em
Prestadores ou Cessionários para garantir que a tela — e, por
consequência, os dashboards, a Visão Geral, o Consolidado e os KPIs dos
Analistas, todos lidos diretamente do banco a cada execução do script —
reflitam imediatamente o novo estado.

Hoje o sistema não usa `st.cache_data`/`st.cache_resource` em lugar
nenhum: cada tela já busca os dados novamente do banco a cada rerun, então
`st.rerun()` já é suficiente. Esta função centraliza esse único passo para
que, se uma camada de cache vier a ser introduzida no futuro, exista um
só lugar para invalidá-la — em vez de precisar caçar cada tela que grava
dados.
"""

from __future__ import annotations

import streamlit as st


def atualizar_apos_mutacao() -> None:
    """Chamar imediatamente após confirmar no banco a criação, edição,
    arquivamento, restauração ou exclusão de um registro."""
    st.rerun()
