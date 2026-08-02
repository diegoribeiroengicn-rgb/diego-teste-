"""
Injeção de CSS customizado para dar identidade visual Tecnoplano ao
Streamlit — inspirada em sistemas corporativos (Microsoft 365, SAP Fiori,
Azure Portal, Power BI Service): sóbria, com tipografia legível e ícones
padronizados (Material Symbols), incluindo a aparência de "janela
flutuante" para os pop-ups/modais (`st.dialog`) de cadastro e edição.

Suporta Tema Claro e Tema Escuro através de um único conjunto de
variáveis CSS (`--gat-*`) — a função é chamada novamente a cada rerun do
Streamlit com o tema atual do usuário, então a troca é imediata (não
exige reload de página nem novo login). A logomarca da Tecnoplano nunca
recebe filtro de cor: é a mesma imagem, incólume, nos dois temas.
"""

import base64

import streamlit as st

from gat.config import CORES, LOGO_PATH

TEMA_CLARO = "claro"
TEMA_ESCURO = "escuro"

# Paleta do Tema Escuro: tons neutros de grafite e azul institucional mais
# claro (para contraste em fundo escuro), evitando preto absoluto e
# branco puro, conforme o padrão visual do sistema (ver Manual do
# Sistema > "Padrão visual do sistema").
_PALETA_ESCURA = {
    "bg": "#10141C",
    "superficie_1": "#1A212C",
    "superficie_2": "#232B38",
    "superficie_3": "#1E2A47",
    "borda": "#2E3646",
    "borda_forte": "#3D4759",
    "navy": "#7FA8F2",
    "azul": "#5B8DEF",
    "azul_2": "#4C7EE0",
    "azul_3": "#1E2A47",
    "texto": "#E2E8F0",
    "texto_fraco": "#9FADC2",
    "vermelho_bg": "#3A1F22",
}


def _paleta(tema: str) -> dict:
    cores = dict(CORES)
    if tema == TEMA_ESCURO:
        cores.update(_PALETA_ESCURA)
    return cores


def logo_base64() -> str:
    """Retorna a logomarca Tecnoplano codificada em base64 para uso em CSS/HTML."""
    if not LOGO_PATH.exists():
        return ""
    return base64.b64encode(LOGO_PATH.read_bytes()).decode("utf-8")


