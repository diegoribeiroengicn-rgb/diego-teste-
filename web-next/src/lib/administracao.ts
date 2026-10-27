import bcrypt from "bcryptjs";
import { obterPool } from "@/lib/db";
import { semearPermissoesPerfil } from "@/lib/permissoes";

export type Usuario = {
  id: number;
  username: string;
  nomeCompleto: string | null;
  perfil: string;
  ativo: boolean;
  deveTrocarSenha: boolean;
  ultimoAcesso: string | null;
  criadoEm: string;
  analistaVinculado: string | null;
};

type LinhaUsuarioBanco = {
  id: number;
  username: string;
  nome_completo: string | null;
  perfil: string;
  ativo: number | boolean;
  deve_trocar_senha: number | boolean;
  ultimo_acesso: string | null;
  criado_em: string;
  analista_vinculado: string | null;
};

function mapUsuario(r: LinhaUsuarioBanco): Usuario {
  return {
    id: r.id, username: r.username, nomeCompleto: r.nome_completo, perfil: r.perfil,
    ativo: !!r.ativo, deveTrocarSenha: !!r.deve_trocar_senha, ultimoAcesso: r.ultimo_acesso,
    criadoEm: r.criado_em, analistaVinculado: r.analista_vinculado,
  };
}

/** Só usuários ativos (não arquivados) — os arquivados pelo módulo
 * Arquivo (ainda não portado) ficam de fora. Mesma regra de
 * gat/database.py::listar_usuarios. */
export async function listarUsuarios(): Promise<Usuario[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaUsuarioBanco>(
    `SELECT id, username, nome_completo, perfil, ativo, deve_trocar_senha, ultimo_acesso, criado_em, analista_vinculado
     FROM usuarios WHERE arquivado_em IS NULL ORDER BY username`,
  );
  return rows.map(mapUsuario);
}

/** Cria um usuário com senha inicial temporária — obrigado a defini-la
 * novamente no primeiro acesso (deve_trocar_senha). Hash bcrypt
 * compatível com o login do sistema Streamlit (mesma tabela
 * `usuarios`). Mesma regra de gat/database.py::criar_usuario. */
