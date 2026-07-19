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
    tables.py                 # Tabela dinâmica com seleção para edição
    charts.py                  # Gráficos Plotly
    kpi_cards.py                # Cartões de KPI
views/
  dashboard.py             # Painel Geral Consolidado
  prestadores.py            # Aba A — Análise de Prestadores
  cessionarios.py            # Aba B — Análise de Cessionários
  alertas.py                  # Alertas críticos (Pendente de Reunião)
  administracao.py             # Gestão de usuários e histórico (admin)
assets/
  tecnoplano_logo.png       # Logomarca institucional
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
`data/gat_tecnoplano.db`.

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

## Exportação de relatórios

O botão **"Exportar Relatório Excel"** (barra lateral) gera um arquivo
`.xlsx` com as abas **PRESTADORES**, **CESSIONARIOS**, **ALERTAS CRITICOS**
e **PAINEL CONSOLIDADO**, respeitando a estrutura de colunas da planilha
original da Tecnoplano.
