import { obterPool } from "@/lib/db";
import {
  KPI_ORDEM,
  KPI_PADRAO_HABILITADO,
  MENSAGEM_LEMBRETE_CRONOGRAMA,
  TITULO_ALERTA_CRONOGRAMA,
  calcularPercentualExecucao,
  calcularSaudeProjeto,
  percentualPlanejadoAte,
  proximoLembreteCronograma,
  proximoMarco,
  type AlertaPmo,
  type AtividadeCronograma,
  type Comunicacao,
  type Entregavel,
  type Medicao,
  type ProjetoPmo,
  type ResumoFinanceiro,
  type Risco,
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

// ---------------------------------------------------------------------------
// Cronograma — leitura (upload/interpretação automática fica para um
// próximo incremento; aqui só a leitura, para alimentar Dashboard/Curva
// S/recálculo de saúde mesmo antes de o Cronograma existir)
// ---------------------------------------------------------------------------

export async function listarAtividadesCronograma(projetoId: number): Promise<AtividadeCronograma[]> {
  const pool = obterPool();
  const { rows: arquivos } = await pool.query<{ id: number }>(
    "SELECT id FROM pmo_cronograma_arquivos WHERE projeto_id = $1 AND ativo = true AND arquivado_em IS NULL",
    [projetoId],
  );
  if (!arquivos.length) return [];
  const { rows } = await pool.query<AtividadeCronograma>(
    "SELECT * FROM pmo_cronograma_atividades WHERE arquivo_id = $1 ORDER BY id",
    [arquivos[0].id],
  );
  return rows;
}

/** Recalcula saúde/%execução/próximo marco a partir do estado atual do
 * cronograma e dos riscos, e persiste — chamado a cada carregamento da
 * página do projeto. Mesma regra de
 * views/pmo_projeto.py::_recalcular_status. */
export async function recalcularStatus(projetoId: number): Promise<ProjetoPmo | null> {
  const atividades = await listarAtividadesCronograma(projetoId);
  const pctExecucao = calcularPercentualExecucao(atividades);
  const marco = proximoMarco(atividades);

  const riscos = await listarRiscos(projetoId);
  const riscosCriticosAbertos = riscos.filter((r) => r.probabilidade * r.impacto >= 15 && r.status === "ABERTO").length;

  const hoje = new Date();
  const atividadeCriticaAtrasada = atividades.some(
    (a) => a.caminho_critico === 1 && a.data_fim && new Date(a.data_fim) < hoje && (a.percentual_concluido ?? 0) < 100,
  );
  const percentualPlanejadoHoje = atividades.length ? percentualPlanejadoAte(atividades, hoje) : null;

  const alerta = await obterAlertaCronograma(projetoId);
  const alertaAtivo = alerta?.status === "ATIVO";

  const saude = calcularSaudeProjeto(pctExecucao, percentualPlanejadoHoje, atividadeCriticaAtrasada, riscosCriticosAbertos, alertaAtivo);

  const pool = obterPool();
  await pool.query(
    "UPDATE pmo_projetos SET saude = $1, percentual_execucao = $2, proximo_marco = $3, proximo_marco_data = $4 WHERE id = $5",
    [saude, pctExecucao, marco?.nome ?? null, marco?.dataFim ?? null, projetoId],
  );
  return obterProjeto(projetoId);
}

// ---------------------------------------------------------------------------
// Financeiro (derivado das Medições)
// ---------------------------------------------------------------------------

export async function resumoFinanceiro(projetoId: number): Promise<ResumoFinanceiro> {
  const [projeto, medicoes] = await Promise.all([obterProjeto(projetoId), listarMedicoes(projetoId)]);
  const contratado = Number(projeto?.valor_contratual ?? 0);
  const soma = (campo: keyof Medicao) => medicoes.reduce((s, m) => s + Number(m[campo] ?? 0), 0);
  const medido = soma("valor_medido");
  const aprovado = soma("valor_aprovado");
  const pago = soma("valor_pago");
  const glosado = soma("valor_glosado");
  return { valor_contratado: contratado, valor_medido: medido, valor_aprovado: aprovado, valor_pago: pago, valor_glosado: glosado, saldo: contratado - pago };
}

// ---------------------------------------------------------------------------
// Medições
// ---------------------------------------------------------------------------

export type DadosMedicao = {
  competencia_mes: number;
  competencia_ano: number;
  percentual: number | null;
  valor_medido: number | null;
  situacao: string;
  valor_aprovado: number | null;
  valor_pago: number | null;
  valor_glosado: number;
};

export async function inserirMedicao(projetoId: number, dados: DadosMedicao, usuario: string): Promise<number> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO pmo_medicoes (projeto_id, competencia_mes, competencia_ano, percentual, valor_medido, situacao, " +
      "valor_aprovado, valor_pago, valor_glosado, criado_por, criado_em) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
    [projetoId, dados.competencia_mes, dados.competencia_ano, dados.percentual, dados.valor_medido, dados.situacao, dados.valor_aprovado, dados.valor_pago, dados.valor_glosado, usuario, agora],
  );
  const medicaoId = rows[0].id;
  await registrarHistorico("pmo_medicoes", medicaoId, {}, { ...dados }, usuario);
  return medicaoId;
}

