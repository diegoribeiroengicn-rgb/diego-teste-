import { obterPool } from "@/lib/db";
import { calcularHoldDias, diasUteisDecorridos, emHold, saldoDiasUteis } from "@/lib/dias-uteis";
import {
  listaDestinatarios,
  ordenarAlertasPrazo,
  prioridadePrazo,
  situacaoPrazoAlertavel,
  type AlertaManual,
  type AlertaPrazo,
  type Origem,
} from "@/lib/meus-alertas-calculo";

const SLA_PRESTADORES_DIAS_UTEIS = 10;
const SLA_CESSIONARIOS_NOVO = 10;
const SLA_CESSIONARIOS_REVISAO = 5;
const STATUS_EM_ANALISE = "EM ANÁLISE";

type LinhaProjeto = {
  id: number;
  codigo: string | null;
  nome_entidade: string | null;
  disciplina: string | null;
  num_at: string | null;
  responsavel: string | null;
  status_analise: string | null;
  data_solicitacao: string | null;
  data_limite: string | null;
  data_analise: string | null;
  hold_inicio: string | null;
  hold_fim: string | null;
  sla_dias: number | null;
  revisao: number | null;
  tipo: string | null;
};

function calcularSlaCessionario(tipo: string | null, revisao: number): number {
  if (tipo === "Quiosque") return SLA_CESSIONARIOS_REVISAO;
  if (revisao === 0 && (tipo === "Loja" || tipo === "Externo")) return SLA_CESSIONARIOS_NOVO;
  return SLA_CESSIONARIOS_REVISAO;
}

function diasRestantesLinha(row: LinhaProjeto, origem: Origem): number {
  const holdDias = calcularHoldDias(row.hold_inicio, row.hold_fim);
  const holdAbertoDesde = emHold(row.hold_inicio, row.hold_fim) ? row.hold_inicio : null;
  if (origem === "prestadores") {
    const sla = row.sla_dias ?? SLA_PRESTADORES_DIAS_UTEIS;
    const decorridos = diasUteisDecorridos(row.data_solicitacao, row.data_analise, holdDias, holdAbertoDesde);
    return sla - decorridos;
  }
  const sla = row.sla_dias ?? calcularSlaCessionario(row.tipo, row.revisao ?? 0);
  return saldoDiasUteis(row.data_solicitacao, sla, row.data_analise, holdDias, holdAbertoDesde);
}

/** Análises "EM ANÁLISE" do analista vinculado ao usuário, com prazo
 * vencido/vence hoje/vence em breve — mesma regra de
 * gat/alertas_pessoais.py::montar_alertas_prazo_pessoais. HOLD fica de
 * fora (SLA pausado, nada a notificar agora). */
export async function buscarAlertasPrazoPessoais(analistaVinculado: string | null): Promise<AlertaPrazo[]> {
  if (!analistaVinculado) return [];
  const pool = obterPool();
  const alvo = analistaVinculado.trim().toUpperCase();

  const [prestadores, cessionarios] = await Promise.all([
    pool.query<LinhaProjeto>(
      `SELECT id, codigo, prestador AS nome_entidade, disciplina, num_at, responsavel, status_analise,
              data_solicitacao, data_limite, data_analise, hold_inicio, hold_fim, sla_dias, revisao, NULL AS tipo
       FROM prestadores WHERE UPPER(TRIM(responsavel)) = $1 AND status_analise = $2`,
      [alvo, STATUS_EM_ANALISE],
    ),
    pool.query<LinhaProjeto>(
      `SELECT id, codigo, cessionario AS nome_entidade, disciplina, num_at, responsavel, status_analise,
              data_solicitacao, data_limite, data_analise, hold_inicio, hold_fim, sla_dias, revisao, tipo
       FROM cessionarios WHERE UPPER(TRIM(responsavel)) = $1 AND status_analise = $2`,
      [alvo, STATUS_EM_ANALISE],
    ),
  ]);

  const alertas: AlertaPrazo[] = [];
  for (const [origem, rows] of [["prestadores", prestadores.rows], ["cessionarios", cessionarios.rows]] as const) {
    for (const row of rows) {
      if (!row.data_solicitacao) continue;
      const diasRestantes = diasRestantesLinha(row, origem);
      const situacao = situacaoPrazoAlertavel(diasRestantes);
      if (!situacao) continue;
      alertas.push({
        chave: `${origem}:${row.id}:${row.data_limite ?? ""}`,
        origem,
        projetoId: row.id,
        codigo: row.codigo,
        nomeEntidade: row.nome_entidade,
        disciplina: row.disciplina,
        numAt: row.num_at,
        dataLimite: row.data_limite,
        situacaoPrazo: situacao,
        diasRestantes,
        prioridade: prioridadePrazo(diasRestantes),
      });
    }
  }
  return ordenarAlertasPrazo(alertas);
}

