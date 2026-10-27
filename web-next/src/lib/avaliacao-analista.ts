import { obterPool } from "@/lib/db";
import { paraData } from "@/lib/dias-uteis";
import { buscarLinhasProdutividade } from "@/lib/relatorios-mensais";
import { calcularProdutividadeAnalistas } from "@/lib/produtividade";
import {
  CHAVES_CRITERIOS,
  PENALIDADE_ETG,
  calcularNotaFinal,
  mediaBruta,
  type CriteriosValores,
  type ResumoObrigatorias,
} from "@/lib/avaliacao-analista-calculo";

const MARCO_AVALIACOES_OFICIAL = "2026-07-01";

function fimDoMesUTC(mes: number, ano: number): number {
  return Date.UTC(ano, mes, 0, 23, 59, 59);
}

/** Analistas (Responsável) com ao menos um projeto de Prestador ou
 * Cessionário marcado com ETG=SIM na competência (Data de Solicitação)
 * informada — usado para aplicar a penalidade automática na avaliação.
 * Mesma regra de views/avaliacao_analistas.py::_analistas_com_etg_no_periodo. */
async function analistasComEtgNoPeriodo(pool: ReturnType<typeof obterPool>, mes: number, ano: number): Promise<Set<string>> {
  const resultado = new Set<string>();
  for (const tabela of ["prestadores", "cessionarios"] as const) {
    const { rows } = await pool.query<{ responsavel: string | null; data_solicitacao: string | null }>(
      `SELECT responsavel, data_solicitacao FROM ${tabela} WHERE etg = 'SIM' AND arquivado_em IS NULL`,
    );
    for (const r of rows) {
      if (!r.responsavel) continue;
      const d = paraData(r.data_solicitacao);
      if (!d || d.getUTCMonth() + 1 !== mes || d.getUTCFullYear() !== ano) continue;
      resultado.add(r.responsavel);
    }
  }
  return resultado;
}

type LinhaCandidato = {
  id: number;
  codigo: string | null;
  nome: string | null;
  disciplina: string | null;
  revisao: number | null;
  data_analise: string | null;
  num_at: string | null;
  item: number | null;
};

/** Para um analista e uma competência (mês/ano), quantas avaliações
 * obrigatórias (Prestador + Cessionário) tinham a Rev. válida concluída
 * até o fim dessa competência, e quantas permaneciam pendentes (sem
 * avaliação de checklist registrada até essa data) — usado na
 * penalização/bonificação da nota do analista. Mesma regra de
 * gat/relatorios_mensais.py::avaliacoes_obrigatorias_do_mes. */
export async function avaliacoesObrigatoriasDoMes(
  pool: ReturnType<typeof obterPool>,
  analista: string,
  mes: number,
  ano: number,
): Promise<ResumoObrigatorias> {
  const fimMes = fimDoMesUTC(mes, ano);
  const marco = paraData(MARCO_AVALIACOES_OFICIAL)!.getTime();
  let obrigatorias = 0;
  let pendentes = 0;
  const atPendentes: string[] = [];

  for (const cfg of [
    { tabela: "prestadores", coluna: "prestador", tipoEntidade: "PRESTADOR" as const, modulo: "prestadores" as const },
    { tabela: "cessionarios", coluna: "cessionario", tipoEntidade: "CESSIONARIO" as const, modulo: "cessionarios" as const },
  ]) {
    const { rows: linhas } = await pool.query<LinhaCandidato>(
      `SELECT id, codigo, ${cfg.coluna} AS nome, disciplina, revisao, data_analise, num_at, item
       FROM ${cfg.tabela} WHERE responsavel = $1 AND status_analise != 'CANCELADO' AND arquivado_em IS NULL`,
      [analista],
    );

    const candidatos = linhas.filter((l) => {
      if ((l.revisao ?? 0) < 1) return false;
      const d = paraData(l.data_analise);
      return !!d && d.getTime() <= fimMes && d.getTime() >= marco;
    });
    if (!candidatos.length) continue;

    const { rows: isentosRows } = await pool.query<{ projeto_id: number }>(
      `SELECT projeto_id FROM avaliacao_obrigatoria_isentos WHERE modulo = $1`,
      [cfg.modulo],
    );
    const isentos = new Set(isentosRows.map((r) => r.projeto_id));

    const { rows: avaliadasRows } = await pool.query<{
      codigo_entidade: string | null;
      nome_entidade: string | null;
      disciplina: string | null;
      data_avaliacao: string | null;
    }>(`SELECT codigo_entidade, nome_entidade, disciplina, data_avaliacao FROM avaliacoes_checklist WHERE tipo_entidade = $1`, [cfg.tipoEntidade]);
    const avaliadasAteFimMes = new Set(
      avaliadasRows
        .filter((r) => {
          const d = paraData(r.data_avaliacao);
          return !!d && d.getTime() <= fimMes;
        })
        .map((r) => `${r.codigo_entidade || r.nome_entidade || ""}||${r.disciplina || ""}`),
    );

    for (const c of candidatos) {
      if (isentos.has(c.id)) continue;
      obrigatorias += 1;
      const chave = `${c.codigo || c.nome || ""}||${c.disciplina || ""}`;
      if (!avaliadasAteFimMes.has(chave)) {
        pendentes += 1;
        atPendentes.push(c.num_at || `Item ${c.item}`);
      }
    }
  }

  return { obrigatorias, pendentes, atPendentes };
}

