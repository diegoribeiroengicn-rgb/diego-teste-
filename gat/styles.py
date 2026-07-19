"""
Injeção de CSS customizado para dar identidade visual Tecnoplano ao
Streamlit — inspirada em sistemas corporativos (Microsoft 365, SAP Fiori,
Azure Portal, Power BI Service): sóbria, com tipografia legível e ícones
padronizados (Material Symbols), incluindo a aparência de "janela
flutuante" para os pop-ups/modais (`st.dialog`) de cadastro e edição.
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
        --gat-azul-3: {CORES['azul_3']};
        --gat-verde: {CORES['verde']};
        --gat-vermelho: {CORES['vermelho']};
        --gat-laranja: {CORES['laranja']};
        --gat-dourado: {CORES['dourado']};
        --gat-bg: {CORES['bg']};
        --gat-borda: {CORES['borda']};
        --gat-texto: {CORES['texto']};
        --gat-texto-fraco: {CORES['texto_fraco']};
    }}

    /* ---- Fundo geral e tipografia ---- */
    html, body, .stApp {{
        background: var(--gat-bg);
        font-size: 16px;
        color: var(--gat-texto);
    }}
    p, li, label, .stMarkdown {{
        font-size: 0.95rem;
        line-height: 1.55;
    }}
    h1, h2, h3 {{
        color: var(--gat-navy);
        font-weight: 700;
        letter-spacing: -.2px;
    }}
    h3 {{ font-size: 1.35rem; margin-bottom: .3rem; }}

    /* ---- Bloco principal: respiro entre seções ---- */
    div[data-testid="stMainBlockContainer"] {{
        padding-top: 1.6rem;
    }}
    div[data-testid="stVerticalBlock"] > div[data-testid="stElementContainer"] {{
        margin-bottom: .15rem;
    }}

    /* ---- Cabeçalho institucional ---- */
    .gat-topbar {{
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #ffffff;
        border-bottom: 3px solid var(--gat-navy);
        padding: 14px 26px;
        border-radius: 10px;
        box-shadow: 0 2px 10px rgba(27,58,138,.12);
        margin-bottom: 24px;
    }}
    .gat-topbar-title {{
        font-size: 13px;
        color: var(--gat-navy);
        letter-spacing: 1.6px;
        text-transform: uppercase;
        font-weight: 700;
        margin-left: 16px;
    }}
    .gat-topbar-sub {{
        font-size: 12px;
        color: var(--gat-texto-fraco);
    }}

    /* ---- Cartões de KPI ---- */
    .gat-kpi-card {{
        background: #ffffff;
        border: 1px solid var(--gat-borda);
        border-left: 4px solid var(--gat-navy);
        border-radius: 8px;
        padding: 18px 20px;
        box-shadow: 0 1px 3px rgba(15,23,42,.05);
        margin-bottom: 4px;
    }}
    .gat-kpi-label {{
        font-size: 11.5px;
        color: var(--gat-texto-fraco);
        text-transform: uppercase;
        letter-spacing: .6px;
        font-weight: 600;
    }}
    .gat-kpi-value {{
        font-size: 28px;
        font-weight: 700;
        color: var(--gat-navy);
        margin-top: 4px;
    }}

    /* ---- Badges de status ---- */
    .gat-badge {{
        display: inline-block;
        padding: 3px 11px;
        border-radius: 4px;
        font-size: 11.5px;
        font-weight: 600;
        color: #ffffff;
        white-space: nowrap;
        letter-spacing: .2px;
    }}

    /* ---- Botões: primário (navy sólido), secundário (contorno discreto) ---- */
    .stButton > button, .stDownloadButton > button, .stFormSubmitButton > button {{
        border-radius: 6px;
        font-weight: 600;
        font-size: .92rem;
        padding: .45rem 1.1rem;
        transition: all .12s ease-in-out;
        border: 1px solid var(--gat-borda-forte, #CBD5E1);
        background: #ffffff;
        color: var(--gat-navy);
    }}
    .stButton > button:hover, .stDownloadButton > button:hover, .stFormSubmitButton > button:hover,
    .stButton > button:focus-visible, .stDownloadButton > button:focus-visible, .stFormSubmitButton > button:focus-visible,
    .stButton > button:focus, .stDownloadButton > button:focus, .stFormSubmitButton > button:focus {{
        border-color: var(--gat-navy);
        background: var(--gat-azul-3);
        color: var(--gat-navy);
    }}
    /* Streamlit usa kind="primary" para st.button e kind="primaryFormSubmit"
       para st.form_submit_button — por isso o seletor usa `*=` (contém). */
    button[kind*="primary"] {{
        background: var(--gat-navy);
        color: #ffffff;
        border: 1px solid var(--gat-navy);
    }}
    button[kind*="primary"]:hover, button[kind*="primary"]:focus-visible, button[kind*="primary"]:focus {{
        background: var(--gat-azul-2);
        border-color: var(--gat-azul-2);
        color: #ffffff;
        box-shadow: 0 2px 6px rgba(27,58,138,.25);
    }}
    button[kind*="primary"] p, button[kind*="primary"] span[data-testid="stIconMaterial"] {{
        color: #ffffff !important;
    }}

    /* ---- Botão destrutivo (uso pontual: ex. desativar usuário) ----
       Aplicado envolvendo o botão em st.container(key="...destrutivo...") */
    div[class*="st-key-"][class*="destrutivo"] .stButton > button {{
        color: var(--gat-vermelho);
        border-color: var(--gat-vermelho);
        background: #ffffff;
    }}
    div[class*="st-key-"][class*="destrutivo"] .stButton > button:hover,
    div[class*="st-key-"][class*="destrutivo"] .stButton > button:focus-visible,
    div[class*="st-key-"][class*="destrutivo"] .stButton > button:focus {{
        background: {CORES['vermelho_bg']};
        color: var(--gat-vermelho);
        border-color: var(--gat-vermelho);
    }}

    /* ---- Sidebar ---- */
    section[data-testid="stSidebar"] {{
        background: #ffffff;
        border-right: 1px solid var(--gat-borda);
    }}
    section[data-testid="stSidebar"] p {{
        font-size: .9rem;
    }}

    /* ---- Navegação lateral (st.navigation): item ativo em destaque ---- */
    header[data-testid="stNavSectionHeader"] p {{
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: .8px;
        font-weight: 700;
        color: var(--gat-texto-fraco);
    }}
    a[data-testid="stSidebarNavLink"] {{
        border-radius: 6px;
        margin: 1px 0;
        transition: background .12s ease-in-out;
    }}
    a[data-testid="stSidebarNavLink"]:hover {{
        background: var(--gat-superficie-2, #F1F5F9);
    }}
    a[data-testid="stSidebarNavLink"][aria-current="page"] {{
        background: var(--gat-azul-3);
        border-left: 3px solid var(--gat-navy);
    }}
    a[data-testid="stSidebarNavLink"][aria-current="page"] p {{
        color: var(--gat-navy) !important;
        font-weight: 700;
    }}
    a[data-testid="stSidebarNavLink"][aria-current="page"] span[data-testid="stIconMaterial"] {{
        color: var(--gat-navy) !important;
    }}

    /* ---- Aparência de pop-up flutuante para st.dialog ---- */
    div[data-testid="stDialog"] div[role="dialog"] {{
        border-top: 6px solid var(--gat-navy);
        border-radius: 12px;
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
        border-radius: 6px;
    }}

    /* ---- Expanders (filtros) ---- */
    div[data-testid="stExpander"] summary {{
        font-weight: 600;
        font-size: .92rem;
    }}

    /* ---- Tabs ---- */
    .stTabs [data-baseweb="tab"] {{
        font-weight: 600;
        font-size: .92rem;
        color: var(--gat-texto-fraco);
    }}
    .stTabs [aria-selected="true"] {{
        color: var(--gat-navy) !important;
        border-bottom-color: var(--gat-azul) !important;
    }}

    /* ---- Métricas nativas (st.metric) ---- */
    div[data-testid="stMetric"] {{
        background: #ffffff;
        border: 1px solid var(--gat-borda);
        border-radius: 8px;
        padding: 12px 16px;
    }}
    div[data-testid="stMetricLabel"] p {{
        font-size: 11.5px;
        text-transform: uppercase;
        letter-spacing: .5px;
        color: var(--gat-texto-fraco);
        font-weight: 600;
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
