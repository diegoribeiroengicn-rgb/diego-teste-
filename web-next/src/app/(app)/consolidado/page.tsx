import { connection } from "next/server";
import { buscarLinhasConsolidado } from "@/lib/consolidado";
import { PainelConsolidado } from "@/components/painel-consolidado";

export default async function PaginaConsolidado() {
  // Renderização por requisição: a página lê o banco, nunca no build.
  await connection();
  const linhas = await buscarLinhasConsolidado();
  return <PainelConsolidado linhas={linhas} />;
}
