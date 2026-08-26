"""
Validação obrigatória ao salvar uma análise (Prestadores ou Cessionários) —
compartilhada pelos dois pop-ups (`gat.ui.modals.dialog_prestador` e
`dialog_cessionario`) para que nunca divirjam sobre quais campos são
obrigatórios nem sobre as mensagens exibidas.

Regras:
* N° AT — obrigatório, mas SEM validação de formato: qualquer conteúdo não
  vazio é aceito ("***", "-", "AT-0303-26-P256-400-01", texto livre, etc.).
* Data de Análise (conclusão) e Status Análise não podem ficar em uma
  combinação inconsistente: um status "final" (mesmo critério já usado no
  Resumo de Conclusão — `eh_status_final_resumo`) exige a data preenchida;
  uma data preenchida não pode conviver com um status que significa que a
  análise ainda está em andamento (EM ANÁLISE, EM HOLD). OBSOLETO/CANCELADO
  não entram em nenhuma das duas exigências — não representam uma conclusão
  a ser cobrada, mas também não a proíbem.
"""

from __future__ import annotations

import streamlit as st

from gat.business_rules import STATUS_ATIVO_ANALISE
from gat.resumo_conclusao import eh_status_final_resumo


def validar_at_data_status(num_at: str | None, data_analise, status_analise: str | None) -> dict[str, str]:
    """Retorna um dict {campo: mensagem} apenas para os campos que falharem
    — campo vazio no retorno (dict vazio) significa que está tudo certo.
    Chaves possíveis: "at", "status", "data". `STATUS_ATIVO_ANALISE`
    (EM ANÁLISE, EM HOLD) é o mesmo critério de "análise em andamento" já
    usado no resto do sistema — a mesma combinação data+status também é
    sinalizada como inconsistência na Atualização por Planilha
    (`gat.planilha_import`), para as duas telas nunca divergirem."""
    erros: dict[str, str] = {}
    if not str(num_at or "").strip():
        erros["at"] = "Informe o número da AT antes de salvar."
    status_normalizado = str(status_analise or "").strip().upper()
    if data_analise and status_normalizado in STATUS_ATIVO_ANALISE:
        erros["status"] = "Informe o status da análise antes de salvar."
    if eh_status_final_resumo(status_analise) and not data_analise:
        erros["data"] = "Informe a data correspondente antes de salvar."
    return erros


def mensagem_erros(erros: dict[str, str]) -> str:
    """Mensagem única a exibir: a específica do campo quando só um está
    errado, ou a mensagem geral (item 6) quando há mais de um."""
    if len(erros) > 1:
        return "Preencha os campos destacados antes de salvar."
    return next(iter(erros.values()))


def destacar_campo(chave_container: str, invalido: bool) -> None:
    """
    Aplica um contorno vermelho ao `st.container(key=chave_container)` que
    envolve o widget correspondente, quando `invalido`. Streamlit gera
    automaticamente a classe CSS `st-key-<chave>` para todo container com
    `key` — mecanismo oficial de estilização por widget individual, por
    isso funciona mesmo a injeção de `<style>` acontecendo depois, no fluxo
    do código: o HTML só é enviado ao navegador quando o script termina,
    então a ordem de execução em Python não afeta a aplicação do CSS.
    """
    if invalido:
        st.markdown(
            f"<style>.st-key-{chave_container} {{ "
            "border: 2px solid #d32f2f !important; border-radius: 8px; "
            "padding: 0.5rem 0.75rem 0.15rem 0.75rem; }}</style>",
            unsafe_allow_html=True,
        )
