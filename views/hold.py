"""View: Lista de Projetos em HOLD (itens 4/5 do módulo de HOLD) —
acessada pelos cards "Projetos em HOLD" da Página Inicial de Prestadores
e Cessionários. HOLD não é atraso: apresentação neutra, sem o tom visual
usado para atrasados/SLA vencido (item 8)."""

from __future__ import annotations

from datetime import date

import pandas as pd
import streamlit as st

from gat.alertas_engine import LIMIAR_DIAS_UTEIS_ACOMPANHAMENTO_HOLD, TIPO_ACOMPANHAMENTO_HOLD
from gat.business_rules import enriquecer_cessionarios, enriquecer_prestadores, filtrar_ativos
from gat.calendario import dias_corridos_entre, dias_uteis_hold_aberto
from gat.database import listar_cessionarios, listar_obras_prestador, listar_prestadores, listar_radar
from gat.normalizacao import texto_seguro
from gat.permissions import exigir_modulo, pode_area
from gat.ui.formatos import formatar_data_br
from gat.ui.modals_hold import dialog_tratativa_hold

_STATUS_RADAR_ATIVOS = {"PENDENTE", "EM_TRATAMENTO", "REABERTO"}


def _situacao_tratativa(dias_uteis: int, status_radar: str) -> str:
    if dias_uteis < LIMIAR_DIAS_UTEIS_ACOMPANHAMENTO_HOLD:
        return "Em HOLD"
    if status_radar == "TRATADO":
        return "Tratativa realizada — permanece em HOLD"
    if status_radar == "EM_TRATAMENTO":
        return "Em tratamento"
    return "Acompanhamento pendente"


def render(usuario: dict, modulo: str) -> None:
    exigir_modulo(usuario, modulo)
    rotulo_modulo = "Prestadores" if modulo == "prestadores" else "Cessionários"
    coluna_nome = "prestador" if modulo == "prestadores" else "cessionario"

    st.subheader(f":material/pause_circle: Projetos em HOLD — {rotulo_modulo}")
    st.caption(
        "Projetos temporariamente paralisados. HOLD não é atraso — pausa o SLA enquanto durar. "
        "Após 3 dias úteis em HOLD, é recomendado o acompanhamento com o especialista."
    )

    if modulo == "prestadores":
        df = enriquecer_prestadores(filtrar_ativos(listar_prestadores()))
    else:
        df = enriquecer_cessionarios(filtrar_ativos(listar_cessionarios()))

    if df.empty or "em_hold" not in df.columns:
        st.info("Nenhum projeto em HOLD no momento.", icon=":material/pause_circle:")
        return

    em_hold = df[df["em_hold"].fillna(False).astype(bool)].copy()
    if em_hold.empty:
        st.info("Nenhum projeto em HOLD no momento.", icon=":material/pause_circle:")
        return

    if modulo == "prestadores":
        obras = listar_obras_prestador()
        mapa_obras = obras.set_index("id")["nome_obra"].to_dict() if not obras.empty else {}
        em_hold["_obra"] = em_hold.get("obra_id", pd.Series(dtype="Int64")).map(mapa_obras)

    radar = listar_radar()
    status_por_projeto: dict[int, str] = {}
    if not radar.empty:
        relevantes = radar[(radar["modulo"] == modulo) & (radar["tipo_alerta"] == TIPO_ACOMPANHAMENTO_HOLD)]
        status_por_projeto = dict(zip(relevantes["projeto_id"], relevantes["status"]))

    st.metric("Total em HOLD", len(em_hold))
    st.markdown("---")

    pode_tratar = pode_area(usuario, f"{modulo}.editar")

    for _, row in em_hold.sort_values("hold_inicio").iterrows():
        dias_uteis = dias_uteis_hold_aberto(row.get("hold_inicio"))
        dias_corridos = dias_corridos_entre(row.get("hold_inicio"), date.today().isoformat()) or 0
        status_radar_atual = status_por_projeto.get(row["id"], "PENDENTE")
        situacao = _situacao_tratativa(dias_uteis, status_radar_atual)
        dias_restantes_pausa = None
        if modulo == "prestadores" and pd.notna(row.get("sla_dias")) and pd.notna(row.get("dias_uteis_decorridos")):
            dias_restantes_pausa = int(row["sla_dias"]) - int(row["dias_uteis_decorridos"])
        elif modulo == "cessionarios" and pd.notna(row.get("saldo_dias_uteis")):
            dias_restantes_pausa = int(row["saldo_dias_uteis"])

        with st.container(border=True):
            col_info, col_situacao = st.columns([3, 1])
            with col_info:
                nome = texto_seguro(row.get(coluna_nome)).strip() or "—"
                codigo = texto_seguro(row.get("codigo")).strip() or "—"
                titulo = f"**{nome}** ({codigo})"
                obra = texto_seguro(row.get("_obra")).strip() if modulo == "prestadores" else ""
                if obra:
                    titulo += f" · Obra: {obra}"
                luc = texto_seguro(row.get("luc")).strip() if modulo == "cessionarios" else ""
                if luc:
                    titulo += f" · LUC: {luc}"
                st.markdown(titulo)
                disciplina = texto_seguro(row.get("disciplina")).strip() or "—"
                responsavel = texto_seguro(row.get("responsavel")).strip() or "—"
                num_at = texto_seguro(row.get("num_at")).strip() or "—"
                st.caption(f"Disciplina: {disciplina} · Responsável: {responsavel} · N° AT {num_at}")
                st.caption(
                    f"Em HOLD desde {formatar_data_br(row.get('hold_inicio'))} · {dias_corridos} dia(s) corrido(s) · "
                    f"{dias_uteis} dia(s) útil(eis)"
                    + (f" · Dias restantes de SLA no momento da pausa: {dias_restantes_pausa}" if dias_restantes_pausa is not None else "")
                )
            with col_situacao:
                st.caption(f"Situação: **{situacao}**")
                st.caption(f"Alerta de {LIMIAR_DIAS_UTEIS_ACOMPANHAMENTO_HOLD} dias: {'Sim' if dias_uteis >= LIMIAR_DIAS_UTEIS_ACOMPANHAMENTO_HOLD else 'Não'}")

            if pode_tratar and st.button(
                "Registrar tratativa", icon=":material/edit_note:", key=f"hold_tratativa_{modulo}_{row['id']}",
            ):
                dialog_tratativa_hold(usuario, modulo, row.to_dict())
