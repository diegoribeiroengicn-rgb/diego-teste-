"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PieLabelRenderProps } from "recharts";
import type { ConsolidadoEntidade, IntervaloRevisao, SituacaoSlaExterno } from "@/lib/revisoes-calculo";
import { MESES_PT_ABREV } from "@/lib/meses";

const COR_VERDE = "#16A34A";
const COR_DOURADO = "#D97706";
const COR_LARANJA = "#EA580C";
const COR_VERMELHO = "#DC2626";
const COR_ROXO = "#7C3AED";
const COR_TEXTO_DIM = "#94A3B8";
const COR_NAVY = "#1B3A8A";
const COR_TEXTO = "#0F172A";

const COR_SITUACAO: Record<SituacaoSlaExterno, string> = {
  "DENTRO DO SLA": COR_VERDE,
  "PRÓXIMO DO LIMITE": COR_DOURADO,
  "NO LIMITE": COR_LARANJA,
  "FORA DO SLA": COR_VERMELHO,
  "AGUARDANDO NOVA REVISÃO": COR_TEXTO_DIM,
  "DATA INCONSISTENTE": COR_ROXO,
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
  return <p className="py-16 text-center text-sm text-(--color-text-weak)">Sem intervalos calculados.</p>;
}

export function GraficoSituacaoSlaExterno({ intervalos }: { intervalos: IntervaloRevisao[] }) {
  const mapa = new Map<SituacaoSlaExterno, number>();
  for (const i of intervalos) mapa.set(i.situacaoSla, (mapa.get(i.situacaoSla) ?? 0) + 1);
  const dados = [...mapa.entries()].map(([situacao, quantidade]) => ({ situacao, quantidade }));
  const total = dados.reduce((s, d) => s + d.quantidade, 0);

  return (
    <div>
      <TituloGrafico>Situação do SLA Externo</TituloGrafico>
      {dados.length === 0 ? (
        <SemDados />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={dados} dataKey="quantidade" nameKey="situacao" cx="50%" cy="42%"
              innerRadius="45%" outerRadius="78%" isAnimationActive={false} paddingAngle={1}
              label={(p: PieLabelRenderProps) => {
                const valor = Number((p.payload as { quantidade?: number } | undefined)?.quantidade ?? 0);
                if (!valor || !total) return null;
                const { x, y } = posicaoRotuloInterno(p);
                return <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize={11}>{`${Math.round((1000 * valor) / total) / 10}%`}</text>;
              }}
              labelLine={false}
            >
              {dados.map((d) => <Cell key={d.situacao} fill={COR_SITUACAO[d.situacao]} stroke="none" />)}
            </Pie>
            <Tooltip formatter={(valor: number, _nome, item) => [valor, item.payload.situacao]} />
            <Legend layout="horizontal" align="center" verticalAlign="bottom" wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function GraficoEvolucaoMensalRetorno({ intervalos }: { intervalos: IntervaloRevisao[] }) {
  const mapa = new Map<string, { chave: string; mes: number; ano: number; soma: number; qtd: number }>();
  for (const i of intervalos) {
    if (!i.dataEntradaAtual || i.diasUteisRetorno == null) continue;
    const d = new Date(i.dataEntradaAtual);
    if (Number.isNaN(d.getTime())) continue;
    const ano = d.getUTCFullYear();
    const mes = d.getUTCMonth() + 1;
    const chave = `${ano}-${String(mes).padStart(2, "0")}`;
    const ponto = mapa.get(chave) ?? { chave, mes, ano, soma: 0, qtd: 0 };
    ponto.soma += i.diasUteisRetorno;
    ponto.qtd += 1;
    mapa.set(chave, ponto);
  }
  const dados = [...mapa.values()]
    .sort((a, b) => (a.chave < b.chave ? -1 : 1))
    .map((p) => ({ rotulo: `${MESES_PT_ABREV[p.mes - 1]}/${String(p.ano).slice(2)}`, mediaDias: Math.round((p.soma / p.qtd) * 10) / 10 }));

  return (
    <div>
      <TituloGrafico>Evolução Mensal — Tempo Médio de Retorno Externo</TituloGrafico>
      {dados.length === 0 ? (
        <SemDados />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={dados} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: COR_TEXTO }} axisLine={{ stroke: "var(--color-border)" }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: COR_TEXTO }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: number) => `${v} dias úteis`} />
            <Bar dataKey="mediaDias" name="Média (dias úteis)" fill={COR_NAVY} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function GraficoProjetosPorRevisao({ intervalos }: { intervalos: IntervaloRevisao[] }) {
  const mapa = new Map<number, number>();
  for (const i of intervalos) mapa.set(i.revisaoAtual, (mapa.get(i.revisaoAtual) ?? 0) + 1);
  const dados = [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([rev, total]) => ({ rotulo: `R${String(rev).padStart(2, "0")}`, total }));

  return (
    <div>
      <TituloGrafico>Projetos por Revisão</TituloGrafico>
      {dados.length === 0 ? (
        <SemDados />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={dados} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="rotulo" tick={{ fontSize: 12, fill: COR_TEXTO }} axisLine={{ stroke: "var(--color-border)" }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: COR_TEXTO }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="total" name="Intervalos" fill={COR_NAVY} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function GraficoTopAtrasoEntidades({ consolidado }: { consolidado: ConsolidadoEntidade[] }) {
  const dados = [...consolidado]
    .filter((c) => c.mediaDias != null)
    .sort((a, b) => (b.mediaDias ?? 0) - (a.mediaDias ?? 0))
    .slice(0, 10)
    .reverse()
    .map((c) => ({ rotulo: c.codigo || c.nome || "—", mediaDias: c.mediaDias ?? 0 }));

  return (
    <div>
      <TituloGrafico>Top 10 — Maior Tempo Médio de Retorno</TituloGrafico>
      {dados.length === 0 ? (
        <SemDados />
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(220, dados.length * 30)}>
          <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke="var(--color-border)" />
            <XAxis type="number" tick={{ fontSize: 11, fill: COR_TEXTO }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="rotulo" width={100} tick={{ fontSize: 11, fill: COR_TEXTO }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: number) => `${v} dias úteis`} />
            <Bar dataKey="mediaDias" name="Média (dias úteis)" fill={COR_VERMELHO} radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
