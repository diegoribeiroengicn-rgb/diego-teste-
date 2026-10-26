"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { PieLabelRenderProps } from "recharts";

const COR_CLASSIFICACAO: Record<string, string> = {
  EXCELENTE: "#16A34A",
  BOM: "#65A30D",
  REGULAR: "#D97706",
  BAIXO: "#EA580C",
  "CRÍTICO": "#DC2626",
};

const RADIAN = Math.PI / 180;

function posicaoRotuloInterno(p: PieLabelRenderProps): { x: number; y: number } {
  const cx = Number(p.cx ?? 0);
  const cy = Number(p.cy ?? 0);
  const raio = (Number(p.innerRadius ?? 0) + Number(p.outerRadius ?? 0)) / 2;
  const angulo = (Number(p.startAngle ?? 0) + Number(p.endAngle ?? 0)) / 2;
  return { x: cx + Math.cos(-RADIAN * angulo) * raio, y: cy + Math.sin(-RADIAN * angulo) * raio };
}

export function GraficoClassificacaoAvaliacoes({ dados }: { dados: { classificacao: string; quantidade: number }[] }) {
  const total = dados.reduce((s, d) => s + d.quantidade, 0);
  if (dados.length === 0) {
    return <p className="py-16 text-center text-sm text-(--color-text-weak)">Sem avaliações no período.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={dados}
          dataKey="quantidade"
          nameKey="classificacao"
          cx="50%"
          cy="42%"
          innerRadius="45%"
          outerRadius="78%"
          isAnimationActive={false}
          paddingAngle={1}
          label={(p: PieLabelRenderProps) => {
            const valor = Number((p.payload as { quantidade?: number } | undefined)?.quantidade ?? 0);
            if (!valor || !total) return null;
            const { x, y } = posicaoRotuloInterno(p);
            return (
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize={11}>
                {`${Math.round((1000 * valor) / total) / 10}%`}
              </text>
            );
          }}
          labelLine={false}
        >
          {dados.map((d) => (
            <Cell key={d.classificacao} fill={COR_CLASSIFICACAO[d.classificacao] ?? "#64748B"} stroke="none" />
          ))}
        </Pie>
        <Tooltip formatter={(valor: number, _nome, item) => [valor, item.payload.classificacao]} />
        <Legend layout="horizontal" align="center" verticalAlign="bottom" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
