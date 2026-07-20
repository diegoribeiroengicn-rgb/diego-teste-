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
├── Relatórios
│   ├── Painel de Analistas       (produtividade mensal por analista)
│   └── Relatórios Mensais         (indicadores, comparativos, Excel/PDF, One Page Report)
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
  auth.py                  # Login seguro, sessão e troca obrigatória de senha
  permissions.py            # Enforcement de controle de acesso (módulos/áreas)
  business_rules.py        # Regras de governança (REV2, cancelados, etc.)
  export_excel.py           # Exportação fiel ao layout original (respeita permissões) + relatórios mensais
  export_pdf.py              # Relatórios mensais e One Page Report em PDF (reportlab)
  relatorios_mensais.py       # Indicadores por competência, produtividade de analistas e comparativos
  ui/
    modals.py                # Pop-ups de cadastro/edição
    modals_gestao.py          # Pop-ups de Reuniões e Planos de Ação
    modals_usuarios.py         # Editor de usuário: dados, senha e permissões
    tables.py                 # Tabela dinâmica com seleção para edição
    charts.py                  # Gráficos Plotly
    kpi_cards.py                # Cartões de KPI
    filtros.py                   # Seletor reutilizável de competência (Mês/Ano)
views/
  inicio.py                 # Portal inicial (cards de acesso aos módulos)
  meu_perfil.py               # Meu Perfil > Alterar Senha
  prestadores_dashboard.py     # Prestadores > Dashboard (KPIs e gráficos exclusivos)
  prestadores.py                 # Prestadores > Projetos (cadastro/edição/consulta)
  avaliacao_prestadores.py         # Prestadores > Avaliação (1-15)
  cessionarios_dashboard.py          # Cessionários > Dashboard (KPIs e gráficos exclusivos)
  cessionarios.py                      # Cessionários > Projetos (cadastro/edição/consulta)
  consolidado.py                         # Consolidado > Visão Geral
  alertas.py                               # Gestão > Central de Alertas (Pendente de Reunião)
  lembretes_pep.py                           # Gestão > Lembretes (projetos sem PEP)
  reunioes.py                                  # Gestão > Reuniões
  planos_acao.py                                 # Gestão > Planos de Ação
  gestao_historico.py                              # Gestão > Histórico
  painel_analistas.py                                # Relatórios > Painel de Analistas (produtividade mensal)
  relatorios_mensais.py                                # Relatórios > Relatórios Mensais (indicadores, Excel/PDF, One Page Report)
  administracao.py                                   # Sistema > Usuários, Validação de Dados, Auditoria, Configurações
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

## Preservação de dados, backups e migrações

O código-fonte e o banco de dados de produção são mantidos separados. Por
padrão o banco fica em `data/gat_tecnoplano.db` (fora do que é substituído a
cada deploy do código), mas o caminho é configurável pela variável de
ambiente `DATABASE_PATH` — útil para apontar a um volume/disco persistente
do ambiente de produção. Se o arquivo indicado já existir, a aplicação
**apenas o utiliza e aplica migrações pendentes**; ele só é criado (e
semeado a partir de `seed_gat_tecnoplano.db`) na primeira execução, quando
ainda não existe. Nenhuma rotina do sistema apaga tabelas, faz `DELETE`
sem condição ou recria o banco do zero durante a inicialização.

Alterações de schema (novas tabelas, colunas ou índices) são aplicadas por
**migrações incrementais e idempotentes**, controladas pela tabela
`schema_version` (versão, data, descrição e status de cada migração
aplicada). A cada inicialização, o sistema roda apenas as migrações com
versão maior que a última aplicada com sucesso — uma migração nunca é
reexecutada, e uma falha interrompe a inicialização sem deixar o schema
parcialmente migrado (a migração falha fica registrada e é tentada
novamente na próxima subida, após a causa ser corrigida).

Antes de aplicar qualquer migração pendente, o sistema cria automaticamente
um **backup** do banco (`data/backups/backup_gat_2026_<data>_<hora>_v<versão>.db`).
A migração só prossegue se o backup for criado com sucesso. São mantidos os
`GAT_MAX_BACKUPS` backups mais recentes (padrão: 15, configurável por
variável de ambiente), sem nunca apagar o mais recente válido.

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

Todo usuário criado pelo administrador recebe uma **senha temporária** e é
obrigado a defini-la novamente no primeiro acesso (tela dedicada, bloqueando
o restante do sistema até a troca). Depois disso, qualquer usuário pode
alterar a própria senha em **Meu Perfil → Alterar Senha**, informando a
senha atual. As senhas são sempre armazenadas com hash `bcrypt` — nunca em
texto puro — e o administrador nunca visualiza a senha atual de um usuário,
apenas redefine (o que também força uma nova troca no próximo login).

## Controle de acesso (perfis, módulos e áreas)

Além da autenticação, o sistema aplica controle de acesso granular,
validado no backend (não apenas ocultando itens de menu):

- **Módulos** (`Prestadores`, `Cessionários`, `Consolidado`) são liberados
  ou bloqueados por usuário. Um módulo bloqueado não aparece no menu, não
  abre por navegação direta e não fornece dados a nenhuma tela do sistema
  (dashboards, listagens, exportações e relatórios excluem esse módulo).
- **Áreas/funcionalidades** (cadastrar/editar projeto, exportar dados,
  avaliações, alertas, lembretes, reuniões, configurações, auditoria,
  administrar usuários etc.) têm permissão binária independente do módulo.
