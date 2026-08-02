"""Conteúdo dos capítulos do módulo PMO no Manual do Sistema — usado
apenas para semear a migração `_migracao_0017_manual_pmo`. Depois de
publicado, o conteúdo passa a ser gerido pela Administração do Manual,
como qualquer outro capítulo."""

from __future__ import annotations

from gat.pmo_business_rules import BIBLIOTECA_KPIS, KPI_ORDEM

_LISTA_KPIS_MARKDOWN = "\n".join(f"- **{BIBLIOTECA_KPIS[chave]['nome']}**" for chave in KPI_ORDEM)

_CONTEUDO_PMO = (
    "**Objetivo**\n\n"
    "O PMO (Project Management Office) é um módulo totalmente independente do GAT, destinado exclusivamente "
    "ao gerenciamento de contratos e projetos. O GAT continua responsável apenas pelas análises técnicas. "
    "Os dois módulos coexistem na mesma plataforma, com regras de negócio, dashboards, indicadores e fluxos "
    "próprios.\n\n"
    "**Diferença entre PMO e GAT**\n\n"
    "- **GAT**: análises técnicas de Prestadores e Cessionários — cadastro, revisões, prazos, avaliações, "
    "alertas de análise, KPIs de analistas.\n"
    "- **PMO**: gerenciamento de contratos e projetos — cronograma, curva S, financeiro, medições, "
    "entregáveis, riscos, comunicações, relatórios e OPR do projeto.\n"
    "- Os únicos módulos compartilhados entre PMO e GAT são **Reuniões**, **Planos de Ação** e **Alertas** — "
    "mesmo compartilhados, cada registro carrega sua origem (GAT ou PMO), nunca misturando as informações.\n\n"
    "**Cadastro de projetos**\n\n"
    "Em PMO > Portfólio de Projetos, o botão **Novo Projeto** abre o cadastro (nome, cliente, contratada, "
    "gerente, data de início, data prevista de término, valor contratual opcional, tipo de contrato e "
    "observações). Ao concluir o cadastro, o sistema já cria automaticamente o alerta \"Cronograma pendente "
    "de recebimento.\" para o novo projeto.\n\n"
    "**Configuração dos Indicadores (KPIs)**\n\n"
    "Logo após o cadastro, o gerente escolhe quais dos 14 indicadores deseja monitorar naquele projeto:\n\n"
    f"{_LISTA_KPIS_MARKDOWN}\n\n"
    "Indicadores não selecionados não criam módulo, não reservam espaço no Dashboard e não aparecem em "
    "nenhuma tela — nem nos relatórios. A configuração pode ser alterada a qualquer momento em "
    "Configuração > Configurar Indicadores: desabilitar um indicador apenas o oculta, sem apagar nenhum "
    "dado já lançado nele; reabilitar traz de volta todos os dados anteriores intactos.\n\n"
    "**Dashboard**\n\n"
    "O Dashboard de cada projeto é dinâmico: mostra um cartão para cada indicador habilitado, reposicionando "
    "automaticamente os cartões — nunca deixa espaços vazios para indicadores desabilitados.\n\n"
    "**Cronograma**\n\n"
    "Permite anexar o cronograma em Excel (.xlsx) ou Primavera (.xer), com interpretação automática de "
    "atividades, marcos, dependências, caminho crítico (método CPM) e datas. Arquivos MS Project (.mpp) são "
    "aceitos apenas como anexo de referência — é um formato binário proprietário sem leitura automática "
    "confiável neste sistema; para ter a leitura automática, exporte o cronograma para Excel ou XER.\n\n"
    "**Funcionamento do alerta automático de solicitação do cronograma**\n\n"
    "Sempre que um novo projeto PMO é criado, o sistema gera automaticamente o alerta \"Cronograma pendente "
    "de recebimento.\", visível na Central de Alertas do PMO, na página inicial do PMO e no Dashboard "
    "Executivo do projeto. Enquanto nenhum cronograma estiver anexado, o sistema envia automaticamente ao "
    "gerente um lembrete a cada 3 dias úteis com a mensagem: \"O projeto ainda não possui cronograma "
    "anexado. Solicite o cronograma à contratada para dar continuidade ao acompanhamento do projeto.\" Todas "
    "as cobranças automáticas, a data de cada lembrete, quem anexou o cronograma e a data do recebimento "
    "ficam registrados.\n\n"
    "**Regras de encerramento desse alerta**\n\n"
    "Assim que um cronograma é anexado, o alerta é encerrado automaticamente e os lembretes periódicos são "
    "cancelados, com o recebimento registrado no histórico. Caso o cronograma seja removido posteriormente, "
    "o sistema reativa automaticamente o alerta e reinicia a contagem dos lembretes de 3 em 3 dias úteis.\n\n"
    "**Curva S**\n\n"
    "Gerada automaticamente a partir do cronograma anexado: compara o percentual planejado (pelas datas do "
    "cronograma) com o percentual realizado atual, evidenciando o desvio de execução.\n\n"
    "**Financeiro**\n\n"
    "Consolida valor contratado, medido, aprovado, pago, glosado e o saldo — os valores medido/aprovado/"
    "pago/glosado são somados automaticamente a partir dos lançamentos da aba Medições.\n\n"
    "**Medições**\n\n"
    "Registro de cada medição por competência (mês/ano), com percentual, valor medido, situação, valor e "
    "data de aprovação, valor e data de pagamento e valor glosado.\n\n"
    "**Gestão de riscos**\n\n"
    "Matriz Probabilidade × Impacto (escala 1 a 5 em cada eixo): a classificação é o produto dos dois "
    "valores (1-4 baixo, 5-9 médio, 10-14 alto, 15-25 crítico). Um risco crítico aberto eleva "
    "automaticamente a saúde do projeto para vermelho.\n\n"
    "**Relatórios**\n\n"
    "Executivo, Completo, Financeiro, Medições, Riscos, Cronograma e Pendências — cada um inclui apenas as "
    "seções cujos indicadores estejam habilitados no projeto, em formato Word.\n\n"
    "**OPR**\n\n"
    "Resumo automático de uma única página do projeto: dados gerais, KPIs habilitados, cronograma, "
    "financeiro, medições, riscos e pendências.\n\n"
    "**Biblioteca de KPIs**\n\n"
    "Reúne a documentação completa (objetivo, fórmula, interpretação e exemplo prático) de todos os 14 "
    "indicadores disponíveis no PMO, acessível a qualquer momento pela aba Biblioteca de KPIs dentro de cada "
    "projeto — ver o capítulo \"Biblioteca de Indicadores (PMO)\" a seguir para o conteúdo completo."
)


def _formatar_kpi_manual(chave: str) -> str:
    kpi = BIBLIOTECA_KPIS[chave]
    return (
        f"**{kpi['nome']}**\n\n"
        f"Objetivo: {kpi['objetivo']}\n\n"
        f"Fórmula: {kpi['formula']}\n\n"
        f"Interpretação: {kpi['interpretacao']}\n\n"
        f"Exemplo prático: {kpi['exemplo']}"
    )


_CONTEUDO_BIBLIOTECA_INDICADORES = (
    "Documentação completa de todos os indicadores disponíveis para configuração em um projeto do PMO. "
    "Sempre que um novo indicador for adicionado ao sistema, este capítulo é atualizado automaticamente.\n\n"
    + "\n\n---\n\n".join(_formatar_kpi_manual(chave) for chave in KPI_ORDEM)
)

CAPITULOS_PMO: list[tuple[str, str]] = [
    ("PMO – Gestão de Projetos", _CONTEUDO_PMO),
    ("Biblioteca de Indicadores (PMO)", _CONTEUDO_BIBLIOTECA_INDICADORES),
]
