"""PMO — Página individual do projeto: menu interno dinâmico (só mostra os
módulos habilitados), Dashboard reposicionado automaticamente, Cronograma
com interpretação automática (Excel/Primavera XER), Curva S, Financeiro,
Medições, Entregáveis, Riscos, Comunicações, Reuniões e Planos de Ação
(compartilhados com o GAT, origem PMO), Relatórios, OPR, Biblioteca de
KPIs e Configuração do Projeto."""

from __future__ import annotations

from datetime import date

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

import gat.pmo_database as pmodb
from gat.arquivo_business_rules import perfil_pode_arquivar_e_restaurar
from gat.config import CORES
from gat.permissions import exigir_area
from gat.pmo_business_rules import (
    BIBLIOTECA_KPIS,
    KPI_ORDEM,
    SAUDE_AMARELO,
    SAUDE_VERDE,
    SAUDE_VERMELHO,
    calcular_percentual_execucao,
    calcular_saude_projeto,
    calcular_spi,
    curva_s_planejada,
    percentual_planejado_ate,
    proximo_marco,
)
from gat.pmo_cronograma_import import FORMATOS_INTERPRETAVEIS, detectar_formato, interpretar_cronograma
from gat.pmo_relatorios import TITULOS_RELATORIO, gerar_opr_pmo, gerar_relatorio_pmo, nome_arquivo_relatorio_pmo
from gat.ui.formatos import formatar_data_br, formatar_datas_df
from gat.ui.modals_arquivo import dialog_arquivar
from gat.ui.modals_pmo import dialog_configurar_kpis, dialog_editar_projeto

_CHAVE_PAGINA_PORTFOLIO = "pmo_portfolio"

_COR_SAUDE = {SAUDE_VERDE: CORES["verde"], SAUDE_AMARELO: CORES["dourado"], SAUDE_VERMELHO: CORES["vermelho"]}
_ICONE_SAUDE = {SAUDE_VERDE: "🟢", SAUDE_AMARELO: "🟡", SAUDE_VERMELHO: "🔴"}

_TABS_POR_KPI = [
    ("cronograma", "Cronograma"), ("curva_s", "Curva S"), ("financeiro", "Financeiro"),
    ("medicoes", "Medições"), ("entregaveis", "Entregáveis"), ("riscos", "Riscos"), ("comunicacoes", "Comunicações"),
]


def _voltar_portfolio() -> None:
    pagina = st.session_state.get("_gat_paginas", {}).get(_CHAVE_PAGINA_PORTFOLIO)
    if pagina is not None:
        st.switch_page(pagina)
    else:
        st.rerun()


def _recalcular_status(projeto: dict) -> dict:
    """Recalcula saúde/%execução/próximo marco a partir do estado atual do
    cronograma e dos riscos, e persiste — chamado a cada carregamento da
    página, do mesmo jeito que o GAT recalcula seus próprios alertas
    dinamicamente a cada tela aberta."""
    atividades = pmodb.listar_atividades_cronograma(projeto["id"])
    pct_execucao = calcular_percentual_execucao(atividades)
    marco = proximo_marco(atividades)
    nome_marco, data_marco = marco if marco else (None, None)

    riscos = pmodb.listar_riscos(projeto["id"])
    riscos_criticos_abertos = 0
    if not riscos.empty:
        classificacao = riscos["probabilidade"] * riscos["impacto"]
        riscos_criticos_abertos = int(((classificacao >= 15) & (riscos["status"] == "ABERTO")).sum())

    atividade_critica_atrasada = False
    percentual_planejado_hoje = None
    if not atividades.empty:
        hoje = pd.Timestamp.today().normalize()
        datas_fim = pd.to_datetime(atividades["data_fim"], errors="coerce")
        atrasada = (atividades["caminho_critico"] == 1) & (datas_fim < hoje) & (atividades["percentual_concluido"].fillna(0) < 100)
        atividade_critica_atrasada = bool(atrasada.any())
        percentual_planejado_hoje = percentual_planejado_ate(atividades, hoje)

    alerta = pmodb.obter_alerta_cronograma(projeto["id"])
    alerta_ativo = bool(alerta and alerta["status"] == "ATIVO")

    saude = calcular_saude_projeto(pct_execucao, percentual_planejado_hoje, atividade_critica_atrasada, riscos_criticos_abertos, alerta_ativo)
    pmodb.atualizar_status_calculado(projeto["id"], saude, pct_execucao, nome_marco, data_marco)
    return pmodb.obter_projeto(projeto["id"])


# ---------------------------------------------------------------------------
# Resumo Executivo
# ---------------------------------------------------------------------------


