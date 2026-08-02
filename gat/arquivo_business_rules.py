"""Regras de negócio do módulo Arquivo: arquivamento lógico (nunca exclusão)
e exclusão definitiva controlada, para registros do GAT e do PMO.

Duas categorias do pedido original ficam **reservadas** (sem tabela de
origem hoje) em vez de terem dados forçados/inventados:

* "Projetistas Arquivados" — hoje o sistema não possui um cadastro próprio
  de Projetista; "projetista" é apenas um rótulo usado na avaliação do
  Cessionário (`views/avaliacao_prestadores.py`). A categoria fica pronta
  para uso assim que esse cadastro existir.
* "Relatórios Arquivados" — os relatórios (Word/Excel) do GAT e do PMO são
  gerados sob demanda e não ficam salvos no banco; não há, portanto,
  registro para arquivar. A categoria fica reservada pelo mesmo motivo.

Ambas aparecem no módulo Arquivo com uma mensagem explicativa, em vez de
simplesmente desaparecer — documentado também no Manual do Sistema.
"""

from __future__ import annotations

from dataclasses import dataclass

from gat.config import PERFIL_ADMIN, PERFIL_CONSULTA, PERFIL_GESTOR

TIPO_ARQUIVAMENTO = "ARQUIVAMENTO"
TIPO_RESTAURACAO = "RESTAURACAO"
TIPO_EXCLUSAO = "EXCLUSAO_DEFINITIVA"

ORIGEM_GAT = "GAT"
ORIGEM_PMO = "PMO"


@dataclass(frozen=True)
class CategoriaArquivo:
    chave: str
    rotulo: str
    tabela: str | None
    origem: str | None
    granularidade: str = "registro"  # "registro" (uma linha) ou "projeto_codigo" (todas as linhas de um código GAT)
    reservada: bool = False
    mensagem_reservada: str = ""


CATEGORIAS: list[CategoriaArquivo] = [
    CategoriaArquivo("pmo_projetos", "Projetos PMO Arquivados", "pmo_projetos", ORIGEM_PMO),
    CategoriaArquivo("projetos_gat", "Projetos GAT Arquivados", None, ORIGEM_GAT, granularidade="projeto_codigo"),
    CategoriaArquivo("analises", "Análises Arquivadas", None, ORIGEM_GAT),
    CategoriaArquivo("analistas", "Analistas Arquivados", "usuarios", None),
    CategoriaArquivo("prestadores", "Prestadores Arquivados", "cadastro_prestadores", ORIGEM_GAT),
    CategoriaArquivo("cessionarios", "Cessionários Arquivados", "cadastro_cessionarios", ORIGEM_GAT),
    CategoriaArquivo(
        "projetistas", "Projetistas Arquivados", None, None, reservada=True,
        mensagem_reservada=(
            "O sistema ainda não possui um cadastro próprio de Projetista — a avaliação do "
            "projetista é registrada dentro da avaliação do Cessionário. Esta categoria ficará "
            "disponível assim que esse cadastro for criado."
        ),
    ),
    CategoriaArquivo("reunioes", "Reuniões Arquivadas", "reunioes", None),
    CategoriaArquivo("planos_acao", "Planos de Ação Arquivados", "planos_acao", None),
    CategoriaArquivo("alertas", "Alertas Arquivados", "alertas_manuais", None),
    CategoriaArquivo(
        "relatorios", "Relatórios Arquivados", None, None, reservada=True,
        mensagem_reservada=(
            "Os relatórios do GAT e do PMO são gerados sob demanda (Word/Excel) e não ficam "
            "salvos no banco de dados — não há, portanto, um registro persistente para arquivar. "
            "Esta categoria ficará disponível caso o sistema passe a guardar relatórios gerados."
        ),
    ),
    CategoriaArquivo("documentos", "Documentos Arquivados", "pmo_cronograma_arquivos", ORIGEM_PMO),
    CategoriaArquivo("outros", "Outros Registros Arquivados", None, None, reservada=True, mensagem_reservada="Reservado para uso futuro."),
]

CATEGORIAS_POR_CHAVE: dict[str, CategoriaArquivo] = {c.chave: c for c in CATEGORIAS}

TABELAS_ARQUIVAVEIS = [
    "pmo_projetos", "prestadores", "cessionarios", "cadastro_prestadores",
    "cadastro_cessionarios", "usuarios", "reunioes", "planos_acao",
    "alertas_manuais", "pmo_cronograma_arquivos",
]

TEXTO_CONFIRMACAO_1 = "Deseja realmente excluir definitivamente este registro?"
TEXTO_CONFIRMACAO_2 = "Esta operação não poderá ser desfeita. Confirmar novamente?"


# ---------------------------------------------------------------------------
# Permissões (ajuste pontual: todos os perfis operacionais podem arquivar e
# restaurar — inclusive Analistas e quaisquer perfis futuros equivalentes —
# com exceção do perfil Consulta, que não tem acesso ao módulo Arquivo.
# Exclusão definitiva é exclusiva de Administrador e Gestor.)
# ---------------------------------------------------------------------------


def perfil_pode_acessar_arquivo(perfil: str) -> bool:
    """Todo perfil operacional acessa o módulo Arquivo, exceto Consulta —
    que só passa a acessar se o Administrador conceder essa permissão
    explicitamente na tela de Administração (mesmo mecanismo de exceção
    pontual usado nas demais áreas restritas do sistema)."""
    return perfil != PERFIL_CONSULTA


def perfil_pode_arquivar_e_restaurar(perfil: str) -> bool:
    return perfil != PERFIL_CONSULTA


def perfil_pode_excluir_definitivamente(perfil: str) -> bool:
    """Exclusão definitiva: exclusiva de Administrador e Gestor."""
    return perfil in {PERFIL_ADMIN, PERFIL_GESTOR}
