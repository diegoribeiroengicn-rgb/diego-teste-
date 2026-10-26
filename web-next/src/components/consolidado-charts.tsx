"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import type { ContagemCategoria, PontoEvolucaoMensal } from "@/lib/consolidado-calculo";
import { MESES_PT_ABREV } from "@/lib/meses";

// Mesma paleta institucional Tecnoplano do relatório em Python (gat/config.py::CORES).
const COR_VERDE = "#16A34A";
const COR_LIMA = "#65A30D";
const COR_DOURADO = "#D97706";
const COR_LARANJA = "#EA580C";
const COR_VERMELHO = "#DC2626";
const COR_AZUL_2 = "#2563EB";
const COR_ROXO = "#7C3AED";
const COR_TEXTO_DIM = "#94A3B8";
const COR_TEXTO_FRACO = "#64748B";
const COR_NAVY = "#1B3A8A";
const COR_TEXTO = "#0F172A";

const SEQUENCIA_GRAFICOS = [COR_NAVY, COR_AZUL_2, "#0284C7", COR_VERDE, COR_DOURADO, COR_LARANJA, COR_ROXO, COR_LIMA, COR_VERMELHO];

const CORES_STATUS_ANALISE: Record<string, string> = {
  "EM ANÁLISE": COR_AZUL_2,
  LIBERADO: COR_VERDE,
  "LIBERADO C/ REST.": COR_LIMA,
  "NÃO LIBERADO": COR_LARANJA,
  "EM HOLD": COR_DOURADO,
  "RIOGALEÃO": COR_ROXO,
  OBSOLETO: COR_TEXTO_DIM,
  CANCELADO: COR_TEXTO_FRACO,
};

const RADIAN = Math.PI / 180;

function posicaoRotuloInterno(p: PieLabelRenderProps): { x: number; y: number } {
  const cx = Number(p.cx ?? 0);
  const cy = Number(p.cy ?? 0);
  const raio = (Number(p.innerRadius ?? 0) + Number(p.outerRadius ?? 0)) / 2;
  const angulo = (Number(p.startAngle ?? 0) + Number(p.endAngle ?? 0)) / 2;
  return {
    x: cx + Math.cos(-RADIAN * angulo) * raio,
    y: cy + Math.sin(-RADIAN * angulo) * raio,
  };
}

function TituloGrafico({ children }: { children: React.ReactNode }) {
  return <p style={{ color: COR_NAVY }} className="mb-2 text-sm font-semibold">{children}</p>;
}

function SemDados() {
  return <p className="py-16 text-center text-sm text-(--color-text-weak)">Sem registros ativos.</p>;
}

export function GraficoStatusDonut({ dados }: { dados: ContagemCategoria[] }) {
  const total = dados.reduce((s, d) => s + d.quantidade, 0);
  return (
    <div>
      <TituloGrafico>Distribuição por Status de Análise</TituloGrafico>
      {dados.length === 0 ? (
        <SemDados />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={dados}
              dataKey="quantidade"
              nameKey="categoria"
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
              {dados.map((d, i) => (
                <Cell key={d.categoria} fill={CORES_STATUS_ANALISE[d.categoria] ?? SEQUENCIA_GRAFICOS[i % SEQUENCIA_GRAFICOS.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip formatter={(valor: number, _nome, item) => [valor, item.payload.categoria]} />
            <Legend layout="horizontal" align="center" verticalAlign="bottom" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function GraficoTopResponsaveis({ dados }: { dados: ContagemCategoria[] }) {
  const formatados = [...dados].reverse();
  return (
    <div>
      <TituloGrafico>Volume por Responsável</TituloGrafico>
      {dados.length === 0 ? (
        <SemDados />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={formatados} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke="var(--color-border)" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: COR_TEXTO }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="categoria" width={110} tick={{ fontSize: 11, fill: COR_TEXTO }} axisLine={false} tickLine={false} />
            <Tooltip />
            <Bar dataKey="quantidade" name="Projetos" fill={COR_NAVY} radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function GraficoEvolucaoMensal({ dados }: { dados: PontoEvolucaoMensal[] }) {
  const formatados = dados.map((d) => ({ ...d, rotulo: `${MESES_PT_ABREV[d.mes - 1]}/${String(d.ano).slice(2)}` }));
  return (
    <div>
      <TituloGrafico>Evolução Mensal — Projetos Analisados</TituloGrafico>
      {formatados.length === 0 ? (
        <SemDados />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={formatados} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: COR_TEXTO }} axisLine={{ stroke: "var(--color-border)" }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: COR_TEXTO }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="prestadores" name="Prestadores" fill={COR_NAVY} isAnimationActive={false} />
            <Bar dataKey="cessionarios" name="Cessionários" fill={COR_AZUL_2} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function GraficoDisciplinaBarras({ dados }: { dados: ContagemCategoria[] }) {
  return (
    <div>
      <TituloGrafico>Projetos por Disciplina</TituloGrafico>
      {dados.length === 0 ? (
        <SemDados />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dados} margin={{ top: 4, right: 8, left: 0, bottom: 48 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="categoria" tick={{ fontSize: 9, fill: COR_TEXTO }} axisLine={{ stroke: "var(--color-border)" }} tickLine={false} angle={-60} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 12, fill: COR_TEXTO }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="quantidade" name="Projetos" fill={COR_NAVY} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
