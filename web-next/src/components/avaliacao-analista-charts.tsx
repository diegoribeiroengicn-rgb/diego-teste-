"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MESES_PT_ABREV } from "@/lib/meses";

const COR_NAVY = "#1B3A8A";
const COR_TEXTO = "#0F172A";

export type PontoEvolucaoNota = { ano: number; mes: number; mediaFinal: number };

function TituloGrafico({ children }: { children: React.ReactNode }) {
  return <p style={{ color: COR_NAVY }} className="mb-2 text-sm font-semibold">{children}</p>;
}

export function GraficoEvolucaoNotaFinal({ dados }: { dados: PontoEvolucaoNota[] }) {
  const formatados = dados.map((d) => ({ ...d, rotulo: `${MESES_PT_ABREV[d.mes - 1]}/${String(d.ano).slice(2)}` }));
  return (
    <div>
      <TituloGrafico>Evolução mensal (nota final)</TituloGrafico>
      {formatados.length === 0 ? (
        <p className="py-16 text-center text-sm text-(--color-text-weak)">Sem avaliações no período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={formatados} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: COR_TEXTO }} axisLine={{ stroke: "var(--color-border)" }} tickLine={false} />
            <YAxis domain={[0, 5]} tick={{ fontSize: 12, fill: COR_TEXTO }} axisLine={false} tickLine={false} />
            <Tooltip />
            <Line type="monotone" dataKey="mediaFinal" name="Nota final (média)" stroke={COR_NAVY} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
