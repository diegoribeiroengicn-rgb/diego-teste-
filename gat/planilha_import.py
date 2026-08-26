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

Uma linha com Data de Análise preenchida mas Status Análise ainda "EM
ANÁLISE"/"EM HOLD" (`STATUS_ATIVO_ANALISE`) é um erro de preenchimento da
própria planilha — a análise foi concluída, mas o status não foi
atualizado para refletir isso. Em vez de importar esse status
desatualizado (o que faz a contagem de projetos por status do sistema não
bater com a planilha), a linha é sinalizada como inconsistência no
relatório para o usuário corrigir o status na fonte antes de reimportar —
mesmo critério de consistência data/status já usado ao salvar uma análise
manualmente (`gat.ui.validacao_campos.validar_at_data_status`).

A planilha é a referência: quando um campo tem valor diferente e não
vazio nos dois lados (conflito), o padrão é atualizar o sistema para
acompanhar a planilha — o usuário só precisa agir para o caso contrário
(manter um valor específico do sistema).

Uso em duas fases (Configurações > Atualização por Planilha):
`planejar_importacao_prestadores`/`planejar_importacao_cessionarios`
leem a planilha e classificam cada linha (novo/atualização/sem
mudança/já arquivado/inconsistente) SEM gravar nada — inclusive
identificando conflitos reais (campo com valor diferente e não vazio dos
dois lados), sempre mostrados na prévia para transparência mesmo que a
resolução padrão já seja aplicar a planilha. Só depois que o usuário
revisa a prévia e confirma (ajustando os conflitos que quiser resolver
diferente, se houver), `executar_plano_prestadores`/
`executar_plano_cessionarios` gravam no banco. `confirmar_importacao`
orquestra as duas execuções com backup antes e restauração automática em
caso de erro (item 8) — cópia de
arquivo (`shutil`), não uma transação SQL única: o resto do sistema já
grava linha a linha, sem uma transação cobrindo múltiplas tabelas, então
esta é a forma de garantir "tudo ou nada" sem reestruturar `gat.database`
só para esta funcionalidade.
"""

from __future__ import annotations

import io
import math
import shutil
from dataclasses import dataclass, field
from typing import Any

import pandas as pd

from gat.business_rules import STATUS_ATIVO_ANALISE

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
    """Número + ano do nº AT ("0468/26" → "468/26"), sem zeros à esquerda
    no número, para comparação — o valor original (com zeros à esquerda)
    nunca é alterado ao gravar; isto é só a chave de correspondência.

    O ANO faz parte da identidade da AT: "0468/26" e "0468/25" são duas
    ATs DIFERENTES que só coincidem no número sequencial — um bug real
    encontrado ao testar (descartar o ano na chave) fez o sistema
    confundir duas análises diferentes de anos diferentes, aplicando o
    valor de uma na outra. Por isso, um nº AT sem ano reconhecível, ou
    que não é um número (ex.: "***", "AT", "% TODO" — valores de
    rascunho ou de células de fora da tabela de dados), NUNCA é usado
    como identificador de correspondência — cai no critério adicional
    (Data de Solicitação) em `chave_registro`."""
    if not num_at:
        return None
    partes = str(num_at).split("/")
    if len(partes) != 2:
        return None
    numero, ano = partes[0].strip(), partes[1].strip()
    if not numero.isdigit() or not ano.isdigit():
        return None
    return f"{int(numero)}/{ano}"


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


# "item" é só a posição/ordem de exibição na tabela (mutável a qualquer
# momento pelo próprio usuário, ex.: botão "Restaurar ordem de chegada")
# — não é um dado de negócio, então nunca é comparado nem tratado como
# preenchimento/conflito; a importação simplesmente não mexe nele.
_CAMPOS_IGNORADOS_NA_COMPARACAO = {"item"}


def _valores_equivalentes(valor_existente: Any, valor_novo: Any, campo: str) -> bool:
    """Compara dois valores já sabidamente não vazios. Campos numéricos
    (`CAMPOS_INTEIROS`) são comparados numericamente, não como texto —
    senão `0.0` (como o pandas devolve uma coluna inteira com algum NULL)
    e `0` (inteiro nativo da planilha) apareceriam como um "conflito"
    falso só por causa do tipo Python, não por serem valores diferentes."""
    if campo in CAMPOS_INTEIROS:
        try:
            return float(valor_existente) == float(valor_novo)
        except (TypeError, ValueError):
            pass
    return str(valor_existente).strip() == str(valor_novo).strip()


def _diff_campos(existente: dict[str, Any], novo: dict[str, Any]) -> tuple[dict[str, Any], dict[str, tuple]]:
    """Compara os campos vindos da planilha com o registro já cadastrado.
    Retorna (`preenchimentos`, `conflitos`):

    * `preenchimentos` — campos vazios no banco que a planilha preenche;
      aplicados automaticamente (item 4), nunca é um conflito preencher o
      que estava em branco.
    * `conflitos` — campos com valor diferente e não vazio dos dois
      lados: `{campo: (valor_sistema, valor_planilha)}` — sempre listados
      na prévia para o usuário ver (item 11), mesmo a planilha sendo a
      referência e a resolução padrão sendo aplicá-la."""
    preenchimentos: dict[str, Any] = {}
    conflitos: dict[str, tuple] = {}
    for campo, valor_novo in novo.items():
        if campo in _CAMPOS_IGNORADOS_NA_COMPARACAO or _vazio(valor_novo):
            continue
        valor_existente = existente.get(campo)
        if _vazio(valor_existente):
            preenchimentos[campo] = valor_novo
        elif not _valores_equivalentes(valor_existente, valor_novo, campo):
            conflitos[campo] = (valor_existente, valor_novo)
    return preenchimentos, conflitos


@dataclass
class ItemPlanoImportacao:
    """Um item do plano de importação — o resultado da análise de UMA
    linha da planilha, antes de qualquer gravação no banco."""
    item_origem: Any
    identificacao: str
    chave: tuple
    tipo: str  # "novo" | "atualizacao" | "sem_mudanca" | "arquivado" | "inconsistente"
    dados_novos: dict[str, Any] = field(default_factory=dict)
    existente_id: int | None = None
    existente: dict[str, Any] = field(default_factory=dict)
    preenchimentos: dict[str, Any] = field(default_factory=dict)
    conflitos: dict[str, tuple] = field(default_factory=dict)
    motivo_inconsistencia: str | None = None


@dataclass
class PlanoImportacao:
    """Resultado da pré-visualização (item 6): classifica cada linha da
    planilha sem gravar nada no banco. `executar_plano` aplica este plano
    depois que o usuário confirma (e resolve os conflitos, se houver)."""
    origem: str
    itens: list[ItemPlanoImportacao] = field(default_factory=list)
    colunas_nao_mapeadas: list[str] = field(default_factory=list)

    @property
    def lidos(self) -> int:
        return len(self.itens)

    @property
    def novos(self) -> int:
        return sum(1 for i in self.itens if i.tipo == "novo")

    @property
    def atualizados(self) -> int:
        return sum(1 for i in self.itens if i.tipo == "atualizacao")

    @property
    def sem_mudanca(self) -> int:
        return sum(1 for i in self.itens if i.tipo == "sem_mudanca")

    @property
    def arquivados(self) -> int:
        return sum(1 for i in self.itens if i.tipo == "arquivado")

    @property
    def inconsistentes(self) -> int:
        return sum(1 for i in self.itens if i.tipo == "inconsistente")

    @property
    def itens_com_conflito(self) -> list[ItemPlanoImportacao]:
        return [i for i in self.itens if i.conflitos]

    @property
    def total_conflitos(self) -> int:
        return len(self.itens_com_conflito)

    def resumo_texto(self) -> str:
        return (
            f"{self.origem}: {self.lidos} lidos · {self.novos} novos · {self.atualizados} atualizados "
            f"({self.total_conflitos} com conflito) · {self.sem_mudanca} sem mudança · "
            f"{self.arquivados} já arquivados (ignorados) · {self.inconsistentes} com inconsistência"
        )


@dataclass
class RelatorioImportacao:
    """Resultado da execução de um plano já confirmado (item 14)."""
    origem: str
    lidos: int = 0
    novos: int = 0
    atualizados: int = 0
    conflitos_tratados: int = 0
    ignorados_sem_mudanca: int = 0
    ignorados_arquivados: int = 0
    inconsistentes: int = 0
    colunas_nao_mapeadas: list[str] = field(default_factory=list)
    detalhes_inconsistencia: list[str] = field(default_factory=list)

    def resumo_texto(self) -> str:
        return (
            f"{self.origem}: {self.lidos} lidos · {self.novos} novos · {self.atualizados} atualizados "
            f"({self.conflitos_tratados} conflitos tratados) · {self.ignorados_sem_mudanca} sem mudança · "
            f"{self.ignorados_arquivados} ignorados (já arquivados) · {self.inconsistentes} com inconsistência"
        )


def _planejar(
    linhas: list[dict[str, Any]], colunas_nao_mapeadas: list[str], origem: str,
    campo_codigo: str, campo_nome_entidade: str, campo_nome_obra: str | None,
    listar_ativos, listar_arquivados_fn, colunas_tabela: list[str],
) -> PlanoImportacao:
    """Fase 1 (item 6): classifica cada linha sem gravar nada no banco."""
    plano = PlanoImportacao(origem=origem, colunas_nao_mapeadas=colunas_nao_mapeadas)

    ativos = listar_ativos()
    arquivados = listar_arquivados_fn()
    indice_ativos: dict[tuple, dict[str, Any]] = {}
    for _, linha in ativos.iterrows():
        indice_ativos[chave_registro(linha.to_dict(), campo_nome_entidade, campo_nome_obra)] = linha.to_dict()
    chaves_arquivadas = {
        chave_registro(linha.to_dict(), campo_nome_entidade, campo_nome_obra) for _, linha in arquivados.iterrows()
    }
    # Linhas da própria planilha que caiam na mesma chave (raro, mas
    # possível) atualizam o item já planejado nesta mesma leva, em vez de
    # criar um segundo — mesma proteção que já existia na execução direta.
    indice_planejados: dict[tuple, int] = {}

    for linha in linhas:
        item_origem = linha.get("item")
        if not linha.get(campo_nome_entidade) or not linha.get("disciplina"):
            plano.itens.append(ItemPlanoImportacao(
                item_origem=item_origem, identificacao=str(linha.get(campo_codigo) or "?"), chave=(),
                tipo="inconsistente", motivo_inconsistencia=f"sem {campo_nome_entidade} ou disciplina",
            ))
            continue

        chave = chave_registro(linha, campo_nome_entidade, campo_nome_obra)
        identificacao = str(linha.get(campo_codigo) or linha.get(campo_nome_entidade))
        campos_planilha = {c: linha.get(c) for c in colunas_tabela if c in linha}

        status_planilha = str(campos_planilha.get("status_analise") or "").strip().upper()
        if campos_planilha.get("data_analise") and status_planilha in STATUS_ATIVO_ANALISE:
            plano.itens.append(ItemPlanoImportacao(
                item_origem=item_origem, identificacao=identificacao, chave=chave, tipo="inconsistente",
                motivo_inconsistencia=(
                    f"Data Análise preenchida ({campos_planilha.get('data_analise')}) mas Status Análise "
                    f"ainda \"{campos_planilha.get('status_analise')}\" na planilha — corrija o status antes "
                    "de importar, ou a contagem de projetos em análise não vai bater"
                ),
            ))
            continue

        indice_repetido = indice_planejados.get(chave)
        if indice_repetido is not None:
            item_repetido = plano.itens[indice_repetido]
            base = {**item_repetido.existente, **item_repetido.preenchimentos}
            preenchimentos, conflitos = _diff_campos(base, campos_planilha)
            item_repetido.preenchimentos.update(preenchimentos)
            item_repetido.conflitos.update(conflitos)
            if item_repetido.tipo == "sem_mudanca" and (preenchimentos or conflitos):
                item_repetido.tipo = "atualizacao"
            continue

        existente = indice_ativos.get(chave)
        if existente is None and chave in chaves_arquivadas:
            plano.itens.append(ItemPlanoImportacao(item_origem=item_origem, identificacao=identificacao, chave=chave, tipo="arquivado"))
            continue

        if existente is None:
            faltando = [c for c in _CAMPOS_OBRIGATORIOS_PARA_NOVO if _vazio(campos_planilha.get(c))]
            if faltando:
                plano.itens.append(ItemPlanoImportacao(
                    item_origem=item_origem, identificacao=identificacao, chave=chave, tipo="inconsistente",
                    motivo_inconsistencia=f"registro novo sem {', '.join(faltando)}",
                ))
                continue
            item_plano = ItemPlanoImportacao(
                item_origem=item_origem, identificacao=identificacao, chave=chave,
                tipo="novo", dados_novos=campos_planilha,
            )
            plano.itens.append(item_plano)
            indice_planejados[chave] = len(plano.itens) - 1
            continue

        preenchimentos, conflitos = _diff_campos(existente, campos_planilha)
        tipo = "atualizacao" if (preenchimentos or conflitos) else "sem_mudanca"
        plano.itens.append(ItemPlanoImportacao(
            item_origem=item_origem, identificacao=identificacao, chave=chave, tipo=tipo,
            existente_id=existente.get("id"), existente=existente, dados_novos=campos_planilha,
            preenchimentos=preenchimentos, conflitos=conflitos,
        ))
        indice_planejados[chave] = len(plano.itens) - 1

    return plano


def executar_plano(
    plano: PlanoImportacao, resolucoes_conflito: dict[tuple, dict[str, str]],
    usuario: str, inserir_fn, atualizar_fn, colunas_tabela: list[str],
) -> RelatorioImportacao:
    """Fase 2 (item 7): aplica um plano já confirmado pelo usuário. A
    planilha é a referência: por padrão, um conflito é resolvido a favor
    do valor da planilha (o sistema é atualizado para acompanhá-la).
    `resolucoes_conflito` tem a decisão por campo de cada item com
    conflito só para os casos em que o usuário quer o comportamento
    contrário — `{chave: {campo: "sistema"}}` — mantendo o valor já
    cadastrado em vez de aplicar o da planilha."""
    relatorio = RelatorioImportacao(
        origem=plano.origem, lidos=plano.lidos, colunas_nao_mapeadas=plano.colunas_nao_mapeadas,
    )
    for item in plano.itens:
        if item.tipo == "inconsistente":
            relatorio.inconsistentes += 1
            relatorio.detalhes_inconsistencia.append(f"Item {item.item_origem or '?'} ({item.identificacao}): {item.motivo_inconsistencia}.")
            continue
        if item.tipo == "arquivado":
            relatorio.ignorados_arquivados += 1
            continue
        if item.tipo == "sem_mudanca":
            relatorio.ignorados_sem_mudanca += 1
            continue

        if item.tipo == "novo":
            campos = dict(item.dados_novos)
            for campo, padrao in _PADROES_SO_PARA_INSERCAO.items():
                if campo in colunas_tabela and _vazio(campos.get(campo)):
                    campos[campo] = padrao
            inserir_fn(campos, usuario)
            relatorio.novos += 1
            continue

        # atualizacao: preenchimentos sempre aplicados; a planilha é a
        # referência, então um conflito também aplica o valor da planilha
        # por padrão — só mantém o valor do sistema quando o usuário
        # escolheu isso explicitamente para aquele campo.
        final = dict(item.existente)
        final.update(item.preenchimentos)
        escolhas = resolucoes_conflito.get(item.chave, {})
        conflitos_tratados_aqui = 0
        for campo, (valor_sistema, valor_planilha) in item.conflitos.items():
            final[campo] = valor_sistema if escolhas.get(campo) == "sistema" else valor_planilha
            conflitos_tratados_aqui += 1
        atualizar_fn(item.existente_id, final, usuario)
        relatorio.atualizados += 1
        relatorio.conflitos_tratados += conflitos_tratados_aqui

    return relatorio


def planejar_importacao_prestadores(conteudo: bytes, nome_aba: str = "PROJ_PREST") -> PlanoImportacao:
    from gat.arquivo_database import listar_arquivados
    from gat.database import COLUNAS_PRESTADORES, listar_prestadores

    linhas, colunas_nao_mapeadas = ler_planilha_prestadores(conteudo, nome_aba)
    return _planejar(
        linhas, colunas_nao_mapeadas, "Prestadores", "codigo", "prestador", "obra_referencia",
        listar_prestadores, lambda: listar_arquivados("prestadores"), COLUNAS_PRESTADORES,
    )


def planejar_importacao_cessionarios(conteudo: bytes, nome_aba: str = "PROJ_CESS") -> PlanoImportacao:
    from gat.arquivo_database import listar_arquivados
    from gat.database import COLUNAS_CESSIONARIOS, listar_cessionarios

    linhas, colunas_nao_mapeadas = ler_planilha_cessionarios(conteudo, nome_aba)
    return _planejar(
        linhas, colunas_nao_mapeadas, "Cessionários", "codigo", "cessionario", None,
        listar_cessionarios, lambda: listar_arquivados("cessionarios"), COLUNAS_CESSIONARIOS,
    )


def executar_plano_prestadores(plano: PlanoImportacao, resolucoes_conflito: dict[tuple, dict[str, str]], usuario: str) -> RelatorioImportacao:
    from gat.database import COLUNAS_PRESTADORES, atualizar_prestador, inserir_prestador

    return executar_plano(plano, resolucoes_conflito, usuario, inserir_prestador, atualizar_prestador, COLUNAS_PRESTADORES)


def executar_plano_cessionarios(plano: PlanoImportacao, resolucoes_conflito: dict[tuple, dict[str, str]], usuario: str) -> RelatorioImportacao:
    from gat.database import COLUNAS_CESSIONARIOS, atualizar_cessionario, inserir_cessionario

    return executar_plano(plano, resolucoes_conflito, usuario, inserir_cessionario, atualizar_cessionario, COLUNAS_CESSIONARIOS)


def confirmar_importacao(
    nome_arquivo: str,
    plano_prestadores: PlanoImportacao, resolucoes_prestadores: dict[tuple, dict[str, str]],
    plano_cessionarios: PlanoImportacao, resolucoes_cessionarios: dict[tuple, dict[str, str]],
    usuario: str,
) -> tuple[RelatorioImportacao, RelatorioImportacao]:
    """
    Aplica os dois planos já revisados e confirmados pelo usuário (item 7).
    Cria backup antes de gravar, marcado como PRE_IMPORTACAO e vinculado ao
    usuário (item 8); se qualquer erro ocorrer durante a aplicação, restaura
    o backup imediatamente — "ou a atualização é concluída com sucesso, ou
    o estado anterior é preservado" — em vez de deixar o banco parcialmente
    atualizado. Cada execução (sucesso ou falha) fica registrada no
    histórico (item 13), com o nome do arquivo de backup PRE_IMPORTACAO
    associado (item 21) para permitir localizar e restaurar exatamente esse
    ponto caso a importação precise ser desfeita depois."""
    from gat.config import DB_PATH
    from gat.database import criar_backup, registrar_importacao_planilha

    caminho_backup = criar_backup(tipo="PRE_IMPORTACAO", usuario=usuario, observacoes=f"Antes de importar \"{nome_arquivo}\"")
    nome_backup = caminho_backup.name if caminho_backup is not None else None

    try:
        relatorio_prest = executar_plano_prestadores(plano_prestadores, resolucoes_prestadores, usuario)
        relatorio_cess = executar_plano_cessionarios(plano_cessionarios, resolucoes_cessionarios, usuario)
    except Exception as exc:
        if caminho_backup is not None:
            shutil.copy2(caminho_backup, DB_PATH)
        registrar_importacao_planilha(
            usuario, nome_arquivo, "Prestadores + Cessionários",
            lidos=plano_prestadores.lidos + plano_cessionarios.lidos,
            novos=0, atualizados=0, conflitos_tratados=0, ignorados=0, inconsistencias=0,
            resultado="ERRO", erro=str(exc), backup_ref=nome_backup,
        )
        raise

    registrar_importacao_planilha(
        usuario, nome_arquivo, "Prestadores",
        lidos=relatorio_prest.lidos, novos=relatorio_prest.novos, atualizados=relatorio_prest.atualizados,
        conflitos_tratados=relatorio_prest.conflitos_tratados,
        ignorados=relatorio_prest.ignorados_sem_mudanca + relatorio_prest.ignorados_arquivados,
        inconsistencias=relatorio_prest.inconsistentes, resultado="SUCESSO", backup_ref=nome_backup,
    )
    registrar_importacao_planilha(
        usuario, nome_arquivo, "Cessionários",
        lidos=relatorio_cess.lidos, novos=relatorio_cess.novos, atualizados=relatorio_cess.atualizados,
        conflitos_tratados=relatorio_cess.conflitos_tratados,
        ignorados=relatorio_cess.ignorados_sem_mudanca + relatorio_cess.ignorados_arquivados,
        inconsistencias=relatorio_cess.inconsistentes, resultado="SUCESSO", backup_ref=nome_backup,
    )
    return relatorio_prest, relatorio_cess
