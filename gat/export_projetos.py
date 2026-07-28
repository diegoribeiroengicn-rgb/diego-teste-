"""
Exportação de dados do módulo Projetos (Prestadores, Cessionários e
Consolidado) em Excel editável e CSV.

Gerada exclusivamente sob demanda — nunca automaticamente ao abrir a tela
— a partir dos dados já carregados pela própria view (respeitando ou não
os filtros aplicados, conforme escolha do usuário), sem depender do
carregamento de dashboards/gráficos.
"""

from __future__ import annotations

import io
from datetime import datetime

import pandas as pd

from gat.config import COLUNAS_EXIBICAO_CESSIONARIOS, COLUNAS_EXIBICAO_PRESTADORES
from gat.database import listar_cadastro_cessionarios, listar_obras_prestador

COLUNA_TIPO_PROJETO = "Tipo de Projeto"


def _colunas_prestadores_exportacao() -> dict[str, str]:
    colunas = dict(COLUNAS_EXIBICAO_PRESTADORES)
    colunas["nome_obra_vinculada"] = "Nome da Obra"
    return colunas


def _colunas_cessionarios_exportacao() -> dict[str, str]:
    colunas = dict(COLUNAS_EXIBICAO_CESSIONARIOS)
    colunas["rvp"] = "RVP"
    colunas["rci"] = "RCI"
    colunas["luc"] = "LUC"
    return colunas


def preparar_prestadores_exportacao(df: pd.DataFrame) -> pd.DataFrame:
    """Acrescenta o nome da obra vinculada (quando já houver vínculo), sem
    alterar nenhuma coluna existente do projeto."""
    df = df.copy()
    obras = listar_obras_prestador()
    mapa_obras = obras.set_index("id")["nome_obra"].to_dict() if not obras.empty else {}
    df["nome_obra_vinculada"] = df.get("obra_id", pd.Series(dtype="Int64")).map(mapa_obras)
    return df


def preparar_cessionarios_exportacao(df: pd.DataFrame) -> pd.DataFrame:
    """Acrescenta RVP/RCI/LUC do cadastro mestre do cessionário vinculado,
    sem alterar nenhuma coluna existente do projeto."""
    df = df.copy()
    cadastro = listar_cadastro_cessionarios()
    if not cadastro.empty and "cessionario_cadastro_id" in df.columns:
        mapa = cadastro.set_index("id")
        df["rvp"] = df["cessionario_cadastro_id"].map(mapa["rvp"])
        df["rci"] = df["cessionario_cadastro_id"].map(mapa["rci"])
        df["luc"] = df["cessionario_cadastro_id"].map(mapa["luc"])
    else:
        df["rvp"] = None
        df["rci"] = None
        df["luc"] = None
    return df


def _dataframe_para_exportacao(df: pd.DataFrame, colunas: dict[str, str]) -> pd.DataFrame:
    colunas_presentes = [c for c in colunas if c in df.columns]
    exportacao = df[colunas_presentes].rename(columns=colunas)
    for coluna_data in ("Data de Solicitação", "Data Limite", "Data Análise", "Hold (Início)", "Hold (Fim)"):
        if coluna_data in exportacao.columns:
            exportacao[coluna_data] = pd.to_datetime(exportacao[coluna_data], errors="coerce").dt.strftime("%d/%m/%Y")
    return exportacao.fillna("—")


def montar_exportacao_prestadores(df: pd.DataFrame) -> pd.DataFrame:
    return _dataframe_para_exportacao(preparar_prestadores_exportacao(df), _colunas_prestadores_exportacao())


def montar_exportacao_cessionarios(df: pd.DataFrame) -> pd.DataFrame:
    return _dataframe_para_exportacao(preparar_cessionarios_exportacao(df), _colunas_cessionarios_exportacao())


def montar_exportacao_consolidada(df_prest: pd.DataFrame, df_cess: pd.DataFrame) -> pd.DataFrame:
    """Junta Prestadores e Cessionários em um único arquivo, somente quando
    solicitado explicitamente — nunca por padrão — com a coluna "Tipo de
    Projeto" identificando a origem de cada linha."""
    exp_prest = montar_exportacao_prestadores(df_prest) if not df_prest.empty else pd.DataFrame()
    exp_cess = montar_exportacao_cessionarios(df_cess) if not df_cess.empty else pd.DataFrame()
    if not exp_prest.empty:
        exp_prest.insert(0, COLUNA_TIPO_PROJETO, "Prestador")
    if not exp_cess.empty:
        exp_cess.insert(0, COLUNA_TIPO_PROJETO, "Cessionário")
    return pd.concat([exp_prest, exp_cess], ignore_index=True).fillna("—")


def gerar_excel_bytes(df: pd.DataFrame, nome_aba: str) -> bytes:
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name=nome_aba[:31], index=False)
        planilha = writer.sheets[nome_aba[:31]]
        for indice, coluna in enumerate(df.columns, start=1):
            maior = max([len(str(coluna))] + [len(str(v)) for v in df[coluna].head(200)]) if not df.empty else len(str(coluna))
            planilha.column_dimensions[planilha.cell(row=1, column=indice).column_letter].width = min(max(maior + 2, 10), 45)
        planilha.freeze_panes = "A2"
    return buffer.getvalue()


def gerar_csv_bytes(df: pd.DataFrame) -> bytes:
    return df.to_csv(index=False, sep=";", encoding="utf-8-sig").encode("utf-8-sig")


def nome_arquivo_exportacao(tipo: str, extensao: str, filtrado: bool, rotulo_periodo: str | None = None) -> str:
    """`tipo` já deve vir capitalizado (`Prestadores`/`Cessionarios`/`Consolidado`)."""
    data_hoje = datetime.now().strftime("%Y-%m-%d")
    partes = [f"Projetos_{tipo}"]
    if filtrado:
        partes.append("Filtrado")
        if rotulo_periodo:
            partes.append(rotulo_periodo.replace(" ", "_").replace("/", "-"))
    partes.append(data_hoje)
    return f"{'_'.join(partes)}.{extensao}"
