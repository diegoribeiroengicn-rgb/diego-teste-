"""View: Cadastro de Cessionários — cadastro mestre (empresa, RVP/RCI/LUC),
separado do módulo Projetos. Cessionários não possuem PEP."""

from __future__ import annotations

import streamlit as st

from gat.database import listar_cadastro_cessionarios, listar_cessionarios, obter_cadastro_cessionario
from gat.permissions import exigir_area, exigir_modulo, pode_area
from gat.ui.modals_cadastro import dialog_cadastro_cessionario, dialog_status_cadastro_cessionario
from gat.ui.tables import tabela_com_edicao


def render(usuario: dict) -> None:
    exigir_modulo(usuario, "cessionarios")

    st.subheader(":material/badge: Cadastro de Cessionários")
    st.caption(
        "Cadastro mestre dos cessionários — empresa, RVP, RCI e LUC. O módulo Projetos continua sendo "
        "usado para cadastrar e acompanhar as análises técnicas; aqui você gerencia os dados que valem "
        "para todos os projetos e disciplinas do mesmo código."
    )

    pode_editar = pode_area(usuario, "cessionarios.cadastro_mestre")

    if pode_editar and st.button("Novo Cadastro", icon=":material/domain_add:", type="primary", key="cadc_novo"):
        dialog_cadastro_cessionario(usuario["username"])

    df = listar_cadastro_cessionarios()
    if df.empty:
        st.info("Nenhum cessionário cadastrado ainda.")
        return

    with st.expander("Filtros", icon=":material/filter_list:", expanded=True):
        col1, col2, col3 = st.columns(3)
        f_codigo = col1.text_input("Pesquisar por código (FXXX/LXXX)", key="cadc_f_codigo")
        f_nome = col2.text_input("Pesquisar por nome do cessionário", key="cadc_f_nome")
        f_status = col3.selectbox("Status", ["Todos", "ATIVO", "INATIVO"], key="cadc_f_status")

    filtrado = df.copy()
    if f_codigo.strip():
        filtrado = filtrado[filtrado["codigo"].fillna("").str.contains(f_codigo.strip(), case=False, na=False, regex=False)]
    if f_nome.strip():
        filtrado = filtrado[filtrado["nome_empresa"].fillna("").str.contains(f_nome.strip(), case=False, na=False, regex=False)]
    if f_status != "Todos":
        filtrado = filtrado[filtrado["status"] == f_status]

    if filtrado.empty:
        st.warning("Nenhum cessionário encontrado com os critérios de busca.", icon=":material/search_off:")
        return

    st.markdown(f"##### Cessionários cadastrados ({len(filtrado)})")
    exibicao = filtrado[["codigo", "nome_empresa", "rvp", "rci", "luc", "responsavel", "status"]].fillna("—").rename(columns={
        "codigo": "Código", "nome_empresa": "Empresa/Operação", "rvp": "RVP", "rci": "RCI", "luc": "LUC",
        "responsavel": "Responsável", "status": "Status",
    })

    def _abrir_edicao(registro: dict) -> None:
        exigir_area(usuario, "cessionarios.cadastro_mestre")
        dialog_cadastro_cessionario(usuario["username"], registro)

    tabela_com_edicao(
        exibicao.reset_index(drop=True), filtrado["id"].reset_index(drop=True), "cadastro_cessionarios",
        abrir_dialog_edicao=_abrir_edicao, obter_registro=obter_cadastro_cessionario,
    )

    st.markdown("---")
    st.markdown("##### Detalhamento do cessionário")
    opcoes = {f"{r['codigo']} — {r['nome_empresa']}": r["id"] for _, r in filtrado.sort_values("codigo").iterrows()}
    escolhido = st.selectbox(f"Selecione um cessionário ({len(opcoes)} encontrado(s))", list(opcoes.keys()), key="cadc_detalhe_escolhido")
    cessionario_id = opcoes[escolhido]
    registro = obter_cadastro_cessionario(cessionario_id)
    if registro is None:
        return

    col_a, col_b, col_c = st.columns(3)
    col_a.metric("Status", registro["status"])
    col_b.metric("RVP", registro.get("rvp") or "—")
    col_c.metric("RCI", registro.get("rci") or "—")
    if registro.get("luc"):
        st.caption(f"LUC: {registro['luc']}")

    if pode_editar:
        col_btn1, col_btn2 = st.columns(2)
        if col_btn1.button("Editar cadastro", icon=":material/edit:", use_container_width=True, key="cadc_editar_detalhe"):
            exigir_area(usuario, "cessionarios.cadastro_mestre")
            dialog_cadastro_cessionario(usuario["username"], registro)
        rotulo_status = "Inativar" if registro["status"] == "ATIVO" else "Reativar"
        if col_btn2.button(rotulo_status, icon=":material/block:", use_container_width=True, key="cadc_status_detalhe"):
            exigir_area(usuario, "cessionarios.cadastro_mestre")
            dialog_status_cadastro_cessionario(usuario["username"], registro)

    st.markdown("###### Projetos vinculados a este cadastro")
    df_projetos = listar_cessionarios()
    vinculados = df_projetos[df_projetos["cessionario_cadastro_id"] == cessionario_id]
    if vinculados.empty:
        st.caption("Nenhum projeto vinculado a este cadastro ainda.")
    else:
        st.dataframe(
            vinculados[["item", "num_at", "disciplina", "revisao", "status_analise", "data_solicitacao"]].rename(columns={
                "item": "Item", "num_at": "N° AT", "disciplina": "Disciplina", "revisao": "Revisão",
                "status_analise": "Status", "data_solicitacao": "Data Solicitação",
            }),
            use_container_width=True, hide_index=True,
        )
