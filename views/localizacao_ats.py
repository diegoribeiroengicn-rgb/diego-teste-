"""View: Localização de ATs — ferramenta de consulta rápida, somente
leitura, para localizar uma AT (ou um conjunto de ATs) por número, obra,
disciplina, prestador, cessionário, código ou revisão, e identificar em
que situação (último status) uma disciplina/obra/projeto se encontra.

Não grava, altera, arquiva nem duplica nenhum dado — consulta diretamente
`listar_prestadores()`/`listar_cessionarios()` (só análises ativas; as
arquivadas continuam exclusivas do módulo Arquivo). O histórico de cada
AT reaproveita a sequência cronológica já usada pela Linha do Tempo
(`views.linha_tempo.renderizar_sequencia_projeto`), sem duplicar lógica."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores
from gat.config import DISCIPLINAS, RESPONSAVEIS, STATUS_ANALISE_OPCOES
from gat.database import listar_cessionarios, listar_obras_prestador, listar_prestadores, nome_exibicao_obra
from gat.normalizacao import texto_sem_acentos, texto_seguro
from gat.permissions import exigir_area, pode_modulo
from gat.resumo_conclusao import rotulos_canais_selecionados
from gat.revisoes import at_valido, chave_entidade_serie
from gat.ui.formatos import formatar_data_br, formatar_datahora_br
from views.linha_tempo import renderizar_sequencia_projeto

_MODULOS = {"Prestadores": "prestadores", "Cessionários": "cessionarios"}

_COR_BADGE_STATUS = {
    "EM ANÁLISE": "orange", "EM HOLD": "blue", "LIBERADO": "green",
    "LIBERADO C/ REST.": "green", "NÃO LIBERADO": "red", "OBSOLETO": "gray", "CANCELADO": "gray",
}


def _badge_status(status: str | None) -> None:
    texto = texto_seguro(status).strip() or "—"
    st.badge(texto, color=_COR_BADGE_STATUS.get(texto.upper(), "gray"))


def _obra_prestador_serie(df: pd.DataFrame) -> pd.Series:
    """Nome de exibição da Obra de cada linha de Prestadores: usa o
    cadastro vinculado (`obra_id`) quando disponível — mesma regra de
    exibição já usada no pop-up de edição —, senão o texto livre já
    gravado em `obra_referencia`. Nunca inventa uma obra que não esteja
    em algum dos dois campos já existentes."""
    obras_df = listar_obras_prestador()
    mapa_obras = {int(r["id"]): nome_exibicao_obra(r.to_dict()) for _, r in obras_df.iterrows()} if not obras_df.empty else {}
    via_cadastro = df.get("obra_id", pd.Series(index=df.index, dtype="object")).map(mapa_obras)
    return via_cadastro.fillna(df.get("obra_referencia", pd.Series(index=df.index, dtype="object")))


def _construir_base() -> pd.DataFrame:
    partes = []
    prest = listar_prestadores()
    if not prest.empty:
        p = prest.copy()
        p["modulo"] = "prestadores"
        p["entidade"] = p["prestador"]
        p["obra"] = _obra_prestador_serie(p)
        partes.append(p)
    cess = listar_cessionarios()
    if not cess.empty:
        c = cess.copy()
        c["modulo"] = "cessionarios"
        c["entidade"] = c["cessionario"]
        # Cessionários não têm um campo "Obra" próprio — "Tipo" (Quiosque/
        # Loja/Externo/Outros) é o campo mais próximo, mesma equivalência já
        # usada em `gat.database.listar_resumos_para_relatorio`.
        c["obra"] = c.get("tipo")
        partes.append(c)
    if not partes:
        return pd.DataFrame()
    return pd.concat(partes, ignore_index=True, sort=False)


def _marcar_mais_recente(df: pd.DataFrame) -> pd.DataFrame:
    """Agrupa por projeto (entidade + N° AT + disciplina — mesmo critério
    de `gat.revisoes.projetos_por_entidade`) e marca, dentro de cada
    grupo encontrado, a revisão de maior número como a mais recente (item
    12/13 da solicitação — nunca assumir uma única AT por obra/disciplina,
    e sempre destacar qual revisão é a atual)."""
    if df.empty:
        return df
    partes = []
    for modulo, grupo_modulo in df.groupby("modulo"):
        coluna_nome = "prestador" if modulo == "prestadores" else "cessionario"
        g = grupo_modulo.copy()
        chave_entidade = chave_entidade_serie(g, coluna_nome)
        g["_chave_entidade"] = chave_entidade
        valido = g["num_at"].apply(at_valido)
        chave_at = chave_entidade.astype(str) + "||" + g["num_at"].astype(str) + "||" + g["disciplina"].apply(texto_sem_acentos)
        chave_unica = chave_entidade.astype(str) + "||SEMAT||" + g["id"].astype(str)
        g["_chave_projeto"] = chave_at.where(valido, chave_unica)
        g["mais_recente"] = False
        for _, sub in g.groupby("_chave_projeto"):
            g.loc[sub["revisao"].idxmax(), "mais_recente"] = True
        partes.append(g)
    return pd.concat(partes, ignore_index=True)


def _renderizar_detalhe(linha: pd.Series) -> None:
    modulo = linha["modulo"]
    coluna_nome = "prestador" if modulo == "prestadores" else "cessionario"
    tipo_entidade = "PRESTADOR" if modulo == "prestadores" else "CESSIONARIO"
    rotulo_modulo = "Prestador" if modulo == "prestadores" else "Cessionário"

    num_at = texto_seguro(linha.get("num_at")).strip()
    disciplina = texto_seguro(linha.get("disciplina")).strip()
    codigo = texto_seguro(linha.get("codigo")).strip()
    entidade = texto_seguro(linha.get("entidade")).strip()
    obra = texto_seguro(linha.get("obra")).strip()

    st.markdown("---")
    st.markdown("##### Detalhes")
    col_titulo, col_status = st.columns([3, 1])
    with col_titulo:
        st.markdown(f"**AT {num_at or '—'}** · {disciplina or '—'} · REV{int(linha.get('revisao') or 0):02d}")
        st.caption(f"{rotulo_modulo}: {codigo or '—'} — {entidade or '—'}")
        if obra:
            st.caption(f"Obra: {obra}")
    with col_status:
        _badge_status(linha.get("status_analise"))

    ano = num_at.split("/")[-1] if "/" in num_at else "—"
    col1, col2, col3 = st.columns(3)
    col1.metric("Ano", ano)
    col2.metric("Analista responsável", texto_seguro(linha.get("responsavel")).strip() or "—")
    col3.metric("Última atualização", formatar_datahora_br(linha.get("atualizado_em")) or "—")

    col4, col5 = st.columns(2)
    col4.caption(f"Data de solicitação: {formatar_data_br(linha.get('data_solicitacao')) or '—'}")
    col5.caption(f"Data de entrega prevista/acordada: {formatar_data_br(linha.get('data_limite')) or '—'}")

    canais = rotulos_canais_selecionados(bool(linha.get("resumo_mfiles")), bool(linha.get("resumo_drive")), bool(linha.get("resumo_email")))
    st.caption(f"Localização da AT (Resumo de Conclusão): {', '.join(canais) if canais else '—'}")

    observacoes = texto_seguro(linha.get("observacoes")).strip()
    if observacoes:
        st.caption(f"Observações: {observacoes}")

    with st.expander("Ver histórico completo (Linha do Tempo)", icon=":material/timeline:"):
        base_completa = listar_prestadores() if modulo == "prestadores" else listar_cessionarios()
        if at_valido(linha.get("num_at")):
            grupo = base_completa[
                (chave_entidade_serie(base_completa, coluna_nome) == linha["_chave_entidade"])
                & (base_completa["num_at"] == linha.get("num_at"))
                & (base_completa["disciplina"].apply(texto_sem_acentos) == texto_sem_acentos(linha.get("disciplina")))
            ]
        else:
            grupo = base_completa[base_completa["id"] == linha["id"]]
        if grupo.empty:
            st.caption("Histórico não disponível para este registro.")
        else:
            grupo_enriquecido = enriquecer_prestadores(grupo) if modulo == "prestadores" else enriquecer_cessionarios(grupo)
            renderizar_sequencia_projeto(modulo, coluna_nome, tipo_entidade, grupo_enriquecido)


def render(usuario: dict) -> None:
    exigir_area(usuario, "localizacao_ats")

    st.subheader(":material/travel_explore: Localização de ATs")
    st.caption(
        "Consulta rápida, somente leitura — localize uma AT por número, obra, disciplina, prestador, "
        "cessionário, código ou revisão, e veja o último status e o histórico completo. Não altera, "
        "arquiva nem duplica nenhum dado do sistema."
    )

    opcoes_modulo = [rotulo for rotulo, chave in _MODULOS.items() if pode_modulo(usuario, chave)]
    if not opcoes_modulo:
        st.info("Nenhum módulo (Prestadores/Cessionários) liberado para este usuário.")
        return

    base = _construir_base()
    modulos_liberados = {_MODULOS[r] for r in opcoes_modulo}
    if not base.empty:
        base = base[base["modulo"].isin(modulos_liberados)]

    with st.expander("Filtros", icon=":material/filter_list:", expanded=True):
        col1, col2, col3 = st.columns(3)
        f_at = col1.text_input("Número da AT", key="lat_at")
        f_obra = col2.text_input("Obra", key="lat_obra")
        f_disciplina = col3.selectbox("Disciplina", ["Todas"] + DISCIPLINAS, key="lat_disciplina")
        col4, col5, col6 = st.columns(3)
        f_prestador = col4.text_input("Prestador", key="lat_prestador")
        f_cessionario = col5.text_input("Cessionário", key="lat_cessionario")
        f_codigo = col6.text_input("Código", key="lat_codigo")
        col7, col8, col9 = st.columns(3)
        f_revisao = col7.text_input("Revisão", key="lat_revisao")
        f_status = col8.selectbox("Status", ["Todos"] + STATUS_ANALISE_OPCOES, key="lat_status")
        f_analista = col9.selectbox("Analista", ["Todos"] + RESPONSAVEIS, key="lat_analista")
        usar_periodo = st.checkbox("Filtrar por período (Data de Solicitação)", key="lat_usar_periodo")
        if usar_periodo:
            st.session_state.setdefault("lat_data_inicio", None)
            st.session_state.setdefault("lat_data_fim", None)
            col10, col11 = st.columns(2)
            data_inicio = col10.date_input("Data início", format="DD/MM/YYYY", key="lat_data_inicio")
            data_fim = col11.date_input("Data fim", format="DD/MM/YYYY", key="lat_data_fim")
        else:
            data_inicio = data_fim = None

    df = base.copy()
    if not df.empty:
        if f_at.strip():
            df = df[df["num_at"].fillna("").astype(str).str.contains(f_at.strip(), case=False, na=False, regex=False)]
        if f_obra.strip():
            df = df[df["obra"].fillna("").astype(str).str.contains(f_obra.strip(), case=False, na=False, regex=False)]
        if f_disciplina != "Todas":
            df = df[df["disciplina"].apply(texto_sem_acentos) == texto_sem_acentos(f_disciplina)]
        if f_prestador.strip():
            df = df[(df["modulo"] == "prestadores") & df["entidade"].fillna("").astype(str).str.contains(f_prestador.strip(), case=False, na=False, regex=False)]
        if f_cessionario.strip():
            df = df[(df["modulo"] == "cessionarios") & df["entidade"].fillna("").astype(str).str.contains(f_cessionario.strip(), case=False, na=False, regex=False)]
        if f_codigo.strip():
            df = df[df["codigo"].fillna("").astype(str).str.contains(f_codigo.strip(), case=False, na=False, regex=False)]
        if f_revisao.strip():
            df = df[df["revisao"].astype(str) == f_revisao.strip()]
        if f_status != "Todos":
            df = df[df["status_analise"].fillna("").astype(str).str.upper() == f_status.upper()]
        if f_analista != "Todos":
            df = df[df["responsavel"] == f_analista]
        if usar_periodo and data_inicio and data_fim:
            datas = pd.to_datetime(df["data_solicitacao"], errors="coerce")
            df = df[(datas.dt.date >= data_inicio) & (datas.dt.date <= data_fim)]

    if df.empty:
        st.warning("Nenhuma AT encontrada para os filtros informados.", icon=":material/search_off:")
        return

    df = _marcar_mais_recente(df)
    df = df.sort_values(["_chave_projeto", "revisao"], ascending=[True, False]).reset_index(drop=True)

    st.metric("ATs encontradas", len(df))

    exibicao = df.copy()
    exibicao["Módulo"] = exibicao["modulo"].map({"prestadores": "Prestador", "cessionarios": "Cessionário"})
    exibicao["Ano"] = exibicao["num_at"].fillna("").astype(str).apply(lambda v: v.split("/")[-1] if "/" in v else "—")
    exibicao["Data Solicitação"] = exibicao["data_solicitacao"].apply(formatar_data_br)
    exibicao["Última Atualização"] = exibicao["atualizado_em"].apply(formatar_datahora_br)
    exibicao["Mais recente"] = exibicao["mais_recente"].map({True: "Sim", False: ""})

    for coluna in ("codigo", "entidade", "obra", "disciplina", "num_at", "status_analise", "responsavel"):
        exibicao[coluna] = exibicao[coluna].fillna("—").replace("", "—")

    tabela = exibicao[[
        "Mais recente", "Módulo", "codigo", "entidade", "obra", "disciplina", "revisao", "num_at", "Ano",
        "status_analise", "responsavel", "Data Solicitação", "Última Atualização",
    ]].rename(columns={
        "codigo": "Código", "entidade": "Prestador/Cessionário", "obra": "Obra", "disciplina": "Disciplina",
        "revisao": "Revisão", "num_at": "N° AT", "status_analise": "Status", "responsavel": "Analista",
    })

    evento = st.dataframe(
        tabela, use_container_width=True, hide_index=True,
        on_select="rerun", selection_mode="single-row", key="lat_tabela",
    )

    linhas_selecionadas = evento.selection.rows if evento and evento.selection else []
    if not linhas_selecionadas:
        st.caption("Selecione uma linha na tabela para ver os detalhes completos e o histórico.")
        return

    _renderizar_detalhe(df.iloc[linhas_selecionadas[0]])
