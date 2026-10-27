import { obterPool } from "@/lib/db";
import { CATEGORIAS, TABELAS_ARQUIVAVEIS, TIPO_ARQUIVAMENTO, TIPO_EXCLUSAO, TIPO_RESTAURACAO, type RegistroArquivado } from "@/lib/arquivo-calculo";

function validarTabela(tabela: string): void {
  if (!TABELAS_ARQUIVAVEIS.includes(tabela)) {
    throw new Error(`'${tabela}' não é uma tabela arquivável pelo módulo Arquivo.`);
  }
}

const COLUNAS_DESCRICAO: Record<string, string[]> = {
  pmo_projetos: ["nome", "cliente", "contratada"],
  prestadores: ["codigo", "prestador", "num_at", "revisao_at"],
  cessionarios: ["codigo", "cessionario", "num_at", "revisao_at"],
  cadastro_prestadores: ["codigo", "nome_empresa"],
  cadastro_cessionarios: ["codigo", "nome_empresa"],
  usuarios: ["username", "nome_completo"],
  alertas_manuais: ["titulo", "codigo_projeto"],
  pmo_cronograma_arquivos: ["nome_arquivo", "formato"],
};

function descricaoRegistro(tabela: string, registro: Record<string, unknown>): string {
  const campos = COLUNAS_DESCRICAO[tabela] ?? ["id"];
  const partes = campos.map((c) => registro[c]).filter((v) => v !== null && v !== undefined && v !== "").map(String);
  return partes.length ? partes.join(" — ") : `${tabela} #${registro.id ?? ""}`;
}

