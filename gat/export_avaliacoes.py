"""
Backup manual dos módulos de avaliação (item 17 do módulo de gestão das
avaliações): exporta o conteúdo completo — avaliações, notas,
comentários, datas e histórico de auditoria — em Excel, CSV (um arquivo
zipado por tabela) ou JSON. Disponível apenas para quem tiver a área de
permissão `avaliacoes.relatorios` (checklist de Prestador/Cessionário) ou
`analistas.relatorios` (nota dos analistas) — ambas já bloqueadas por
padrão para os perfis Analista e Consulta.

Este backup é um recorte específico dos dados de avaliação, pensado para
guardar fora do sistema sob demanda — complementa, mas não substitui, o
backup completo do banco (`gat/database.py::exportar_banco_bytes`) e o
backup automático (diário, pré-migração e a cada gravação — ver
`gat/backup_externo.py` e `gat/database.py::_aplicar_migracoes`).
"""

from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime
from typing import Any

import pandas as pd

from gat.database import listar_avaliacoes_checklist, listar_fechamentos_avaliacao_analista, listar_historico


def montar_backup_avaliacoes_checklist(tipo_entidade: str | None = None) -> dict[str, pd.DataFrame]:
    """`tipo_entidade`: "PRESTADOR", "CESSIONARIO" ou None (ambos)."""
    avaliacoes = listar_avaliacoes_checklist(tipo_entidade)
    historico = listar_historico("avaliacoes_checklist")
    if tipo_entidade and not avaliacoes.empty:
        historico = historico[historico["registro_id"].isin(avaliacoes["id"])]
    return {"avaliacoes": avaliacoes, "historico_auditoria": historico}


def montar_backup_avaliacoes_analistas() -> dict[str, pd.DataFrame]:
    from gat.database import listar_avaliacoes_analistas

    avaliacoes = listar_avaliacoes_analistas()
    fechamentos = listar_fechamentos_avaliacao_analista()
    historico = listar_historico("avaliacoes_analistas")
    seguranca = listar_historico("seguranca")
    if not seguranca.empty:
        seguranca = seguranca[seguranca["campo"].isin(["FECHAMENTO_AVALIACAO_ANALISTA", "RECALCULO_AVALIACAO_ANALISTA"])]
    return {
        "avaliacoes": avaliacoes, "fechamentos_mensais": fechamentos,
        "historico_edicoes": historico, "historico_fechamentos": seguranca,
    }


def gerar_excel_multiplas_abas(tabelas: dict[str, pd.DataFrame]) -> bytes:
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        for nome_aba, df in tabelas.items():
            df_saida = df if not df.empty else pd.DataFrame({"aviso": ["Nenhum registro encontrado."]})
            df_saida.to_excel(writer, sheet_name=nome_aba[:31], index=False)
    return buffer.getvalue()


def gerar_zip_csv(tabelas: dict[str, pd.DataFrame]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as arquivo_zip:
        for nome_aba, df in tabelas.items():
            conteudo_csv = df.to_csv(index=False, sep=";", encoding="utf-8-sig")
            arquivo_zip.writestr(f"{nome_aba}.csv", conteudo_csv)
    return buffer.getvalue()


def gerar_json_bytes(tabelas: dict[str, pd.DataFrame]) -> bytes:
    estrutura: dict[str, Any] = {
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
        **{nome: json.loads(df.to_json(orient="records", date_format="iso")) for nome, df in tabelas.items()},
    }
    return json.dumps(estrutura, ensure_ascii=False, indent=2).encode("utf-8")


def nome_arquivo_backup(prefixo: str, extensao: str) -> str:
    return f"Backup_{prefixo}_{datetime.now().strftime('%Y-%m-%d_%H%M%S')}.{extensao}"
