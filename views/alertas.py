"""View: Alertas Críticos — Projetos Pendente de Reunião (gargalos)."""

from __future__ import annotations

import streamlit as st

from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores, filtrar_ativos
from gat.config import COLUNAS_EXIBICAO_CESSIONARIOS, COLUNAS_EXIBICAO_PRESTADORES, META_REVISAO_APROVACAO
from gat.database import listar_cessionarios, listar_prestadores


def render(usuario: dict) -> None:
    st.subheader(":material/notifications_active: Alertas Críticos — Pendente de Reunião")
    st.caption(
        f"Projetos com status **NÃO LIBERADO** e revisão igual ou superior à meta corporativa "
        f"(**REV{META_REVISAO_APROVACAO}**) são categorizados como gargalos críticos e exigem reunião de alinhamento."
    )

    df_prest = enriquecer_prestadores(filtrar_ativos(listar_prestadores()))
    df_cess = enriquecer_cessionarios(filtrar_ativos(listar_cessionarios()))

    pendentes_prest = df_prest[df_prest["pendente_reuniao"]] if not df_prest.empty else df_prest
    pendentes_cess = df_cess[df_cess["pendente_reuniao"]] if not df_cess.empty else df_cess

    col1, col2 = st.columns(2)
    col1.metric("Prestadores pendentes de reunião", len(pendentes_prest))
    col2.metric("Cessionários pendentes de reunião", len(pendentes_cess))

    st.markdown("#### Prestadores")
    if pendentes_prest.empty:
        st.success("Nenhum projeto de prestador pendente de reunião no momento.")
    else:
        colunas = list(COLUNAS_EXIBICAO_PRESTADORES.keys())
        st.dataframe(
            pendentes_prest[colunas].rename(columns=COLUNAS_EXIBICAO_PRESTADORES),
            use_container_width=True,
            hide_index=True,
        )

    st.markdown("#### Cessionários")
    if pendentes_cess.empty:
        st.success("Nenhum projeto de cessionário pendente de reunião no momento.")
    else:
        colunas = list(COLUNAS_EXIBICAO_CESSIONARIOS.keys())
        st.dataframe(
            pendentes_cess[colunas].rename(columns=COLUNAS_EXIBICAO_CESSIONARIOS),
            use_container_width=True,
            hide_index=True,
        )
