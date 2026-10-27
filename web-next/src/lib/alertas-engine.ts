import { obterPool } from "@/lib/db";
import { calcularHoldDias, diasUteisDecorridos, diasUteisEntre, emHold, hojeBr, saldoDiasUteis } from "@/lib/dias-uteis";
import {
  TIPO_ALERTA_LABELS,
  TIPO_ATRASO_REENVIO,
  chaveAvaliacao,
  determinarAlertasLinha,
  statusRadarAtivo,
  type LinhaAlertaBase,
  type Origem,
  type StatusRadar,
  type TipoAlerta,
} from "@/lib/alertas-engine-calculo";
import { calcularIntervalosRevisao } from "@/lib/revisoes-calculo";
import { buscarLinhasRevisao } from "@/lib/revisoes";

const STATUS_CANCELADO = "CANCELADO";
const SLA_PRESTADORES_DIAS_UTEIS = 10;
const SLA_CESSIONARIOS_NOVO = 10;
const SLA_CESSIONARIOS_REVISAO = 5;

export type AlertaItem = {
  chaveRadar: string;
  modulo: Origem;
  projetoId: number;
  nome: string | null;
  codigo: string | null;
  disciplina: string | null;
  numAt: string | null;
  revisao: number | null;
  responsavel: string | null;
  item: number | null;
  tipoAlerta: TipoAlerta;
  motivoLabel: string;
  detalhe: string | null;
  status: StatusRadar;
  justificativa: string | null;
  providencia: string | null;
  responsavelTratamento: string | null;
  dataTratamento: string | null;
  observacao: string | null;
  adiadoPara: string | null;
};

type LinhaBanco = {
  id: number;
  item: number | null;
  codigo: string | null;
  nome_entidade: string | null;
  disciplina: string | null;
  num_at: string | null;
  revisao: number | null;
  responsavel: string | null;
  status_analise: string | null;
  data_solicitacao: string | null;
  data_analise: string | null;
  hold_inicio: string | null;
  hold_fim: string | null;
  sla_dias: number | null;
  sla_reduzido: number | null;
  nivel_prioridade: number | null;
  tipo: string | null;
};

function calcularSlaCessionario(tipo: string | null, revisao: number): number {
  if (tipo === "Quiosque") return SLA_CESSIONARIOS_REVISAO;
  if (revisao === 0 && (tipo === "Loja" || tipo === "Externo")) return SLA_CESSIONARIOS_NOVO;
  return SLA_CESSIONARIOS_REVISAO;
}

async function buscarLinhasModulo(pool: ReturnType<typeof obterPool>, modulo: Origem): Promise<LinhaAlertaBase[]> {
  const tabela = modulo;
  const colunaNome = modulo === "prestadores" ? "prestador" : "cessionario";
  const { rows } = await pool.query<LinhaBanco>(
    `SELECT id, item, codigo, ${colunaNome} AS nome_entidade, disciplina, num_at, revisao, responsavel, status_analise,
            data_solicitacao, data_analise, hold_inicio, hold_fim, sla_dias, sla_reduzido, nivel_prioridade,
            ${modulo === "cessionarios" ? "tipo" : "NULL AS tipo"}
     FROM ${tabela} WHERE status_analise != $1 AND arquivado_em IS NULL`,
    [STATUS_CANCELADO],
  );

  const hojeIso = hojeBr().toISOString().slice(0, 10);
  return rows.map((row) => {
    const holdDias = calcularHoldDias(row.hold_inicio, row.hold_fim);
    const estaEmHold = emHold(row.hold_inicio, row.hold_fim);
    const holdAbertoDesde = estaEmHold ? row.hold_inicio : null;

    let statusEntregaCalc: LinhaAlertaBase["statusEntregaCalc"] = null;
    let diasRestantes: number | null = null;
    if (row.data_solicitacao) {
      if (modulo === "prestadores") {
        const sla = row.sla_dias ?? SLA_PRESTADORES_DIAS_UTEIS;
        const decorridos = diasUteisDecorridos(row.data_solicitacao, row.data_analise, holdDias, holdAbertoDesde);
        statusEntregaCalc = decorridos < sla ? "ANTES DO PRAZO" : decorridos === sla ? "NO PRAZO" : "ATRASADO";
        diasRestantes = sla - decorridos;
      } else {
        const sla = row.sla_dias ?? calcularSlaCessionario(row.tipo, row.revisao ?? 0);
        const saldo = saldoDiasUteis(row.data_solicitacao, sla, row.data_analise, holdDias, holdAbertoDesde);
        statusEntregaCalc = saldo > 0 ? "ANTES DO PRAZO" : saldo === 0 ? "NO PRAZO" : "ATRASADO";
        diasRestantes = saldo;
      }
      if (estaEmHold && statusEntregaCalc === "ATRASADO") statusEntregaCalc = "NO PRAZO";
    }

    const diasHoldAbertos = estaEmHold ? Math.max(diasUteisEntre(row.hold_inicio, hojeIso), 0) : 0;

    return {
      id: row.id,
      nome: row.nome_entidade,
      codigo: row.codigo,
      disciplina: row.disciplina,
      numAt: row.num_at,
      revisao: row.revisao,
      responsavel: row.responsavel,
      item: row.item,
      statusAnalise: (row.status_analise || "").trim().toUpperCase(),
      dataAnalise: row.data_analise,
      statusEntregaCalc,
      emHold: estaEmHold,
      diasRestantes,
      slaReduzido: !!row.sla_reduzido,
      nivelPrioridade: row.nivel_prioridade,
      slaDias: row.sla_dias,
      diasHoldAbertos,
    };
  });
}

