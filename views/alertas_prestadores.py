"""View: Central de Alertas — Prestadores (alertas exclusivos do módulo)."""

from __future__ import annotations

from gat.permissions import exigir_modulo
from views import alertas


def render(usuario: dict) -> None:
    exigir_modulo(usuario, "prestadores")
    alertas.render(usuario, modulo="prestadores")
