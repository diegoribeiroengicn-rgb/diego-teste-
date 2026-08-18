"""
Regras de negócio do "Resumo de Conclusão da Análise" — funções puras
(sem Streamlit, sem banco) para decidir quando o pop-up de envio deve ser
oferecido e para montar o texto/os dados que compõem o resumo compacto,
aplicáveis tanto a análises de Prestadores quanto de Cessionários.
"""

from __future__ import annotations

from typing import Any

# Status de análise considerados "conclusão" para fins deste recurso —
# os três status finais citados explicitamente na solicitação. Os demais
# status do vocabulário (EM ANÁLISE, EM HOLD, OBSOLETO, CANCELADO) não
# representam uma conclusão de análise a ser comunicada a terceiros.
STATUS_FINAIS_RESUMO = {"LIBERADO", "LIBERADO C/ REST.", "NÃO LIBERADO"}

STATUS_POR_EXTENSO = {
    "LIBERADO": "Liberado",
    "LIBERADO C/ REST.": "Liberado com restrição",
    "NÃO LIBERADO": "Não liberado",
}

CANAIS_DISPONIBILIZACAO = ("mfiles", "drive", "email")

_ROTULOS_CANAL = {"mfiles": "M-Files", "drive": "Drive", "email": "E-mail"}


def eh_status_final_resumo(status: str | None) -> bool:
    return bool(status) and str(status).strip().upper() in STATUS_FINAIS_RESUMO


def status_por_extenso(status: str | None) -> str:
    if not status:
        return "-"
    return STATUS_POR_EXTENSO.get(str(status).strip().upper(), str(status).strip())


def deve_disparar_popup_resumo(
    status_analise: str | None,
    data_analise: str | None,
    resumo_popup_disparado_em: str | None,
) -> bool:
    """
    True quando a análise deve receber, pela primeira vez, a oferta do
    Resumo de Conclusão: status final + Data de Entrega/Conclusão
    informados, e o pop-up ainda não foi oferecido antes para este
    registro (independente de o analista ter concluído ou não o fluxo).
    """
    if resumo_popup_disparado_em:
        return False
    if not eh_status_final_resumo(status_analise):
        return False
    return bool(data_analise)


def montar_texto_disponibilizacao(mfiles: bool, drive: bool, email: bool) -> str:
    """Monta a frase automática conforme a combinação de canais marcados
    (seção 4 da solicitação). Sem nenhum canal marcado, retorna string
    vazia — o card simplesmente omite essa linha."""
    postados = []
    if mfiles:
        postados.append("M-Files")
    if drive:
        postados.append("Drive")

    if postados and email:
        return f"Postada no {' e '.join(postados)} e enviada por e-mail"
    if postados:
        return f"Postada no {' e '.join(postados)}"
    if email:
        return "Enviada por e-mail"
    return ""


def rotulos_canais_selecionados(mfiles: bool, drive: bool, email: bool) -> list[str]:
    selecionados = []
    if mfiles:
        selecionados.append(_ROTULOS_CANAL["mfiles"])
    if drive:
        selecionados.append(_ROTULOS_CANAL["drive"])
    if email:
        selecionados.append(_ROTULOS_CANAL["email"])
    return selecionados


def montar_numero_at(num_at: str | None, codigo: str | None, revisao: int | None) -> str:
    """
    Número completo da AT usado no Resumo de Conclusão:
    AT-{nº AT}-{código}-{revisão de 2 dígitos}, ex.: AT-0303-26-P256-01.
    O nº AT já cadastrado (ex. "0303/26") tem a barra normalizada para
    hífen; segmentos ausentes são simplesmente omitidos.
    """
    partes = ["AT"]
    if num_at:
        partes.append(str(num_at).strip().replace("/", "-"))
    if codigo:
        partes.append(str(codigo).strip())
    if revisao is not None:
        try:
            partes.append(f"{int(revisao):02d}")
        except (TypeError, ValueError):
            pass
    if len(partes) == 1:
        return "-"
    return "-".join(partes)


def montar_entidade_obra(nome_entidade: str | None, obra_referencia: str | None) -> str:
    nome_entidade = (nome_entidade or "-").strip()
    obra_referencia = (obra_referencia or "").strip()
    if obra_referencia:
        return f"{nome_entidade} - {obra_referencia}"
    return nome_entidade


def montar_disciplina_revisao(disciplina: str | None, revisao: int | None) -> str:
    disciplina = (disciplina or "-").strip() or "-"
    if revisao is None:
        return disciplina
    try:
        return f"{disciplina} - R{int(revisao):02d}"
    except (TypeError, ValueError):
        return disciplina


def montar_dados_resumo(tabela: str, dados: dict[str, Any], mfiles: bool, drive: bool, email: bool) -> dict[str, Any]:
    """
    Monta o conjunto de campos exibidos no Resumo de Conclusão a partir do
    cadastro já existente da análise — nenhuma digitação adicional é
    exigida do analista (seção 5/6 da solicitação).
    """
    if tabela == "prestadores":
        nome_entidade = dados.get("prestador")
        referencia = dados.get("obra_referencia")
    else:
        nome_entidade = dados.get("cessionario")
        referencia = dados.get("tipo")
    return {
        "numero_at": montar_numero_at(dados.get("num_at"), dados.get("codigo"), dados.get("revisao")),
        "texto_disponibilizacao": montar_texto_disponibilizacao(mfiles, drive, email),
        "entidade_obra": montar_entidade_obra(nome_entidade, referencia),
        "disciplina_revisao": montar_disciplina_revisao(dados.get("disciplina"), dados.get("revisao")),
        "status_extenso": status_por_extenso(dados.get("status_analise")),
        "status_bruto": dados.get("status_analise"),
    }
