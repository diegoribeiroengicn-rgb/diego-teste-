import { obterPool } from "@/lib/db";

export type Projeto = {
  id: number;
  item: number | null;
  codigo: string;
  entidade: string;
  disciplina: string;
  revisao: number;
  status_analise: string;
  num_at: string | null;
  num_documentos: number | null;
  data_limite: string | null;
  responsavel: string | null;
};

export type Tabela = "prestadores" | "cessionarios";

const COLUNA_ENTIDADE: Record<Tabela, string> = {
  prestadores: "prestador",
  cessionarios: "cessionario",
};

/** Busca projetos de `prestadores` ou `cessionarios`, opcionalmente
 * filtrados por responsável (busca explícita) e por uma lista de status
 * (`EM ANÁLISE`, `EM HOLD` etc.). Sem busca explícita, todas as análises
 * aparecem (não só as do analista logado) — `analistaProprio` só decide a
 * ordem: as dele aparecem primeiro, por data limite, seguidas das demais
 * também por data limite. */
export async function buscarProjetos(
  tabela: Tabela,
  opcoes: { termoResponsavel: string; analistaProprio?: string | null; statusEntre?: string[] },
): Promise<Projeto[]> {
  const colunaEntidade = COLUNA_ENTIDADE[tabela];
  const pool = obterPool();
  const condicoes = [`arquivado_em IS NULL`];
  const parametros: unknown[] = [];

  if (opcoes.termoResponsavel) {
    parametros.push(opcoes.termoResponsavel);
    condicoes.push(`UPPER(responsavel) LIKE UPPER('%' || $${parametros.length} || '%')`);
  }

  if (opcoes.statusEntre?.length) {
    parametros.push(opcoes.statusEntre);
    condicoes.push(`status_analise = ANY($${parametros.length})`);
  }

  let ordem = "data_limite ASC NULLS LAST";
  if (opcoes.analistaProprio) {
    parametros.push(opcoes.analistaProprio.trim());
    ordem = `(UPPER(TRIM(responsavel)) = UPPER($${parametros.length})) DESC, data_limite ASC NULLS LAST`;
  }

  const { rows } = await pool.query<Omit<Projeto, "entidade"> & Record<string, unknown>>(
    `SELECT id, item, codigo, "${colunaEntidade}" AS entidade, disciplina, revisao, status_analise, num_at, num_documentos, data_limite, responsavel
     FROM ${tabela}
     WHERE ${condicoes.join(" AND ")}
     ORDER BY ${ordem}
     LIMIT 200`,
    parametros,
  );
  return rows as unknown as Projeto[];
}

export type ProjetoComOrigem = Projeto & { origem: Tabela };

export type FiltroProjetosLista = {
  termoCodigo?: string;
  termoEntidade?: string;
  termoResponsavel?: string;
  status?: string;
  disciplina?: string;
  dataLimiteDe?: string;
  dataLimiteAte?: string;
  analistaProprio?: string | null;
  /** "" = ordem padrão (aguardando análise primeiro); "item" / "item_desc"
   * = ordem numérica da planilha (coluna Item), crescente ou decrescente. */
  ordem?: string;
  /** Tamanho da página carregada (30/50/100, crescendo a cada "Carregar
   * mais") — sempre um LIMIT sobre a base completa no banco, nunca sobre
   * uma lista já truncada em memória. */
  limite: number;
};

export type ResultadoProjetosLista = {
  projetos: Projeto[];
  /** Total de registros que atendem aos filtros na base completa — pode
   * ser maior que `projetos.length` quando ainda há mais para carregar. */
  total: number;
};

const STATUS_PENDENTES_SQL = "ARRAY['EM ANÁLISE','EM HOLD','RIOGALEÃO']";

/** Busca paginada e filtrada de projetos para a listagem editável de
 * Projetos (Editar/Dar Baixa inline) — sempre consulta a base completa
 * no banco com os filtros aplicados antes do LIMIT, então localizar um
 * projeto específico nunca depende dele estar entre os primeiros N
 * registros carregados. Função separada de `buscarProjetos` (usada por
 * Dashboard/Em Análise/Em HOLD/Mobile) para não alterar o comportamento
 * dessas telas, que não pediram esta melhoria.
 *
 * Ordenação: além do próprio analista aparecer primeiro quando
 * informado, prioriza projetos aguardando análise (EM ANÁLISE/EM
 * HOLD/RIOGALEÃO) pela data limite mais próxima, e só depois os já
 * concluídos (LIBERADO/NÃO LIBERADO/OBSOLETO/CANCELADO) pela data da
 * atualização mais recente — nunca pela posição da linha na planilha de
 * origem. */