def _tab_resumo_executivo(projeto: dict, habilitados: set[str]) -> None:
    saude = projeto.get("saude") or SAUDE_VERDE
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Status", projeto.get("status") or "—")
    col2.markdown(
        f"<div style='font-size:0.75rem;font-weight:700;text-transform:uppercase;color:{CORES['texto_fraco']};'>Saúde</div>"
        f"<div style='font-size:1.5rem;font-weight:800;'>{_ICONE_SAUDE.get(saude,'⚪')} {saude.capitalize()}</div>",
        unsafe_allow_html=True,
    )
    col3.metric("% Execução", f"{projeto.get('percentual_execucao') or 0:.0f}%")
    col4.metric("Término previsto", formatar_data_br(projeto.get("data_prevista_termino")))

    st.caption(f"Próximo marco: **{projeto.get('proximo_marco') or 'Nenhum marco pendente'}**" + (
        f" — {formatar_data_br(projeto.get('proximo_marco_data'))}" if projeto.get("proximo_marco_data") else ""
    ))

    alertas_ativos = pmodb.listar_alertas_projeto(projeto["id"])
    qtd_alertas_ativos = int(alertas_ativos["status"].isin(["ABERTO", "EM_TRATAMENTO"]).sum()) if not alertas_ativos.empty else 0
    riscos = pmodb.listar_riscos(projeto["id"]) if "riscos" in habilitados else pd.DataFrame()
    riscos_abertos = int((riscos["status"] == "ABERTO").sum()) if not riscos.empty else 0

    col5, col6, col7 = st.columns(3)
    col5.metric("Alertas ativos", qtd_alertas_ativos)
    col6.metric("Riscos abertos", riscos_abertos if "riscos" in habilitados else "—")
    col7.metric("Valor contratual", f"R$ {projeto['valor_contratual']:,.2f}" if projeto.get("valor_contratual") else "—")

    st.markdown("###### Indicadores habilitados neste projeto")
    st.markdown(
        " ".join(
            f"<span style='display:inline-block;margin:2px;padding:4px 10px;border-radius:14px;"
            f"background:{CORES['azul_3']};color:{CORES['navy']};font-size:0.8rem;font-weight:600;'>"
            f"{BIBLIOTECA_KPIS[chave]['nome']}</span>"
            for chave in KPI_ORDEM if chave in habilitados
        ) or "<span>Nenhum indicador habilitado.</span>",
        unsafe_allow_html=True,
    )


# ---------------------------------------------------------------------------
# Dashboard dinâmico
# ---------------------------------------------------------------------------


def _tab_dashboard(projeto: dict, habilitados: set[str]) -> None:
    if not habilitados:
        st.info("Nenhum indicador habilitado para este projeto. Habilite em Configuração > Indicadores.", icon=":material/tune:")
        return

    atividades = pmodb.listar_atividades_cronograma(projeto["id"])
    riscos = pmodb.listar_riscos(projeto["id"])
    resumo_fin = pmodb.resumo_financeiro(projeto["id"])
    medicoes = pmodb.listar_medicoes(projeto["id"])
    entregaveis = pmodb.listar_entregaveis(projeto["id"])
    hoje = pd.Timestamp.today().normalize()
    pct_planejado_hoje = percentual_planejado_ate(atividades, hoje) if not atividades.empty else 0
    pct_realizado = calcular_percentual_execucao(atividades)

    cartoes: list[tuple[str, str, str]] = []
    if "cronograma" in habilitados:
        criticas = int(atividades["caminho_critico"].sum()) if not atividades.empty else 0
        cartoes.append(("Cronograma", f"{len(atividades)} atividades", f"{criticas} no caminho crítico"))
    if "curva_s" in habilitados:
        cartoes.append(("Curva S", f"Planejado hoje: {pct_planejado_hoje:.0f}%", f"Realizado: {pct_realizado:.0f}%"))
    if "financeiro" in habilitados:
        cartoes.append(("Financeiro", f"Saldo: R$ {resumo_fin['saldo']:,.2f}", f"Pago: R$ {resumo_fin['valor_pago']:,.2f}"))
    if "medicoes" in habilitados:
        ultima = medicoes.iloc[0] if not medicoes.empty else None
        cartoes.append(("Medições", f"{len(medicoes)} lançadas", f"Última: {ultima['situacao']}" if ultima is not None else "Nenhuma lançada"))
    if "spi" in habilitados:
        spi = calcular_spi(pct_realizado, pct_planejado_hoje)
        cartoes.append(("SPI", f"{spi:.2f}" if spi is not None else "—", "No prazo" if spi and spi >= 1 else "Atrasado" if spi else "Sem dados"))
    if "entregaveis" in habilitados:
        entregues = int(entregaveis["entregue"].sum()) if not entregaveis.empty else 0
        cartoes.append(("Entregáveis", f"{entregues}/{len(entregaveis)} entregues", f"{len(entregaveis)-entregues} pendentes" if not entregaveis.empty else "Nenhum cadastrado"))
    if "avanco_fisico" in habilitados:
        cartoes.append(("Avanço Físico", f"{pct_realizado:.0f}%", "Baseado no cronograma"))
    if "avanco_documental" in habilitados:
        pct_doc = round(entregaveis["percentual_documental"].fillna(0).mean(), 1) if not entregaveis.empty else 0.0
        cartoes.append(("Avanço Documental", f"{pct_doc:.0f}%", "Média dos entregáveis"))
    if "riscos" in habilitados:
        abertos = int((riscos["status"] == "ABERTO").sum()) if not riscos.empty else 0
        criticos = int(((riscos["probabilidade"] * riscos["impacto"] >= 15) & (riscos["status"] == "ABERTO")).sum()) if not riscos.empty else 0
        cartoes.append(("Riscos", f"{abertos} abertos", f"{criticos} críticos"))
    if "comunicacoes" in habilitados:
        comunicacoes = pmodb.listar_comunicacoes(projeto["id"])
        cartoes.append(("Comunicações", f"{len(comunicacoes)} registradas", "—"))
    if "custos" in habilitados:
        cartoes.append(("Custos", f"AC: R$ {resumo_fin['valor_pago']:,.2f}", f"EV: R$ {resumo_fin['valor_aprovado']:,.2f}"))
    if "cpi" in habilitados:
        cpi = round(resumo_fin["valor_aprovado"] / resumo_fin["valor_pago"], 2) if resumo_fin["valor_pago"] else None
        cartoes.append(("CPI", f"{cpi:.2f}" if cpi else "—", "Eficiente" if cpi and cpi >= 1 else "Estouro" if cpi else "Sem dados"))
    if "bim" in habilitados:
        cartoes.append(("BIM", "—", "Sem dados lançados"))
    if "seguranca" in habilitados:
        cartoes.append(("Segurança", "—", "Sem dados lançados"))

    colunas = st.columns(3)
    for indice, (titulo, valor, detalhe) in enumerate(cartoes):
        with colunas[indice % 3]:
            with st.container(border=True):
                st.caption(titulo)
                st.markdown(f"**{valor}**")
                st.caption(detalhe)


