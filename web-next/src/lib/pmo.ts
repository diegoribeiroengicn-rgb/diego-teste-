import { obterPool } from "@/lib/db";
import {
  KPI_ORDEM,
  KPI_PADRAO_HABILITADO,
  MENSAGEM_LEMBRETE_CRONOGRAMA,
  TITULO_ALERTA_CRONOGRAMA,
  proximoLembreteCronograma,
  type AlertaPmo,
  type ProjetoPmo,
} from "@/lib/pmo-calculo";

const MODULO_ALERTA_PMO = "pmo";

/** Grava uma linha de histórico por campo alterado — mesma regra de
 * gat/database.py::registrar_historico (versão pública de
 * `_registrar_historico`, reaproveitada pelo PMO). */
async function registrarHistorico(
  tabela: string,
  registroId: number,
  antigo: Record<string, unknown>,
  novo: Record<string, unknown>,
  usuario: string,
): Promise<void> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  for (const [campo, valorNovo] of Object.entries(novo)) {
    const valorAntigo = antigo[campo] ?? null;
    if (String(valorAntigo) === String(valorNovo)) continue;
    await pool.query(
      "INSERT INTO historico_edicoes (tabela, registro_id, campo, valor_anterior, valor_novo, usuario, data_hora) " +
        "VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [tabela, registroId, campo, valorAntigo != null ? String(valorAntigo) : null, valorNovo != null ? String(valorNovo) : null, usuario, agora],
    );
  }
}

// ---------------------------------------------------------------------------
// Projetos
// ---------------------------------------------------------------------------

export type DadosProjetoPmo = {
  nome: string;
  cliente: string | null;
  contratada: string | null;
  gerente: string | null;
  data_inicio: string | null;
  data_prevista_termino: string | null;
  valor_contratual: number | null;
  tipo_contrato: string | null;
  observacoes: string | null;
};

const COLUNAS_PROJETO = [
  "nome", "cliente", "contratada", "gerente", "data_inicio", "data_prevista_termino",
  "valor_contratual", "tipo_contrato", "observacoes",
] as const;

/** Cadastra um novo projeto PMO e, na sequência: grava a configuração
 * inicial dos KPIs (apenas os selecionados ficam habilitados — os demais
 * existem na tabela já desabilitados, prontos para serem ligados depois
 * sem perder nenhum dado já registrado) e gera automaticamente o alerta
 * "Cronograma pendente de recebimento.", obrigatório para todo projeto
 * novo enquanto não houver cronograma. Mesma regra de
 * gat/pmo_database.py::criar_projeto. */
