import { obterPool } from "@/lib/db";
import { emHold } from "@/lib/dias-uteis";
import {
  estaAguardandoDevolutivaExterna, linhaMaisRecentePorProjeto, situacaoDevolutiva,
  type DevolutivaPendente, type LinhaProjetoRevisao,
} from "@/lib/devolutiva-calculo";

const CAMPO_NOME_ENTIDADE: Record<"prestadores" | "cessionarios", string> = {
  prestadores: "prestador", cessionarios: "cessionario",
};

export type CobrancaDevolutiva = {
  id: number;
  modulo: string;
  projeto_id: number;
  numero_cobranca: number;
  data_cobranca: string;
  hora_cobranca: string | null;
  usuario: string;
  canal: string | null;
  observacao: string | null;
  criado_em: string;
};

export async function listarCobrancasDevolutiva(modulo?: "prestadores" | "cessionarios", projetoId?: number): Promise<CobrancaDevolutiva[]> {
  const pool = obterPool();
  const condicoes: string[] = [];
  const parametros: unknown[] = [];
  if (modulo) {
    parametros.push(modulo);
    condicoes.push(`modulo = $${parametros.length}`);
  }
  if (projetoId != null) {
    parametros.push(projetoId);
    condicoes.push(`projeto_id = $${parametros.length}`);
  }
  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const { rows } = await pool.query<CobrancaDevolutiva>(
    `SELECT * FROM devolutiva_cobrancas ${where} ORDER BY numero_cobranca`, parametros,
  );
  return rows;
}

/** Registra uma cobrança de Devolutiva Externa efetivamente realizada
 * (confirmada pelo usuário após o envio) — nunca gerada/enviada
 * automaticamente. A partir desta confirmação, a contagem dos próximos 5
 * dias úteis passa a valer a partir desta data. Mesma regra de
 * gat/database.py::registrar_cobranca_devolutiva. */
export async function registrarCobrancaDevolutiva(
  modulo: "prestadores" | "cessionarios", projetoId: number, numeroCobranca: number,
  usuario: string, canal: string, observacao: string | null,
): Promise<void> {
  const pool = obterPool();
  const agora = new Date();
  const dataCobranca = agora.toISOString().slice(0, 10);
  const horaCobranca = agora.toISOString().slice(11, 19);
  await pool.query(
    `INSERT INTO devolutiva_cobrancas (modulo, projeto_id, numero_cobranca, data_cobranca, hora_cobranca, usuario, canal, observacao, criado_em)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [modulo, projetoId, numeroCobranca, dataCobranca, horaCobranca, usuario, canal, observacao, agora.toISOString()],
  );
}

type LinhaProjetoDb = LinhaProjetoRevisao & {
  status_analise: string | null;
  data_analise: string | null;
  hold_inicio: string | null;
  hold_fim: string | null;
  responsavel: string | null;
};

/** Monta a lista de projetos atualmente aguardando devolutiva externa —
 * a revisão mais recente de cada projeto exige retorno do Prestador/
 * Cessionário e ainda não houve retorno. Mesma regra de
 * gat/devolutiva_externa.py::montar_devolutivas_pendentes, aqui já
 * buscando ativos + cobranças do banco. Escopo deste incremento: sem o
 * rótulo de Obra vinculada (gat usa `obra_id`/`listar_obras_prestador`,
 * ainda não portado em lib/analise.ts). */
export async function buscarDevolutivasPendentes(modulos: ("prestadores" | "cessionarios")[]): Promise<DevolutivaPendente[]> {
  const pool = obterPool();
  const resultado: DevolutivaPendente[] = [];

  for (const modulo of modulos) {
    const campoNomeEntidade = CAMPO_NOME_ENTIDADE[modulo];
    const { rows } = await pool.query<LinhaProjetoDb>(
      `SELECT id, codigo, "${campoNomeEntidade}" AS nome_entidade, disciplina, num_at, revisao,
              status_analise, data_analise, hold_inicio, hold_fim, responsavel
       FROM ${modulo} WHERE arquivado_em IS NULL`,
    );
    const maisRecentes = linhaMaisRecentePorProjeto(rows, "nome_entidade");
    const candidatos = maisRecentes.filter((l) => estaAguardandoDevolutivaExterna(l.status_analise));
    if (!candidatos.length) continue;

    const cobrancas = await listarCobrancasDevolutiva(modulo);
    const cobrancasPorProjeto = new Map<number, string[]>();
    for (const c of cobrancas) {
      const lista = cobrancasPorProjeto.get(c.projeto_id) ?? [];
      lista.push(c.data_cobranca);
      cobrancasPorProjeto.set(c.projeto_id, lista);
    }

    for (const linha of candidatos) {
      const emHoldAtual = emHold(linha.hold_inicio, linha.hold_fim);
      const situacao = situacaoDevolutiva(linha.data_analise, linha.hold_inicio, linha.hold_fim, emHoldAtual, cobrancasPorProjeto.get(linha.id) ?? []);
      resultado.push({
        ...situacao, modulo, projetoId: linha.id, codigo: linha.codigo,
        nome: (linha.nome_entidade as string | null) ?? null, disciplina: linha.disciplina, numAt: linha.num_at,
        revisao: linha.revisao, dataUltimaAt: linha.data_analise, responsavel: linha.responsavel,
        holdInicio: linha.hold_inicio, holdFim: linha.hold_fim, emHold: emHoldAtual,
      });
    }
  }

  return resultado;
}
