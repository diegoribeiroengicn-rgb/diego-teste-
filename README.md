# Sistema GAT 2026 — Controle de Análises Técnicas (Tecnoplano)

Programa de governança e análise de projetos para o GAT (Gerenciamento de
Análises Técnicas) da Tecnoplano, cobrindo as análises de **Prestadores de
Serviço** e **Cessionários**, com painel consolidado, alertas de
governança e exportação fiel para Excel.

## Arquitetura

- **Python 3.10+**
- **Streamlit** — interface interativa, com pop-ups/modais (`st.dialog`) para
  cadastro e edição de registros
- **SQLite** (`data/gat_tecnoplano.db`) — persistência de dados e histórico
  de edições
- **bcrypt** — hash de senhas de acesso
- **pandas / openpyxl** — manipulação de dados e exportação de relatórios
- **Plotly** — gráficos interativos do painel

## Navegação

A navegação usa `st.navigation` (nativo do Streamlit) agrupada por módulo —
**sem bolinhas ou botões de rádio** para alternar entre eles. Cada módulo é
um ambiente próprio, com sequência de Item, filtros, KPIs e gráficos
exclusivos:

```
GAT 2026
├── Início                    (portal com cards de acesso rápido)
├── Prestadores
│   ├── Dashboard              (KPIs e gráficos exclusivos)
│   ├── Projetos                (cadastro/edição/consulta)
│   └── Avaliação
├── Cessionários
│   ├── Dashboard
│   └── Projetos
├── Consolidado
│   └── Visão Geral             (visão executiva integrada)
├── Gestão
│   ├── Central de Alertas       (Pendente de Reunião)
│   ├── Lembretes (Sem PEP)
│   ├── Reuniões                  (vínculo N:N a projetos de Prestadores/Cessionários)
│   ├── Planos de Ação             (responsável, prazo e conclusão)
│   └── Histórico                   (auditoria de Reuniões e Planos de Ação)
└── Sistema
    └── Administração            (somente perfil ADMIN)
```

## Estrutura do projeto

```
app.py                  # Ponto de entrada Streamlit (login + navegação)
gat/
  config.py              # Constantes, paleta de cores e listas suspensas
  styles.py               # CSS institucional Tecnoplano (inclui modais)
  calendario.py           # Feriados RJ e cálculo de dias úteis
  database.py             # Esquema SQLite e operações CRUD
  auth.py                  # Login seguro e sessão
  business_rules.py        # Regras de governança (REV2, cancelados, etc.)
  export_excel.py           # Exportação fiel ao layout original
  ui/
    modals.py                # Pop-ups de cadastro/edição
    modals_gestao.py          # Pop-ups de Reuniões e Planos de Ação
    tables.py                 # Tabela dinâmica com seleção para edição
    charts.py                  # Gráficos Plotly
    kpi_cards.py                # Cartões de KPI
views/
  inicio.py                 # Portal inicial (cards de acesso aos módulos)
  prestadores_dashboard.py   # Prestadores > Dashboard (KPIs e gráficos exclusivos)
  prestadores.py               # Prestadores > Projetos (cadastro/edição/consulta)
  avaliacao_prestadores.py       # Prestadores > Avaliação (1-15)
  cessionarios_dashboard.py        # Cessionários > Dashboard (KPIs e gráficos exclusivos)
  cessionarios.py                    # Cessionários > Projetos (cadastro/edição/consulta)
  consolidado.py                       # Consolidado > Visão Geral
  alertas.py                             # Gestão > Central de Alertas (Pendente de Reunião)
  lembretes_pep.py                         # Gestão > Lembretes (projetos sem PEP)
  reunioes.py                                # Gestão > Reuniões
  planos_acao.py                               # Gestão > Planos de Ação
  gestao_historico.py                            # Gestão > Histórico
  administracao.py                                 # Sistema > Administração
assets/
  tecnoplano_logo.png       # Logomarca institucional
scripts/
  importar_planilha.py      # Importação em lote a partir das planilhas Excel
data/
  seed_gat_tecnoplano.db    # Banco de sementes com o histórico real importado
```

## Instalação

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Execução

```bash
streamlit run app.py
```