def injetar_css_global(tema: str = TEMA_CLARO) -> None:
    """Injeta o CSS institucional Tecnoplano em toda a aplicação, no Tema
    Claro (padrão) ou Escuro conforme a preferência do usuário logado."""
    cores = _paleta(tema)
    escuro = tema == TEMA_ESCURO
    superficie_1 = cores["superficie_1"]
    css = f"""
    <style>
    :root {{
        --gat-navy: {cores['navy']};
        --gat-azul: {cores['azul']};
        --gat-azul-2: {cores['azul_2']};
        --gat-azul-3: {cores['azul_3']};
        --gat-verde: {cores['verde']};
        --gat-vermelho: {cores['vermelho']};
        --gat-laranja: {cores['laranja']};
        --gat-dourado: {cores['dourado']};
        --gat-bg: {cores['bg']};
        --gat-superficie-1: {superficie_1};
        --gat-superficie-2: {cores['superficie_2']};
        --gat-borda: {cores['borda']};
        --gat-borda-forte: {cores['borda_forte']};
        --gat-texto: {cores['texto']};
        --gat-texto-fraco: {cores['texto_fraco']};
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
        color: var(--gat-texto);
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
        background: {superficie_1};
        border-bottom: 3px solid var(--gat-navy);
        padding: 14px 26px;
        border-radius: 10px;
        box-shadow: 0 2px 10px rgba(15,23,42,{'.35' if escuro else '.12'});
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
        background: {superficie_1};
        border: 1px solid var(--gat-borda);
        border-left: 4px solid var(--gat-navy);
        border-radius: 8px;
        padding: 18px 20px;
        box-shadow: 0 1px 3px rgba(15,23,42,{'.3' if escuro else '.05'});
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
        border: 1px solid var(--gat-borda-forte);
        background: {superficie_1};
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
        background: {superficie_1};
    }}
    div[class*="st-key-"][class*="destrutivo"] .stButton > button:hover,
    div[class*="st-key-"][class*="destrutivo"] .stButton > button:focus-visible,
    div[class*="st-key-"][class*="destrutivo"] .stButton > button:focus {{
        background: {cores['vermelho_bg']};
        color: var(--gat-vermelho);
        border-color: var(--gat-vermelho);
    }}

    /* ---- Cabeçalho nativo do Streamlit (barra superior) ---- */
    header[data-testid="stHeader"] {{
        background: var(--gat-bg);
    }}
    header[data-testid="stHeader"] * {{
        color: var(--gat-texto);
    }}

    /* ---- Sidebar ---- */
    section[data-testid="stSidebar"] {{
        background: {superficie_1};
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
    a[data-testid="stSidebarNavLink"] p, a[data-testid="stSidebarNavLink"] span[data-testid="stIconMaterial"] {{
        color: var(--gat-texto);
    }}
    a[data-testid="stSidebarNavLink"]:hover {{
        background: var(--gat-superficie-2);
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
        background: {superficie_1};
        border-top: 6px solid var(--gat-navy);
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(15,23,42,{'.6' if escuro else '.35'});
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
    div[data-testid="stExpander"] {{
        background: {superficie_1};
        border-color: var(--gat-borda);
    }}
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
        background: {superficie_1};
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

    /* ---- Formulários, campos de texto, seletores, calendário ----
       Streamlit >= 1.5x usa React Aria (não mais BaseWeb) para
       selectbox/multiselect/combobox/calendário — os seletores abaixo
       cobrem os dois modelos (o BaseWeb fica como reforço/compatibilidade). */
    div[data-testid="stTextInput"] input, div[data-testid="stTextArea"] textarea,
    div[data-testid="stNumberInput"] input, div[data-baseweb="select"] > div,
    div[data-testid="stDateInput"] input,
    div[data-testid="stSelectbox"] input, div[data-testid="stMultiSelect"] input,
    div[data-testid="stSelectbox"] [role="group"], div[data-testid="stMultiSelect"] [role="group"],
    [data-rac] input, [data-rac][role="group"] {{
        background: {superficie_1};
        color: var(--gat-texto);
        border-color: var(--gat-borda-forte);
    }}
    div[data-baseweb="popover"], div[data-baseweb="calendar"], div[data-baseweb="menu"],
    [role="listbox"], [role="option"], [role="dialog"][data-rac],
    div[id^="react-aria"], div[class*="ListBox"], ul[data-rac] {{
        background: {superficie_1} !important;
        color: var(--gat-texto);
    }}
    [role="option"]:hover, [role="option"][data-focused="true"], [role="option"][aria-selected="true"] {{
        background: var(--gat-superficie-2) !important;
    }}
    div[data-testid="stFileUploaderDropzone"] {{
        background: var(--gat-superficie-2);
        border-color: var(--gat-borda-forte);
    }}
    div[data-testid="stContainer"], div[data-testid="stForm"] {{
        border-color: var(--gat-borda);
    }}

    /* ---- Gráficos Plotly: texto e grades legíveis no Tema Escuro ----
       Os gráficos usam fundo transparente (herdam o fundo da página) —
       aqui só recolorimos texto/eixos/grades via CSS, sem precisar
       reconfigurar cada gráfico individualmente em Python. */
    {"".join([
        ".js-plotly-plot .plotly text { fill: " + cores['texto'] + " !important; }",
        ".js-plotly-plot .xgridlayer path, .js-plotly-plot .ygridlayer path { stroke: " + cores['borda'] + " !important; }",
        ".js-plotly-plot .xzl, .js-plotly-plot .yzl { stroke: " + cores['borda_forte'] + " !important; }",
    ]) if escuro else ""}

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