async function buscarCriticosEAvaliados(pool: ReturnType<typeof obterPool>, tipoEntidade: "PRESTADOR" | "CESSIONARIO") {
  const { rows } = await pool.query<{ codigo_entidade: string | null; nome_entidade: string; disciplina: string | null; classificacao: string; data_avaliacao: string }>(
    `SELECT codigo_entidade, nome_entidade, disciplina, classificacao, data_avaliacao FROM avaliacoes_checklist WHERE tipo_entidade = $1`,
    [tipoEntidade],
  );

  const avaliados = new Set<string>();
  const ultimaPorChave = new Map<string, { classificacao: string; data: string }>();
  for (const r of rows) {
    const chave = chaveAvaliacao(r.codigo_entidade, r.nome_entidade, r.disciplina);
    avaliados.add(chave);
    const atual = ultimaPorChave.get(chave);
    if (!atual || r.data_avaliacao > atual.data) {
      ultimaPorChave.set(chave, { classificacao: r.classificacao, data: r.data_avaliacao });
    }
  }
  const criticos = new Set<string>();
  for (const [chave, v] of ultimaPorChave) {
    if (v.classificacao === "CRÍTICO" || v.classificacao === "BAIXO") criticos.add(chave);
  }
  return { criticos, avaliados };
}

async function buscarIsentos(pool: ReturnType<typeof obterPool>, modulo: Origem): Promise<Set<number>> {
  const { rows } = await pool.query<{ projeto_id: number }>(
    `SELECT projeto_id FROM avaliacao_obrigatoria_isentos WHERE modulo = $1`,
    [modulo],
  );
  return new Set(rows.map((r) => r.projeto_id));
}

type LinhaRadar = {
  modulo: string;
  projeto_id: number;
  tipo_alerta: string;
  status: string;
  justificativa: string | null;
  providencia: string | null;
  responsavel_tratamento: string | null;
  data_tratamento: string | null;
  observacao: string | null;
  adiado_para: string | null;
};

async function buscarRadar(pool: ReturnType<typeof obterPool>): Promise<Map<string, LinhaRadar>> {
  const { rows } = await pool.query<LinhaRadar>(`SELECT * FROM alertas_radar`);
  const mapa = new Map<string, LinhaRadar>();
  for (const r of rows) mapa.set(`${r.modulo}:${r.projeto_id}:${r.tipo_alerta}`, r);
  return mapa;
}

function montarAlertaItem(
  modulo: Origem,
  projetoId: number,
  campos: Omit<AlertaItem, "chaveRadar" | "modulo" | "projetoId" | "status" | "justificativa" | "providencia" | "responsavelTratamento" | "dataTratamento" | "observacao" | "adiadoPara">,
  radar: Map<string, LinhaRadar>,
): AlertaItem {
  const chaveRadar = `${modulo}:${projetoId}:${campos.tipoAlerta}`;
  const radarLinha = radar.get(chaveRadar);
  return {
    chaveRadar,
    modulo,
    projetoId,
    ...campos,
    status: (radarLinha?.status as StatusRadar) || "PENDENTE",
    justificativa: radarLinha?.justificativa ?? null,
    providencia: radarLinha?.providencia ?? null,
    responsavelTratamento: radarLinha?.responsavel_tratamento ?? null,
    dataTratamento: radarLinha?.data_tratamento ?? null,
    observacao: radarLinha?.observacao ?? null,
    adiadoPara: radarLinha?.adiado_para ?? null,
  };
}

/** Monta os alertas de um módulo (Prestadores ou Cessionários) — reúne os
 * 8 critérios do motor consolidado, já com o status atual do ciclo de
 * vida (alertas_radar). Mesma regra de
 * gat/alertas_engine.py::montar_alertas_modulo. ATRASO_REENVIO é por
 * INTERVALO entre revisões (gat/revisoes.py::alertas_atraso_reenvio),
 * não por linha — montado à parte dos demais 7 critérios. */