O banco de dados SQLite é criado automaticamente na primeira execução, em
`data/gat_tecnoplano.db`. Se o arquivo ainda não existir, ele é restaurado
automaticamente a partir do banco de sementes versionado no repositório
(`data/seed_gat_tecnoplano.db`) — que já contém todo o histórico real
importado da planilha `Controle_GAT_Projetos_2026.xlsm` (455 registros de
Prestadores e 496 de Cessionários). Ou seja: **a aplicação já nasce
povoada com os dados reais** — só é necessário cadastrar manualmente os
projetos novos a partir daqui em diante.

### Reimportar ou atualizar a base de sementes

Caso a planilha oficial seja atualizada e você queira regerar a base de
sementes com uma versão mais recente:

```bash
python scripts/importar_planilha.py \
  --xlsm caminho/Controle_GAT_Projetos_2026.xlsm \
  --avaliacao caminho/Avaliacao_Prestadores_GAT.xlsx \
  --destino data/seed_gat_tecnoplano.db \
  --forcar
```

> ⚠️ O script recusa a execução se o banco de destino já tiver registros
> (para não duplicar dados), a menos que `--forcar` seja informado. Nunca
> rode este comando apontando `--destino` para o banco de produção em uso
> — ele foi desenhado para (re)gerar apenas o arquivo de sementes.

### Acesso inicial

Um usuário administrador padrão é criado automaticamente no primeiro
início do sistema:

- **Usuário:** `admin`
- **Senha:** `Tecnoplano@2026`

> ⚠️ Altere a senha padrão assim que possível pelo módulo **Administração**
> (disponível apenas para o perfil ADMIN).

## Regras de governança implementadas

- Projetos com status **CANCELADO** são rigorosamente excluídos dos KPIs e
  das visões ativas do painel.
- Meta corporativa de aprovação: até a **Revisão 2 (REV2)**.
- Projetos **NÃO LIBERADO** com revisão **>= REV2** são categorizados como
  **Pendente de Reunião** (gargalo crítico), com view dedicada de alertas.
- Dias úteis decorridos/saldo de dias úteis são calculados dinamicamente
  com base no calendário oficial de feriados do Rio de Janeiro (RJ).
- O Item operacional (numeração da planilha original) é preservado e nunca
  recalculado; Prestadores e Cessionários possuem sequências de Item
  independentes; cancelamentos não geram renumeração.

## Projeto sem PEP (alerta, pendência e lembrete automáticos)

O campo PEP não é obrigatório para concluir um cadastro. Ao salvar um
projeto sem PEP, o sistema:

1. Exibe um aviso de atenção e exige confirmação explícita antes de gravar;
2. Sinaliza o registro com o badge **SEM PEP** nas tabelas de Prestadores
   e Cessionários;
3. Gera automaticamente um lembrete na tela **Lembretes (Sem PEP)**, com a
   contagem de dias sem PEP (a partir da Data de Solicitação) e uma
   criticidade que evolui com o tempo — **Informativo → Atenção → Crítico**;
4. Os limiares de dias para cada criticidade são parametrizáveis em
   **Administração → Configurações** (não são fixos no código);
5. Assim que o PEP é informado, a pendência e o lembrete são encerrados
   automaticamente — a auditoria completa (criação e regularização) fica
   registrada no histórico de edições.

## Central de Gestão (Reuniões e Planos de Ação)

Área própria dentro do grupo **Gestão**, independente das telas de cadastro
de Prestadores/Cessionários:

- **Reuniões** — registro de reuniões de alinhamento, com vínculo N:N a um
  ou mais projetos de Prestadores e/ou Cessionários (um mesmo projeto pode
  aparecer em várias reuniões), lista de participantes, ata e decisões.
- **Planos de Ação** — ações com responsável, prazo e status (Pendente, Em
  Andamento, Concluído), podendo ser criadas avulsas ou a partir de uma
  reunião; a conclusão registra automaticamente data e usuário responsável
  pelo encerramento.
- **Histórico** — auditoria dedicada de todas as movimentações de Reuniões
  e Planos de Ação (criação, edição e conclusão), separada do histórico
  geral de Prestadores/Cessionários.

## Exportação de relatórios

O botão **"Exportar Relatório Excel"** (barra lateral) gera um arquivo
`.xlsx` com as abas **PRESTADORES**, **CESSIONARIOS**, **ALERTAS CRITICOS**
e **PAINEL CONSOLIDADO**, respeitando a estrutura de colunas da planilha
original da Tecnoplano.
