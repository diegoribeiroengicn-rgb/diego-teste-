"""
Sistema GAT 2026 — Controle de Análises Técnicas (Tecnoplano)
==============================================================

Ponto de entrada da aplicação Streamlit. Responsável por:
* Inicializar o banco de dados SQLite;
* Aplicar a identidade visual institucional Tecnoplano;
* Bloquear o acesso até autenticação válida (login seguro);
* Orquestrar a navegação entre os módulos do sistema.
"""

from __future__ import annotations

from datetime import datetime

import streamlit as st

from gat.auth import logout, tela_login, usuario_atual, usuario_autenticado
from gat.config import PERFIL_ADMIN
from gat.database import init_db
from gat.export_excel import gerar_relatorio_excel
from gat.styles import cabecalho_institucional, injetar_css_global, logo_base64
from views import administracao, alertas, cessionarios, dashboard, prestadores

st.set_page_config(
    page_title="GAT 2026 · Tecnoplano",
    page_icon="📐",
    layout="wide",
    initial_sidebar_state="expanded",
)

init_db()
injetar_css_global()

if not usuario_autenticado():
    tela_login()
    st.stop()

usuario = usuario_atual()

# ---------------------------------------------------------------------------
# Cabeçalho institucional
# ---------------------------------------------------------------------------
cabecalho_institucional(subtitulo=f"{usuario['nome_completo'] or usuario['username']} · {datetime.now().strftime('%d/%m/%Y')}")

# ---------------------------------------------------------------------------
# Sidebar — navegação
# ---------------------------------------------------------------------------
with st.sidebar:
    logo_b64 = logo_base64()
    if logo_b64:
        st.markdown(
            f'<div style="text-align:center;padding:8px 0 16px 0">'
            f'<img src="data:image/png;base64,{logo_b64}" style="height:38px;object-fit:contain"/></div>',
            unsafe_allow_html=True,
        )
    st.markdown(f"**{usuario['nome_completo'] or usuario['username']}**")
    st.caption(f"Perfil: {usuario['perfil']}")
    st.divider()

    opcoes_menu = [
        "📊 Painel Geral",
        "📐 Análise de Prestadores",
        "🏬 Análise de Cessionários",
        "🚨 Alertas Críticos",
    ]
    if usuario["perfil"] == PERFIL_ADMIN:
        opcoes_menu.append("⚙️ Administração")

    pagina = st.radio("Navegação", opcoes_menu, label_visibility="collapsed")

    st.divider()
    st.download_button(
        "⬇️ Exportar Relatório Excel",
        data=gerar_relatorio_excel(),
        file_name=f"GAT_2026_Relatorio_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        use_container_width=True,
    )

    if st.button("🚪 Sair", use_container_width=True):
        logout()

# ---------------------------------------------------------------------------
# Roteamento de páginas
# ---------------------------------------------------------------------------
if pagina == "📊 Painel Geral":
    dashboard.render(usuario)
elif pagina == "📐 Análise de Prestadores":
    prestadores.render(usuario)
elif pagina == "🏬 Análise de Cessionários":
    cessionarios.render(usuario)
elif pagina == "🚨 Alertas Críticos":
    alertas.render(usuario)
elif pagina == "⚙️ Administração":
    administracao.render(usuario)
