import { marcarTratadoAlerta } from "@/lib/alertas-engine";
import { atualizarCessionario, atualizarPrestador, obterCessionarioCompleto, obterPrestadorCompleto } from "@/lib/analise";
import { LABEL_DECISAO_HOLD, type DadosTratativaHold } from "@/lib/hold-calculo";

/** Registra o contato com o especialista sobre um projeto em HOLD,
 * reaproveitando o ciclo de vida de alertas já existente
 * (marcarTratadoAlerta, tipo ACOMPANHAMENTO_HOLD) para o histórico da
 * tratativa. Registrar a tratativa NÃO retira o projeto do HOLD por si
 * só: a contagem do HOLD só muda quando `decisao === "RETIRADO"`, que
 * encerra o HOLD (hold_fim) — mesma regra de
 * gat/database.py::registrar_tratativa_hold. */
export async function registrarTratativaHold(
  tabela: "prestadores" | "cessionarios", projetoId: number, dados: DadosTratativaHold, usuario: string,
): Promise<void> {
  await marcarTratadoAlerta(
    tabela, projetoId, "ACOMPANHAMENTO_HOLD", LABEL_DECISAO_HOLD[dados.decisao], dados.especialista.trim(), dados.resolucao.trim(), usuario,
  );

  if (dados.decisao === "RETIRADO") {
    if (tabela === "prestadores") {
      const registro = await obterPrestadorCompleto(projetoId);
      if (registro) await atualizarPrestador(projetoId, { ...registro, hold_fim: dados.dataContato }, usuario);
    } else {
      const registro = await obterCessionarioCompleto(projetoId);
      if (registro) await atualizarCessionario(projetoId, { ...registro, hold_fim: dados.dataContato }, usuario);
    }
  }
}
