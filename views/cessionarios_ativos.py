"""View: Cessionários Ativos — lista mantida manualmente pelo administrador
(categoria + quantidade, ex.: "Locadora Ext." = 2), exibida no One Page
Report de Cessionários. Não é derivada dos projetos de análise — é
informação operacional (quais espaços/operações estão ativos agora), sem
fonte estruturada própria no sistema até este sub-módulo existir."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.database import (
    atualizar_cessionario_ativo,
    excluir_cessionario_ativo,
    inserir_cessionario_ativo,
    listar_cessionarios_ativos,
    reordenar_cessionarios_ativos,
)
from gat.permissions import exigir_area, exigir_modulo


def render(usuario: dict) -> None:
    exigir_modulo(usuario, "cessionarios")
    exigir_area(usuario, "cessionarios.cadastro_mestre")

    st.subheader(":material/store: Cessionários Ativos")
    st.caption(
        "Lista mantida manualmente — quais categorias de cessionário estão ativas agora e em que "
        "quantidade (ex.: \"Locadora Ext.\" = 2). Usada no One Page Report de Cessionários; não é "
        "calculada a partir dos projetos de análise."
    )

    df = listar_cessionarios_ativos()

    editado = st.data_editor(
        df[["id", "categoria", "quantidade"]] if not df.empty else pd.DataFrame(columns=["id", "categoria", "quantidade"]),
        column_config={
            "id": None,
            "categoria": st.column_config.TextColumn("Categoria", required=True, help='Ex.: "Locadora Ext.", "Sala VIP", "Loja FB"'),
            "quantidade": st.column_config.NumberColumn("Quantidade", min_value=0, step=1, required=True),
        },
        hide_index=True, use_container_width=True, num_rows="dynamic", key="cessionarios_ativos_editor",
    )

    if st.button("Salvar", icon=":material/save:", type="primary", key="cessionarios_ativos_salvar"):
        ids_originais = set(df["id"]) if not df.empty else set()
        ids_mantidos: list[int] = []

        for _, linha in editado.iterrows():
            categoria = str(linha.get("categoria") or "").strip()
            if not categoria:
                continue
            quantidade = int(linha.get("quantidade") or 0)
            registro_id = linha.get("id")
            if pd.notna(registro_id) and int(registro_id) in ids_originais:
                registro_id = int(registro_id)
                original = df[df["id"] == registro_id].iloc[0]
                if original["categoria"] != categoria or int(original["quantidade"]) != quantidade:
                    atualizar_cessionario_ativo(registro_id, categoria, quantidade, usuario["username"])
                ids_mantidos.append(registro_id)
            else:
                novo_id = inserir_cessionario_ativo(categoria, quantidade, usuario["username"])
                ids_mantidos.append(novo_id)

        for removido_id in ids_originais - set(ids_mantidos):
            excluir_cessionario_ativo(int(removido_id))

        reordenar_cessionarios_ativos(ids_mantidos)
        st.success("Lista de Cessionários Ativos atualizada com sucesso.")
        st.rerun()

    if not df.empty:
        st.caption(f"Total de categorias: {len(df)} — soma das quantidades: {int(df['quantidade'].sum())}.")