export async function buscarAlertasModulo(modulo: Origem): Promise<AlertaItem[]> {
  const pool = obterPool();
  const tipoEntidade = modulo === "prestadores" ? "PRESTADOR" : "CESSIONARIO";
  const [linhas, { criticos, avaliados }, isentos, radar, linhasRevisao] = await Promise.all([
    buscarLinhasModulo(pool, modulo),
    buscarCriticosEAvaliados(pool, tipoEntidade),
    buscarIsentos(pool, modulo),
    buscarRadar(pool),
    buscarLinhasRevisao(modulo),
  ]);

  const alertas: AlertaItem[] = [];
  for (const linha of linhas) {
    const gerados = determinarAlertasLinha(linha, modulo, criticos, avaliados, isentos);
    for (const g of gerados) {
      alertas.push(montarAlertaItem(modulo, linha.id, {
        nome: linha.nome,
        codigo: linha.codigo,
        disciplina: linha.disciplina,
        numAt: linha.numAt,
        revisao: linha.revisao,
        responsavel: linha.responsavel,
        item: linha.item,
        tipoAlerta: g.tipoAlerta,
        motivoLabel: TIPO_ALERTA_LABELS[g.tipoAlerta],
        detalhe: g.detalhe,
      }, radar));
    }
  }

  const intervalos = calcularIntervalosRevisao(linhasRevisao);
  for (const intervalo of intervalos) {
    if (intervalo.situacaoSla !== "FORA DO SLA" || intervalo.diasUteisRetorno == null) continue;
    alertas.push(montarAlertaItem(modulo, intervalo.id, {
      nome: intervalo.nome,
      codigo: intervalo.codigo,
      disciplina: intervalo.disciplina,
      numAt: intervalo.numAt,
      revisao: intervalo.revisaoAtual,
      responsavel: intervalo.responsavel,
      item: intervalo.item,
      tipoAlerta: TIPO_ATRASO_REENVIO,
      motivoLabel: TIPO_ALERTA_LABELS[TIPO_ATRASO_REENVIO],
      detalhe: `REV${String(intervalo.revisaoAnterior).padStart(2, "0")}→REV${String(intervalo.revisaoAtual).padStart(2, "0")}: ${intervalo.diasUteisRetorno} dias úteis sem retorno`,
    }, radar));
  }

  return alertas;
}

async function upsertAlerta(
  modulo: Origem,
  projetoId: number,
  tipoAlerta: TipoAlerta,
  campos: Record<string, string | null>,
  usuario: string,
): Promise<void> {
  const pool = obterPool();
  const agora = new Date().toISOString();
  const colunas = Object.keys(campos);
  const valores = Object.values(campos);
  const colunasTodas = [...colunas, "atualizado_em", "atualizado_por"];
  const valoresTodos = [...valores, agora, usuario];
  const placeholders = colunasTodas.map((_, i) => `$${i + 4}`);
  await pool.query(
    `INSERT INTO alertas_radar (modulo, projeto_id, tipo_alerta, ${colunasTodas.join(", ")})
     VALUES ($1, $2, $3, ${placeholders.join(", ")})
     ON CONFLICT (modulo, projeto_id, tipo_alerta) DO UPDATE SET
       ${colunasTodas.map((c) => `${c} = excluded.${c}`).join(", ")}`,
    [modulo, projetoId, tipoAlerta, ...valoresTodos],
  );
}

export async function iniciarTratamentoAlerta(modulo: Origem, projetoId: number, tipoAlerta: TipoAlerta, usuario: string): Promise<void> {
  await upsertAlerta(modulo, projetoId, tipoAlerta, { status: "EM_TRATAMENTO" }, usuario);
}

export async function marcarTratadoAlerta(
  modulo: Origem, projetoId: number, tipoAlerta: TipoAlerta,
  providencia: string, responsavel: string, observacao: string | null, usuario: string,
): Promise<void> {
  await upsertAlerta(
    modulo, projetoId, tipoAlerta,
    { status: "TRATADO", providencia, responsavel_tratamento: responsavel, data_tratamento: new Date().toISOString(), observacao },
    usuario,
  );
}

export async function adiarAlerta(
  modulo: Origem, projetoId: number, tipoAlerta: TipoAlerta, adiadoPara: string | null, observacao: string | null, usuario: string,
): Promise<void> {
  await upsertAlerta(modulo, projetoId, tipoAlerta, { status: "ADIADO", adiado_para: adiadoPara, observacao }, usuario);
}

export async function retirarDoRadar(modulo: Origem, projetoId: number, tipoAlerta: TipoAlerta, justificativa: string, usuario: string): Promise<void> {
  await upsertAlerta(modulo, projetoId, tipoAlerta, { status: "RETIRADO", justificativa }, usuario);
}

export async function reabrirAlerta(modulo: Origem, projetoId: number, tipoAlerta: TipoAlerta, usuario: string): Promise<void> {
  await upsertAlerta(modulo, projetoId, tipoAlerta, { status: "REABERTO" }, usuario);
}

export { statusRadarAtivo };