async function registrarAuditoriaArquivo(
  client: { query: ReturnType<typeof obterPool>["query"] },
  tabela: string,
  registroId: number,
  tipoOperacao: string,
  usuario: string,
  justificativa: string | null,
  descricaoRegistroTexto: string,
): Promise<void> {
  const categoria = CATEGORIAS.find((c) => c.tabela === tabela);
  const origem = categoria?.origem ?? null;
  await client.query(
    `INSERT INTO arquivo_auditoria (tabela, registro_id, tipo_operacao, usuario, data_hora, justificativa, descricao_registro, origem)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [tabela, registroId, tipoOperacao, usuario, new Date().toISOString(), justificativa, descricaoRegistroTexto, origem],
  );
}

/** Arquivamento lógico — nunca remove o registro, só marca arquivado_em.
 * Mesma regra de gat/arquivo_database.py::arquivar_registro. */
export async function arquivarRegistro(tabela: string, registroId: number, usuario: string, motivo: string | null): Promise<void> {
  validarTabela(tabela);
  const pool = obterPool();
  const { rows } = await pool.query(`SELECT * FROM ${tabela} WHERE id = $1`, [registroId]);
  const registro = rows[0];
  if (!registro) throw new Error("Registro não encontrado.");
  if (registro.arquivado_em) return;

  await pool.query(
    `UPDATE ${tabela} SET arquivado_em = $1, arquivado_por = $2, motivo_arquivamento = $3, arquivado_teste = false WHERE id = $4`,
    [new Date().toISOString(), usuario, motivo, registroId],
  );
  await registrarAuditoriaArquivo(pool, tabela, registroId, TIPO_ARQUIVAMENTO, usuario, motivo, descricaoRegistro(tabela, registro));
}

/** Mesma regra de gat/arquivo_database.py::restaurar_registro. */
export async function restaurarRegistro(tabela: string, registroId: number, usuario: string, justificativa: string | null): Promise<void> {
  validarTabela(tabela);
  const pool = obterPool();
  const { rows } = await pool.query(`SELECT * FROM ${tabela} WHERE id = $1`, [registroId]);
  const registro = rows[0];
  if (!registro) throw new Error("Registro não encontrado.");

  await pool.query(
    `UPDATE ${tabela} SET arquivado_em = NULL, arquivado_por = NULL, motivo_arquivamento = NULL, arquivado_teste = false WHERE id = $1`,
    [registroId],
  );
  await registrarAuditoriaArquivo(pool, tabela, registroId, TIPO_RESTAURACAO, usuario, justificativa, descricaoRegistro(tabela, registro));
}

/** Só pode ser chamada para um registro já arquivado — a exclusão
 * definitiva nunca alcança um registro ativo. Mesma regra de
 * gat/arquivo_database.py::excluir_definitivamente. */
export async function excluirDefinitivamente(tabela: string, registroId: number, usuario: string, justificativa: string): Promise<void> {
  validarTabela(tabela);
  if (!justificativa.trim()) throw new Error("Informe a justificativa da exclusão definitiva.");
  const pool = obterPool();
  const { rows } = await pool.query(`SELECT * FROM ${tabela} WHERE id = $1`, [registroId]);
  const registro = rows[0];
  if (!registro) throw new Error("Registro não encontrado.");
  if (!registro.arquivado_em) throw new Error("Só é possível excluir definitivamente um registro que já esteja arquivado.");

  const descricao = descricaoRegistro(tabela, registro);
  await pool.query(`DELETE FROM ${tabela} WHERE id = $1`, [registroId]);
  await registrarAuditoriaArquivo(pool, tabela, registroId, TIPO_EXCLUSAO, usuario, justificativa.trim(), descricao);
}

export async function listarArquivados(tabela: string): Promise<RegistroArquivado[]> {
  validarTabela(tabela);
  const pool = obterPool();
  const { rows } = await pool.query<RegistroArquivado>(`SELECT * FROM ${tabela} WHERE arquivado_em IS NOT NULL ORDER BY arquivado_em DESC`);
  return rows.map(removerColunasSensiveis);
}

const COLUNAS_SENSIVEIS_OU_PESADAS = new Set(["senha_hash", "conteudo"]);

/** Mesma proteção de views/arquivo.py::_remover_colunas_sensiveis —
 * nunca envia hash de senha (usuarios) nem colunas pesadas para o
 * cliente. */
function removerColunasSensiveis(registro: RegistroArquivado): RegistroArquivado {
  const limpo = { ...registro };
  for (const coluna of COLUNAS_SENSIVEIS_OU_PESADAS) delete limpo[coluna];
  return limpo;
}

export type ProjetoGatArquivado = { codigo: string; arquivado_em: string };

/** Códigos de projeto GAT totalmente arquivados (todas as análises de
 * prestadores e cessionarios daquele código estão arquivadas). Mesma
 * regra de gat/arquivo_database.py::listar_codigos_gat_arquivados. */
export async function listarCodigosGatArquivados(): Promise<ProjetoGatArquivado[]> {
  const pool = obterPool();
  const { rows: total } = await pool.query<{ codigo: string; total: string }>(
    `SELECT codigo, COUNT(*) AS total FROM (
       SELECT codigo FROM prestadores UNION ALL SELECT codigo FROM cessionarios
     ) t GROUP BY codigo`,
  );
  const { rows: arquivados } = await pool.query<{ codigo: string; arquivados: string; arquivado_em: string }>(
    `SELECT codigo, COUNT(*) AS arquivados, MAX(arquivado_em) AS arquivado_em FROM (
       SELECT codigo, arquivado_em FROM prestadores WHERE arquivado_em IS NOT NULL
       UNION ALL
       SELECT codigo, arquivado_em FROM cessionarios WHERE arquivado_em IS NOT NULL
     ) t GROUP BY codigo`,
  );
  const totalPorCodigo = new Map(total.map((r) => [r.codigo, Number(r.total)]));
  return arquivados
    .filter((a) => totalPorCodigo.get(a.codigo) === Number(a.arquivados))
    .map((a) => ({ codigo: a.codigo, arquivado_em: a.arquivado_em }))
    .sort((a, b) => (b.arquivado_em || "").localeCompare(a.arquivado_em || ""));
}

/** Mesma regra de gat/arquivo_database.py::restaurar_projeto_gat. */
export async function restaurarProjetoGat(codigo: string, usuario: string): Promise<number> {
  const pool = obterPool();
  let total = 0;
  for (const tabela of ["prestadores", "cessionarios"] as const) {
    const { rows } = await pool.query<{ id: number }>(`SELECT id FROM ${tabela} WHERE codigo = $1 AND arquivado_em IS NOT NULL`, [codigo]);
    for (const linha of rows) {
      await pool.query(
        `UPDATE ${tabela} SET arquivado_em = NULL, arquivado_por = NULL, motivo_arquivamento = NULL, arquivado_teste = false WHERE id = $1`,
        [linha.id],
      );
      total++;
    }
  }
  if (total > 0) {
    await registrarAuditoriaArquivo(pool, "projetos_gat", 0, TIPO_RESTAURACAO, usuario, null, `Projeto GAT ${codigo} (${total} análise(s))`);
  }
  return total;
}

export type RegistroAuditoriaArquivo = {
  id: number;
  tabela: string;
  registro_id: number;
  tipo_operacao: string;
  usuario: string;
  data_hora: string;
  justificativa: string | null;
  descricao_registro: string | null;
  origem: string | null;
};

export async function listarAuditoriaArquivo(tipoOperacao: string | null, origem: string | null): Promise<RegistroAuditoriaArquivo[]> {
  const pool = obterPool();
  const condicoes: string[] = [];
  const params: string[] = [];
  if (tipoOperacao) {
    params.push(tipoOperacao);
    condicoes.push(`tipo_operacao = $${params.length}`);
  }
  if (origem) {
    params.push(origem);
    condicoes.push(`origem = $${params.length}`);
  }
  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const { rows } = await pool.query<RegistroAuditoriaArquivo>(`SELECT * FROM arquivo_auditoria ${where} ORDER BY data_hora DESC`, params);
  return rows;
}