# ---------------------------------------------------------------------------
# Cronograma
# ---------------------------------------------------------------------------


def _tab_cronograma(projeto: dict, usuario: dict) -> None:
    projeto_id = projeto["id"]
    cronograma_ativo = pmodb.obter_cronograma_ativo(projeto_id)

    if cronograma_ativo:
        st.success(
            f"Cronograma ativo: **{cronograma_ativo['nome_arquivo']}** (enviado por {cronograma_ativo['enviado_por']} "
            f"em {formatar_data_br(cronograma_ativo['enviado_em'])}).",
            icon=":material/check_circle:",
        )
        if st.button("Remover cronograma", icon=":material/delete:", key="pmo_remover_cronograma"):
            pmodb.remover_cronograma_ativo(projeto_id, usuario["username"])
            st.rerun()

        atividades = pmodb.listar_atividades_cronograma(projeto_id)
        if not atividades.empty:
            exibicao = formatar_datas_df(atividades, ["data_inicio", "data_fim"])
            exibicao["Marco"] = exibicao["e_marco"].map({1: "Sim", 0: "Não"})
            exibicao["Caminho Crítico"] = exibicao["caminho_critico"].map({1: "Sim", 0: "Não"})
            st.dataframe(
                exibicao[["nome", "data_inicio", "data_fim", "duracao_dias", "percentual_concluido", "Marco", "Caminho Crítico", "folga_dias"]].rename(columns={
                    "nome": "Atividade", "data_inicio": "Início", "data_fim": "Término", "duracao_dias": "Duração (dias)",
                    "percentual_concluido": "% Concluído", "folga_dias": "Folga (dias)",
                }),
                use_container_width=True, hide_index=True,
            )
        else:
            st.caption("Arquivo anexado sem interpretação automática (formato .mpp — apenas armazenado como referência).")
    else:
        st.warning(
            "Nenhum cronograma anexado — o alerta \"Cronograma pendente de recebimento.\" está ativo e o "
            "gerente receberá lembretes a cada 3 dias úteis até que um cronograma seja anexado.",
            icon=":material/schedule:",
        )

    st.markdown("###### Anexar novo cronograma")
    st.caption(
        "Interpretação automática de atividades, marcos, dependências e caminho crítico disponível para "
        "Excel (.xlsx) e Primavera (.xer). Arquivos MS Project (.mpp) são aceitos apenas como anexo de "
        "referência — formato binário proprietário sem leitura automática confiável neste sistema; exporte "
        "para Excel ou XER para ter a leitura automática."
    )
    arquivo = st.file_uploader("Arquivo do cronograma", type=["xlsx", "xls", "xer", "mpp"], key="pmo_upload_cronograma")
    if arquivo is not None and st.button("Processar e anexar", icon=":material/upload_file:", type="primary", key="pmo_processar_cronograma"):
        try:
            formato = detectar_formato(arquivo.name)
            conteudo = arquivo.getvalue()
            atividades_interpretadas = interpretar_cronograma(arquivo.name, formato, conteudo) if formato in FORMATOS_INTERPRETAVEIS else None
            pmodb.anexar_cronograma(projeto_id, arquivo.name, formato, conteudo, atividades_interpretadas, usuario["username"])
            if formato in FORMATOS_INTERPRETAVEIS:
                st.success(f"Cronograma anexado e interpretado automaticamente ({len(atividades_interpretadas)} atividades).", icon=":material/check_circle:")
            else:
                st.info("Arquivo .mpp anexado como referência (sem interpretação automática).", icon=":material/info:")
            st.rerun()
        except ValueError as exc:
            st.error(str(exc), icon=":material/error:")

    lembretes = pmodb.listar_lembretes_cronograma(projeto_id)
    if not lembretes.empty:
        with st.expander(f"Histórico de lembretes automáticos ({len(lembretes)})", icon=":material/notifications:"):
            st.dataframe(
                formatar_datas_df(lembretes, ["enviado_em"])[["enviado_em", "mensagem"]].rename(columns={"enviado_em": "Enviado em", "mensagem": "Mensagem"}),
                use_container_width=True, hide_index=True,
            )

    arquivos = pmodb.listar_arquivos_cronograma(projeto_id)
    if not arquivos.empty:
        with st.expander(f"Documentos de cronograma anexados ({len(arquivos)})", icon=":material/folder_open:"):
            for _, arq in arquivos.iterrows():
                col_nome, col_arquivar = st.columns([4, 1])
                situacao = "ativo" if arq["ativo"] else "removido"
                col_nome.write(f"**{arq['nome_arquivo']}** ({arq['formato']}) — {situacao}, enviado por {arq['enviado_por']}")
                if perfil_pode_arquivar_e_restaurar(usuario.get("perfil")) and col_arquivar.button(
                    "Arquivar", icon=":material/archive:", key=f"pmo_arquivar_doc_{arq['id']}", use_container_width=True
                ):
                    dialog_arquivar("pmo_cronograma_arquivos", int(arq["id"]), arq["nome_arquivo"], usuario["username"])


