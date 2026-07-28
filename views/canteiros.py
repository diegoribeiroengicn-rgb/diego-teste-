"""View: Painel de Canteiros — cartões e KPIs automáticos das obras
marcadas como canteiro no Cadastro de Prestadores. Somente leitura (a
edição da obra continua em Cadastro de Prestadores); os KPIs são
calculados a partir dos projetos do módulo Projetos já vinculados a cada
canteiro (via `obra_id`), sem exigir nenhuma digitação manual adicional."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.business_rules import enriquecer_prestadores, filtrar_ativos
from gat.config import CORES
from gat.database import listar_cadastro_prestadores, listar_obras_prestador, listar_prestadores, nome_exibicao_obra
from gat.permissions import exigir_modulo
from gat.ui.kpi_cards import renderizar_kpis

_STATUS_OPCOES = ["Todos", "ATIVA", "INATIVA"]


def render(usuario: dict) -> None:
    exigir_modulo(usuario, "prestadores")

    st.subheader(":material/construction: Painel de Canteiros")
    st.caption(
        "Cartões automáticos das obras marcadas como canteiro no Cadastro de Prestadores, com indicadores "
        "calculados a partir dos projetos já vinculados no módulo Projetos. Para editar uma obra/canteiro, "
        "use Prestadores → Cadastro."
    )

    obras = listar_obras_prestador()
    canteiros = obras[obras["e_canteiro"] == 1].copy() if not obras.empty else obras
    if canteiros.empty:
        st.info("Nenhum canteiro cadastrado ainda. Marque uma obra como canteiro em Prestadores → Cadastro.")
        return

    cadastros = listar_cadastro_prestadores()
    mapa_prestador = cadastros.set_index("id").to_dict("index") if not cadastros.empty else {}

    projetos = enriquecer_prestadores(filtrar_ativos(listar_prestadores()))

    with st.expander("Filtros", icon=":material/filter_list:", expanded=False):
        col1, col2 = st.columns(2)
        f_nome = col1.text_input("Pesquisar por nome do canteiro", key="cant_f_nome")
        f_status = col2.selectbox("Status da obra", _STATUS_OPCOES, key="cant_f_status")

    filtrado = canteiros.copy()
    if f_nome.strip():
        filtrado = filtrado[filtrado["nome_obra"].fillna("").str.contains(f_nome.strip(), case=False, na=False, regex=False)]
    if f_status != "Todos":
        filtrado = filtrado[filtrado["status"] == f_status]

    if filtrado.empty:
        st.warning("Nenhum canteiro encontrado com os critérios de busca.", icon=":material/search_off:")
        return

    ids_canteiros = set(filtrado["id"])
    projetos_canteiros = projetos[projetos.get("obra_id").isin(ids_canteiros)] if not projetos.empty and "obra_id" in projetos.columns else pd.DataFrame()

    total_canteiros = len(filtrado)
    total_projetos = len(projetos_canteiros)
    total_atrasados = int((projetos_canteiros["status_entrega_calc"] == "ATRASADO").sum()) if not projetos_canteiros.empty else 0
    total_sem_pep = int((~projetos_canteiros["tem_pep"]).sum()) if not projetos_canteiros.empty else 0

    renderizar_kpis([
        ("Canteiros", str(total_canteiros), CORES["navy"]),
        ("Projetos vinculados", str(total_projetos), CORES["azul_2"]),
        ("Atrasados", str(total_atrasados), CORES["vermelho"]),
        ("Sem PEP", str(total_sem_pep), CORES["dourado"]),
    ])

    st.markdown("#####")
    colunas = st.columns(3)
    for indice, (_, canteiro) in enumerate(filtrado.sort_values("nome_obra").iterrows()):
        canteiro_dict = canteiro.to_dict()
        prestador_info = mapa_prestador.get(canteiro_dict["prestador_id"], {})
        projetos_do_canteiro = projetos_canteiros[projetos_canteiros["obra_id"] == canteiro_dict["id"]] if not projetos_canteiros.empty else pd.DataFrame()

        total = len(projetos_do_canteiro)
        atrasados = int((projetos_do_canteiro["status_entrega_calc"] == "ATRASADO").sum()) if not projetos_do_canteiro.empty else 0
        sem_pep = int((~projetos_do_canteiro["tem_pep"]).sum()) if not projetos_do_canteiro.empty else 0
        pendente_reuniao = int(projetos_do_canteiro["pendente_reuniao"].sum()) if not projetos_do_canteiro.empty else 0

        with colunas[indice % 3]:
            with st.container(border=True):
                st.markdown(f"**{nome_exibicao_obra(canteiro_dict)}**")
                st.caption(
                    f"{prestador_info.get('codigo', '—')} – {prestador_info.get('nome_empresa', 'Prestador não encontrado')} "
                    f"· Obra {canteiro_dict['status'].title()}"
                )
                m1, m2 = st.columns(2)
                m1.metric("Projetos", total)
                m2.metric("Atrasados", atrasados)
                m3, m4 = st.columns(2)
                m3.metric("Sem PEP", sem_pep)
                m4.metric("Reunião", pendente_reuniao)

                with st.expander("Ver projetos vinculados", icon=":material/list_alt:"):
                    if projetos_do_canteiro.empty:
                        st.caption("Nenhum projeto vinculado a este canteiro ainda.")
                    else:
                        st.dataframe(
                            projetos_do_canteiro[["item", "num_at", "disciplina", "revisao", "status_analise", "status_entrega_calc"]].rename(columns={
                                "item": "Item", "num_at": "N° AT", "disciplina": "Disciplina", "revisao": "Revisão",
                                "status_analise": "Status Análise", "status_entrega_calc": "Status Entrega",
                            }),
                            use_container_width=True, hide_index=True,
                        )
