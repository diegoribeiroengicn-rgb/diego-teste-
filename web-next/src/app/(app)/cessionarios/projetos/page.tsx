import { buscarProjetosPaginado, listarDisciplinasDistintas } from "@/lib/projetos";
import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { TabelaProjetos } from "@/components/tabela-projetos";

const TAMANHOS_PAGINA = [30, 50, 100];
const TAMANHO_PADRAO = TAMANHOS_PAGINA[0];
const LIMITE_MAXIMO = 2000;

export default async function PaginaProjetosCessionarios({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; codigo?: string; entidade?: string; status?: string; disciplina?: string; de?: string; ate?: string; tamanho?: string; limite?: string }>;
}) {
  const sessao = await obterSessao();
  const sp = await searchParams;
  const busca = (sp.q || "").trim();
  const tamanho = TAMANHOS_PAGINA.includes(Number(sp.tamanho)) ? Number(sp.tamanho) : TAMANHO_PADRAO;
  const limiteParam = Number(sp.limite);
  const limite = Number.isFinite(limiteParam) && limiteParam >= tamanho ? Math.min(Math.floor(limiteParam), LIMITE_MAXIMO) : tamanho;

  const filtro = {
    termoResponsavel: busca,
    termoCodigo: (sp.codigo || "").trim(),
    termoEntidade: (sp.entidade || "").trim(),
    status: (sp.status || "").trim(),
    disciplina: (sp.disciplina || "").trim(),
    dataLimiteDe: (sp.de || "").trim(),
    dataLimiteAte: (sp.ate || "").trim(),
    analistaProprio: sessao?.analistaVinculado || null,
    limite,
  };
  const podeCadastrar = sessao ? await areaPermitida(sessao.id, sessao.perfil, "cessionarios.cadastrar") : false;
  const podeEditar = sessao ? await areaPermitida(sessao.id, sessao.perfil, "cessionarios.editar") : false;

  const [{ projetos, total }, disciplinas] = await Promise.all([
    buscarProjetosPaginado("cessionarios", filtro),
    listarDisciplinasDistintas("cessionarios"),
  ]);

  return (
    <TabelaProjetos
      titulo="Cessionários — Projetos"
      colunaEntidade="Cessionário"
      tabela="cessionarios"
      projetos={projetos}
      total={total}
      tamanho={tamanho}
      limite={limite}
      tamanhosPagina={TAMANHOS_PAGINA}
      disciplinas={disciplinas}
      filtros={{ q: busca, codigo: filtro.termoCodigo, entidade: filtro.termoEntidade, status: filtro.status, disciplina: filtro.disciplina, de: filtro.dataLimiteDe, ate: filtro.dataLimiteAte }}
      analistaProprio={sessao?.analistaVinculado || null}
      temAnalistaProprio={!!sessao?.analistaVinculado}
      podeCadastrar={podeCadastrar}
      podeEditar={podeEditar}
    />
  );
}
