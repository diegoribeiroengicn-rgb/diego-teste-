"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import type { AcumuladoMes, IndicadorDisciplina, IndicadorRevisao } from "@/lib/opr-cessionarios";
import { MESES_PT_ABREV } from "@/lib/meses";

// Mesma paleta institucional Tecnoplano do relatório em Python
// (gat/config.py::CORES) — fixa, não acompanha o tema claro/escuro, pois
// este é um relatório pensado para impressão/exportação (PDF/Word/PPTX),
// igual à versão Streamlit.
const COR_VERDE = "#16A34A";
const COR_DOURADO = "#D97706";
const COR_VERMELHO = "#DC2626";
const COR_AZUL_2 = "#2563EB";
const COR_ROXO = "#7C3AED";
const COR_TEXTO_DIM = "#94A3B8";
const COR_CEU = "#0284C7";
const COR_NAVY = "#1B3A8A";
const COR_TEXTO = "#0F172A";

const RADIAN = Math.PI / 180;

/** Posição no meio do anel do donut (entre innerRadius e outerRadius, no
 * ângulo médio do setor) — o `label` padrão do Recharts posiciona o texto
 * FORA do donut (outerRadius + offset), o que deixaria o texto branco
 * sobre o fundo branco do card; aqui o rótulo fica dentro da fatia
 * colorida, como no modelo de referência em Plotly. */
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

const CORES_DISCIPLINA: Record<string, string> = {
  ARQUITETURA: COR_VERDE,
  "ELÉTRICA": COR_DOURADO,
  HVAC: COR_ROXO,
  "INCÊNDIO": COR_VERMELHO,
  "HIDROSSANITÁRIO": COR_AZUL_2,
  "HIDROSSANTÁRIO": COR_AZUL_2,
  ESTRUTURA: COR_TEXTO_DIM,
  "ESTRUTURA (MC)": COR_TEXTO_DIM,
  ESTRUTURAS: COR_TEXTO_DIM,
};

function TituloGrafico({ children }: { children: React.ReactNode }) {
  return <p style={{ color: COR_NAVY }} className="mb-2 text-sm font-semibold">{children}</p>;
}

export function GraficoDisciplinas({ dados }: { dados: IndicadorDisciplina[] }) {
  return (
    <div>
      <TituloGrafico>Contribuição das Disciplinas</TituloGrafico>
      {dados.length === 0 ? (
        <p className="py-16 text-center text-sm text-(--color-text-weak)">Sem dados no período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={dados}
              dataKey="documentos"
              nameKey="disciplina"
              cx="50%"
              cy="42%"
              innerRadius="45%"
              outerRadius="78%"
              isAnimationActive={false}
              paddingAngle={1}
              label={(p: PieLabelRenderProps) => {
                const { x, y } = posicaoRotuloInterno(p);
                const percentual = (p.payload as { percentual?: number } | undefined)?.percentual ?? 0;
                return (
                  <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize={11}>
                    {`${percentual}%`}
                  </text>
                );
              }}
              labelLine={false}
            >
              {dados.map((d) => (
                <Cell key={d.disciplina} fill={CORES_DISCIPLINA[d.disciplina] ?? COR_CEU} stroke="none" />
              ))}
            </Pie>
            <Tooltip formatter={(valor: number, _nome, item) => [`${valor} (${item.payload.percentual}%)`, item.payload.disciplina]} />
            <Legend layout="horizontal" align="center" verticalAlign="bottom" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function GraficoRevisao({ dados }: { dados: IndicadorRevisao[] }) {
  const formatados = dados.map((d) => ({ ...d, rotulo: `R${String(d.revisao).padStart(2, "0")}` }));
  return (
    <div>
      <TituloGrafico>Projetos Liberados no Mês</TituloGrafico>
      {formatados.length === 0 ? (
        <p className="py-16 text-center text-sm text-(--color-text-weak)">Sem dados no período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={formatados} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="rotulo" tick={{ fontSize: 12, fill: COR_TEXTO }} axisLine={{ stroke: "var(--color-border)" }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: COR_TEXTO }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="total" name="Total" fill={COR_VERDE} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              <LabelList dataKey="total" position="top" style={{ fontSize: 12, fill: COR_TEXTO }} />
            </Bar>
            <Bar dataKey="com_substituicao" name="C/ Substituição" fill={COR_DOURADO} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              <LabelList dataKey="com_substituicao" position="top" style={{ fontSize: 12, fill: COR_TEXTO }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function GraficoLiberadoDonut({ liberados, naoLiberados }: { liberados: number; naoLiberados: number }) {
  const total = liberados + naoLiberados;
  const dados = [
    { nome: "LIBERADO", valor: liberados, cor: COR_VERDE },
    { nome: "NÃO LIBERADO", valor: naoLiberados, cor: COR_VERMELHO },
  ];
  return (
    <div>
      {total === 0 ? (
        <p className="py-16 text-center text-sm text-(--color-text-weak)">Sem dados no período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={dados}
              dataKey="valor"
              nameKey="nome"
              cx="50%"
              cy="42%"
              innerRadius="45%"
              outerRadius="78%"
              isAnimationActive={false}
              label={(p: PieLabelRenderProps) => {
                const valor = Number((p.payload as { valor?: number } | undefined)?.valor ?? 0);
                if (!valor) return null;
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
                <Cell key={d.nome} fill={d.cor} stroke="none" />
              ))}
            </Pie>
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

type RotuloTotalProps = { x?: string | number; y?: string | number; width?: string | number; index?: number };

function rotuloSeNaoZero(valor: React.ReactNode): React.ReactNode {
  return Number(valor) ? valor : "";
}

export function GraficoAcumulado({ dados, ano }: { dados: AcumuladoMes[]; ano: number }) {
  const formatados = dados.map((d) => ({ ...d, rotulo: MESES_PT_ABREV[d.mes - 1] }));

  function RotuloTotal({ x, y, width, index }: RotuloTotalProps) {
    if (x == null || y == null || width == null || index == null) return null;
    const total = formatados[index]?.total ?? 0;
    if (!total) return null;
    return (
      <text x={Number(x) + Number(width) / 2} y={Number(y) - 8} textAnchor="middle" fontSize={13} fontWeight={700} fill={COR_NAVY}>
        {total}
      </text>
    );
  }

  return (
    <div>
      <TituloGrafico>Acumulado do Ano de {ano}</TituloGrafico>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={formatados} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: COR_TEXTO }} axisLine={{ stroke: "var(--color-border)" }} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: COR_TEXTO }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="atrasado" name="Atrasado" stackId="pilha" fill={COR_VERMELHO} isAnimationActive={false}>
            <LabelList dataKey="atrasado" position="inside" formatter={rotuloSeNaoZero} style={{ fontSize: 11, fill: "#fff" }} />
          </Bar>
          <Bar dataKey="no_prazo" name="No Prazo" stackId="pilha" fill={COR_DOURADO} isAnimationActive={false}>
            <LabelList dataKey="no_prazo" position="inside" formatter={rotuloSeNaoZero} style={{ fontSize: 11, fill: "#fff" }} />
          </Bar>
          <Bar dataKey="adiantado" name="Adiantado" stackId="pilha" fill={COR_VERDE} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="adiantado" position="inside" formatter={rotuloSeNaoZero} style={{ fontSize: 11, fill: "#fff" }} />
            <LabelList content={RotuloTotal} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
