import { obterSessao } from "@/lib/session";
import { areaPermitida } from "@/lib/permissoes";
import { buscarAvaliacoesAnalistasEnriquecidas, buscarRelatorioGerencialAnalistas } from "@/lib/avaliacao-analista";
import { PainelAvaliacaoAnalistas } from "@/components/painel-avaliacao-analistas";

export default async function PaginaAvaliacaoAnalistas() {
  const sessao = await obterSessao();
  if (!sessao) return null;

  const podeVerNotas = await areaPermitida(sessao.id, sessao.perfil, "analistas.notas");
  if (!podeVerNotas) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-2xl font-semibold text-(--color-text)">Avaliação dos Analistas</h1>
        <p className="mt-3 rounded-xl border border-(--color-red)/30 bg-(--color-red)/10 px-4 py-3 text-sm text-(--color-red)">
          Acesso não autorizado a Analistas — Visualizar notas/avaliações. Solicite liberação ao administrador do sistema.
        </p>
      </div>
    );
  }

  const [podeAvaliar, podeVerRelatorios, avaliacoes] = await Promise.all([
    areaPermitida(sessao.id, sessao.perfil, "analistas.avaliar"),
    areaPermitida(sessao.id, sessao.perfil, "analistas.relatorios"),
    buscarAvaliacoesAnalistasEnriquecidas(),
  ]);

  const relatorioGerencial = podeVerRelatorios ? await buscarRelatorioGerencialAnalistas(avaliacoes) : [];

  return (
    <PainelAvaliacaoAnalistas
      avaliacoes={avaliacoes}
      relatorioGerencial={relatorioGerencial}
      podeAvaliar={podeAvaliar}
      podeVerRelatorios={podeVerRelatorios}
      perfil={sessao.perfil}
    />
  );
}
