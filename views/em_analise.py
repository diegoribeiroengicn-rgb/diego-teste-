"""View: Lista de Projetos "Em Análise" (Prestadores/Cessionários) —
acesso rápido, por analista responsável, aos projetos que estão com a
análise em mãos agora. Segue o mesmo padrão de `views/hold.py` (função
`render(usuario, modulo)` compartilhada, registrada no menu lateral de
cada módulo em `app.py`) e reaproveita o mesmo componente de cards da
aba "Projetos" (`lista_cards_com_edicao`) — sem duplicar a exibição.

A aba "Projetos" continua mostrando todos os status, sem filtro; esta
página é um recorte adicional, sempre limitado a status_analise ==
"EM ANÁLISE".
"""

from __future__ import annotations

import streamlit as st

from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores
from gat.config import COLUNAS_EXIBICAO_CESSIONARIOS, COLUNAS_EXIBICAO_PRESTADORES, SLA_PRESTADORES_DIAS_UTEIS
from gat.database import listar_cessionarios, listar_prestadores, obter_cessionario, obter_prestador
from gat.permissions import exigir_area, exigir_modulo, pode_area
from gat.ui.formatos import formatar_datas_df, rotulo_status_analise
from gat.ui.modals import dialog_cessionario, dialog_prestador
from gat.ui.tables import lista_cards_com_edicao
from views.cessionarios import _COLUNAS_DATA_CESSIONARIOS, _rotulo_situacao_prazo as _rotulo_situacao_prazo_cessionarios
from views.prestadores import _COLUNAS_DATA_PRESTADORES, _rotulo_situacao_prazo as _rotulo_situacao_prazo_prestadores


def render(usuario: dict, modulo: str) -> None:
    exigir_modulo(usuario, modulo)
    rotulo_modulo = "Prestadores" if modulo == "prestadores" else "Cessionários"
    coluna_nome = "prestador" if modulo == "prestadores" else "cessionario"
    campo_nome_entidade = "Prestador de Serviço" if modulo == "prestadores" else "Cessionário"

    st.subheader(f":material/search: Em Análise — {rotulo_modulo}")
    st.caption(
        "Projetos com status \"EM ANÁLISE\" agrupados por analista responsável — "
        "visão rápida de quem está com o quê em mãos agora. Para todos os status, veja Projetos."
    )

    if modulo == "prestadores":
        df = enriquecer_prestadores(listar_prestadores())
    else:
        df = enriquecer_cessionarios(listar_cessionarios())

    if df.empty:
        st.info("Nenhum registro cadastrado ainda.", icon=":material/search:")
        return

    df_filtrado = df[df["status_analise"].fillna("").astype(str).str.strip().str.upper() == "EM ANÁLISE"].copy()
    if df_filtrado.empty:
        st.info("Nenhum projeto em análise no momento.", icon=":material/search:")
        return

    # Ordena por responsável (em branco por último) para que o
    # agrupamento visual por analista fique contíguo; Item como
    # critério de desempate dentro de cada analista.
    df_filtrado["_resp_ordenacao"] = df_filtrado["responsavel"].fillna("").astype(str).str.strip()
    df_filtrado["_resp_vazio"] = (df_filtrado["_resp_ordenacao"] == "").astype(int)
    df_filtrado = df_filtrado.sort_values(
        by=["_resp_vazio", "_resp_ordenacao", "item"]
    ).drop(columns=["_resp_vazio", "_resp_ordenacao"]).reset_index(drop=True)

    st.caption(f"{len(df_filtrado)} registro(s) em análise.")

    if modulo == "prestadores":
        df_filtrado["_dias_restantes"] = df_filtrado["sla_dias"].fillna(SLA_PRESTADORES_DIAS_UTEIS) - df_filtrado["dias_uteis_decorridos"]
        df_filtrado["Situação do Prazo"] = df_filtrado.apply(
            lambda r: _rotulo_situacao_prazo_prestadores(r["_dias_restantes"], r.get("revisao"), r.get("status_analise"), r.get("data_limite")), axis=1
        )
        colunas = list(COLUNAS_EXIBICAO_PRESTADORES.keys())
        df_para_exibicao = formatar_datas_df(df_filtrado, _COLUNAS_DATA_PRESTADORES)
        df_exibicao = df_para_exibicao[[*colunas[:3], "Situação do Prazo", *colunas[3:]]].rename(columns=COLUNAS_EXIBICAO_PRESTADORES)
    else:
        df_filtrado["Situação do Prazo"] = df_filtrado.apply(
            lambda r: _rotulo_situacao_prazo_cessionarios(r["saldo_dias_uteis"], r.get("revisao"), r.get("status_analise"), r.get("data_limite")), axis=1
        )
        colunas = list(COLUNAS_EXIBICAO_CESSIONARIOS.keys())
        df_para_exibicao = formatar_datas_df(df_filtrado, _COLUNAS_DATA_CESSIONARIOS)
        df_exibicao = df_para_exibicao[[*colunas[:3], "Situação do Prazo", *colunas[3:]]].rename(columns=COLUNAS_EXIBICAO_CESSIONARIOS)

    df_exibicao["Status Análise"] = df_filtrado["status_analise"].map(rotulo_status_analise).to_numpy()

    def _abrir_edicao(registro: dict) -> None:
        exigir_area(usuario, f"{modulo}.editar")
        if modulo == "prestadores":
            dialog_prestador(usuario["username"], registro, pode_definir_prioridade=pode_area(usuario, "prioridades.definir"))
        else:
            dialog_cessionario(usuario["username"], registro, pode_definir_prioridade=pode_area(usuario, "prioridades.definir"))

    lista_cards_com_edicao(
        df_exibicao,
        df_filtrado["id"],
        chave=f"em_analise_{modulo}",
        campo_nome_entidade=campo_nome_entidade,
        abrir_dialog_edicao=_abrir_edicao,
        obter_registro=obter_prestador if modulo == "prestadores" else obter_cessionario,
        tabela_arquivo=modulo,
        usuario=usuario,
        descricao_arquivo=lambda r: f"{r.get('codigo')} — {r.get(coluna_nome)} (AT {r.get('num_at')})",
        campo_destaque_extra="Responsável",
        agrupar_por="Responsável",
    )