# ---------------------------------------------------------------------------
# Curva S
# ---------------------------------------------------------------------------


def _tab_curva_s(projeto: dict, usuario: dict) -> None:
    atividades = pmodb.listar_atividades_cronograma(projeto["id"])
    if atividades.empty:
        st.info("Anexe um cronograma na aba Cronograma para gerar a Curva S automaticamente.", icon=":material/info:")
        return
    curva = curva_s_planejada(atividades)
    if curva.empty:
        st.info("Não foi possível calcular a Curva S — verifique se as atividades têm datas de início/término.", icon=":material/info:")
        return
    pct_realizado = calcular_percentual_execucao(atividades)

    fig = go.Figure()
    fig.add_trace(go.Scatter(x=curva["data"], y=curva["pct_planejado"], mode="lines+markers", name="Planejado", line=dict(color=CORES["navy"])))
    fig.add_hline(y=pct_realizado, line_dash="dash", line_color=CORES["verde"], annotation_text=f"Realizado atual: {pct_realizado:.0f}%")
    fig.update_layout(yaxis_title="% Acumulado", plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)")
    st.plotly_chart(fig, use_container_width=True)

    hoje = pd.Timestamp.today().normalize()
    pct_planejado_hoje = percentual_planejado_ate(atividades, hoje)
    desvio = pct_realizado - pct_planejado_hoje
    col1, col2, col3 = st.columns(3)
    col1.metric("Planejado até hoje", f"{pct_planejado_hoje:.0f}%")
    col2.metric("Realizado atual", f"{pct_realizado:.0f}%")
    col3.metric("Desvio", f"{desvio:+.0f} p.p.")


# ---------------------------------------------------------------------------
# Financeiro
# ---------------------------------------------------------------------------


def _tab_financeiro(projeto: dict, usuario: dict) -> None:
    resumo = pmodb.resumo_financeiro(projeto["id"])
    col1, col2, col3 = st.columns(3)
    col1.metric("Valor contratado", f"R$ {resumo['valor_contratado']:,.2f}")
    col2.metric("Valor medido", f"R$ {resumo['valor_medido']:,.2f}")
    col3.metric("Valor aprovado", f"R$ {resumo['valor_aprovado']:,.2f}")
    col4, col5, col6 = st.columns(3)
    col4.metric("Valor pago", f"R$ {resumo['valor_pago']:,.2f}")
    col5.metric("Valor glosado", f"R$ {resumo['valor_glosado']:,.2f}")
    col6.metric("Saldo", f"R$ {resumo['saldo']:,.2f}")
    st.caption("Os valores medido/aprovado/pago/glosado são consolidados a partir dos lançamentos da aba Medições.")


# ---------------------------------------------------------------------------
# Medições
# ---------------------------------------------------------------------------

_SITUACOES_MEDICAO = ["EM ANÁLISE", "APROVADA", "APROVADA COM RESSALVA", "REPROVADA"]