export async function criarUsuario(
  username: string,
  senha: string,
  nomeCompleto: string,
  perfil: string,
  analistaVinculado: string | null,
): Promise<number> {
  const pool = obterPool();
  const senhaHash = await bcrypt.hash(senha, 10);
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO usuarios (username, senha_hash, nome_completo, perfil, ativo, deve_trocar_senha, criado_em, analista_vinculado)
     VALUES ($1,$2,$3,$4,true,true,$5,$6) RETURNING id`,
    [username, senhaHash, nomeCompleto, perfil, new Date().toISOString(), analistaVinculado],
  );
  const id = rows[0].id;
  await semearPermissoesPerfil(id, perfil);
  return id;
}

export async function atualizarUsuario(
  username: string,
  nomeCompleto: string,
  perfil: string,
  analistaVinculado: string | null,
): Promise<void> {
  const pool = obterPool();
  await pool.query(
    `UPDATE usuarios SET nome_completo = $1, perfil = $2, analista_vinculado = $3 WHERE username = $4`,
    [nomeCompleto, perfil, analistaVinculado, username],
  );
}

export async function definirUsuarioAtivo(username: string, ativo: boolean): Promise<void> {
  const pool = obterPool();
  await pool.query(`UPDATE usuarios SET ativo = $1 WHERE username = $2`, [ativo, username]);
}

/** Administrador redefine a senha de um usuário — força troca no
 * próximo login e nunca expõe a senha atual. Mesma regra de
 * gat/database.py::redefinir_senha_admin. */
export async function redefinirSenhaAdmin(username: string, novaSenha: string): Promise<void> {
  const pool = obterPool();
  const senhaHash = await bcrypt.hash(novaSenha, 10);
  await pool.query(`UPDATE usuarios SET senha_hash = $1, deve_trocar_senha = true WHERE username = $2`, [senhaHash, username]);
}

export async function exigirTrocaSenhaProximoLogin(username: string): Promise<void> {
  const pool = obterPool();
  await pool.query(`UPDATE usuarios SET deve_trocar_senha = true WHERE username = $1`, [username]);
}

export async function obterConfiguracao(chave: string, padrao: string): Promise<string> {
  const pool = obterPool();
  const { rows } = await pool.query<{ valor: string }>(`SELECT valor FROM configuracoes WHERE chave = $1`, [chave]);
  return rows[0]?.valor ?? padrao;
}

export async function definirConfiguracao(chave: string, valor: string): Promise<void> {
  const pool = obterPool();
  await pool.query(
    `INSERT INTO configuracoes (chave, valor) VALUES ($1,$2) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`,
    [chave, valor],
  );
}

export type DiagnosticoImportacao = {
  totalImportados: number;
  itemMinimo: number | null;
  itemMaximo: number | null;
  itensAusentesNaOrigem: number[];
};

async function diagnosticoItem(tabela: "prestadores" | "cessionarios"): Promise<DiagnosticoImportacao> {
  const pool = obterPool();
  const { rows: totalRows } = await pool.query<{ n: string }>(`SELECT COUNT(*) AS n FROM ${tabela}`);
  const total = Number(totalRows[0].n);
  const { rows: limiteRows } = await pool.query<{ mn: number | null; mx: number | null }>(
    `SELECT MIN(item) AS mn, MAX(item) AS mx FROM ${tabela} WHERE item IS NOT NULL`,
  );
  const minimo = limiteRows[0]?.mn ?? null;
  const maximo = limiteRows[0]?.mx ?? null;

  const faltantes: number[] = [];
  if (minimo != null && maximo != null) {
    const { rows: itensRows } = await pool.query<{ item: number }>(`SELECT DISTINCT item FROM ${tabela} WHERE item IS NOT NULL`);
    const existentes = new Set(itensRows.map((r) => r.item));
    for (let i = minimo; i <= maximo; i++) if (!existentes.has(i)) faltantes.push(i);
  }
  return { totalImportados: total, itemMinimo: minimo, itemMaximo: maximo, itensAusentesNaOrigem: faltantes };
}

/** Relatório de validação da importação, calculado inteiramente a
 * partir do banco. A numeração de Item é preservada tal como veio da
 * planilha (nunca renumerada); números ausentes refletem linhas que já
 * não existiam na planilha de origem. Mesma regra de
 * gat/database.py::relatorio_validacao_importacao. */
export async function relatorioValidacaoImportacao(): Promise<{ prestadores: DiagnosticoImportacao; cessionarios: DiagnosticoImportacao }> {
  const [prestadores, cessionarios] = await Promise.all([diagnosticoItem("prestadores"), diagnosticoItem("cessionarios")]);
  return { prestadores, cessionarios };
}

export type RegistroHistorico = {
  id: number;
  tabela: string;
  registroId: number;
  campo: string;
  valorAnterior: string | null;
  valorNovo: string | null;
  usuario: string;
  dataHora: string;
};

type LinhaHistoricoBanco = {
  id: number; tabela: string; registro_id: number; campo: string;
  valor_anterior: string | null; valor_novo: string | null; usuario: string; data_hora: string;
};

/** `limite` null não trunca nada (histórico completo) — passe um valor
 * explícito para um recorte. Mesma regra de gat/database.py::listar_historico. */
export async function listarHistorico(tabela: string | null, limite: number | null): Promise<RegistroHistorico[]> {
  const pool = obterPool();
  const condicoes: string[] = [];
  const params: (string | number)[] = [];
  if (tabela) {
    condicoes.push(`tabela = $${params.length + 1}`);
    params.push(tabela);
  }
  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const limitClause = limite != null ? `LIMIT $${params.length + 1}` : "";
  if (limite != null) params.push(limite);

  const { rows } = await pool.query<LinhaHistoricoBanco>(
    `SELECT * FROM historico_edicoes ${where} ORDER BY data_hora DESC ${limitClause}`,
    params,
  );
  return rows.map((r) => ({
    id: r.id, tabela: r.tabela, registroId: r.registro_id, campo: r.campo,
    valorAnterior: r.valor_anterior, valorNovo: r.valor_novo, usuario: r.usuario, dataHora: r.data_hora,
  }));
}

export type CodigoDisciplina = { disciplina: string; codigo: string | null; descricao: string | null };

export async function listarCodigosDisciplina(): Promise<CodigoDisciplina[]> {
  const pool = obterPool();
  const { rows } = await pool.query<CodigoDisciplina>(`SELECT disciplina, codigo, descricao FROM codigos_disciplina ORDER BY disciplina`);
  return rows;
}

/** Cria ou atualiza o código de uma disciplina (upsert por nome).
 * Mesma regra de gat/database.py::definir_codigo_disciplina. */
export async function definirCodigoDisciplina(disciplina: string, codigo: string | null, descricao: string | null, usuario: string): Promise<void> {
  const pool = obterPool();
  await pool.query(
    `INSERT INTO codigos_disciplina (disciplina, codigo, descricao, atualizado_em, atualizado_por)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (disciplina) DO UPDATE SET codigo = excluded.codigo, descricao = excluded.descricao,
       atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`,
    [disciplina.trim().toUpperCase(), (codigo || "").trim() || null, (descricao || "").trim() || null, new Date().toISOString(), usuario],
  );
}

export type PerguntaChecklistAdmin = {
  id: number;
  categoria: string;
  texto: string;
  ordemCategoria: number;
  ordemPergunta: number;
  ativo: boolean;
};

type LinhaPerguntaBanco = { id: number; categoria: string; texto: string; ordem_categoria: number; ordem_pergunta: number; ativo: number | boolean };

/** `apenasAtivas = false` também traz as desativadas — usado no painel
 * admin para permitir reativá-las. Mesma regra de
 * gat/database.py::listar_perguntas_checklist. */
export async function listarPerguntasChecklistAdmin(apenasAtivas: boolean): Promise<PerguntaChecklistAdmin[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaPerguntaBanco>(
    `SELECT id, categoria, texto, ordem_categoria, ordem_pergunta, ativo FROM avaliacao_checklist_perguntas
     ${apenasAtivas ? "WHERE ativo = true" : ""} ORDER BY ordem_categoria, ordem_pergunta`,
  );
  return rows.map((r) => ({
    id: r.id, categoria: r.categoria, texto: r.texto, ordemCategoria: r.ordem_categoria,
    ordemPergunta: r.ordem_pergunta, ativo: !!r.ativo,
  }));
}

export async function inserirPerguntaChecklist(categoria: string, texto: string, ordemCategoria: number, ordemPergunta: number, usuario: string): Promise<number> {
  const pool = obterPool();
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO avaliacao_checklist_perguntas (categoria, texto, ordem_categoria, ordem_pergunta, ativo, criado_em, criado_por)
     VALUES ($1,$2,$3,$4,true,$5,$6) RETURNING id`,
    [categoria.trim().toUpperCase(), texto.trim(), ordemCategoria, ordemPergunta, new Date().toISOString(), usuario],
  );
  return rows[0].id;
}

export async function atualizarPerguntaChecklist(
  perguntaId: number, categoria: string, texto: string, ordemCategoria: number, ordemPergunta: number, usuario: string,
): Promise<void> {
  const pool = obterPool();
  await pool.query(
    `UPDATE avaliacao_checklist_perguntas SET categoria = $1, texto = $2, ordem_categoria = $3, ordem_pergunta = $4,
       atualizado_em = $5, atualizado_por = $6 WHERE id = $7`,
    [categoria.trim().toUpperCase(), texto.trim(), ordemCategoria, ordemPergunta, new Date().toISOString(), usuario, perguntaId],
  );
}

/** Nunca exclui de fato — avaliações antigas continuam referenciando o
 * id original em respostas_json, mesmo com a pergunta desativada.
 * Mesma regra de gat/database.py::definir_ativa_pergunta_checklist. */
export async function definirAtivaPerguntaChecklist(perguntaId: number, ativo: boolean, usuario: string): Promise<void> {
  const pool = obterPool();
  await pool.query(
    `UPDATE avaliacao_checklist_perguntas SET ativo = $1, atualizado_em = $2, atualizado_por = $3 WHERE id = $4`,
    [ativo, new Date().toISOString(), usuario, perguntaId],
  );
}
