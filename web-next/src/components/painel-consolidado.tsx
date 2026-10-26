import {
  contagemPorDisciplina,
  contagemPorStatus,
  evolucaoMensal,
  excluirArts,
  resumoIndicadoresAtraso,
  resumoPorResponsavel,
  topResponsaveis,
  type LinhaConsolidada,
} from "@/lib/consolidado-calculo";
import { hojeBr } from "@/lib/dias-uteis";
import {
  GraficoDisciplinaBarras,
  GraficoEvolucaoMensal,
  GraficoStatusDonut,
  GraficoTopResponsaveis,
} from "@/components/consolidado-charts";

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

function TabelaResumo({ titulo, dados }: { titulo: string; dados: { responsavel: string; projetos: number; atrasados: number }[] }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
      <p style={{ color: "var(--color-navy)" }} className="mb-3 text-sm font-semibold">{titulo}</p>
      {dados.length === 0 ? (
        <p className="py-6 text-center text-sm text-(--color-text-weak)">Sem registros ativos.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[260px] text-left text-sm">
            <thead>
              <tr className="text-xs font-medium text-(--color-text-dim)">
                <th className="py-2 pr-3">Responsável</th>
                <th className="py-2 pr-3 text-right">Projetos</th>
                <th className="py-2 text-right">Atrasados</th>
              </tr>
            </thead>
            <tbody>
              {dados.map((r) => (
                <tr key={r.responsavel} className="border-t border-(--color-border)">
                  <td className="py-2 pr-3 text-(--color-text)">{r.responsavel}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-(--color-text)">{r.projetos}</td>
                  <td className="py-2 text-right tabular-nums" style={{ color: r.atrasados ? "var(--color-red)" : undefined }}>
                    {r.atrasados}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PainelConsolidado({ linhas }: { linhas: LinhaConsolidada[] }) {
  const semArt = excluirArts(linhas);
  const prest = semArt.filter((l) => l.origem === "prestadores");
  const cess = semArt.filter((l) => l.origem === "cessionarios");

  const totalPrest = prest.length;
  const totalCess = cess.length;
  const totalGeral = totalPrest + totalCess;

  const atrasadosPrest = prest.filter((l) => l.statusEntregaCalc === "ATRASADO").length;
  const atrasadosCess = cess.filter((l) => l.statusEntregaCalc === "ATRASADO").length;
  const totalAtrasados = atrasadosPrest + atrasadosCess;
  const pctNoPrazo = totalGeral > 0 ? Math.round((1000 * (totalGeral - totalAtrasados)) / totalGeral) / 10 : 0;

  const semPepPrest = prest.filter((l) => l.temPep === false).length;

  const hoje = hojeBr();
  const r1 = resumoIndicadoresAtraso(prest, hoje);
  const r2 = resumoIndicadoresAtraso(cess, hoje);
  const totalAtivos = r1.emAnalise + r2.emAnalise;
  const atrasadosEmAnalise = r1.atrasadosEmAnalise + r2.atrasadosEmAnalise;
  const pctAtrasadosEmAnalise = totalAtivos > 0 ? Math.round((1000 * atrasadosEmAnalise) / totalAtivos) / 10 : 0;

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Painel Geral Consolidado</h1>
      <p className="mt-1 max-w-2xl text-sm text-(--color-text-weak)">
        União das abas de Prestadores e Cessionários. Projetos CANCELADOS são rigorosamente excluídos.
      </p>

      <p className="mt-6 text-sm font-semibold text-(--color-text)">Panorama Operacional</p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CartaoKpi titulo="Projetos Ativos (Total)" valor={String(totalGeral)} cor="var(--color-navy)" />
        <CartaoKpi titulo="Prestadores Ativos" valor={String(totalPrest)} cor="var(--color-blue-2)" />
        <CartaoKpi titulo="Cessionários Ativos" valor={String(totalCess)} cor="var(--color-sky)" />
        <CartaoKpi titulo="Projetos sem PEP — Prestadores" valor={String(semPepPrest)} cor="var(--color-gold)" />
      </div>

      <p className="mt-6 text-sm font-semibold text-(--color-text)">Produção e Distribuição</p>
      <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
          <GraficoStatusDonut dados={contagemPorStatus(semArt)} />
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
          <GraficoTopResponsaveis dados={topResponsaveis(semArt)} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
          <GraficoEvolucaoMensal dados={evolucaoMensal(prest, cess)} />
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-5">
          <GraficoDisciplinaBarras dados={contagemPorDisciplina(semArt)} />
        </div>
      </div>

      <p className="mt-6 text-sm font-semibold text-(--color-text)">Resumo Sintético</p>
      <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TabelaResumo titulo="Prestadores" dados={resumoPorResponsavel(prest)} />
        <TabelaResumo titulo="Cessionários" dados={resumoPorResponsavel(cess)} />
      </div>

      <hr className="mt-8 border-(--color-border)" />
      <p className="mt-6 text-sm font-semibold text-(--color-text)">Acompanhamento de Prazos</p>
      <p className="mt-1 text-xs text-(--color-text-weak)">
        Situação de prazos e atrasos das análises ativas e concluídas — Prestadores e Cessionários.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <CartaoKpi titulo="Atrasados (Total)" valor={String(r1.totalAtrasados + r2.totalAtrasados)} cor="var(--color-red)" />
        <CartaoKpi titulo="Em Análise" valor={String(totalAtivos)} cor="var(--color-blue-2)" />
        <CartaoKpi titulo="% Dentro do Prazo" valor={`${pctNoPrazo}%`} cor={pctNoPrazo >= 80 ? "var(--color-green)" : pctNoPrazo >= 60 ? "var(--color-gold)" : "var(--color-red)"} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <CartaoKpi titulo="Dentro do Prazo" valor={String(r1.dentroPrazo + r2.dentroPrazo)} cor="var(--color-green)" />
        <CartaoKpi titulo="Próximos do Vencimento" valor={String(r1.proximoVencimento + r2.proximoVencimento)} cor="var(--color-gold)" />
        <CartaoKpi titulo="Atrasados em Análise" valor={String(atrasadosEmAnalise)} cor="var(--color-red)" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <CartaoKpi titulo="Concluídos no Prazo" valor={String(r1.concluidosNoPrazo + r2.concluidosNoPrazo)} cor="var(--color-green)" />
        <CartaoKpi titulo="Concluídos com Atraso" valor={String(r1.concluidosComAtraso + r2.concluidosComAtraso)} cor="var(--color-orange)" />
      </div>

      <p className="mt-4 text-xs text-(--color-text-dim)">
        {pctAtrasadosEmAnalise}% dos projetos ativos estão atrasados em análise ({r1.atrasadosEmAnalise} Prestadores · {r2.atrasadosEmAnalise} Cessionários).
        Total de projetos atrasados (ativos + concluídos com atraso): {r1.totalAtrasados + r2.totalAtrasados}.
      </p>

      <p className="mt-6 text-xs text-(--color-text-dim)">
        Exportação para Excel/CSV ainda não disponível nesta versão — use o sistema atual enquanto esse recurso não chega por aqui.
      </p>
    </div>
  );
}