def _tab_medicoes(projeto: dict, usuario: dict) -> None:
    with st.expander("Nova medição", icon=":material/add:"):
        col1, col2 = st.columns(2)
        mes = col1.selectbox("Mês", list(range(1, 13)), index=date.today().month - 1, key="pmo_med_mes")
        ano = col2.number_input("Ano", min_value=2020, max_value=2100, value=date.today().year, key="pmo_med_ano")
        col3, col4 = st.columns(2)
        percentual = col3.number_input("% da medição", min_value=0.0, max_value=100.0, step=1.0, key="pmo_med_pct")
        valor_medido = col4.number_input("Valor medido (R$)", min_value=0.0, step=1000.0, key="pmo_med_valor")
        situacao = st.selectbox("Situação", _SITUACOES_MEDICAO, key="pmo_med_situacao")
        col5, col6, col7 = st.columns(3)
        valor_aprovado = col5.number_input("Valor aprovado (R$)", min_value=0.0, step=1000.0, key="pmo_med_aprovado")
        valor_pago = col6.number_input("Valor pago (R$)", min_value=0.0, step=1000.0, key="pmo_med_pago")
        valor_glosado = col7.number_input("Valor glosado (R$)", min_value=0.0, step=1000.0, key="pmo_med_glosado")
        if st.button("Registrar medição", icon=":material/save:", type="primary", key="pmo_med_salvar"):
            pmodb.inserir_medicao(projeto["id"], {
                "competencia_mes": mes, "competencia_ano": ano, "percentual": percentual, "valor_medido": valor_medido,
                "situacao": situacao, "valor_aprovado": valor_aprovado or None, "valor_pago": valor_pago or None,
                "valor_glosado": valor_glosado,
            }, usuario["username"])
            st.rerun()

    medicoes = pmodb.listar_medicoes(projeto["id"])
    if medicoes.empty:
        st.caption("Nenhuma medição registrada ainda.")
        return
    st.dataframe(
        medicoes[["competencia_mes", "competencia_ano", "percentual", "valor_medido", "situacao", "valor_aprovado", "valor_pago", "valor_glosado"]].rename(columns={
            "competencia_mes": "Mês", "competencia_ano": "Ano", "percentual": "%", "valor_medido": "Valor Medido",
            "situacao": "Situação", "valor_aprovado": "Aprovado", "valor_pago": "Pago", "valor_glosado": "Glosado",
        }),
        use_container_width=True, hide_index=True,
    )


# ---------------------------------------------------------------------------
# Entregáveis
# ---------------------------------------------------------------------------


def _tab_entregaveis(projeto: dict, usuario: dict) -> None:
    with st.expander("Novo entregável", icon=":material/add:"):
        nome = st.text_input("Nome do entregável", key="pmo_ent_nome")
        col1, col2 = st.columns(2)
        data_prevista = col1.date_input("Data prevista", value=None, format="DD/MM/YYYY", key="pmo_ent_data_prevista")
        percentual_documental = col2.number_input("% documental", min_value=0.0, max_value=100.0, step=5.0, key="pmo_ent_pct_doc")
        observacoes = st.text_area("Observações", key="pmo_ent_obs")
        if st.button("Adicionar entregável", icon=":material/save:", type="primary", key="pmo_ent_salvar"):
            if not nome.strip():
                st.error("Informe o nome do entregável.", icon=":material/error:")
            else:
                pmodb.inserir_entregavel(projeto["id"], {
                    "nome": nome.strip(), "previsto": 1, "entregue": 0,
                    "data_prevista": data_prevista.isoformat() if data_prevista else None,
                    "percentual_documental": percentual_documental, "observacoes": observacoes.strip() or None,
                }, usuario["username"])
                st.rerun()

    entregaveis = pmodb.listar_entregaveis(projeto["id"])
    if entregaveis.empty:
        st.caption("Nenhum entregável cadastrado ainda.")
        return
    total = len(entregaveis)
    entregues = int(entregaveis["entregue"].sum())
    col1, col2, col3 = st.columns(3)
    col1.metric("Total previsto", total)
    col2.metric("Total entregue", entregues)
    col3.metric("Pendências", total - entregues)

    for _, linha in entregaveis.iterrows():
        with st.container(border=True):
            col_info, col_acao = st.columns([4, 1])
            with col_info:
                st.markdown(f"**{linha['nome']}** — {'✅ Entregue' if linha['entregue'] else '⏳ Pendente'}")
                st.caption(
                    f"Previsto: {formatar_data_br(linha['data_prevista'])} · "
                    f"Entregue em: {formatar_data_br(linha['data_entrega']) if linha['data_entrega'] else '—'} · "
                    f"% documental: {linha['percentual_documental']:.0f}%"
                )
            with col_acao:
                if not linha["entregue"] and st.button("Marcar entregue", key=f"pmo_ent_marcar_{linha['id']}", use_container_width=True):
                    pmodb.atualizar_entregavel(int(linha["id"]), {
                        "nome": linha["nome"], "previsto": linha["previsto"], "entregue": 1,
                        "data_prevista": linha["data_prevista"], "data_entrega": date.today().isoformat(),
                        "percentual_documental": 100.0, "observacoes": linha["observacoes"],
                    }, usuario["username"])
                    st.rerun()


# ---------------------------------------------------------------------------
# Riscos
# ---------------------------------------------------------------------------


