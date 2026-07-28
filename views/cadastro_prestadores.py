"""View: Cadastro de Prestadores — cadastro mestre (empresa, PEP,
obras/canteiros), separado do módulo Projetos. O módulo Projetos continua
responsável por cadastrar e acompanhar as análises técnicas; este módulo
gerencia apenas os dados cadastrais que valem para todos os projetos do
mesmo código (evitando repetir o PEP em cada projeto)."""

from __future__ import annotations

import streamlit as st

from gat.database import (
    listar_cadastro_prestadores,
    listar_obras_prestador,
    listar_prestadores,
    nome_exibicao_obra,
    obter_cadastro_prestador,
)
from gat.permissions import exigir_area, exigir_modulo, pode_area
from gat.ui.modals_cadastro import (
    dialog_cadastro_prestador,
    dialog_obra_prestador,
    dialog_status_cadastro_prestador,
)
from gat.ui.tables import tabela_com_edicao


def render(usuario: dict) -> None:
    exigir_modulo(usuario, "prestadores")

    st.subheader(":material/badge: Cadastro de Prestadores")
    st.caption(
        "Cadastro mestre dos prestadores — empresa, PEP, obras e canteiros. O módulo Projetos continua "
        "sendo usado para cadastrar e acompanhar as análises técnicas; aqui você gerencia os dados que "
        "valem para todos os projetos do mesmo código, sem precisar repetir o PEP em cada um."
    )

    pode_editar = pode_area(usuario, "prestadores.cadastro_mestre")

    if pode_editar and st.button("Novo Cadastro", icon=":material/person_add:", type="primary", key="cadp_novo"):
        dialog_cadastro_prestador(usuario["username"])

    df = listar_cadastro_prestadores()
    if df.empty:
        st.info("Nenhum prestador cadastrado ainda.")
        return

    with st.expander("Filtros", icon=":material/filter_list:", expanded=True):
        col1, col2, col3 = st.columns(3)
        f_codigo = col1.text_input("Pesquisar por código (PXXX)", key="cadp_f_codigo")
        f_nome = col2.text_input("Pesquisar por nome da empresa", key="cadp_f_nome")
        f_status = col3.selectbox("Status", ["Todos", "ATIVO", "INATIVO"], key="cadp_f_status")

    filtrado = df.copy()
    if f_codigo.strip():
        filtrado = filtrado[filtrado["codigo"].fillna("").str.contains(f_codigo.strip(), case=False, na=False, regex=False)]
    if f_nome.strip():
        filtrado = filtrado[filtrado["nome_empresa"].fillna("").str.contains(f_nome.strip(), case=False, na=False, regex=False)]
    if f_status != "Todos":
        filtrado = filtrado[filtrado["status"] == f_status]

    if filtrado.empty:
        st.warning("Nenhum prestador encontrado com os critérios de busca.", icon=":material/search_off:")
        return

    st.markdown(f"##### Prestadores cadastrados ({len(filtrado)})")
    exibicao = filtrado[["codigo", "nome_empresa", "possui_pep", "numero_pep", "responsavel", "status"]].copy()
    exibicao["possui_pep"] = exibicao["possui_pep"].map({"SIM": "Sim", "NAO": "Não"}).fillna("Não")
    exibicao = exibicao.fillna("—").rename(columns={
        "codigo": "Código", "nome_empresa": "Empresa", "possui_pep": "Possui PEP", "numero_pep": "N° PEP",
        "responsavel": "Responsável", "status": "Status",
    })

    def _abrir_edicao(registro: dict) -> None:
        exigir_area(usuario, "prestadores.cadastro_mestre")
        dialog_cadastro_prestador(usuario["username"], registro)

    tabela_com_edicao(
        exibicao.reset_index(drop=True), filtrado["id"].reset_index(drop=True), "cadastro_prestadores",
        abrir_dialog_edicao=_abrir_edicao, obter_registro=obter_cadastro_prestador,
    )

    st.markdown("---")
    st.markdown("##### Detalhamento do prestador")
    opcoes = {f"{r['codigo']} — {r['nome_empresa']}": r["id"] for _, r in filtrado.sort_values("codigo").iterrows()}
    escolhido = st.selectbox(f"Selecione um prestador ({len(opcoes)} encontrado(s))", list(opcoes.keys()), key="cadp_detalhe_escolhido")
    prestador_id = opcoes[escolhido]
    registro = obter_cadastro_prestador(prestador_id)
    if registro is None:
        return

    col_a, col_b, col_c = st.columns(3)
    col_a.metric("Status", registro["status"])
    col_b.metric("Possui PEP", "Sim" if registro["possui_pep"] == "SIM" else "Não")
    col_c.metric("N° PEP", registro.get("numero_pep") or "—")

    if pode_editar:
        col_btn1, col_btn2 = st.columns(2)
        if col_btn1.button("Editar cadastro", icon=":material/edit:", use_container_width=True, key="cadp_editar_detalhe"):
            exigir_area(usuario, "prestadores.cadastro_mestre")
            dialog_cadastro_prestador(usuario["username"], registro)
        rotulo_status = "Inativar" if registro["status"] == "ATIVO" else "Reativar"
        if col_btn2.button(rotulo_status, icon=":material/block:", use_container_width=True, key="cadp_status_detalhe"):
            exigir_area(usuario, "prestadores.cadastro_mestre")
            dialog_status_cadastro_prestador(usuario["username"], registro)

    st.markdown("###### Obras / Áreas Vinculadas")
    obras = listar_obras_prestador(prestador_id)
    if pode_editar and st.button("Adicionar nova obra", icon=":material/add_business:", key="cadp_add_obra"):
        exigir_area(usuario, "prestadores.cadastro_mestre")
        dialog_obra_prestador(usuario["username"], prestador_id)

    if obras.empty:
        st.caption("Nenhuma obra cadastrada para este prestador.")
    else:
        for _, obra in obras.iterrows():
            obra_dict = obra.to_dict()
            rotulo = nome_exibicao_obra(obra_dict)
            icone = ":material/construction:" if obra_dict.get("e_canteiro") else ":material/home_work:"
            with st.expander(f"{rotulo} · {obra_dict['status']}", icon=icone):
                st.caption(obra_dict.get("observacoes") or "Sem observações.")
                if pode_editar and st.button("Editar obra", key=f"cadp_editar_obra_{obra_dict['id']}"):
                    exigir_area(usuario, "prestadores.cadastro_mestre")
                    dialog_obra_prestador(usuario["username"], prestador_id, obra_dict)

    st.markdown("###### Projetos vinculados a este cadastro")
    df_projetos = listar_prestadores()
    vinculados = df_projetos[df_projetos["prestador_cadastro_id"] == prestador_id]
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
