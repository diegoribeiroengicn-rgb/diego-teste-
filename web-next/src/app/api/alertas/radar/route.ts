import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import {
  adiarAlerta,
  iniciarTratamentoAlerta,
  marcarTratadoAlerta,
  reabrirAlerta,
  retirarDoRadar,
} from "@/lib/alertas-engine";
import type { Origem, TipoAlerta } from "@/lib/alertas-engine-calculo";

type Corpo = {
  acao: "tratar" | "concluir" | "adiar" | "retirar" | "reabrir";
  modulo: Origem;
  projetoId: number;
  tipoAlerta: TipoAlerta;
  providencia?: string;
  responsavel?: string;
  observacao?: string | null;
  adiadoPara?: string | null;
  justificativa?: string;
};

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }

  const corpo = (await req.json()) as Corpo;
  if (!corpo.modulo || !corpo.projetoId || !corpo.tipoAlerta || !corpo.acao) {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }

  try {
    switch (corpo.acao) {
      case "tratar":
        await iniciarTratamentoAlerta(corpo.modulo, corpo.projetoId, corpo.tipoAlerta, sessao.username);
        break;
      case "concluir":
        if (!corpo.providencia?.trim() || !corpo.responsavel?.trim()) {
          return NextResponse.json({ erro: "Informe a providência tomada e o responsável." }, { status: 400 });
        }
        await marcarTratadoAlerta(corpo.modulo, corpo.projetoId, corpo.tipoAlerta, corpo.providencia.trim(), corpo.responsavel.trim(), corpo.observacao?.trim() || null, sessao.username);
        break;
      case "adiar":
        await adiarAlerta(corpo.modulo, corpo.projetoId, corpo.tipoAlerta, corpo.adiadoPara || null, corpo.observacao?.trim() || null, sessao.username);
        break;
      case "retirar":
        if (!corpo.justificativa?.trim()) {
          return NextResponse.json({ erro: "Informe a justificativa para retirar do radar." }, { status: 400 });
        }
        await retirarDoRadar(corpo.modulo, corpo.projetoId, corpo.tipoAlerta, corpo.justificativa.trim(), sessao.username);
        break;
      case "reabrir":
        await reabrirAlerta(corpo.modulo, corpo.projetoId, corpo.tipoAlerta, sessao.username);
        break;
      default:
        return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao atualizar o alerta." }, { status: 500 });
  }
}