def _tab_riscos(projeto: dict, usuario: dict) -> None:
    with st.expander("Novo risco", icon=":material/add:"):
        descricao = st.text_area("Descrição do risco", key="pmo_risco_desc")
        col1, col2 = st.columns(2)
        probabilidade = col1.slider("Probabilidade (1-5)", 1, 5, 3, key="pmo_risco_prob")
        impacto = col2.slider("Impacto (1-5)", 1, 5, 3, key="pmo_risco_impacto")
        col3, col4 = st.columns(2)
        responsavel = col3.text_input("Responsável", key="pmo_risco_resp")
        status = col4.selectbox("Status", ["ABERTO", "EM MITIGAÇÃO", "ENCERRADO"], key="pmo_risco_status")
        plano_mitigacao = st.text_area("Plano de mitigação", key="pmo_risco_plano")
        if st.button("Registrar risco", icon=":material/save:", type="primary", key="pmo_risco_salvar"):
            if not descricao.strip():
                st.error("Descreva o risco.", icon=":material/error:")
            else:
                pmodb.inserir_risco(projeto["id"], {
                    "descricao": descricao.strip(), "probabilidade": probabilidade, "impacto": impacto,
                    "status": status, "responsavel": responsavel.strip() or None, "plano_mitigacao": plano_mitigacao.strip() or None,
                }, usuario["username"])
                st.rerun()

    riscos = pmodb.listar_riscos(projeto["id"])
    if riscos.empty:
        st.caption("Nenhum risco cadastrado ainda.")
        return
    exibicao = riscos.copy()
    exibicao["classificacao"] = exibicao["probabilidade"] * exibicao["impacto"]

    col1, col2, col3 = st.columns(3)
    col1.metric("Total de riscos", len(exibicao))
    col2.metric("Abertos", int((exibicao["status"] == "ABERTO").sum()))
    col3.metric("Críticos (≥15)", int(((exibicao["classificacao"] >= 15) & (exibicao["status"] == "ABERTO")).sum()))

    st.dataframe(
        exibicao[["descricao", "probabilidade", "impacto", "classificacao", "status", "responsavel"]].rename(columns={
            "descricao": "Descrição", "probabilidade": "Probabilidade", "impacto": "Impacto",
            "classificacao": "Classificação", "status": "Status", "responsavel": "Responsável",
        }).sort_values("Classificação", ascending=False),
        use_container_width=True, hide_index=True,
    )


# ---------------------------------------------------------------------------
# Comunicações
# ---------------------------------------------------------------------------


def _tab_comunicacoes(projeto: dict, usuario: dict) -> None:
    with st.expander("Nova comunicação", icon=":material/add:"):
        col1, col2 = st.columns(2)
        data_com = col1.date_input("Data", value=date.today(), format="DD/MM/YYYY", key="pmo_com_data")
        tipo = col2.selectbox("Tipo", ["Reunião", "Ofício", "E-mail", "Ata", "Outro"], key="pmo_com_tipo")
        descricao = st.text_area("Descrição", key="pmo_com_desc")
        responsavel = st.text_input("Responsável", key="pmo_com_resp")
        if st.button("Registrar comunicação", icon=":material/save:", type="primary", key="pmo_com_salvar"):
            if not descricao.strip():
                st.error("Descreva a comunicação.", icon=":material/error:")
            else:
                pmodb.inserir_comunicacao(projeto["id"], {
                    "data": data_com.isoformat(), "tipo": tipo, "descricao": descricao.strip(), "responsavel": responsavel.strip() or None,
                }, usuario["username"])
                st.rerun()

    comunicacoes = pmodb.listar_comunicacoes(projeto["id"])
    if comunicacoes.empty:
        st.caption("Nenhuma comunicação registrada ainda.")
        return
    st.dataframe(
        formatar_datas_df(comunicacoes, ["data"])[["data", "tipo", "descricao", "responsavel"]].rename(columns={
            "data": "Data", "tipo": "Tipo", "descricao": "Descrição", "responsavel": "Responsável",
        }),
        use_container_width=True, hide_index=True,
    )


# ---------------------------------------------------------------------------
# Reuniões e Planos de Ação (compartilhados, origem PMO)
# ---------------------------------------------------------------------------


