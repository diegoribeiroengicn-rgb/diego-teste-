import { connection } from "next/server";
import { buscarAtividades } from "@/lib/atividades";
import { TabelaAtividades } from "@/components/tabela-atividades";

export default async function PaginaHistoricoAtividades() {
  // Renderização por requisição: a página lê o banco, nunca no build.
  await connection();
  const atividades = await buscarAtividades();
  return <TabelaAtividades atividades={atividades} />;
}
