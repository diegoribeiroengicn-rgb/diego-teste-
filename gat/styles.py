"""
Injeção de CSS customizado para dar identidade visual Tecnoplano ao
Streamlit, incluindo a aparência de "janela flutuante" para os
pop-ups/modais (`st.dialog`) de cadastro e edição.
"""

import base64

import streamlit as st

from gat.config import CORES, LOGO_PATH


def logo_base64() -> str:
    """Retorna a logomarca Tecnoplano codificada em base64 para uso em CSS/HTML."""
    if not LOGO_PATH.exists():
        return ""
    return base64.b64encode(LOGO_PATH.read_bytes()).decode("utf-8")


def injetar_css_global() -> None:
    """Injeta o CSS institucional Tecnoplano em toda a aplicação."""
    css = f"""
    <style>
    :root {{
        --gat-navy: {CORES['navy']};
        --gat-azul: {CORES['azul']};
        --gat-azul-2: {CORES['azul_2']};
        --gat-verde: {CORES['verde']};
        --gat-vermelho: {CORES['vermelho']};
        --gat-laranja: {CORES['laranja']};
        --gat-dourado: {CORES['dourado']};
        --gat-bg: {CORES['bg']};
        --gat-borda: {CORES['borda']};
    }}

    /* ---- Fundo geral e tipografia ---- */
    .stApp {{
        background: var(--gat-bg);
    }}

    /* ---- Cabeçalho institucional ---- */
    .gat-topbar {{
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #ffffff;
        border-bottom: 3px solid var(--gat-navy);
        padding: 10px 24px;
        border-radius: 10px;
        box-shadow: 0 2px 10px rgba(27,58,138,.15);
        margin-bottom: 18px;
    }}
    .gat-topbar-title {{
        font-size: 13px;
        color: var(--gat-navy);
        letter-spacing: 2px;
        text-transform: uppercase;
        font-weight: 700;
        margin-left: 14px;
    }}
    .gat-topbar-sub {{
        font-size: 11px;
        color: #64748B;
    }}

    /* ---- Cartões de KPI ---- */
    .gat-kpi-card {{
        background: #ffffff;
        border: 1px solid var(--gat-borda);
        border-left: 5px solid var(--gat-navy);
        border-radius: 10px;
        padding: 14px 16px;
        box-shadow: 0 1px 4px rgba(15,23,42,.06);
    }}
    .gat-kpi-label {{
        font-size: 11px;
        color: #64748B;
        text-transform: uppercase;
        letter-spacing: .5px;
        font-weight: 600;
    }}
    .gat-kpi-value {{
        font-size: 26px;
        font-weight: 700;
        color: var(--gat-navy);
    }}
    .gat-kpi-delta {{
        font-size: 11px;
        font-weight: 600;
    }}

    /* ---- Badges de status ---- */
    .gat-badge {{
        display: inline-block;
        padding: 3px 10px;
        border-radius: 100px;
        font-size: 11px;
        font-weight: 600;
        color: #ffffff;
        white-space: nowrap;
    }}

    /* ---- Botões padrão Streamlit com identidade Tecnoplano ---- */
    .stButton > button {{
        background: var(--gat-navy);
        color: #ffffff;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        transition: all .15s ease-in-out;
    }}
    .stButton > button:hover {{
        background: var(--gat-azul-2);
        color: #ffffff;
        box-shadow: 0 2px 8px rgba(27,58,138,.35);
    }}
    .stButton > button[kind="secondary"] {{
        background: #ffffff;
        color: var(--gat-navy);
        border: 1px solid var(--gat-navy);
    }}
    .stDownloadButton > button {{
        background: var(--gat-verde);
        color: #ffffff;
        border: none;
        border-radius: 8px;
        font-weight: 600;
    }}

    /* ---- Sidebar ---- */
    section[data-testid="stSidebar"] {{
        background: #ffffff;
        border-right: 1px solid var(--gat-borda);
    }}

    /* ---- Aparência de pop-up flutuante para st.dialog ---- */
    div[data-testid="stDialog"] div[role="dialog"] {{
        border-top: 6px solid var(--gat-navy);
        border-radius: 14px;
        box-shadow: 0 20px 60px rgba(15,23,42,.35);
    }}
    div[data-testid="stDialog"] h1,
    div[data-testid="stDialog"] h2,
    div[data-testid="stDialog"] h3 {{
        color: var(--gat-navy);
    }}

    /* ---- Tabelas ---- */
    div[data-testid="stDataFrame"] {{
        border: 1px solid var(--gat-borda);
        border-radius: 8px;
    }}

    /* ---- Tabs ---- */
    .stTabs [data-baseweb="tab"] {{
        font-weight: 600;
        color: #64748B;
    }}
    .stTabs [aria-selected="true"] {{
        color: var(--gat-navy) !important;
        border-bottom-color: var(--gat-azul) !important;
    }}

    #MainMenu {{visibility: hidden;}}
    footer {{visibility: hidden;}}
    </style>
    """
    st.markdown(css, unsafe_allow_html=True)


def cabecalho_institucional(subtitulo: str = "") -> None:
    """Renderiza o cabeçalho com a logomarca Tecnoplano e título do sistema."""
    logo_b64 = logo_base64()
    logo_html = (
        f'<img src="data:image/png;base64,{logo_b64}" style="height:32px;object-fit:contain" />'
        if logo_b64 else "<strong>TECNOPLANO</strong>"
    )
    st.markdown(
        f"""
        <div class="gat-topbar">
            <div style="display:flex;align-items:center;">
                {logo_html}
                <span class="gat-topbar-title">GAT 2026 · Controle de Análises Técnicas</span>
            </div>
            <div class="gat-topbar-sub">{subtitulo}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def badge_html(texto: str, cor_hex: str) -> str:
    """Gera o HTML de um badge colorido para exibição de status em tabelas/cards."""
    return f'<span class="gat-badge" style="background:{cor_hex}">{texto}</span>'


def kpi_card_html(label: str, valor: str, cor_hex: str | None = None) -> str:
    """Gera o HTML de um cartão de KPI no padrão visual Tecnoplano."""
    borda = f"border-left-color:{cor_hex};" if cor_hex else ""
    return f"""
    <div class="gat-kpi-card" style="{borda}">
        <div class="gat-kpi-label">{label}</div>
        <div class="gat-kpi-value">{valor}</div>
    </div>
    """
