import { chaveEntidade, chaveProjeto, type LinhaRevisao, type Origem } from "@/lib/revisoes-calculo";

export type LinhaLocalizacao = LinhaRevisao & {
  modulo: Origem;
  obra: string | null;
  atualizadoEm: string | null;
  resumoMfiles: boolean;
  resumoDrive: boolean;
  resumoEmail: boolean;
};

export type LinhaLocalizacaoMarcada = LinhaLocalizacao & { chaveProjeto: string; maisRecente: boolean };

/** Agrupa por projeto (entidade + N° AT + disciplina, dentro do mesmo
 * módulo) e marca, em cada grupo, a revisão de maior número como a mais
 * recente — mesma regra de views/localizacao_ats.py::_marcar_mais_recente. */
export function marcarMaisRecente(linhas: LinhaLocalizacao[]): LinhaLocalizacaoMarcada[] {
  const porGrupo = new Map<string, LinhaLocalizacao[]>();
  for (const l of linhas) {
    const chave = `${l.modulo}::${chaveProjeto(l)}`;
    const lista = porGrupo.get(chave) ?? [];
    lista.push(l);
    porGrupo.set(chave, lista);
  }

  const resultado: LinhaLocalizacaoMarcada[] = [];
  for (const [chave, grupo] of porGrupo) {
    const maiorRevisao = Math.max(...grupo.map((g) => g.revisao));
    for (const l of grupo) {
      resultado.push({ ...l, chaveProjeto: chave, maisRecente: l.revisao === maiorRevisao });
    }
  }
  return resultado;
}

const ROTULOS_CANAL: Record<"mfiles" | "drive" | "email", string> = { mfiles: "M-Files", drive: "Drive", email: "E-mail" };

/** Mesma regra de gat/resumo_conclusao.py::rotulos_canais_selecionados. */
export function rotulosCanaisSelecionados(mfiles: boolean, drive: boolean, email: boolean): string[] {
  const selecionados: string[] = [];
  if (mfiles) selecionados.push(ROTULOS_CANAL.mfiles);
  if (drive) selecionados.push(ROTULOS_CANAL.drive);
  if (email) selecionados.push(ROTULOS_CANAL.email);
  return selecionados;
}

export { chaveEntidade };
