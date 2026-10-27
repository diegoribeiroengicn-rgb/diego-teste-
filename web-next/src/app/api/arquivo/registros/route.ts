import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { CATEGORIAS, perfilPodeArquivarERestaurar, perfilPodeExcluirDefinitivamente } from "@/lib/arquivo-calculo";
import { excluirDefinitivamente, listarArquivados, listarCodigosGatArquivados, restaurarRegistro } from "@/lib/arquivo";

export async function GET(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "arquivo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao módulo Arquivo." }, { status: 403 });
  }

  const chave = req.nextUrl.searchParams.get("categoria");
  const categoria = CATEGORIAS.find((c) => c.chave === chave);
  if (!categoria || categoria.reservada) {
    return NextResponse.json({ erro: "Categoria inválida." }, { status: 400 });
  }

  if (categoria.granularidade === "projeto_codigo") {
    const projetos = await listarCodigosGatArquivados();
    return NextResponse.json({ projetos });
  }

  if (categoria.chave === "analises") {
    const [prestadores, cessionarios] = await Promise.all([listarArquivados("prestadores"), listarArquivados("cessionarios")]);
    return NextResponse.json({
      registros: [
        ...prestadores.map((r) => ({ ...r, _tabela: "prestadores" })),
        ...cessionarios.map((r) => ({ ...r, _tabela: "cessionarios" })),
      ],
    });
  }

  const registros = await listarArquivados(categoria.tabela!);
  return NextResponse.json({ registros: registros.map((r) => ({ ...r, _tabela: categoria.tabela })) });
}

type Corpo = {
  acao: "restaurar" | "excluir";
  tabela: string;
  registroId: number;
  justificativa?: string;
};

/** O módulo Arquivo só restaura e exclui definitivamente — arquivar um
 * registro ativo é ação de cada módulo de origem (ex.: Administração
 * para usuários), nunca desta tela. Mesmo escopo de views/arquivo.py,
 * que também nunca chama arquivar_registro. */
export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "arquivo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao módulo Arquivo." }, { status: 403 });
  }

  const dados = (await req.json()) as Corpo;

  try {
    if (dados.acao === "excluir") {
      if (!perfilPodeExcluirDefinitivamente(sessao.perfil)) {
        return NextResponse.json({ erro: "Exclusão definitiva é restrita a Administrador e Gestor." }, { status: 403 });
      }
      await excluirDefinitivamente(dados.tabela, dados.registroId, sessao.username, dados.justificativa ?? "");
      void registrarAtividade(sessao.username, sessao.perfil, "EXCLUSAO_DEFINITIVA_ARQUIVO", "arquivo", `${dados.tabela}#${dados.registroId}`);
      return NextResponse.json({ ok: true });
    }

    if (!perfilPodeArquivarERestaurar(sessao.perfil)) {
      return NextResponse.json({ erro: "Acesso não autorizado a restaurar registros." }, { status: 403 });
    }
    await restaurarRegistro(dados.tabela, dados.registroId, sessao.username, dados.justificativa ?? null);
    void registrarAtividade(sessao.username, sessao.perfil, "RESTAURACAO", "arquivo", `${dados.tabela}#${dados.registroId}`);
    return NextResponse.json({ ok: true });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao processar a operação." }, { status: 500 });
  }
}
