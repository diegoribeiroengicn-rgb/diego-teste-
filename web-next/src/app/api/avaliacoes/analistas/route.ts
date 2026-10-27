import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { inserirAvaliacaoAnalista, type DadosAvaliacaoAnalista } from "@/lib/avaliacao-analista";

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "analistas.avaliar"))) {
    return NextResponse.json({ erro: "Acesso não autorizado a Analistas — Inserir/editar avaliações." }, { status: 403 });
  }

  const dados = (await req.json()) as DadosAvaliacaoAnalista;
  if (!dados.analista?.trim() || !dados.mes || !dados.ano) {
    return NextResponse.json({ erro: "Preencha analista, mês e ano de referência." }, { status: 400 });
  }
  dados.avaliador = sessao.username;

  try {
    const id = await inserirAvaliacaoAnalista(dados, sessao.username);
    void registrarAtividade(sessao.username, sessao.perfil, "NOVA_AVALIACAO_ANALISTA", "analistas", `${dados.analista} — ${dados.mes}/${dados.ano}`);
    return NextResponse.json({ id });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao salvar avaliação." }, { status: 500 });
  }
}
