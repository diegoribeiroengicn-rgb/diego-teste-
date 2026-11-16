import { connection } from "next/server";
import { PainelConsultaAts } from "@/components/mobile/painel-consulta-ats";

export default async function PaginaMobileAts() {
  // Renderização por requisição: a página lê o banco, nunca no build.
  await connection();
  return <PainelConsultaAts />;
}