def _tab_reunioes(projeto: dict, usuario: dict) -> None:
    with st.expander("Nova reunião", icon=":material/add:"):
        titulo = st.text_input("Título", key="pmo_reuniao_titulo")
        pauta = st.text_area("Pauta", key="pmo_reuniao_pauta")
        col1, col2 = st.columns(2)
        data_prevista = col1.date_input("Data prevista", value=date.today(), format="DD/MM/YYYY", key="pmo_reuniao_data")
        participantes_texto = col2.text_input("Participantes (separados por vírgula)", key="pmo_reuniao_participantes")
        ata = st.text_area("Ata (opcional)", key="pmo_reuniao_ata")
        if st.button("Registrar reunião", icon=":material/save:", type="primary", key="pmo_reuniao_salvar"):
            if not titulo.strip():
                st.error("Informe o título da reunião.", icon=":material/error:")
            else:
                participantes = [p.strip() for p in participantes_texto.split(",") if p.strip()]
                pmodb.criar_reuniao_pmo(projeto["id"], {
                    "titulo": titulo.strip(), "pauta": pauta.strip() or None,
                    "data_prevista": data_prevista.isoformat() if data_prevista else None, "ata": ata.strip() or None,
                }, participantes, usuario["username"])
                st.rerun()

    reunioes = pmodb.listar_reunioes_projeto(projeto["id"])
    if reunioes.empty:
        st.caption("Nenhuma reunião registrada ainda.")
        return
    st.dataframe(
        formatar_datas_df(reunioes, ["data_prevista", "data_realizada"])[["titulo", "pauta", "data_prevista", "origem"]].rename(columns={
            "titulo": "Título", "pauta": "Pauta", "data_prevista": "Data Prevista", "origem": "Origem",
        }),
        use_container_width=True, hide_index=True,
    )


def _tab_planos_acao(projeto: dict, usuario: dict) -> None:
    with st.expander("Novo plano de ação", icon=":material/add:"):
        descricao = st.text_area("Descrição", key="pmo_plano_desc")
        col1, col2 = st.columns(2)
        responsavel = col1.text_input("Responsável", key="pmo_plano_resp")
        prazo = col2.date_input("Prazo", value=None, format="DD/MM/YYYY", key="pmo_plano_prazo")
        if st.button("Registrar plano de ação", icon=":material/save:", type="primary", key="pmo_plano_salvar"):
            if not descricao.strip():
                st.error("Descreva o plano de ação.", icon=":material/error:")
            else:
                pmodb.criar_plano_acao_pmo(projeto["id"], {
                    "descricao": descricao.strip(), "responsavel": responsavel.strip() or None,
                    "prazo": prazo.isoformat() if prazo else None, "status": "PENDENTE",
                }, usuario["username"])
                st.rerun()

    planos = pmodb.listar_planos_acao_projeto(projeto["id"])
    if planos.empty:
        st.caption("Nenhum plano de ação registrado ainda.")
        return
    for _, linha in planos.iterrows():
        with st.container(border=True):
            col_info, col_acao = st.columns([4, 1])
            with col_info:
                st.markdown(f"**{linha['descricao']}**")
                st.caption(f"Responsável: {linha.get('responsavel') or '—'} · Prazo: {formatar_data_br(linha.get('prazo'))} · Status: {linha['status']}")
            with col_acao:
                if linha["status"] != "CONCLUÍDO" and st.button("Concluir", key=f"pmo_plano_concluir_{linha['id']}", use_container_width=True):
                    pmodb.atualizar_plano_acao_pmo(int(linha["id"]), {
                        "descricao": linha["descricao"], "responsavel": linha["responsavel"], "prazo": linha["prazo"], "status": "CONCLUÍDO",
                    }, usuario["username"])
                    st.rerun()


# ---------------------------------------------------------------------------
# Relatórios e OPR
# ---------------------------------------------------------------------------


def _tab_relatorios(projeto: dict, habilitados: set[str], usuario: dict) -> None:
    tipo_rotulo = st.selectbox("Tipo de relatório", list(TITULOS_RELATORIO.values()), key="pmo_relatorio_tipo")
    tipo_chave = next(k for k, v in TITULOS_RELATORIO.items() if v == tipo_rotulo)
    if st.button("Gerar relatório (Word)", icon=":material/description:", type="primary", key="pmo_gerar_relatorio"):
        conteudo = gerar_relatorio_pmo(projeto, tipo_chave, habilitados, usuario["username"])
        st.download_button(
            "Baixar relatório (Word)", data=conteudo, file_name=nome_arquivo_relatorio_pmo(projeto["nome"], tipo_chave),
            mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document", key="pmo_baixar_relatorio",
        )


def _tab_opr(projeto: dict, habilitados: set[str], usuario: dict) -> None:
    st.caption("OPR — resumo de uma página com dados gerais, KPIs habilitados, cronograma, financeiro, medições, riscos e pendências.")
    if st.button("Gerar OPR (Word)", icon=":material/description:", type="primary", key="pmo_gerar_opr"):
        conteudo = gerar_opr_pmo(projeto, habilitados, usuario["username"])
        st.download_button(
            "Baixar OPR (Word)", data=conteudo, file_name=nome_arquivo_relatorio_pmo(projeto["nome"], "executivo").replace("Relatório_Executivo", "OPR"),
            mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document", key="pmo_baixar_opr",
        )


# ---------------------------------------------------------------------------
# Biblioteca de KPIs
# ---------------------------------------------------------------------------


def _tab_biblioteca_kpis(habilitados: set[str]) -> None:
    st.caption("Todos os indicadores disponíveis no PMO — os habilitados neste projeto aparecem destacados.")
    for chave in KPI_ORDEM:
        kpi = BIBLIOTECA_KPIS[chave]
        destaque = chave in habilitados
        with st.expander(f"{'✅ ' if destaque else ''}{kpi['nome']}", icon=":material/help:"):
            st.markdown(f"**Objetivo:** {kpi['objetivo']}")
            st.markdown(f"**Fórmula:** {kpi['formula']}")
            st.markdown(f"**Interpretação:** {kpi['interpretacao']}")
            st.markdown(f"**Exemplo prático:** {kpi['exemplo']}")


