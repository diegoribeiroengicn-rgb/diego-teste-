"""
Camada de controle de acesso do Sistema GAT 2026.

Centraliza a verificação de permissões por módulo (Prestadores, Cessionários,
Consolidado) e por área/funcionalidade (dashboards, cadastro, exportação,
avaliações, alertas, lembretes, reuniões, configurações, auditoria,
administração de usuários).

Importante: estas funções são a validação de *backend* — devem ser chamadas
no topo de cada view (antes de qualquer consulta ou renderização de dados),
não apenas usadas para esconder botões no menu. `app.py` também usa
`modulo_permitido`/`area_permitida` para montar a navegação, mas a ausência
de um item no menu não substitui a checagem aqui.
"""

from __future__ import annotations

import streamlit as st

from gat.config import AREAS_PERMISSAO, MODULOS_LABELS
from gat.database import area_permitida, modulo_permitido, registrar_tentativa_acesso_bloqueado


def pode_modulo(usuario: dict, modulo: str) -> bool:
    return modulo_permitido(usuario, modulo)


def pode_area(usuario: dict, area: str) -> bool:
    return area_permitida(usuario, area)


def exigir_modulo(usuario: dict, modulo: str) -> bool:
    """Bloqueia a renderização da página se o módulo não for permitido para o
    usuário — chamar no início de toda view pertencente a um módulo
    controlado (Prestadores, Cessionários, Consolidado)."""
    if pode_modulo(usuario, modulo):
        return True
    registrar_tentativa_acesso_bloqueado(usuario.get("username", ""), f"módulo:{modulo}")
    st.error(
        f"Acesso não autorizado ao módulo **{MODULOS_LABELS.get(modulo, modulo)}**. "
        "Solicite liberação ao administrador do sistema.",
        icon=":material/block:",
    )
    st.stop()
    return False


def exigir_area(usuario: dict, area: str) -> bool:
    """Bloqueia a renderização da página (ou de uma ação pontual) se a área
    não for permitida para o usuário."""
    if pode_area(usuario, area):
        return True
    registrar_tentativa_acesso_bloqueado(usuario.get("username", ""), f"área:{area}")
    st.error(
        f"Acesso não autorizado a **{AREAS_PERMISSAO.get(area, area)}**. "
        "Solicite liberação ao administrador do sistema.",
        icon=":material/block:",
    )
    st.stop()
    return False
