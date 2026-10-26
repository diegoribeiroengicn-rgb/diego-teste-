"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PieLabelRenderProps } from "recharts";
import {
  CLASSIFICACAO_ANTES_PRAZO,
  CLASSIFICACAO_COM_ATRASO,
  CLASSIFICACAO_NO_DIA,
  LABEL_CLASSIFICACAO,
  type LinhaConsolidadaAnalista,
  type LinhaPrazo,
} from "@/lib/kpis-prazo-calculo";

const COR_VERDE = "#16A34A";
const COR_DOURADO = "#D97706";
const COR_VERMELHO = "#DC2626";
const COR_NAVY = "#1B3A8A";
const COR_TEXTO = "#0F172A";

const COR_CLASSIFICACAO: Record<string, string> = {
  [CLASSIFICACAO_ANTES_PRAZO]: COR_VERDE,
  [CLASSIFICACAO_NO_DIA]: COR_DOURADO,
  [CLASSIFICACAO_COM_ATRASO]: COR_VERMELHO,
};

const RADIAN = Math.PI / 180;

function posicaoRotuloInterno(p: PieLabelRenderProps): { x: number; y: number } {
  const cx = Number(p.cx ?? 0);
  const cy = Number(p.cy ?? 0);
  const raio = (Number(p.innerRadius ?? 0) + Number(p.outerRadius ?? 0)) / 2;
  const angulo = (Number(p.startAngle ?? 0) + Number(p.endAngle ?? 0)) / 2;
  return { x: cx + Math.cos(-RADIAN * angulo) * raio, y: cy + Math.sin(-RADIAN * angulo) * raio };
}

function TituloGrafico({ children }: { children: React.ReactNode }) {
  return <p style={{ color: COR_NAVY }} className="mb-2 text-sm font-semibold">{children}</p>;
}

function SemDados() {
  return <p className="py-16 text-center text-sm text-(--color-text-weak)">Sem entregas concluídas no período.</p>;
}

export function GraficoClassificacaoPrazo({ linhas, titulo }: { linhas: LinhaPrazo[]; titulo: string }) {
  const contagem = [CLASSIFICACAO_ANTES_PRAZO, CLASSIFICACAO_NO_DIA, CLASSIFICACAO_COM_ATRASO]
    .map((c) => ({ classificacao: c, quantidade: linhas.filter((l) => l.classificacaoEntrega === c).length }))
    .filter((c) => c.quantidade > 0);
  const total = contagem.reduce((s, c) => s + c.quantidade, 0);

  return (
    <div>
      <TituloGrafico>{titulo}</TituloGrafico>
      {contagem.length === 0 ? (
        <SemDados />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={contagem}
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
              {contagem.map((c) => (
                <Cell key={c.classificacao} fill={COR_CLASSIFICACAO[c.classificacao]} stroke="none" />
              ))}
            </Pie>
            <Tooltip formatter={(valor: number, _nome, item) => [valor, LABEL_CLASSIFICACAO[item.payload.classificacao as keyof typeof LABEL_CLASSIFICACAO]]} />
            <Legend
              layout="horizontal"
              align="center"
              verticalAlign="bottom"
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(valor: string) => LABEL_CLASSIFICACAO[valor as keyof typeof LABEL_CLASSIFICACAO] ?? valor}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function GraficoRankingCumprimento({ tabela }: { tabela: LinhaConsolidadaAnalista[] }) {
  const dados = [...tabela].sort((a, b) => b.pctCumprimentoPrazo - a.pctCumprimentoPrazo).reverse();
  return (
    <div>
      <TituloGrafico>Ranking — % Cumprimento do Prazo</TituloGrafico>
      {dados.length === 0 ? (
        <SemDados />
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(220, dados.length * 34)}>
          <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke="var(--color-border)" />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: COR_TEXTO }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="analista" width={110} tick={{ fontSize: 11, fill: COR_TEXTO }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(valor: number) => `${valor}%`} />
            <Bar dataKey="pctCumprimentoPrazo" name="% Cumprimento" fill={COR_NAVY} radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function GraficoAtrasadosPorAnalista({ tabela }: { tabela: LinhaConsolidadaAnalista[] }) {
  const dados = [...tabela].sort((a, b) => b.atrasadosEmAnalise - a.atrasadosEmAnalise).filter((d) => d.atrasadosEmAnalise > 0);
  return (
    <div>
      <TituloGrafico>Atrasados em Análise por Analista</TituloGrafico>
      {dados.length === 0 ? (
        <p className="py-10 text-center text-sm text-(--color-text-weak)">Nenhum analista com análises atrasadas.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={dados} margin={{ top: 20, right: 8, left: 0, bottom: 28 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="analista" tick={{ fontSize: 10, fill: COR_TEXTO }} axisLine={{ stroke: "var(--color-border)" }} tickLine={false} angle={-35} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 12, fill: COR_TEXTO }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="atrasadosEmAnalise" name="Atrasados" fill={COR_VERMELHO} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
