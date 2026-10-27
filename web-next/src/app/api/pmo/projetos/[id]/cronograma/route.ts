import { NextRequest, NextResponse } from "next/server";
import { obterSessao } from "@/lib/session";
import { registrarAtividade } from "@/lib/atividades";
import { areaPermitida } from "@/lib/permissoes";
import { aplicarCpm, interpretarCronograma } from "@/lib/pmo-cronograma-import";
import { detectarFormatoCronograma, FORMATOS_INTERPRETAVEIS } from "@/lib/pmo-calculo";
import {
  anexarCronograma,
  listarArquivosCronograma,
  listarAtividadesCronograma,
  listarLembretesCronograma,
  obterCronogramaAtivo,
} from "@/lib/pmo";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "pmo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao PMO." }, { status: 403 });
  }

  const { id } = await params;
  const projetoId = Number(id);
  const [cronogramaAtivo, atividades, arquivos, lembretes] = await Promise.all([
    obterCronogramaAtivo(projetoId),
    listarAtividadesCronograma(projetoId),
    listarArquivosCronograma(projetoId),
    listarLembretesCronograma(projetoId),
  ]);

  return NextResponse.json({ cronogramaAtivo, atividades, arquivos, lembretes });
}

/** Recebe o arquivo via multipart/form-data (campo "arquivo"), detecta o
 * formato pela extensão, interpreta automaticamente quando possível
 * (Excel/XER — .mpp é aceito só como referência) e aplica o CPM antes de
 * gravar. Mesmo fluxo de views/pmo_projeto.py::_tab_cronograma. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  if (!(await areaPermitida(sessao.id, sessao.perfil, "pmo"))) {
    return NextResponse.json({ erro: "Acesso não autorizado ao PMO." }, { status: 403 });
  }

  const { id } = await params;
  const projetoId = Number(id);

  const formData = await req.formData();
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ erro: "Envie um arquivo de cronograma." }, { status: 400 });
  }

  try {
    const formato = detectarFormatoCronograma(arquivo.name);
    const conteudo = Buffer.from(await arquivo.arrayBuffer());
    const atividadesInterpretadas = FORMATOS_INTERPRETAVEIS.has(formato) ? await interpretarCronograma(formato, conteudo) : null;
    const atividadesComCpm = atividadesInterpretadas?.length ? aplicarCpm(atividadesInterpretadas) : null;

    await anexarCronograma(projetoId, arquivo.name, formato, conteudo, atividadesComCpm, sessao.username);
    void registrarAtividade(sessao.username, sessao.perfil, "PMO_CRONOGRAMA_ANEXADO", "pmo", `#${id}`);
    return NextResponse.json({
      ok: true,
      interpretado: !!atividadesComCpm,
      quantidadeAtividades: atividadesComCpm?.length ?? 0,
    });
  } catch (exc) {
    return NextResponse.json({ erro: exc instanceof Error ? exc.message : "Erro ao processar o cronograma." }, { status: 400 });
  }
}
