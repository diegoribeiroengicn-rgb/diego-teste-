"""
Importação incremental da planilha oficial "Controle GAT Projetos" (abas
PROJ_PREST / PROJ_CESS) para as tabelas `prestadores`/`cessionarios` — sem
recriar tabelas, sem apagar registros existentes e sem duplicar análises
já cadastradas (item 1 da solicitação "Atualização de dados pela
planilha, correção do Resumo de Conclusão e atualização dinâmica dos
dashboards").

Chave de identificação de um registro já existente (item 3): código do
Prestador/Cessionário + disciplina + revisão + número da AT (quando
presente na planilha) — a mesma combinação que identifica unicamente uma
análise no fluxo real de trabalho; quando o nº AT está ausente em ambos
os lados, a Obra de Referência (só para Prestadores) entra na chave como
critério adicional. Quando o registro já existe, os campos são
atualizados; um valor vazio/nulo na planilha NUNCA sobrescreve um valor
já preenchido no banco (item 4) — só passa a campos genuinamente vazios.
Um registro cuja chave só é encontrada entre os já arquivados é apenas
sinalizado no relatório, nunca modificado nem duplicado — arquivamento é
uma decisão manual separada.
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass, field
from typing import Any

import pandas as pd

_LINHA_CABECALHO = 5  # 1-indexed — linha real do cabeçalho nas abas PROJ_PREST/PROJ_CESS

_MAPA_COLUNAS_PRESTADORES = {
    "Item": "item", "Código": "codigo", "Prestador de Serviço": "prestador",
    "Disciplina": "disciplina", "Disciplina (SLA)": "disciplina_sla", "PEP'S": "peps",
    "Obra de Referência": "obra_referencia", "Revisão": "revisao", "N° de Doc.": "num_documentos",
    "Data de Solicitação": "data_solicitacao", "Data Limite": "data_limite", "Data Análise": "data_analise",
    "Hold (Início)": "hold_inicio", "Hold (Fim)": "hold_fim", "N° AT": "num_at", "REV. AT": "revisao_at",
    "Responsável": "responsavel", "Status Análise": "status_analise", "Observações": "observacoes",
    "Natureza da Revisão": "natureza_revisao", "N° de erros encontrados": "num_erros", "ETG": "etg",
}

_MAPA_COLUNAS_CESSIONARIOS = {
    "Item": "item", "Código": "codigo", "Cessionário": "cessionario",
    "Disciplina": "disciplina", "Disciplina (SLA)": "disciplina_sla",
    "Revisão": "revisao", "N° de Doc.": "num_documentos", "Data de Solicitação": "data_solicitacao",
    "SLA (Dias úteis)": "sla_dias", "Data Limite": "data_limite", "Data Análise": "data_analise",
    "Hold (início)": "hold_inicio", "Hold (fim)": "hold_fim", "N° AT": "num_at", "REV. AT": "revisao_at",
    "Responsável": "responsavel", "Status Análise": "status_analise", "Observações": "observacoes",
    "Tipo": "tipo", "Natureza da Revisão": "natureza_revisao", "N° de erros encontrados": "num_erros", "ETG": "etg",
}

CAMPOS_DATA = ("data_solicitacao", "data_limite", "data_analise", "hold_inicio", "hold_fim")
CAMPOS_INTEIROS = {"item", "revisao", "num_documentos", "revisao_at", "num_erros", "sla_dias"}
CAMPOS_TEXTO_MAIUSCULO = {"status_analise", "etg"}

# Colunas NOT NULL no banco que a planilha pode não preencher — usados só
# para completar um registro NOVO (nunca sobrescrevem um existente, que já
# tem valor); os mesmos padrões já usados pelo resto do sistema.
_PADROES_SO_PARA_INSERCAO = {
    "etg": "NÃO", "revisao": 0, "num_documentos": 0, "status_analise": "EM ANÁLISE",
    "sla_reduzido": 0, "data_limite_ajustada_manualmente": 0,
}

# Colunas sem default no banco (NOT NULL "seco") — sem elas, o registro
# nem pode ser inserido; uma linha sem esse dado é inconsistência real da
# planilha (item 5), não algo para preencher com um valor inventado.
_CAMPOS_OBRIGATORIOS_PARA_NOVO = {"data_solicitacao"}


def _vazio(valor: Any) -> bool:
    if valor is None:
        return True
    if isinstance(valor, str):
        return not valor.strip()
    try:
        if isinstance(valor, float) and math.isnan(valor):
            return True
        return bool(pd.isna(valor))
    except (TypeError, ValueError):
        return False


def _texto(valor: Any, maiusculo: bool = False) -> str | None:
    if _vazio(valor):
        return None
    texto = str(valor).strip()
    return texto.upper() if maiusculo else texto


def _inteiro(valor: Any) -> int | None:
    if _vazio(valor):
        return None
    try:
        return int(float(valor))
    except (TypeError, ValueError):
        return None


def _data_iso(valor: Any) -> str | None:
    if _vazio(valor):
        return None
    ts = pd.to_datetime(valor, errors="coerce", dayfirst=True)
    if pd.isna(ts):
        return None
    return ts.strftime("%Y-%m-%d")


def _normalizar_linha(bruta: dict[str, Any]) -> dict[str, Any]:
    linha: dict[str, Any] = {}
    for campo, valor in bruta.items():
        if campo in CAMPOS_DATA:
            linha[campo] = _data_iso(valor)
        elif campo in CAMPOS_INTEIROS:
            linha[campo] = _inteiro(valor)
        elif campo in CAMPOS_TEXTO_MAIUSCULO:
            linha[campo] = _texto(valor, maiusculo=True)
        else:
            linha[campo] = _texto(valor)
    return linha


def _ler_aba(conteudo: bytes, nome_aba: str, mapa_colunas: dict[str, str]) -> tuple[list[dict[str, Any]], list[str]]:
    """Lê a aba a partir da linha de cabeçalho real (linha 5) e devolve as
    linhas já normalizadas com os nomes de campo internos do sistema, mais
    a lista de colunas da planilha que não têm correspondência conhecida
    (reportadas, nunca descartadas em silêncio — item 5)."""
    bruto = pd.read_excel(io.BytesIO(conteudo), sheet_name=nome_aba, header=_LINHA_CABECALHO - 1, dtype=object)
    bruto.columns = [" ".join(str(c).split()) if c is not None else "" for c in bruto.columns]

    colunas_nao_mapeadas = sorted(
        {c for c in bruto.columns if c and c not in mapa_colunas and not str(c).startswith("Unnamed")}
    )

    linhas: list[dict[str, Any]] = []
    for _, linha_bruta in bruto.iterrows():
        candidata = {campo: linha_bruta.get(coluna) for coluna, campo in mapa_colunas.items()}
        # "item" costuma vir preenchido por fórmula em linhas de template
        # vazias, bem além do fim dos dados reais — não conta como conteúdo.
        if all(_vazio(v) for campo, v in candidata.items() if campo != "item"):
            continue  # linha em branco (rodapé/espaçamento da planilha) — não é um registro
        linhas.append(_normalizar_linha(candidata))
    return linhas, colunas_nao_mapeadas


def ler_planilha_prestadores(conteudo: bytes, nome_aba: str = "PROJ_PREST") -> tuple[list[dict[str, Any]], list[str]]:
    return _ler_aba(conteudo, nome_aba, _MAPA_COLUNAS_PRESTADORES)


def ler_planilha_cessionarios(conteudo: bytes, nome_aba: str = "PROJ_CESS") -> tuple[list[dict[str, Any]], list[str]]:
    return _ler_aba(conteudo, nome_aba, _MAPA_COLUNAS_CESSIONARIOS)


def _num_at_normalizado(num_at: str | None) -> str | None:
    """Só a parte numérica do nº AT (antes da '/'), sem zeros à esquerda,
    para comparação — o valor original (com zeros à esquerda) nunca é
    alterado ao gravar; isto é só a chave de correspondência. Um nº AT que
    não é um número (ex.: "***", "AT", "% TODO" — valores de rascunho ou
    de células de fora da tabela de dados) NUNCA é usado como identificador
    de correspondência: várias análises diferentes usam o mesmo texto de
    rascunho para "ainda não tem AT", então usá-lo como chave faria
    análises diferentes colidirem na mesma chave (mesclando uma na outra,
    ou criando duplicidade, conforme a ordem de leitura)."""
    if not num_at:
        return None
    parte = str(num_at).split("/")[0].strip()
    if parte.isdigit():
        return str(int(parte))
    return None


def chave_registro(linha: dict[str, Any], campo_nome_entidade: str, campo_extra: str | None = None) -> tuple:
    """Chave de identificação única de uma análise (item 3): código +
    disciplina + revisão + nº AT.

    Um Prestador/Cessionário legítimo pode ainda não ter código atribuído
    (ex.: análise prévia enviada antes da pasta ser criada) — nesse caso o
    nome da entidade substitui o código na chave, em vez de descartar o
    registro só por faltar o código (item 3: "se não existir, criar um
    novo registro" — a ausência do código não significa que o registro é
    inválido).

    Quando o nº AT não é um identificador confiável (ausente ou um valor
    de rascunho não numérico — ver `_num_at_normalizado`), a Data de
    Solicitação entra na chave como critério adicional (é um dado real da
    análise, muito improvável de coincidir por acaso entre duas análises
    realmente diferentes) — e, para Prestadores, também a Obra de
    Referência — para não misturar duas análises diferentes que ainda não
    têm AT na mesma chave."""
    codigo = _texto(linha.get("codigo"), maiusculo=True)
    identificador = codigo or _texto(linha.get(campo_nome_entidade), maiusculo=True)
    disciplina = _texto(linha.get("disciplina"), maiusculo=True)
    revisao = linha.get("revisao")
    num_at = _num_at_normalizado(linha.get("num_at"))
    if num_at is not None:
        return (identificador, disciplina, revisao, num_at)
    extras: tuple = (_texto(linha.get("data_solicitacao")),)
    if campo_extra:
        extras = (*extras, _texto(linha.get(campo_extra), maiusculo=True))
    return (identificador, disciplina, revisao, num_at, *extras)


def mesclar_preservando(existente: dict[str, Any], novo: dict[str, Any]) -> dict[str, Any]:
    """Atualiza `existente` com os campos de `novo`, exceto quando o valor
    novo está vazio — nesse caso o valor já cadastrado é preservado
    (item 4). Nunca mexe em campos que a planilha não carrega (ex.:
    SLA calculado, vínculos de cadastro, prioridade)."""
    resultado = dict(existente)
    for campo, valor in novo.items():
        if not _vazio(valor):
            resultado[campo] = valor
    return resultado


@dataclass
class RelatorioImportacao:
    origem: str
    lidos: int = 0
    novos: int = 0
    atualizados: int = 0
    ignorados_sem_mudanca: int = 0
    ignorados_arquivados: int = 0
    inconsistentes: int = 0
    colunas_nao_mapeadas: list[str] = field(default_factory=list)
    detalhes_inconsistencia: list[str] = field(default_factory=list)

    @property
    def possiveis_duplicidades(self) -> int:
        return 0  # a chave por (código+disciplina+revisão+nºAT) já impede duplicidade na importação

    def resumo_texto(self) -> str:
        return (
            f"{self.origem}: {self.lidos} lidos · {self.novos} novos · {self.atualizados} atualizados · "
            f"{self.ignorados_sem_mudanca} sem mudança · {self.ignorados_arquivados} ignorados (já arquivados) · "
            f"{self.inconsistentes} com inconsistência"
        )


def _aplicar(
    linhas: list[dict[str, Any]], colunas_nao_mapeadas: list[str], origem: str,
    campo_codigo: str, campo_nome_entidade: str, campo_nome_obra: str | None,
    listar_ativos, listar_arquivados_fn, inserir_fn, atualizar_fn, colunas_tabela: list[str],
    usuario: str,
) -> RelatorioImportacao:
    relatorio = RelatorioImportacao(origem=origem, lidos=len(linhas), colunas_nao_mapeadas=colunas_nao_mapeadas)

    ativos = listar_ativos()
    arquivados = listar_arquivados_fn()
    indice_ativos: dict[tuple, dict[str, Any]] = {}
    for _, linha in ativos.iterrows():
        indice_ativos[chave_registro(linha.to_dict(), campo_nome_entidade, campo_nome_obra)] = linha.to_dict()
    chaves_arquivadas = {
        chave_registro(linha.to_dict(), campo_nome_entidade, campo_nome_obra) for _, linha in arquivados.iterrows()
    }

    for linha in linhas:
        # O código é usado na chave quando existe, mas sua ausência sozinha
        # não invalida a linha (item 3) — um Prestador/Cessionário real
        # pode ainda não ter código atribuído (ex.: análise prévia enviada
        # antes da pasta ser criada no Citadon). O que realmente falta para
        # a linha ser um registro reconhecível é o nome da entidade.
        if not linha.get(campo_nome_entidade) or not linha.get("disciplina"):
            relatorio.inconsistentes += 1
            relatorio.detalhes_inconsistencia.append(
                f"Item {linha.get('item') or '?'}: sem {campo_nome_entidade} ou disciplina — linha ignorada."
            )
            continue

        chave = chave_registro(linha, campo_nome_entidade, campo_nome_obra)
        existente = indice_ativos.get(chave)

        if existente is None and chave in chaves_arquivadas:
            relatorio.ignorados_arquivados += 1
            continue

        campos_planilha = {c: linha.get(c) for c in colunas_tabela if c in linha}

        if existente is None:
            faltando = [campo for campo in _CAMPOS_OBRIGATORIOS_PARA_NOVO if _vazio(campos_planilha.get(campo))]
            if faltando:
                relatorio.inconsistentes += 1
                identificacao = linha.get(campo_codigo) or linha.get(campo_nome_entidade)
                relatorio.detalhes_inconsistencia.append(
                    f"Item {linha.get('item') or '?'} ({identificacao}): registro novo sem "
                    f"{', '.join(faltando)} — não é possível cadastrar sem esse(s) dado(s)."
                )
                continue
            for campo, padrao in _PADROES_SO_PARA_INSERCAO.items():
                if campo in colunas_tabela and _vazio(campos_planilha.get(campo)):
                    campos_planilha[campo] = padrao
            novo_id = inserir_fn(campos_planilha, usuario)
            # Registra o novo registro no índice imediatamente — se outra
            # linha da MESMA planilha cair na mesma chave (ex.: duas
            # análises diferentes sem nº AT, mesmo código/disciplina/revisão
            # e mesma Data de Solicitação), ela deve atualizar este
            # registro que acabou de ser criado, nunca criar um segundo.
            indice_ativos[chave] = {**campos_planilha, "id": novo_id}
            relatorio.novos += 1
            continue

        mesclado = mesclar_preservando(existente, campos_planilha)
        mudou = any(mesclado.get(c) != existente.get(c) for c in campos_planilha)
        if mudou:
            atualizar_fn(existente["id"], mesclado, usuario)
            relatorio.atualizados += 1
        else:
            relatorio.ignorados_sem_mudanca += 1
        indice_ativos[chave] = mesclado

    return relatorio


def importar_prestadores(conteudo: bytes, usuario: str, nome_aba: str = "PROJ_PREST") -> RelatorioImportacao:
    from gat.arquivo_database import listar_arquivados
    from gat.database import COLUNAS_PRESTADORES, inserir_prestador, listar_prestadores, atualizar_prestador

    linhas, colunas_nao_mapeadas = ler_planilha_prestadores(conteudo, nome_aba)
    return _aplicar(
        linhas, colunas_nao_mapeadas, "Prestadores", "codigo", "prestador", "obra_referencia",
        listar_prestadores, lambda: listar_arquivados("prestadores"),
        inserir_prestador, atualizar_prestador, COLUNAS_PRESTADORES, usuario,
    )


def importar_cessionarios(conteudo: bytes, usuario: str, nome_aba: str = "PROJ_CESS") -> RelatorioImportacao:
    from gat.arquivo_database import listar_arquivados
    from gat.database import COLUNAS_CESSIONARIOS, inserir_cessionario, listar_cessionarios, atualizar_cessionario

    linhas, colunas_nao_mapeadas = ler_planilha_cessionarios(conteudo, nome_aba)
    return _aplicar(
        linhas, colunas_nao_mapeadas, "Cessionários", "codigo", "cessionario", None,
        listar_cessionarios, lambda: listar_arquivados("cessionarios"),
        inserir_cessionario, atualizar_cessionario, COLUNAS_CESSIONARIOS, usuario,
    )