export async function criarProjeto(dados: DadosProjetoPmo, kpisHabilitados: string[] | null, usuario: string): Promise<number> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const valores = COLUNAS_PROJETO.map((c) => dados[c] ?? null);
  const habilitados = new Set(kpisHabilitados ?? Object.entries(KPI_PADRAO_HABILITADO).filter(([, v]) => v).map(([k]) => k));

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO pmo_projetos (${COLUNAS_PROJETO.join(", ")}, criado_em, criado_por) ` +
      `VALUES (${COLUNAS_PROJETO.map((_, i) => `$${i + 1}`).join(", ")}, $${COLUNAS_PROJETO.length + 1}, $${COLUNAS_PROJETO.length + 2}) ` +
      "RETURNING id",
    [...valores, agora, usuario],
  );
  const projetoId = rows[0].id;

  for (const chave of KPI_ORDEM) {
    const ligado = habilitados.has(chave);
    await pool.query(
      "INSERT INTO pmo_projeto_kpis (projeto_id, kpi_chave, habilitado, habilitado_em) VALUES ($1,$2,$3,$4)",
      [projetoId, chave, ligado, ligado ? agora : null],
    );
  }

  const campos = Object.fromEntries(COLUNAS_PROJETO.map((c) => [c, dados[c] ?? null]));
  await registrarHistorico("pmo_projetos", projetoId, {}, campos, usuario);

  await criarAlertaCronogramaPendente(projetoId, usuario);
  return projetoId;
}

export async function atualizarProjeto(projetoId: number, dados: DadosProjetoPmo, usuario: string): Promise<void> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const { rows: antigas } = await pool.query("SELECT * FROM pmo_projetos WHERE id = $1", [projetoId]);
  const antigo = antigas[0] ?? {};

  const setClause = COLUNAS_PROJETO.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const valores = COLUNAS_PROJETO.map((c) => dados[c] ?? null);
  await pool.query(
    `UPDATE pmo_projetos SET ${setClause}, atualizado_em = $${COLUNAS_PROJETO.length + 1}, atualizado_por = $${COLUNAS_PROJETO.length + 2} WHERE id = $${COLUNAS_PROJETO.length + 3}`,
    [...valores, agora, usuario, projetoId],
  );

  const campos = Object.fromEntries(COLUNAS_PROJETO.map((c) => [c, dados[c] ?? null]));
  await registrarHistorico("pmo_projetos", projetoId, antigo, campos, usuario);
}

export async function definirStatusProjeto(projetoId: number, status: string, usuario: string): Promise<void> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const { rows } = await pool.query<{ status: string }>("SELECT status FROM pmo_projetos WHERE id = $1", [projetoId]);
  await pool.query(
    "UPDATE pmo_projetos SET status = $1, atualizado_em = $2, atualizado_por = $3 WHERE id = $4",
    [status, agora, usuario, projetoId],
  );
  await registrarHistorico("pmo_projetos", projetoId, { status: rows[0]?.status }, { status }, usuario);
}

export async function obterProjeto(projetoId: number): Promise<ProjetoPmo | null> {
  const pool = obterPool();
  const { rows } = await pool.query<ProjetoPmo>("SELECT * FROM pmo_projetos WHERE id = $1", [projetoId]);
  return rows[0] ?? null;
}

/** Só projetos ativos — os arquivados pelo módulo Arquivo somem do
 * Portfólio/Dashboards e ficam disponíveis exclusivamente na tela de
 * Arquivo. Mesma regra de gat/pmo_database.py::listar_projetos. */
export async function listarProjetos(): Promise<ProjetoPmo[]> {
  const pool = obterPool();
  const { rows } = await pool.query<ProjetoPmo>("SELECT * FROM pmo_projetos WHERE arquivado_em IS NULL ORDER BY nome");
  return rows;
}

// ---------------------------------------------------------------------------
// Configuração dos KPIs por projeto
// ---------------------------------------------------------------------------

export type KpiProjeto = { id: number; projeto_id: number; kpi_chave: string; habilitado: boolean; habilitado_em: string | null; desabilitado_em: string | null };

export async function listarKpisProjeto(projetoId: number): Promise<KpiProjeto[]> {
  const pool = obterPool();
  const { rows } = await pool.query<KpiProjeto>("SELECT * FROM pmo_projeto_kpis WHERE projeto_id = $1", [projetoId]);
  return rows;
}

export async function kpisHabilitadosProjeto(projetoId: number): Promise<Set<string>> {
  const linhas = await listarKpisProjeto(projetoId);
  return new Set(linhas.filter((l) => l.habilitado).map((l) => l.kpi_chave));
}

/** Nunca apaga a linha de um indicador desabilitado (preserva os dados já
 * lançados naquele módulo) e nunca cria um indicador que já existe (a
 * tabela já tem uma linha para cada um dos 14 desde o cadastro do
 * projeto): apenas liga/desliga a flag `habilitado`. Mesma regra de
 * gat/pmo_database.py::definir_kpis_projeto. */
export async function definirKpisProjeto(projetoId: number, chavesHabilitadas: Set<string>, usuario: string): Promise<void> {
  const pool = obterPool();
  const atuais = await listarKpisProjeto(projetoId);
  const agora = new Date().toISOString();
  for (const linha of atuais) {
    const deveHabilitar = chavesHabilitadas.has(linha.kpi_chave);
    if (deveHabilitar === linha.habilitado) continue;
    if (deveHabilitar) {
      await pool.query(
        "UPDATE pmo_projeto_kpis SET habilitado = true, habilitado_em = $1 WHERE projeto_id = $2 AND kpi_chave = $3",
        [agora, projetoId, linha.kpi_chave],
      );
    } else {
      await pool.query(
        "UPDATE pmo_projeto_kpis SET habilitado = false, desabilitado_em = $1 WHERE projeto_id = $2 AND kpi_chave = $3",
        [agora, projetoId, linha.kpi_chave],
      );
    }
    await registrarHistorico("pmo_projeto_kpis", linha.id, { habilitado: linha.habilitado }, { habilitado: deveHabilitar }, usuario);
  }
}

// ---------------------------------------------------------------------------
// Alerta automático de cronograma pendente (ciclo de vida completo)
// ---------------------------------------------------------------------------

export type AlertaCronograma = {
  id: number;
  projeto_id: number;
  alerta_manual_id: number | null;
  status: string;
  criado_em: string;
  qtd_lembretes: number;
  ultimo_lembrete_em: string | null;
  proximo_lembrete_em: string | null;
  encerrado_em: string | null;
  anexado_por: string | null;
  anexado_em: string | null;
};

async function criarAlertaCronogramaPendente(projetoId: number, usuario: string): Promise<number> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO alertas_manuais (modulo, projeto_id, titulo, descricao, prioridade, status, criado_por, criado_em) " +
      "VALUES ($1,$2,$3,$4,'Alta','ABERTO',$5,$6) RETURNING id",
    [MODULO_ALERTA_PMO, projetoId, TITULO_ALERTA_CRONOGRAMA, MENSAGEM_LEMBRETE_CRONOGRAMA, usuario, agora],
  );
  const alertaId = rows[0].id;
  await registrarHistorico("alertas_manuais", alertaId, {}, { status: "ABERTO", titulo: TITULO_ALERTA_CRONOGRAMA }, usuario);

  const proximo = proximoLembreteCronograma(new Date()).toISOString().slice(0, 10);
  await pool.query(
    "INSERT INTO pmo_alertas_cronograma (projeto_id, alerta_manual_id, status, criado_em, proximo_lembrete_em) VALUES ($1,$2,'ATIVO',$3,$4)",
    [projetoId, alertaId, agora, proximo],
  );
  return alertaId;
}

export async function obterAlertaCronograma(projetoId: number): Promise<AlertaCronograma | null> {
  const pool = obterPool();
  const { rows } = await pool.query<AlertaCronograma>("SELECT * FROM pmo_alertas_cronograma WHERE projeto_id = $1", [projetoId]);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Alertas do projeto (infraestrutura compartilhada com o GAT)
// ---------------------------------------------------------------------------

/** Alertas configurados livremente pelo gerente do projeto (marcos,
 * vencimentos etc.), além do alerta automático de cronograma pendente —
 * mesma infraestrutura (`alertas_manuais`, origem `modulo = 'pmo'`) usada
 * pelo GAT. Mesma regra de gat/pmo_database.py::criar_alerta_pmo. */
export async function criarAlertaPmo(
  projetoId: number, titulo: string, descricao: string, usuario: string,
  prioridade = "Média", vencimento: string | null = null,
): Promise<number> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO alertas_manuais (modulo, projeto_id, titulo, descricao, prioridade, vencimento, status, criado_por, criado_em) " +
      "VALUES ($1,$2,$3,$4,$5,$6,'ABERTO',$7,$8) RETURNING id",
    [MODULO_ALERTA_PMO, projetoId, titulo, descricao, prioridade, vencimento, usuario, agora],
  );
  const alertaId = rows[0].id;
  await registrarHistorico("alertas_manuais", alertaId, {}, { status: "ABERTO", titulo }, usuario);
  return alertaId;
}

export async function listarAlertasProjeto(projetoId: number): Promise<AlertaPmo[]> {
  const pool = obterPool();
  const { rows } = await pool.query<AlertaPmo>(
    "SELECT id, modulo, projeto_id, titulo, descricao, prioridade, vencimento, status, criado_por, criado_em " +
      "FROM alertas_manuais WHERE modulo = $1 AND projeto_id = $2 AND arquivado_em IS NULL ORDER BY criado_em DESC",
    [MODULO_ALERTA_PMO, projetoId],
  );
  return rows;
}

export async function listarAlertasPmo(): Promise<AlertaPmo[]> {
  const pool = obterPool();
  const { rows } = await pool.query<AlertaPmo>(
    "SELECT id, modulo, projeto_id, titulo, descricao, prioridade, vencimento, status, criado_por, criado_em " +
      "FROM alertas_manuais WHERE modulo = $1 AND arquivado_em IS NULL ORDER BY criado_em DESC",
    [MODULO_ALERTA_PMO],
  );
  return rows;
}

/** Verifica todos os alertas de cronograma pendente ainda ativos e, para
 * os que já atingiram a data do próximo lembrete (padrão: 3 dias úteis
 * desde o último), registra um novo lembrete e agenda o seguinte. Chamada
 * a cada carregamento do Portfólio — o sistema não tem um agendador em
 * segundo plano. Mesma regra de
 * gat/pmo_database.py::verificar_e_gerar_lembretes_cronograma. */
export async function verificarEGerarLembretesCronograma(): Promise<number> {
  const pool = obterPool();
  const hoje = new Date().toISOString().slice(0, 10);
  const { rows: pendentes } = await pool.query<AlertaCronograma>(
    "SELECT * FROM pmo_alertas_cronograma WHERE status = 'ATIVO' AND proximo_lembrete_em <= $1",
    [hoje],
  );
  let gerados = 0;
  for (const linha of pendentes) {
    const agora = new Date().toISOString();
    const proximo = proximoLembreteCronograma(new Date()).toISOString().slice(0, 10);
    await pool.query(
      "INSERT INTO pmo_cronograma_lembretes (projeto_id, enviado_em, mensagem) VALUES ($1,$2,$3)",
      [linha.projeto_id, agora, MENSAGEM_LEMBRETE_CRONOGRAMA],
    );
    await pool.query(
      "UPDATE pmo_alertas_cronograma SET qtd_lembretes = qtd_lembretes + 1, ultimo_lembrete_em = $1, proximo_lembrete_em = $2 WHERE id = $3",
      [agora, proximo, linha.id],
    );
    gerados += 1;
  }
  return gerados;
}
