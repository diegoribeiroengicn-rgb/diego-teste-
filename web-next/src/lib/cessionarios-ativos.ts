import { obterPool } from "@/lib/db";

export type CessionarioAtivo = {
  id: number;
  categoria: string;
  quantidade: number;
};

export type ItemCessionarioAtivo = {
  id?: number;
  categoria: string;
  quantidade: number;
};

export async function listarCessionariosAtivos(): Promise<CessionarioAtivo[]> {
  const pool = obterPool();
  const { rows } = await pool.query<CessionarioAtivo>(
    "SELECT id, categoria, quantidade FROM cessionarios_ativos ORDER BY ordem, id",
  );
  return rows;
}

/** Substitui a lista inteira (categoria + quantidade) por `itens`, na
 * mesma ordem em que chegam — cria o que é novo (sem `id`), atualiza o
 * que mudou, remove o que não veio na lista e regrava `ordem` conforme
 * a posição final. Mesmo comportamento do botão "Salvar" em
 * views/cessionarios_ativos.py (grade editável de uma vez). */
export async function salvarCessionariosAtivos(itens: ItemCessionarioAtivo[], usuario: string): Promise<void> {
  const pool = obterPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: existentes } = await client.query<{ id: number }>("SELECT id FROM cessionarios_ativos");
    const idsExistentes = new Set(existentes.map((r) => r.id));
    const idsMantidos: number[] = [];
    const agora = new Date().toISOString();

    for (const item of itens) {
      const categoria = item.categoria.trim();
      if (!categoria) continue;
      const quantidade = Math.max(0, Math.trunc(item.quantidade) || 0);

      if (item.id && idsExistentes.has(item.id)) {
        await client.query(
          `UPDATE cessionarios_ativos SET categoria=$1, quantidade=$2, atualizado_em=$3, atualizado_por=$4 WHERE id=$5`,
          [categoria, quantidade, agora, usuario, item.id],
        );
        idsMantidos.push(item.id);
      } else {
        const { rows } = await client.query<{ id: number }>(
          `INSERT INTO cessionarios_ativos (categoria, quantidade, ordem, criado_em, criado_por)
           VALUES ($1,$2,0,$3,$4) RETURNING id`,
          [categoria, quantidade, agora, usuario],
        );
        idsMantidos.push(rows[0].id);
      }
    }

    for (const idRemovido of idsExistentes) {
      if (!idsMantidos.includes(idRemovido)) {
        await client.query("DELETE FROM cessionarios_ativos WHERE id=$1", [idRemovido]);
      }
    }

    for (let i = 0; i < idsMantidos.length; i++) {
      await client.query("UPDATE cessionarios_ativos SET ordem=$1 WHERE id=$2", [i, idsMantidos[i]]);
    }

    await client.query("COMMIT");
  } catch (exc) {
    await client.query("ROLLBACK");
    throw exc;
  } finally {
    client.release();
  }
}