const COLUNAS_CRITERIOS = CHAVES_CRITERIOS;

export type DadosAvaliacaoAnalista = {
  analista: string;
  avaliador: string;
  mes: number;
  ano: number;
  criterios: CriteriosValores;
  justificativa: string;
  observacoes: string;
};

export async function inserirAvaliacaoAnalista(dados: DadosAvaliacaoAnalista, usuario: string): Promise<number> {
  const pool = obterPool();
  const colunas = ["analista", "avaliador", "mes", "ano", ...COLUNAS_CRITERIOS, "justificativa", "observacoes", "criado_em", "criado_por"];
  const valores = [
    dados.analista, dados.avaliador, dados.mes, dados.ano,
    ...COLUNAS_CRITERIOS.map((c) => dados.criterios[c] ?? null),
    dados.justificativa, dados.observacoes, new Date().toISOString(), usuario,
  ];
  const placeholders = valores.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO avaliacoes_analistas (${colunas.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    valores,
  );
  return rows[0].id;
}

export async function atualizarAvaliacaoAnalista(id: number, dados: DadosAvaliacaoAnalista): Promise<void> {
  const pool = obterPool();
  const colunas = ["analista", "avaliador", "mes", "ano", ...COLUNAS_CRITERIOS, "justificativa", "observacoes"];
  const valores = [
    dados.analista, dados.avaliador, dados.mes, dados.ano,
    ...COLUNAS_CRITERIOS.map((c) => dados.criterios[c] ?? null),
    dados.justificativa, dados.observacoes,
  ];
  const setClause = colunas.map((c, i) => `${c} = $${i + 1}`).join(", ");
  await pool.query(`UPDATE avaliacoes_analistas SET ${setClause} WHERE id = $${colunas.length + 1}`, [...valores, id]);
}

export type FechamentoAvaliacaoAnalista = {
  id: number;
  avaliacaoAnalistaId: number;
  analista: string;
  mes: number;
  ano: number;
  notaOriginal: number;
  avaliacoesObrigatorias: number;
  avaliacoesPendentes: number;
  atsPendentes: string | null;
  penalizacaoFracao: number;
  bonificacao: number;
  notaFinal: number;
  justificativaAutomatica: string;
  recomendacaoGerencial: string | null;
  dataFechamento: string;
  usuarioFechamento: string;
};

type LinhaFechamentoBanco = {
  id: number;
  avaliacao_analista_id: number;
  analista: string;
  mes: number;
  ano: number;
  nota_original: number;
  avaliacoes_obrigatorias: number;
  avaliacoes_pendentes: number;
  ats_pendentes: string | null;
  penalizacao_fracao: number;
  bonificacao: number;
  nota_final: number;
  justificativa_automatica: string;
  recomendacao_gerencial: string | null;
  data_fechamento: string;
  usuario_fechamento: string;
};

function mapFechamento(r: LinhaFechamentoBanco): FechamentoAvaliacaoAnalista {
  return {
    id: r.id, avaliacaoAnalistaId: r.avaliacao_analista_id, analista: r.analista, mes: r.mes, ano: r.ano,
    notaOriginal: Number(r.nota_original), avaliacoesObrigatorias: r.avaliacoes_obrigatorias, avaliacoesPendentes: r.avaliacoes_pendentes,
    atsPendentes: r.ats_pendentes, penalizacaoFracao: Number(r.penalizacao_fracao), bonificacao: Number(r.bonificacao),
    notaFinal: Number(r.nota_final), justificativaAutomatica: r.justificativa_automatica, recomendacaoGerencial: r.recomendacao_gerencial,
    dataFechamento: r.data_fechamento, usuarioFechamento: r.usuario_fechamento,
  };
}

export async function listarFechamentosAvaliacaoAnalista(): Promise<FechamentoAvaliacaoAnalista[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaFechamentoBanco>(`SELECT * FROM fechamentos_avaliacao_analista`);
  return rows.map(mapFechamento);
}

export type DadosFechamento = {
  avaliacaoAnalistaId: number;
  analista: string;
  mes: number;
  ano: number;
  notaOriginal: number;
  avaliacoesObrigatorias: number;
  avaliacoesPendentes: number;
  atsPendentes: string;
  penalizacaoFracao: number;
  bonificacao: number;
  notaFinal: number;
  justificativaAutomatica: string;
  recomendacaoGerencial: string | null;
};

/** Congela a nota final calculada para um analista/competência — a
 * partir daqui, essa nota não é mais recalculada automaticamente. Falha
 * se a competência já estiver fechada (UNIQUE(analista, mes, ano)); use
 * `recalcularFechamentoAvaliacaoAnalista`, restrito ao Administrador. */
export async function fecharAvaliacaoAnalista(dados: DadosFechamento, usuario: string): Promise<number> {
  const pool = obterPool();
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO fechamentos_avaliacao_analista (
       avaliacao_analista_id, analista, mes, ano, nota_original, avaliacoes_obrigatorias,
       avaliacoes_pendentes, ats_pendentes, penalizacao_fracao, bonificacao, nota_final,
       justificativa_automatica, recomendacao_gerencial, data_fechamento, usuario_fechamento
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [
      dados.avaliacaoAnalistaId, dados.analista, dados.mes, dados.ano, dados.notaOriginal,
      dados.avaliacoesObrigatorias, dados.avaliacoesPendentes, dados.atsPendentes,
      dados.penalizacaoFracao, dados.bonificacao, dados.notaFinal,
      dados.justificativaAutomatica, dados.recomendacaoGerencial, new Date().toISOString(), usuario,
    ],
  );
  return rows[0].id;
}

/** Sobrescreve um fechamento já existente — ação restrita ao
 * Administrador. Mesma regra de
 * gat/database.py::recalcular_fechamento_avaliacao_analista. */
export async function recalcularFechamentoAvaliacaoAnalista(
  analista: string,
  mes: number,
  ano: number,
  dados: DadosFechamento,
  usuarioAdmin: string,
): Promise<void> {
  const pool = obterPool();
  await pool.query(
    `UPDATE fechamentos_avaliacao_analista SET
       avaliacao_analista_id = $1, nota_original = $2, avaliacoes_obrigatorias = $3, avaliacoes_pendentes = $4,
       ats_pendentes = $5, penalizacao_fracao = $6, bonificacao = $7, nota_final = $8,
       justificativa_automatica = $9, recomendacao_gerencial = $10, data_fechamento = $11, usuario_fechamento = $12
     WHERE analista = $13 AND mes = $14 AND ano = $15`,
    [
      dados.avaliacaoAnalistaId, dados.notaOriginal, dados.avaliacoesObrigatorias, dados.avaliacoesPendentes,
      dados.atsPendentes, dados.penalizacaoFracao, dados.bonificacao, dados.notaFinal,
      dados.justificativaAutomatica, dados.recomendacaoGerencial, new Date().toISOString(), usuarioAdmin,
      analista, mes, ano,
    ],
  );
}

type LinhaAvaliacaoBanco = {
  id: number;
  analista: string;
  avaliador: string | null;
  mes: number;
  ano: number;
  justificativa: string | null;
  observacoes: string | null;
} & Record<string, number | string | null>;

export type AvaliacaoAnalistaEnriquecida = {
  id: number;
  analista: string;
  avaliador: string | null;
  mes: number;
  ano: number;
  criterios: CriteriosValores;
  justificativa: string | null;
  observacoes: string | null;
  mediaBruta: number;
  etgPenalizado: boolean;
  mediaGeral: number;
  avaliacoesObrigatorias: number;
  avaliacoesPendentes: number;
  avaliacoesAtPendentes: string;
  penalizacaoFracao: number;
  bonificacao: number;
  mediaFinal: number;
  reconhecimento: string | null;
  justificativaAutomatica: string;
  fechado: boolean;
  dataFechamento: string | null;
  usuarioFechamento: string | null;
};

/** Pipeline completo: nota-base -> penalidade de ETG -> avaliações
 * obrigatórias (penalização/bonificação) -> fechamento mensal (quando
 * existir, sobrepõe o cálculo ao valor persistido e congelado). Mesma
 * ordem de views/avaliacao_analistas.py::render (_aplicar_penalidade_etg
 * -> _aplicar_avaliacoes_obrigatorias -> _aplicar_fechamentos). */
export async function buscarAvaliacoesAnalistasEnriquecidas(): Promise<AvaliacaoAnalistaEnriquecida[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaAvaliacaoBanco>(`SELECT * FROM avaliacoes_analistas ORDER BY ano DESC, mes DESC`);
  if (!rows.length) return [];

  const competencias = new Set(rows.map((r) => `${r.mes}-${r.ano}`));
  const etgCache = new Map<string, Set<string>>();
  for (const chave of competencias) {
    const [mes, ano] = chave.split("-").map(Number);
    etgCache.set(chave, await analistasComEtgNoPeriodo(pool, mes, ano));
  }

  const fechamentos = await listarFechamentosAvaliacaoAnalista();
  const fechamentosMapa = new Map(fechamentos.map((f) => [`${f.analista}::${f.mes}::${f.ano}`, f]));

  const resultado: AvaliacaoAnalistaEnriquecida[] = [];
  for (const row of rows) {
    const criterios: CriteriosValores = {};
    for (const chave of CHAVES_CRITERIOS) criterios[chave] = typeof row[chave] === "number" ? (row[chave] as number) : null;

    const bruta = mediaBruta(criterios);
    const etgSet = etgCache.get(`${row.mes}-${row.ano}`) ?? new Set<string>();
    const etgPenalizado = etgSet.has(row.analista);
    const mediaGeral = etgPenalizado ? Math.round(bruta * PENALIDADE_ETG * 100) / 100 : bruta;

    const fechamento = fechamentosMapa.get(`${row.analista}::${row.mes}::${row.ano}`);

    let avaliacoesObrigatorias: number;
    let avaliacoesPendentes: number;
    let avaliacoesAtPendentes: string;
    let penalizacaoFracao: number;
    let bonificacao: number;
    let mediaFinal: number;
    let reconhecimento: string | null;
    let justificativaAutomatica: string;

    if (fechamento) {
      avaliacoesObrigatorias = fechamento.avaliacoesObrigatorias;
      avaliacoesPendentes = fechamento.avaliacoesPendentes;
      avaliacoesAtPendentes = fechamento.atsPendentes || "";
      penalizacaoFracao = fechamento.penalizacaoFracao;
      bonificacao = fechamento.bonificacao;
      mediaFinal = fechamento.notaFinal;
      justificativaAutomatica = fechamento.justificativaAutomatica;
      reconhecimento = fechamento.recomendacaoGerencial;
    } else {
      const resumo = await avaliacoesObrigatoriasDoMes(pool, row.analista, row.mes, row.ano);
      const calc = calcularNotaFinal(mediaGeral, resumo);
      avaliacoesObrigatorias = resumo.obrigatorias;
      avaliacoesPendentes = resumo.pendentes;
      avaliacoesAtPendentes = resumo.atPendentes.join(", ");
      penalizacaoFracao = calc.penalizacaoFracao;
      bonificacao = calc.bonificacao;
      mediaFinal = calc.notaFinal;
      justificativaAutomatica = calc.justificativaAutomatica;
      reconhecimento = calc.reconhecimento;
    }

    resultado.push({
      id: row.id, analista: row.analista, avaliador: row.avaliador, mes: row.mes, ano: row.ano,
      criterios, justificativa: row.justificativa, observacoes: row.observacoes,
      mediaBruta: bruta, etgPenalizado, mediaGeral,
      avaliacoesObrigatorias, avaliacoesPendentes, avaliacoesAtPendentes,
      penalizacaoFracao, bonificacao, mediaFinal, reconhecimento, justificativaAutomatica,
      fechado: !!fechamento,
      dataFechamento: fechamento?.dataFechamento ?? null,
      usuarioFechamento: fechamento?.usuarioFechamento ?? null,
    });
  }
  return resultado;
}

export type LinhaRelatorioGerencialAnalista = {
  analista: string;
  mes: number;
  ano: number;
  analisesRealizadas: number;
  avaliacoesObrigatorias: number;
  avaliacoesRealizadas: number;
  avaliacoesPendentes: number;
  atsPendentes: string;
  notaOriginal: number;
  penalizacaoFracao: number;
  bonificacao: number;
  notaFinal: number;
  situacao: string;
  justificativaAutomatica: string;
  recomendacaoGerencial: string | null;
};

/** Relatório gerencial por analista/competência: análises realizadas
 * (reaproveita produtividade.ts/relatorios-mensais.ts em vez de duplicar
 * a lógica de contagem), avaliações obrigatórias/realizadas/pendentes,
 * nota original, penalização, bonificação, nota final e recomendação.
 * Mesma regra de views/avaliacao_analistas.py::_renderizar_relatorio_gerencial. */
export async function buscarRelatorioGerencialAnalistas(
  linhasFiltradas: AvaliacaoAnalistaEnriquecida[],
): Promise<LinhaRelatorioGerencialAnalista[]> {
  const combinacoes = new Map<string, AvaliacaoAnalistaEnriquecida>();
  for (const l of linhasFiltradas) combinacoes.set(`${l.analista}::${l.mes}::${l.ano}`, l);

  const linhasProd = await buscarLinhasProdutividade(["prestadores", "cessionarios"]);

  return [...combinacoes.values()]
    .map((l) => {
      const prod = calcularProdutividadeAnalistas(linhasProd, l.mes, l.ano, { analista: l.analista });
      const analisesRealizadas = prod.reduce((s, p) => s + p.concluidos, 0);
      return {
        analista: l.analista, mes: l.mes, ano: l.ano,
        analisesRealizadas,
        avaliacoesObrigatorias: l.avaliacoesObrigatorias,
        avaliacoesRealizadas: l.avaliacoesObrigatorias - l.avaliacoesPendentes,
        avaliacoesPendentes: l.avaliacoesPendentes,
        atsPendentes: l.avaliacoesAtPendentes || "—",
        notaOriginal: l.mediaGeral,
        penalizacaoFracao: l.penalizacaoFracao,
        bonificacao: l.bonificacao,
        notaFinal: l.mediaFinal,
        situacao: l.fechado ? "Fechada" : "Prévia (não fechada)",
        justificativaAutomatica: l.justificativaAutomatica,
        recomendacaoGerencial: l.reconhecimento,
      };
    })
    .sort((a, b) => b.ano - a.ano || b.mes - a.mes || a.analista.localeCompare(b.analista));
}
