import { SeletorCompetencia } from "@/components/seletor-competencia";
import {
  GraficoAcumulado,
  GraficoDisciplinas,
  GraficoLiberadoDonut,
  GraficoRevisao,
} from "@/components/opr-cessionarios-charts";
import type { DadosOprCessionarios } from "@/lib/opr-cessionarios";
import type { CessionarioAtivo } from "@/lib/cessionarios-ativos";
import { MESES_PT } from "@/lib/meses";

function CartaoKpi({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-4 py-4">
      <p className="text-xl font-semibold tabular-nums" style={cor ? { color: cor } : undefined}>
        {valor}
      </p>
      <p className="mt-1 text-xs text-(--color-text-weak)">{titulo}</p>
    </div>
  );
}

export function PainelOprCessionarios({
  mes,
  ano,
  dados,
  cessionariosAtivos,
}: {
  mes: number;
  ano: number;
  dados: DadosOprCessionarios;
  cessionariosAtivos: CessionarioAtivo[];
}) {
  const { resumo } = dados;
  const tituloMesAno = `${MESES_PT[mes - 1]} ${ano}`;

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-(--color-text)">One Page Report — Cessionários</h1>
          <p className="mt-1 max-w-2xl text-sm text-(--color-text-weak)">
            Infográfico mensal no modelo institucional &quot;GAT Cessionários&quot; — {tituloMesAno}.
          </p>
        </div>
        <SeletorCompetencia mes={mes} ano={ano} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <CartaoKpi titulo="Análises Emitidas" valor={String(resumo.analises_emitidas)} cor="var(--color-navy)" />
        <CartaoKpi titulo="Docs Analisados" valor={String(resumo.documentos)} cor="var(--color-blue-2)" />
        <CartaoKpi titulo="Adiantados" valor={`${resumo.adiantados} (${resumo.adiantados_pct}%)`} cor="var(--color-green)" />
        <CartaoKpi titulo="No Prazo" valor={`${resumo.no_prazo} (${resumo.no_prazo_pct}%)`} cor="var(--color-gold)" />
        <CartaoKpi titulo="Atrasados" valor={`${resumo.atrasados} (${resumo.atrasados_pct}%)`} cor="var(--color-red)" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
          <GraficoDisciplinas dados={dados.disciplinas} />
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
          <GraficoRevisao dados={dados.porRevisao} />
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
          <GraficoLiberadoDonut liberados={resumo.liberados} naoLiberados={resumo.nao_liberados} />

          <div className="mt-2 border-t border-(--color-border) pt-3">
            <p className="text-xs font-semibold text-(--color-navy)">CESSIONÁRIOS ATIVOS</p>
            {cessionariosAtivos.length === 0 ? (
              <p className="mt-1 text-xs text-(--color-text-weak)">
                Nenhum cadastrado — gerencie em Cessionários &gt; Cessionários Ativos.
              </p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {cessionariosAtivos.map((c) => (
                  <li key={c.id} className="text-xs text-(--color-text-weak)">
                    • {c.quantidade} {c.categoria}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3 border-t border-(--color-border) pt-3">
            <p className="text-xs font-semibold text-(--color-navy)">RESUMO</p>
            <ul className="mt-1 space-y-0.5">
              <li className="text-xs text-(--color-text-weak)">{resumo.analises_emitidas} análises emitidas</li>
              <li className="text-xs text-(--color-text-weak)">{resumo.documentos} docs analisados</li>
              <li className="text-xs text-(--color-text-weak)">{resumo.adiantados} adiantados ({resumo.adiantados_pct}%)</li>
              <li className="text-xs text-(--color-text-weak)">{resumo.no_prazo} no prazo ({resumo.no_prazo_pct}%)</li>
              <li className="text-xs text-(--color-text-weak)">{resumo.atrasados} atrasados ({resumo.atrasados_pct}%)</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
          <GraficoAcumulado dados={dados.acumuladoAtual} ano={ano} />
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
          <GraficoAcumulado dados={dados.acumuladoAnterior} ano={ano - 1} />
        </div>
      </div>

      <p className="mt-4 text-xs text-(--color-text-dim)">
        Exportação para PDF/Word/PowerPoint ainda não disponível nesta versão — use o sistema atual
        enquanto esse recurso não chega por aqui.
      </p>
    </div>
  );
}