export async function listarMedicoes(projetoId: number): Promise<Medicao[]> {
  const pool = obterPool();
  const { rows } = await pool.query<Medicao>(
    "SELECT * FROM pmo_medicoes WHERE projeto_id = $1 ORDER BY competencia_ano DESC, competencia_mes DESC",
    [projetoId],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Entregáveis
// ---------------------------------------------------------------------------

export type DadosEntregavel = {
  nome: string;
  previsto: number;
  entregue: number;
  data_prevista: string | null;
  data_entrega: string | null;
  percentual_documental: number;
  observacoes: string | null;
};

export async function inserirEntregavel(projetoId: number, dados: DadosEntregavel, usuario: string): Promise<number> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO pmo_entregaveis (projeto_id, nome, previsto, entregue, data_prevista, data_entrega, percentual_documental, observacoes, criado_por, criado_em) " +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
    [projetoId, dados.nome, dados.previsto, dados.entregue, dados.data_prevista, dados.data_entrega, dados.percentual_documental, dados.observacoes, usuario, agora],
  );
  const entregavelId = rows[0].id;
  await registrarHistorico("pmo_entregaveis", entregavelId, {}, { ...dados }, usuario);
  return entregavelId;
}

export async function atualizarEntregavel(entregavelId: number, dados: DadosEntregavel, usuario: string): Promise<void> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const { rows: antigas } = await pool.query("SELECT * FROM pmo_entregaveis WHERE id = $1", [entregavelId]);
  await pool.query(
    "UPDATE pmo_entregaveis SET nome = $1, previsto = $2, entregue = $3, data_prevista = $4, data_entrega = $5, " +
      "percentual_documental = $6, observacoes = $7, atualizado_em = $8, atualizado_por = $9 WHERE id = $10",
    [dados.nome, dados.previsto, dados.entregue, dados.data_prevista, dados.data_entrega, dados.percentual_documental, dados.observacoes, agora, usuario, entregavelId],
  );
  await registrarHistorico("pmo_entregaveis", entregavelId, antigas[0] ?? {}, { ...dados }, usuario);
}

export async function listarEntregaveis(projetoId: number): Promise<Entregavel[]> {
  const pool = obterPool();
  const { rows } = await pool.query<Entregavel>("SELECT * FROM pmo_entregaveis WHERE projeto_id = $1 ORDER BY id", [projetoId]);
  return rows;
}

// ---------------------------------------------------------------------------
// Riscos
// ---------------------------------------------------------------------------

export type DadosRisco = {
  descricao: string;
  probabilidade: number;
  impacto: number;
  status: string;
  responsavel: string | null;
  plano_mitigacao: string | null;
};

export async function inserirRisco(projetoId: number, dados: DadosRisco, usuario: string): Promise<number> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO pmo_riscos (projeto_id, descricao, probabilidade, impacto, status, responsavel, plano_mitigacao, criado_por, criado_em) " +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
    [projetoId, dados.descricao, dados.probabilidade, dados.impacto, dados.status, dados.responsavel, dados.plano_mitigacao, usuario, agora],
  );
  const riscoId = rows[0].id;
  await registrarHistorico("pmo_riscos", riscoId, {}, { ...dados }, usuario);
  return riscoId;
}

export async function listarRiscos(projetoId: number): Promise<Risco[]> {
  const pool = obterPool();
  const { rows } = await pool.query<Risco>("SELECT * FROM pmo_riscos WHERE projeto_id = $1 ORDER BY id", [projetoId]);
  return rows;
}

// ---------------------------------------------------------------------------
// Comunicações
// ---------------------------------------------------------------------------

export type DadosComunicacao = { data: string; tipo: string; descricao: string; responsavel: string | null };

export async function inserirComunicacao(projetoId: number, dados: DadosComunicacao, usuario: string): Promise<number> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO pmo_comunicacoes (projeto_id, data, tipo, descricao, responsavel, criado_por, criado_em) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [projetoId, dados.data, dados.tipo, dados.descricao, dados.responsavel, usuario, agora],
  );
  const comunicacaoId = rows[0].id;
  await registrarHistorico("pmo_comunicacoes", comunicacaoId, {}, { ...dados }, usuario);
  return comunicacaoId;
}

export async function listarComunicacoes(projetoId: number): Promise<Comunicacao[]> {
  const pool = obterPool();
  const { rows } = await pool.query<Comunicacao>("SELECT * FROM pmo_comunicacoes WHERE projeto_id = $1 ORDER BY data DESC", [projetoId]);
  return rows;
}
