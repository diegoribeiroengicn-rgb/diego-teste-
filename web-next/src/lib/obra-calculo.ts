/** Obras / Áreas vinculadas a um Prestador (inclui identificação de
 * canteiro) — porta de gat/ui/modals_cadastro.py::dialog_obra_prestador. */

export const STATUS_OBRA_OPCOES = ["ATIVA", "CONCLUÍDA", "SUSPENSA"] as const;
export type StatusObra = (typeof STATUS_OBRA_OPCOES)[number];

export type DadosObraPrestador = {
  prestador_id: number;
  nome_obra: string;
  codigo_referencia: string | null;
  status: StatusObra;
  e_canteiro: boolean;
  observacoes: string | null;
};

/** "CANTEIRO – <nome da obra>" quando marcada como canteiro — sem alterar
 * o nome original armazenado no banco. Mesma regra de
 * gat/database.py::nome_exibicao_obra. */
export function nomeExibicaoObra(obra: { nome_obra: string; e_canteiro: boolean }): string {
  return obra.e_canteiro ? `CANTEIRO – ${obra.nome_obra}` : obra.nome_obra;
}

export function validarObraPrestador(dados: Pick<DadosObraPrestador, "nome_obra">): string | null {
  if (!dados.nome_obra?.trim()) return "Informe o nome da obra.";
  return null;
}