# ---------------------------------------------------------------------------
# Configuração do Projeto
# ---------------------------------------------------------------------------

_STATUS_PROJETO = ["EM ANDAMENTO", "PAUSADO", "CONCLUÍDO", "CANCELADO"]


def _tab_configuracao(projeto: dict, habilitados: set[str], usuario: dict) -> None:
    col1, col2, col3 = st.columns(3)
    with col1:
        if st.button("Editar dados do projeto", icon=":material/edit:", use_container_width=True):
            dialog_editar_projeto(usuario["username"], projeto)
    with col2:
        if st.button("Configurar Indicadores", icon=":material/tune:", use_container_width=True):
            dialog_configurar_kpis(usuario["username"], projeto["id"])
    with col3:
        if perfil_pode_arquivar_e_restaurar(usuario.get("perfil")) and st.button(
            "Arquivar Projeto", icon=":material/archive:", use_container_width=True
        ):
            dialog_arquivar("pmo_projetos", projeto["id"], projeto["nome"], usuario["username"], ao_concluir=_voltar_portfolio)

    st.markdown("###### Status do projeto")
    novo_status = st.selectbox(
        "Status", _STATUS_PROJETO, index=_STATUS_PROJETO.index(projeto["status"]) if projeto.get("status") in _STATUS_PROJETO else 0,
        key="pmo_config_status",
    )
    if novo_status != projeto.get("status") and st.button("Salvar status", icon=":material/save:", key="pmo_salvar_status"):
        pmodb.definir_status_projeto(projeto["id"], novo_status, usuario["username"])
        st.rerun()

    st.markdown("###### Observações")
    st.write(projeto.get("observacoes") or "Nenhuma observação registrada.")


# ---------------------------------------------------------------------------
# Entrada principal
# ---------------------------------------------------------------------------

_RENDER_KPI_TAB = {
    "cronograma": _tab_cronograma, "curva_s": _tab_curva_s, "financeiro": _tab_financeiro,
    "medicoes": _tab_medicoes, "entregaveis": _tab_entregaveis, "riscos": _tab_riscos, "comunicacoes": _tab_comunicacoes,
}


def render(usuario: dict) -> None:
    exigir_area(usuario, "pmo")

    projeto_id = st.session_state.get("pmo_projeto_selecionado")
    if not projeto_id:
        st.warning("Nenhum projeto selecionado. Volte ao Portfólio e escolha um projeto.", icon=":material/info:")
        if st.button("Voltar ao Portfólio", icon=":material/arrow_back:"):
            _voltar_portfolio()
        return

    projeto = pmodb.obter_projeto(projeto_id)
    if projeto is None:
        st.error("Projeto não encontrado.", icon=":material/error:")
        if st.button("Voltar ao Portfólio", icon=":material/arrow_back:"):
            _voltar_portfolio()
        return

    pmodb.verificar_e_gerar_lembretes_cronograma()
    projeto = _recalcular_status(projeto)
    habilitados = pmodb.kpis_habilitados_projeto(projeto_id)

    if st.button("← Voltar ao Portfólio", key="pmo_voltar_projeto"):
        _voltar_portfolio()

    st.subheader(f":material/folder_open: {projeto['nome']}")
    st.caption(f"Cliente: {projeto.get('cliente') or '—'} · Contratada: {projeto.get('contratada') or '—'} · Gerente: {projeto.get('gerente') or '—'}")

    rotulos = ["Resumo Executivo", "Dashboard"]
    rotulos += [rotulo for chave, rotulo in _TABS_POR_KPI if chave in habilitados]
    rotulos += ["Reuniões", "Planos de Ação", "Relatórios", "OPR", "Biblioteca de KPIs", "Configuração"]

    abas = st.tabs(rotulos)
    indice = 0
    with abas[indice]:
        _tab_resumo_executivo(projeto, habilitados)
    indice += 1
    with abas[indice]:
        _tab_dashboard(projeto, habilitados)
    indice += 1
    for chave, _rotulo in _TABS_POR_KPI:
        if chave in habilitados:
            with abas[indice]:
                _RENDER_KPI_TAB[chave](projeto, usuario)
            indice += 1
    with abas[indice]:
        _tab_reunioes(projeto, usuario)
    indice += 1
    with abas[indice]:
        _tab_planos_acao(projeto, usuario)
    indice += 1
    with abas[indice]:
        _tab_relatorios(projeto, habilitados, usuario)
    indice += 1
    with abas[indice]:
        _tab_opr(projeto, habilitados, usuario)
    indice += 1
    with abas[indice]:
        _tab_biblioteca_kpis(habilitados)
    indice += 1
    with abas[indice]:
        _tab_configuracao(projeto, habilitados, usuario)
