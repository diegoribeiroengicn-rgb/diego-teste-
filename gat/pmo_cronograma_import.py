"""
Interpretação automática de cronogramas anexados ao PMO.

Suporte real de interpretação automática (atividades, marcos, dependências
e datas — o caminho crítico é calculado depois, em
`gat.pmo_business_rules.calcular_caminho_critico`, sobre o resultado
destas funções):

* **Excel** — planilha com colunas flexíveis (aceita variações comuns de
  nome de coluna, em português);
* **Primavera XER** — formato texto plano tabulado, documentado pela
  Oracle (tabelas `%T`/campos `%F`/linhas `%R`); lê as tabelas `TASK` e
  `TASKPRED`.

**Limitação assumida deliberadamente**: o formato `.mpp` do Microsoft
Project é um binário proprietário (OLE compound file) sem uma biblioteca
Python confiável para leitura fiel de atividades/dependências neste
ambiente. Arquivos `.mpp` são aceitos e anexados ao projeto para
referência, mas não são interpretados automaticamente — a tela orienta o
gerente a exportar para Excel ou XER quando precisar da leitura
automática (atividades, marcos, caminho crítico).
"""

from __future__ import annotations

import io
import unicodedata

import pandas as pd

FORMATOS_INTERPRETAVEIS = {"excel", "xer"}
FORMATOS_ACEITOS = {"excel", "xer", "mpp"}

COLUNAS_ATIVIDADE_SAIDA = [
    "identificador_origem", "nome", "data_inicio", "data_fim",
    "duracao_dias", "percentual_concluido", "e_marco", "predecessoras",
]

_ALIAS_COLUNAS_EXCEL = {
    "identificador_origem": ["id", "identificador", "codigo", "código", "cod", "wbs"],
    "nome": ["atividade", "nome", "tarefa", "descricao", "descrição", "task"],
    "data_inicio": ["inicio", "início", "data inicio", "data início", "data de inicio", "data de início", "start"],
    "data_fim": ["termino", "término", "data termino", "data término", "data de termino", "data de término", "fim", "finish"],
    "duracao_dias": ["duracao", "duração", "duracao (dias)", "duração (dias)", "dias", "duration"],
    "percentual_concluido": ["% concluido", "% concluído", "percentual", "percentual concluido", "percentual concluído", "avanco", "avanço", "% complete"],
    "e_marco": ["marco", "e marco", "é marco", "milestone"],
    "predecessoras": ["predecessoras", "predecessora", "dependencias", "dependências", "predecessors"],
}


def _normalizar(texto: str) -> str:
    texto = str(texto).strip().lower()
    return "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))


def _resolver_coluna(colunas_normalizadas: dict[str, str], chave: str) -> str | None:
    for alias in _ALIAS_COLUNAS_EXCEL[chave]:
        alias_norm = _normalizar(alias)
        if alias_norm in colunas_normalizadas:
            return colunas_normalizadas[alias_norm]
    return None


def interpretar_cronograma_excel(conteudo: bytes) -> pd.DataFrame:
    """
    Lê a primeira planilha do arquivo e reconhece automaticamente as
    colunas de atividade, datas, duração, percentual concluído, marco e
    predecessoras — independente da ordem das colunas e tolerante a
    variações comuns de nome de coluna em português. Levanta `ValueError`
    com uma mensagem clara quando a coluna de nome da atividade não é
    encontrada (planilha fora do formato esperado).
    """
    bruto = pd.read_excel(io.BytesIO(conteudo), dtype=str)
    colunas_normalizadas = {_normalizar(c): c for c in bruto.columns}

    coluna_nome = _resolver_coluna(colunas_normalizadas, "nome")
    if coluna_nome is None:
        raise ValueError(
            "Não foi possível identificar a coluna com o nome da atividade na planilha. "
            "Use um cabeçalho como 'Atividade', 'Nome' ou 'Tarefa'."
        )

    saida = pd.DataFrame()
    saida["nome"] = bruto[coluna_nome].astype(str).str.strip()

    coluna_id = _resolver_coluna(colunas_normalizadas, "identificador_origem")
    saida["identificador_origem"] = bruto[coluna_id].astype(str).str.strip() if coluna_id else (saida.index + 1).astype(str)

    for chave in ("data_inicio", "data_fim"):
        coluna = _resolver_coluna(colunas_normalizadas, chave)
        saida[chave] = pd.to_datetime(bruto[coluna], errors="coerce", dayfirst=True).dt.strftime("%Y-%m-%d") if coluna else None

    coluna_duracao = _resolver_coluna(colunas_normalizadas, "duracao_dias")
    if coluna_duracao:
        saida["duracao_dias"] = pd.to_numeric(bruto[coluna_duracao], errors="coerce")
    else:
        inicio = pd.to_datetime(saida["data_inicio"], errors="coerce")
        fim = pd.to_datetime(saida["data_fim"], errors="coerce")
        saida["duracao_dias"] = (fim - inicio).dt.days

    coluna_pct = _resolver_coluna(colunas_normalizadas, "percentual_concluido")
    if coluna_pct:
        pct = bruto[coluna_pct].astype(str).str.replace("%", "", regex=False).str.replace(",", ".", regex=False)
        saida["percentual_concluido"] = pd.to_numeric(pct, errors="coerce")
    else:
        saida["percentual_concluido"] = 0.0
    saida["percentual_concluido"] = saida["percentual_concluido"].fillna(0).clip(lower=0, upper=100)

    coluna_marco = _resolver_coluna(colunas_normalizadas, "e_marco")
    if coluna_marco:
        valores = bruto[coluna_marco].astype(str).str.strip().str.lower()
        saida["e_marco"] = valores.isin(["sim", "s", "1", "true", "yes", "x"]).astype(int)
    else:
        saida["e_marco"] = (saida["duracao_dias"].fillna(0) == 0).astype(int)

    coluna_pred = _resolver_coluna(colunas_normalizadas, "predecessoras")
    saida["predecessoras"] = bruto[coluna_pred].astype(str).replace({"nan": None, "None": None}) if coluna_pred else None

    saida["duracao_dias"] = saida["duracao_dias"].fillna(0)
    return saida[COLUNAS_ATIVIDADE_SAIDA]


