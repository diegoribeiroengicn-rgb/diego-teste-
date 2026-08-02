"""View: Gestão > Reuniões."""

from __future__ import annotations

import streamlit as st

from gat.business_rules import filtrar_por_competencia
from gat.database import listar_planos_da_reuniao, listar_reunioes, obter_reuniao
from gat.permissions import exigir_area
from gat.ui.filtros import rotulo_competencia, seletor_competencia
from gat.ui.formatos import formatar_data_br, formatar_datas_df
from gat.ui.kpi_cards import renderizar_kpis
from gat.ui.modals_gestao import dialog_plano_acao, dialog_reuniao


def render(usuario: dict) -> None:
    exigir_area(usuario, "reunioes")

    st.subheader(":material/groups: Reuniões")
    st.caption("Reuniões de alinhamento vinculadas a um ou mais projetos de Prestadores e/ou Cessionários.")

    col_novo, _ = st.columns([1, 4])
    with col_novo:
        if st.button("Nova Reunião", icon=":material/add:", type="primary", key="nova_reuniao", use_container_width=True):
            dialog_reuniao(usuario["username"])

    df = listar_reunioes()
    if df.empty:
        st.info("Nenhuma reunião registrada ainda. Utilize o botão acima para iniciar.")
        return

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        mes, ano = seletor_competencia("reunioes_comp", "Competência (Data Prevista)")

    df_filtrado = filtrar_por_competencia(df, "data_prevista", mes, ano)
    if df_filtrado.empty:
        st.warning(
            f"Nenhuma reunião encontrada em {rotulo_competencia(mes, ano)}.",
            icon=":material/search_off:",
        )
        return

    total = len(df_filtrado)
    realizadas = int(df_filtrado["data_realizada"].notna().sum())
    previstas = total - realizadas
    renderizar_kpis([
        ("Total de Reuniões", str(total), None),
        ("Realizadas", str(realizadas), None),
        ("Previstas / Não realizadas", str(previstas), None),
    ])

    st.markdown("#####")

    for _, linha in df_filtrado.iterrows():
        status_txt = "Realizada" if linha["data_realizada"] else "Prevista"
        data_prevista_rotulo = formatar_data_br(linha["data_prevista"]) or "s/ data"
        with st.expander(f"{linha['titulo']} — {status_txt} ({data_prevista_rotulo})", icon=":material/event:"):
            reuniao = obter_reuniao(int(linha["id"]))
            col_a, col_b = st.columns(2)
            with col_a:
                st.markdown(f"**Pauta:** {reuniao.get('pauta') or '-'}")
                st.markdown(f"**Data Prevista:** {formatar_data_br(reuniao.get('data_prevista')) or '-'}")
                st.markdown(f"**Data Realizada:** {formatar_data_br(reuniao.get('data_realizada')) or '-'}")
                participantes = reuniao.get("participantes") or []
                st.markdown(f"**Participantes:** {', '.join(participantes) if participantes else '-'}")
            with col_b:
                projetos = reuniao.get("projetos") or []
                st.markdown("**Projetos vinculados:**")
                if projetos:
                    for p in projetos:
                        origem = "Prestador" if p["modulo"] == "prestadores" else "Cessionário"
                        nome_projeto = p["nome"] or f"#{p['projeto_id']}"
                        st.markdown(f"- [{origem}] {nome_projeto}")
                else:
                    st.caption("Nenhum projeto vinculado.")

            if reuniao.get("ata"):
                st.markdown("**Ata:**")
                st.write(reuniao["ata"])
            if reuniao.get("decisoes"):
                st.markdown("**Decisões:**")
                st.write(reuniao["decisoes"])

            df_planos = listar_planos_da_reuniao(int(linha["id"]))
            st.markdown("**Planos de ação desta reunião:**")
            if df_planos.empty:
                st.caption("Nenhum plano de ação vinculado.")
            else:
                st.dataframe(
                    formatar_datas_df(df_planos, ["prazo"])[["descricao", "responsavel", "prazo", "status"]].rename(columns={
                        "descricao": "Descrição", "responsavel": "Responsável", "prazo": "Prazo", "status": "Status",
                    }),
                    use_container_width=True,
                    hide_index=True,
                )

            col_editar, col_novo_plano = st.columns(2)
            with col_editar:
                if st.button("Editar reunião", icon=":material/edit:", key=f"editar_reuniao_{linha['id']}", use_container_width=True):
                    dialog_reuniao(usuario["username"], reuniao)
            with col_novo_plano:
                if st.button("Novo plano de ação", icon=":material/add_task:", key=f"novo_plano_{linha['id']}", use_container_width=True):
                    dialog_plano_acao(usuario["username"], reuniao_id_padrao=int(linha["id"]))