type LinhaAlertaManual = {
  id: number;
  modulo: string;
  titulo: string;
  descricao: string | null;
  observacoes: string | null;
  num_at: string | null;
  codigo_projeto: string | null;
  nome_entidade: string | null;
  prioridade: string | null;
  destinatarios: string | null;
  criado_por: string;
  criado_em: string;
  atualizado_por: string | null;
  atualizado_em: string | null;
};

/** Alertas manuais ABERTOS (e não arquivados) endereçados a `username`
 * via alertas_manuais.destinatarios — mesma regra de
 * gat/alertas_pessoais.py::montar_alertas_manuais_pessoais. */
export async function buscarAlertasManuaisPessoais(username: string): Promise<AlertaManual[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaAlertaManual>(
    `SELECT id, modulo, titulo, descricao, observacoes, num_at, codigo_projeto, nome_entidade,
            prioridade, destinatarios, criado_por, criado_em, atualizado_por, atualizado_em
     FROM alertas_manuais WHERE status = 'ABERTO' AND arquivado_em IS NULL
     ORDER BY criado_em DESC`,
  );

  const direcionados: AlertaManual[] = [];
  for (const row of rows) {
    if (!listaDestinatarios(row.destinatarios).includes(username)) continue;
    direcionados.push({
      chave: `${row.id}:${row.atualizado_em ?? row.criado_em}`,
      id: row.id,
      origem: row.modulo === "cessionarios" ? "cessionarios" : "prestadores",
      titulo: row.titulo,
      descricao: row.descricao,
      observacoes: row.observacoes,
      numAt: row.num_at,
      codigoProjeto: row.codigo_projeto,
      nomeEntidade: row.nome_entidade,
      prioridade: row.prioridade,
      criadoPor: row.criado_por,
      criadoEm: row.criado_em,
      atualizadoPor: row.atualizado_por,
      atualizadoEm: row.atualizado_em,
    });
  }
  return direcionados;
}

/** Conjunto de "tipo:chave" já vistos pelo usuário — usado para filtrar o
 * que ainda precisa aparecer em Meus Alertas. */
export async function buscarAlertasPessoaisVistos(username: string): Promise<Set<string>> {
  const pool = obterPool();
  const { rows } = await pool.query<{ tipo: string; chave: string }>(
    `SELECT tipo, chave FROM alertas_pessoais_vistos WHERE usuario = $1`,
    [username],
  );
  return new Set(rows.map((r) => `${r.tipo}:${r.chave}`));
}

export async function marcarAlertaPessoalVisto(usuario: string, tipo: "PRAZO" | "MANUAL", chave: string): Promise<void> {
  const pool = obterPool();
  await pool.query(
    `INSERT INTO alertas_pessoais_vistos (usuario, tipo, chave, visto_em) VALUES ($1, $2, $3, NOW()::text)
     ON CONFLICT (usuario, tipo, chave) DO UPDATE SET visto_em = excluded.visto_em`,
    [usuario, tipo, chave],
  );
}

export type AlertasPessoais = {
  prazoPendente: AlertaPrazo[];
  manuaisPendente: AlertaManual[];
};

/** Ponto único para Meus Alertas — prazo + manuais, já filtrados pelos já
 * vistos. Mesma regra de gat/alertas_pessoais.py::carregar_alertas_pessoais. */
export async function buscarAlertasPessoais(username: string, analistaVinculado: string | null): Promise<AlertasPessoais> {
  const [prazo, manuais, vistos] = await Promise.all([
    buscarAlertasPrazoPessoais(analistaVinculado),
    buscarAlertasManuaisPessoais(username),
    buscarAlertasPessoaisVistos(username),
  ]);
  return {
    prazoPendente: prazo.filter((a) => !vistos.has(`PRAZO:${a.chave}`)),
    manuaisPendente: manuais.filter((a) => !vistos.has(`MANUAL:${a.chave}`)),
  };
}
