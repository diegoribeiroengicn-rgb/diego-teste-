"""View: Histórico de Atividades por Login — auditoria de acessos e ações
dos usuários (área restrita historico_atividades). Não expõe senhas/hashes."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.database import listar_atividades, listar_usuarios
from gat.permissions import exigir_area

_TIPOS_EVENTO = [
    "LOGIN", "LOGOUT", "PAGINA", "PROJETO_CRIADO", "PROJETO_EDITADO",
    "AVALIACAO_REALIZADA", "AVALIACAO_EDITADA", "EXPORTACAO", "OPR_GERADO",
]


def render(usuario: dict) -> None:
    exigir_area(usuario, "historico_atividades")

    st.subheader(":material/manage_history: Histórico de Atividades por Login")
    st.caption(
        "Login, logout, páginas acessadas e ações realizadas por usuário. Não registra senhas, "
        "hashes ou qualquer informação sensível."
    )

    usuarios_disponiveis = sorted(listar_usuarios()["username"].tolist())

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        col1, col2, col3 = st.columns(3)
        f_usuario = col1.multiselect("Usuário", usuarios_disponiveis, key="filtro_hist_ativ_usuario")
        f_tipo = col2.multiselect("Tipo de atividade", _TIPOS_EVENTO, key="filtro_hist_ativ_tipo")
        f_modulo = col3.text_input("Módulo/página", key="filtro_hist_ativ_modulo")
        col4, col5 = st.columns(2)
        f_data_ini = col4.date_input("Data inicial", value=None, format="DD/MM/YYYY", key="filtro_hist_ativ_data_ini")
        f_data_fim = col5.date_input("Data final", value=None, format="DD/MM/YYYY", key="filtro_hist_ativ_data_fim")

    df = listar_atividades(
        usuario=f_usuario[0] if len(f_usuario) == 1 else None,
        tipo_evento=f_tipo[0] if len(f_tipo) == 1 else None,
    )
    if df.empty:
        st.info("Nenhuma atividade registrada ainda.")
        return

    if len(f_usuario) > 1:
        df = df[df["usuario"].isin(f_usuario)]
    if len(f_tipo) > 1:
        df = df[df["tipo_evento"].isin(f_tipo)]
    if f_modulo.strip():
        df = df[df["modulo"].fillna("").astype(str).str.contains(f_modulo.strip(), case=False, na=False, regex=False)]
    datas = pd.to_datetime(df["data_hora"], errors="coerce")
    if f_data_ini:
        df = df[datas >= pd.Timestamp(f_data_ini)]
    if f_data_fim:
        df = df[datas <= pd.Timestamp(f_data_fim) + pd.Timedelta(days=1)]

    if df.empty:
        st.warning("Nenhuma atividade encontrada com os filtros aplicados.", icon=":material/search_off:")
        return

    col_m1, col_m2, col_m3 = st.columns(3)
    col_m1.metric("Registros", len(df))
    col_m2.metric("Usuários distintos", df["usuario"].nunique())
    col_m3.metric("Logins no período", int((df["tipo_evento"] == "LOGIN").sum()))

    df_exibicao = df.rename(columns={
        "usuario": "Usuário", "perfil": "Perfil", "tipo_evento": "Tipo de Atividade",
        "modulo": "Módulo/Página", "detalhe": "Detalhe", "data_hora": "Data/Hora",
    })[["Usuário", "Perfil", "Tipo de Atividade", "Módulo/Página", "Detalhe", "Data/Hora"]]
    st.dataframe(df_exibicao, use_container_width=True, hide_index=True)