export async function buscarProjetosPaginado(tabela: Tabela, filtro: FiltroProjetosLista): Promise<ResultadoProjetosLista> {
  const colunaEntidade = COLUNA_ENTIDADE[tabela];
  const pool = obterPool();
  const condicoes = [`arquivado_em IS NULL`];
  const parametros: unknown[] = [];

  if (filtro.termoCodigo?.trim()) {
    parametros.push(filtro.termoCodigo.trim());
    condicoes.push(`UPPER(codigo) LIKE UPPER('%' || $${parametros.length} || '%')`);
  }
  if (filtro.termoEntidade?.trim()) {
    parametros.push(filtro.termoEntidade.trim());
    condicoes.push(`UPPER("${colunaEntidade}") LIKE UPPER('%' || $${parametros.length} || '%')`);
  }
  if (filtro.termoResponsavel?.trim()) {
    parametros.push(filtro.termoResponsavel.trim());
    condicoes.push(`UPPER(responsavel) LIKE UPPER('%' || $${parametros.length} || '%')`);
  }
  if (filtro.status?.trim()) {
    parametros.push(filtro.status.trim());
    condicoes.push(`status_analise = $${parametros.length}`);
  }
  if (filtro.disciplina?.trim()) {
    parametros.push(filtro.disciplina.trim());
    condicoes.push(`disciplina = $${parametros.length}`);
  }
  if (filtro.dataLimiteDe?.trim()) {
    parametros.push(filtro.dataLimiteDe.trim());
    condicoes.push(`data_limite >= $${parametros.length}`);
  }
  if (filtro.dataLimiteAte?.trim()) {
    parametros.push(filtro.dataLimiteAte.trim());
    condicoes.push(`data_limite <= $${parametros.length}`);
  }

  let ordem = `
    CASE WHEN status_analise = ANY(${STATUS_PENDENTES_SQL}) THEN 0 ELSE 1 END ASC,
    CASE WHEN status_analise = ANY(${STATUS_PENDENTES_SQL}) THEN data_limite END ASC NULLS LAST,
    CASE WHEN status_analise <> ALL(${STATUS_PENDENTES_SQL}) THEN atualizado_em END DESC NULLS LAST`;
  if (filtro.ordem === "item" || filtro.ordem === "item_desc") {
    // Ordem da planilha: só o número do Item, sem priorizar status nem analista.
    ordem = `item ${filtro.ordem === "item" ? "ASC" : "DESC"} NULLS LAST, id ${filtro.ordem === "item" ? "ASC" : "DESC"}`;
  } else if (filtro.analistaProprio?.trim()) {
    parametros.push(filtro.analistaProprio.trim());
    ordem = `(UPPER(TRIM(responsavel)) = UPPER($${parametros.length})) DESC, ${ordem}`;
  }

  parametros.push(filtro.limite);
  const { rows } = await pool.query<Omit<Projeto, "entidade"> & Record<string, unknown> & { total_geral: string }>(
    `SELECT id, item, codigo, "${colunaEntidade}" AS entidade, disciplina, revisao, status_analise, num_at, num_documentos, data_limite, responsavel,
            COUNT(*) OVER() AS total_geral
     FROM ${tabela}
     WHERE ${condicoes.join(" AND ")}
     ORDER BY ${ordem}
     LIMIT $${parametros.length}`,
    parametros,
  );

  const total = rows.length ? Number(rows[0].total_geral) : 0;
  const projetos = rows as unknown as Projeto[];
  return { projetos, total };
}

/** Valores distintos de disciplina já cadastrados em `tabela`, para
 * popular o filtro da listagem de Projetos sem depender de uma lista
 * fixa (cada planilha importada pode trazer disciplinas diferentes). */
export async function listarDisciplinasDistintas(tabela: Tabela): Promise<string[]> {
  const pool = obterPool();
  const { rows } = await pool.query<{ disciplina: string }>(
    `SELECT DISTINCT disciplina FROM ${tabela} WHERE disciplina IS NOT NULL AND disciplina <> '' AND arquivado_em IS NULL ORDER BY disciplina`,
  );
  return rows.map((r) => r.disciplina);
}

export type ContagemProjetos = { status_analise: string; disciplina: string | null; n: number };

/** Contagem de análises por status e disciplina sobre a base completa
 * (não arquivadas) — fonte dos indicadores do Dashboard. Agregada no
 * banco de propósito: somar a partir de `buscarProjetos` contaria só os
 * registros que cabem no LIMIT daquela listagem. */
export async function contarProjetos(tabela: Tabela, termoResponsavel: string): Promise<ContagemProjetos[]> {
  const pool = obterPool();
  const condicoes = [`arquivado_em IS NULL`];
  const parametros: unknown[] = [];
  if (termoResponsavel) {
    parametros.push(termoResponsavel);
    condicoes.push(`UPPER(responsavel) LIKE UPPER('%' || $${parametros.length} || '%')`);
  }
  const { rows } = await pool.query<ContagemProjetos>(
    `SELECT status_analise, disciplina, COUNT(*)::int AS n FROM ${tabela}
     WHERE ${condicoes.join(" AND ")} GROUP BY status_analise, disciplina`,
    parametros,
  );
  return rows;
}
