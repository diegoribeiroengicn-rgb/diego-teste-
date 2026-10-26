import { obterSessao } from "@/lib/session";
import {
  listarConfirmacoesLeituraManual,
  listarManualCapitulos,
  listarManualVersoes,
  usuarioConfirmouLeituraManual,
  versaoAtivaManual,
} from "@/lib/manual-sistema";
import { LeitorManual } from "@/components/leitor-manual";
import { AdminManual } from "@/components/admin-manual";

const PERFIS_PODEM_ADMINISTRAR = ["ADMIN", "GESTOR"];

export default async function PaginaManualSistema() {
  const sessao = await obterSessao();
  const podeAdministrar = !!sessao && PERFIS_PODEM_ADMINISTRAR.includes(sessao.perfil);

  const [capitulosLeitura, versao] = await Promise.all([
    listarManualCapitulos(sessao?.perfil ?? null),
    versaoAtivaManual(),
  ]);
  const jaConfirmou = versao && sessao ? await usuarioConfirmouLeituraManual(sessao.username, versao.numeroVersao) : true;

  let capitulosAdmin = capitulosLeitura;
  let versoes: Awaited<ReturnType<typeof listarManualVersoes>> = [];
  let confirmacoes: Awaited<ReturnType<typeof listarConfirmacoesLeituraManual>> = [];
  if (podeAdministrar) {
    [capitulosAdmin, versoes, confirmacoes] = await Promise.all([
      listarManualCapitulos(null),
      listarManualVersoes(),
      versao ? listarConfirmacoesLeituraManual(versao.numeroVersao) : Promise.resolve([]),
    ]);
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-(--color-text)">Manual do Sistema</h1>
      <LeitorManual capitulos={capitulosLeitura} versaoAtiva={versao} jaConfirmou={jaConfirmou} />

      {podeAdministrar && (
        <AdminManual
          capitulos={capitulosAdmin}
          versoes={versoes}
          versaoAtivaNumero={versao?.numeroVersao ?? null}
          confirmacoes={confirmacoes}
        />
      )}
    </div>
  );
}