def _parsear_tabelas_xer(texto: str) -> dict[str, pd.DataFrame]:
    """Estrutura genérica de um arquivo XER: cada tabela começa em uma
    linha `%T\tNOME_TABELA`, seguida de `%F\tcampo1\tcampo2...` e de N
    linhas `%R\tvalor1\tvalor2...` até a próxima `%T` ou o fim do arquivo."""
    tabelas: dict[str, pd.DataFrame] = {}
    tabela_atual: str | None = None
    campos: list[str] = []
    linhas: list[list[str]] = []

    def _fechar_tabela() -> None:
        if tabela_atual and campos:
            tabelas[tabela_atual] = pd.DataFrame(linhas, columns=campos)

    for linha_bruta in texto.splitlines():
        if not linha_bruta:
            continue
        partes = linha_bruta.split("\t")
        marcador = partes[0]
        if marcador == "%T":
            _fechar_tabela()
            tabela_atual = partes[1] if len(partes) > 1 else None
            campos, linhas = [], []
        elif marcador == "%F":
            campos = partes[1:]
        elif marcador == "%R":
            valores = partes[1:]
            if len(valores) < len(campos):
                valores += [None] * (len(campos) - len(valores))
            linhas.append(valores[: len(campos)])
    _fechar_tabela()
    return tabelas


def interpretar_cronograma_xer(conteudo: bytes) -> pd.DataFrame:
    """
    Interpreta as tabelas `TASK` (atividades) e `TASKPRED` (predecessoras)
    de um arquivo Primavera XER (formato texto plano). Marcos são
    identificados pelo `task_type` (`TT_Mile`/`TT_FinMile`) do Primavera.
    """
    texto = conteudo.decode("utf-8", errors="replace")
    tabelas = _parsear_tabelas_xer(texto)
    tarefas = tabelas.get("TASK")
    if tarefas is None or tarefas.empty:
        raise ValueError("Não foi encontrada a tabela TASK no arquivo XER — verifique se é uma exportação válida do Primavera.")

    preds_por_tarefa: dict[str, list[str]] = {}
    taskpred = tabelas.get("TASKPRED")
    if taskpred is not None and not taskpred.empty and "task_id" in taskpred.columns and "pred_task_id" in taskpred.columns:
        for _, linha in taskpred.iterrows():
            preds_por_tarefa.setdefault(linha["task_id"], []).append(linha["pred_task_id"])

    saida = pd.DataFrame()
    saida["identificador_origem"] = tarefas.get("task_id")
    saida["nome"] = tarefas.get("task_name", tarefas.get("task_code", "")).astype(str).str.strip()
    saida["data_inicio"] = pd.to_datetime(tarefas.get("target_start_date"), errors="coerce").dt.strftime("%Y-%m-%d")
    saida["data_fim"] = pd.to_datetime(tarefas.get("target_end_date"), errors="coerce").dt.strftime("%Y-%m-%d")
    horas = pd.to_numeric(tarefas.get("target_drtn_hr_cnt"), errors="coerce").fillna(0)
    saida["duracao_dias"] = (horas / 8.0).round(2)
    saida["percentual_concluido"] = pd.to_numeric(tarefas.get("phys_complete_pct"), errors="coerce").fillna(0).clip(lower=0, upper=100)
    tipos_marco = {"TT_Mile", "TT_FinMile"}
    saida["e_marco"] = tarefas.get("task_type", "").isin(tipos_marco).astype(int)
    saida["predecessoras"] = saida["identificador_origem"].map(lambda tid: ",".join(preds_por_tarefa.get(tid, [])) or None)
    return saida[COLUNAS_ATIVIDADE_SAIDA]


def interpretar_cronograma(nome_arquivo: str, formato: str, conteudo: bytes) -> pd.DataFrame | None:
    """Ponto único de entrada usado pela tela de Cronograma do PMO.
    Retorna `None` para `.mpp` (sem interpretação automática — arquivo
    apenas anexado como referência)."""
    if formato == "excel":
        return interpretar_cronograma_excel(conteudo)
    if formato == "xer":
        return interpretar_cronograma_xer(conteudo)
    return None


def detectar_formato(nome_arquivo: str) -> str:
    extensao = nome_arquivo.rsplit(".", 1)[-1].lower() if "." in nome_arquivo else ""
    if extensao in ("xlsx", "xls", "xlsm"):
        return "excel"
    if extensao == "xer":
        return "xer"
    if extensao == "mpp":
        return "mpp"
    raise ValueError(f"Formato de arquivo não suportado: .{extensao}. Envie um arquivo Excel (.xlsx), Primavera (.xer) ou MS Project (.mpp).")