- **Perfis** (`ADMIN`, `GESTOR`, `ANALISTA`, `CONSULTA`) definem apenas o
  ponto de partida das permissões de um novo usuário — a partir da criação,
  as permissões são individuais e o administrador pode conceder ou retirar
  qualquer uma delas a qualquer momento em **Administração → Usuários**,
  sem precisar excluir e recriar a conta.
- Toda concessão/retirada de acesso, criação e alteração de perfil de
  usuário, redefinição de senha, ativação/inativação e tentativa de acesso
  a um módulo ou área bloqueados ficam registradas na auditoria de
  segurança (**Administração → Histórico e Auditoria**, filtro
  `seguranca`) — nunca com senhas ou hashes.

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

## Validação da importação dos dados

Em **Administração → Validação de Dados**, o sistema apresenta um relatório
calculado inteiramente a partir do banco (não depende do arquivo de origem
estar disponível): total de registros importados, Item mínimo/máximo e
eventuais números de Item ausentes na sequência.

A importação real (`scripts/importar_planilha.py`) grava todas as linhas
com prestador/cessionário e data de solicitação preenchidos, sem aplicar
filtro de status, PEP ou duplicidade. No histórico importado, Prestadores
soma exatamente 455 registros (Item 1–455, sem lacunas). Cessionários soma
496 registros — a numeração de Item chega a 501, mas os números 73, 270,
271, 272 e 273 não correspondem a nenhuma linha física na planilha de
origem (removidas antes da importação, sem reaproveitamento de numeração,
conforme a política de preservação de Item do sistema) — não é uma falha
da importação.

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

## Filtro de competência (Mês/Ano)

Um filtro de **competência** (Mês/Ano, com opção "Todos os períodos") está
disponível em **Início, Prestadores › Dashboard, Cessionários › Dashboard,
Consolidado, Prestadores › Avaliação, Painel de Analistas e Relatórios
Mensais**. O filtro usa a **Data de Solicitação** como referência (Data da
Avaliação, no caso da tela de Avaliação) e recalcula automaticamente todos
os KPIs, gráficos e tabelas da tela — sem alterar o comportamento padrão
("Todos os períodos") quando nenhum mês/ano é selecionado. Os dashboards de
Prestadores e Cessionários exibem ainda um mini comparativo (mês atual ×
mês anterior) para Recebidos, Concluídos e % SLA sempre que uma competência
específica está selecionada. Também está disponível nas telas de **Projetos**
de Prestadores e Cessionários (não só nos Dashboards).

### Pesquisa por N° AT e por nome (Prestadores e Cessionários)

As telas **Prestadores › Projetos** e **Cessionários › Projetos** também
possuem, no painel de Filtros, pesquisa por **N° AT** (correspondência
exata ou parcial) e por **nome do Prestador/Cessionário** (parcial, sem
diferenciar maiúsculas/minúsculas nem exigir acentuação exata). Os dois
campos funcionam em conjunto com todos os demais filtros já existentes
(Responsável, Status, PEP, Pendente de Reunião, Tipo e Competência). O
painel tem botões **Pesquisar** e **Limpar filtros**, mostra a quantidade
de registros encontrados e exibe uma mensagem clara quando nenhum registro
corresponde aos filtros aplicados. A pesquisa é somente leitura — nunca
altera, exclui ou duplica registros.

## Painel de Analistas (produtividade mensal)

Disponível no grupo **Relatórios** (área `analistas`), apresenta a
produtividade de cada analista por competência: projetos analisados,
documentos analisados, ATs emitidas, tempo médio de análise, % de SLA
atendido, backlog do período, projetos concluídos e projetos em andamento.
Pode ser filtrado por módulo (Prestadores, Cessionários ou Consolidado),
disciplina, analista e competência (Mês/Ano).

> ⚠️ O **backlog de um mês passado** é uma aproximação: como o sistema não
> mantém um histórico de mudanças de status, ele é calculado como a
> quantidade de projetos **atualmente** em "EM ANÁLISE" cuja Data de
> Solicitação é anterior ao fim do mês consultado — não uma reconstrução
> histórica exata do status naquele momento.

## Relatórios Mensais e One Page Report

Disponível no grupo **Relatórios** (área `relatorios`), permite emitir
relatórios mensais para **Prestadores, Cessionários, Consolidado e
Analistas**, sempre para uma competência específica (Mês/Ano obrigatórios):

- KPIs do período (recebidos, concluídos, em análise, documentos, % SLA,
  backlog) ou, no caso de Analistas, a tabela completa de produtividade;
- **Comparativos**: mês atual × mês anterior, mês atual × mesmo mês do ano
  anterior, e acumulado do ano — nos dashboards e no próprio relatório;
- **Exportação em Excel** (abas INDICADORES, PROJETOS e PRODUTIVIDADE) e em
  **PDF**, respeitando os filtros de módulo e competência aplicados;
- **One Page Report** — resumo executivo em uma única página (PDF),
  consolidando Prestadores + Cessionários da competência selecionada:
  total de projetos, concluídos, em análise, documentos, produtividade
  média dos analistas, % de SLA, backlog, projetos sem PEP, comparativo com
  o mês anterior e observações gerenciais. As observações de cada
  competência podem ser cadastradas e editadas na própria tela e ficam
  salvas para reaproveitamento em relatórios futuros daquele mês.
