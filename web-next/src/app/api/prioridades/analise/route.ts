import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { registrarAtividade } from "@/lib/atividades";
import { obterPool } from "@/lib/db";
import {
  definirPrioridadeAnalise, historicoPrioridade, marcadoresDaAnalise, podeVerContratual, prioridadeDaAnalise, removerPrioridadeAnalise,
} from "@/lib/prioridades";
import { slaContratual, vencimentoContratual } from "@/lib/prazos-calculo";

type Tabela = "prestadores" | "cessionarios";
const tabelaValida = (t: unknown): t is Tabela => t === "prestadores" || t === "cessionarios";

async function autorizar(tabela: Tabela) {
  const sessao = await obterSessao();
  if (!sessao) return { erro: NextResponse.json({ erro: "Sessão expirada." }, { status: 401 }) };
  if (!(await areaPermitida(sessao.id, sessao.perfil, `${tabela}.editar`))) {
    return { erro: NextResponse.json({ erro: "Acesso não autorizado a definir prioridades." }, { status: 403 }) };
  }
  return { sessao };
}

/** Dados do pop-up de prioridade da análise. O prazo contratual só é
 * devolvido a Gestor/Admin — o analista recebe apenas o operacional. */
export async function GET(req: NextRequest) {
  const tabela = req.nextUrl.searchParams.get("tabela");
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!tabelaValida(tabela) || !id) return NextResponse.json({ erro: "Parâmetros inválidos." }, { status: 400 });
  const a = await autorizar(tabela);
  if (a.erro) return a.erro;
  const ver = await podeVerContratual(a.sessao.id, a.sessao.perfil);
  const { rows } = await obterPool().query(`SELECT * FROM ${tabela} WHERE id = $1`, [id]);
  const r = rows[0];
  if (!r) return NextResponse.json({ erro: "Análise não encontrada." }, { status: 404 });
  const entidade = tabela === "prestadores" ? r.prestador : r.cessionario;
  const resposta: Record<string, unknown> = {
    analise: { codigo: r.codigo, entidade, disciplina: r.disciplina, revisao: r.revisao, dataSolicitacao: r.data_solicitacao, dataLimite: r.data_limite, status: r.status_analise },
    prioridade: await prioridadeDaAnalise(tabela, id, ver),
    historico: await historicoPrioridade(tabela, id),
    marcadores: await marcadoresDaAnalise(tabela, r.codigo, entidade),
    podeVerContratual: ver,
  };
  if (ver) {
    const sla = slaContratual(tabela, r.tipo ?? null, r.revisao ?? 0);
    resposta.contratual = { sla, vencimento: vencimentoContratual(r.data_solicitacao, sla) };
  }
  return NextResponse.json(resposta);
}

export async function PUT(req: NextRequest) {
  const c = (await req.json()) as { tabela: unknown; id: number; dataEntregaOperacional?: string; slaOperacionalDias?: number; justificativa?: string };
  if (!tabelaValida(c.tabela) || !c.id) return NextResponse.json({ erro: "Parâmetros inválidos." }, { status: 400 });
  const a = await autorizar(c.tabela);
  if (a.erro) return a.erro;
  try {
    const p = await definirPrioridadeAnalise({
      tabela: c.tabela, registroId: c.id, origem: "LISTAGEM", dataEntregaOperacional: c.dataEntregaOperacional ?? null,
      slaOperacionalDias: c.slaOperacionalDias ?? null, justificativa: c.justificativa ?? null,
    }, a.sessao.username);
    void registrarAtividade(a.sessao.username, a.sessao.perfil, "PRIORIDADE_DEFINIDA", c.tabela, `Análise #${c.id}: operacional ${p.vencimento_operacional}`);
    return NextResponse.json({ ok: true });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao definir a prioridade." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const c = (await req.json()) as { tabela: unknown; id: number };
  if (!tabelaValida(c.tabela) || !c.id) return NextResponse.json({ erro: "Parâmetros inválidos." }, { status: 400 });
  const a = await autorizar(c.tabela);
  if (a.erro) return a.erro;
  try {
    await removerPrioridadeAnalise(c.tabela, c.id, a.sessao.username);
    void registrarAtividade(a.sessao.username, a.sessao.perfil, "PRIORIDADE_REMOVIDA", c.tabela, `Análise #${c.id}`);
    return NextResponse.json({ ok: true });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao remover a prioridade." }, { status: 400 });
  }
}
