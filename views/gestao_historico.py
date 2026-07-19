"""View: Gestão > Histórico (auditoria de Reuniões e Planos de Ação)."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.database import listar_historico
from gat.permissions import exigir_area


def render(usuario: dict) -> None:
    exigir_area(usuario, "reunioes")

    st.subheader(":material/history: Histórico da Gestão")
    st.caption("Auditoria de todas as movimentações de Reuniões e Planos de Ação: criação, edição e conclusão.")

    filtro_tabela = st.selectbox("Tipo", ["Todos", "Reuniões", "Planos de Ação"])

    if filtro_tabela == "Reuniões":
        df_hist = listar_historico("reunioes")
    elif filtro_tabela == "Planos de Ação":
        df_hist = listar_historico("planos_acao")
    else:
        df_hist = pd.concat([listar_historico("reunioes"), listar_historico("planos_acao")], ignore_index=True)
        if not df_hist.empty:
            df_hist = df_hist.sort_values("data_hora", ascending=False).reset_index(drop=True)

    if df_hist.empty:
        st.info("Nenhuma movimentação registrada ainda.")
        return

    st.dataframe(
        df_hist.rename(columns={
            "tabela": "Tipo", "registro_id": "ID", "campo": "Campo",
            "valor_anterior": "Valor Anterior", "valor_novo": "Valor Novo",
            "usuario": "Usuário", "data_hora": "Data/Hora",
        }),
        use_container_width=True,
        hide_index=True,
    )
