import Link from "next/link";
import type { LinhaLocalizacao } from "@/lib/localizacao-ats-calculo";
import type { Atividade } from "@/lib/atividades";
import {
  ROTULO_VER, DIAS_SEM_MOVIMENTO, REVISOES_CRITICAS, calcularIndicadores, cargaPorAnalista, distribuicaoSla, filtrarLinhas, percentualSla,
  recentes, selecionar, ultimaMovimentacao, type ChaveVer, type FiltrosPainel, type LinhaDistribuicao,
} from "@/lib/painel-governanca-calculo";
import { STATUS_ANALISE_OPCOES } from "@/lib/administracao-calculo";

const rotulos: Record<string, string> = {
  de: "de", ate: "ate", codigo: "codigo", prestador: "prestador", disciplina: "disciplina", analista: "analista", status: "status", modulo: "modulo",
};

function href(f: FiltrosPainel, extra: Record<string, string | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(rotulos[k], v);
  for (const [k, v] of Object.entries(extra)) { if (v) p.set(k, v); else p.delete(k); }
  const q = p.toString();
  return q ? `/inicio?${q}` : "/inicio";
}

const fmtData = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("pt-BR");
};
const fmtDataHora = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString("pt-BR");
};

const COR_STATUS: Record<string, string> = {
  "EM ANÁLISE": "bg-(--color-blue-3) text-(--color-blue-2)", "EM HOLD": "bg-(--color-orange-bg) text-(--color-orange)",
  LIBERADO: "bg-(--color-green-bg) text-(--color-green)", "LIBERADO C/ REST.": "bg-(--color-green-bg) text-(--color-green)",
  "NÃO LIBERADO": "bg-(--color-red-bg) text-(--color-red)",
};

function Cartao({ titulo, valor, detalhe, tom, destino, ativo }: { titulo: string; valor: string; detalhe?: string; tom?: "red" | "orange" | "green" | "navy"; destino: string; ativo?: boolean }) {
  const cor = tom === "red" ? "text-(--color-red)" : tom === "orange" ? "text-(--color-orange)" : tom === "green" ? "text-(--color-green)" : "text-(--color-navy)";
  return (
    <Link href={destino} className={`block rounded-2xl border bg-(--color-surface-1) px-4 py-3.5 transition-colors hover:bg-(--color-surface-2) ${ativo ? "border-(--color-navy) ring-2 ring-(--color-navy)/20" : "border-(--color-border)"}`}>
      <p className="text-xs text-(--color-text-weak)">{titulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${cor}`}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-[0.7rem] text-(--color-text-dim)">{detalhe}</p>}
    </Link>
  );
}

function Secao({ titulo, children, nota }: { titulo: string; children: React.ReactNode; nota?: string }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-(--color-navy)">{titulo}</h2>
      {nota && <p className="mt-0.5 text-xs text-(--color-text-dim)">{nota}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function TabelaLinhas({ linhas, vazio }: { linhas: LinhaLocalizacao[]; vazio: string }) {
  if (!linhas.length) return <p className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) px-5 py-8 text-center text-sm text-(--color-text-weak)">{vazio}</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs font-medium text-(--color-text-dim)">
            <th className="px-3 py-2.5">Código</th><th className="px-3 py-2.5">Prestador / Cessionário</th><th className="px-3 py-2.5">Disciplina</th>
            <th className="px-3 py-2.5">AT · Rev.</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Prazo</th>
            <th className="px-3 py-2.5">Última mov.</th><th className="px-3 py-2.5">Responsável</th><th className="px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={`${l.modulo}-${l.id}`} className="border-t border-(--color-border)">
              <td className="px-3 py-2.5 font-medium text-(--color-text)">{l.codigo || "—"}</td>
              <td className="px-3 py-2.5 text-(--color-text)">
                <span className={`mr-1.5 rounded-full px-1.5 py-0.5 text-[0.65rem] font-medium ${l.modulo === "prestadores" ? "bg-(--color-blue-3) text-(--color-blue-2)" : "bg-(--color-purple-bg) text-(--color-purple)"}`}>{l.modulo === "prestadores" ? "P" : "C"}</span>
                {l.nome || "—"}
              </td>
              <td className="px-3 py-2.5 text-(--color-text-weak)">{l.disciplina || "—"}</td>
              <td className="px-3 py-2.5 whitespace-nowrap text-(--color-text-weak)">{l.numAt || "—"} · R{String(l.revisao).padStart(2, "0")}</td>
              <td className="px-3 py-2.5"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${COR_STATUS[l.statusAnalise] ?? "bg-(--color-surface-2) text-(--color-text-weak)"}`}>{l.statusAnalise}</span></td>
              <td className="px-3 py-2.5 whitespace-nowrap text-(--color-text-weak)">{fmtData(l.dataLimite)}{l.diasRestantes != null && l.statusAnalise === "EM ANÁLISE" ? ` (${l.diasRestantes} du)` : ""}</td>
              <td className="px-3 py-2.5 whitespace-nowrap text-(--color-text-weak)">{fmtData(ultimaMovimentacao(l))}</td>
              <td className="px-3 py-2.5 text-(--color-text-weak)">{l.responsavel || "—"}</td>
              <td className="px-3 py-2.5"><Link href={`/${l.modulo}/analise/${l.id}`} className="whitespace-nowrap rounded-full border border-(--color-border) px-3 py-1 text-xs font-medium text-(--color-navy) hover:bg-(--color-surface-2)">Abrir</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarraSla({ d }: { d: LinhaDistribuicao }) {
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-(--color-surface-2)">
      {d.dentro > 0 && <div className="bg-(--color-green)" style={{ flexGrow: d.dentro }} />}
      {d.proximo > 0 && <div className="bg-(--color-orange)" style={{ flexGrow: d.proximo }} />}
      {d.vencido > 0 && <div className="bg-(--color-red)" style={{ flexGrow: d.vencido }} />}
    </div>
  );
}

function TabelaDistribuicao({ titulo, dados, hrefLinha }: { titulo: string; dados: LinhaDistribuicao[]; hrefLinha?: (chave: string) => string }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-4">
      <p className="text-xs font-semibold text-(--color-text)">{titulo}</p>
      {dados.length === 0 ? <p className="mt-3 text-xs text-(--color-text-weak)">Nenhuma análise em aberto.</p> : (
        <div className="mt-3 space-y-2.5">
          {dados.slice(0, 12).map((d) => (
            <div key={d.chave}>
              <div className="flex items-center justify-between gap-2 text-xs">
                {hrefLinha ? <Link href={hrefLinha(d.chave)} className="truncate font-medium text-(--color-navy) hover:underline">{d.chave}</Link> : <span className="truncate text-(--color-text)">{d.chave}</span>}
                <span className="shrink-0 tabular-nums text-(--color-text-weak)">
                  <span className="text-(--color-green)">{d.dentro}</span> · <span className="text-(--color-orange)">{d.proximo}</span> · <span className="text-(--color-red)">{d.vencido}</span>
                </span>
              </div>
              <div className="mt-1"><BarraSla d={d} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const input = "rounded-full border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-xs text-(--color-text) outline-none focus:border-(--color-navy)";

export function PainelGovernanca({
  primeiroNome, linhas, filtros, ver, busca, atividades, agora,
}: {
  primeiroNome: string; linhas: LinhaLocalizacao[]; filtros: FiltrosPainel; ver: ChaveVer | null; busca: string; atividades: Atividade[]; agora: number;
}) {
  const base = filtrarLinhas(linhas, filtros);
  const ind = calcularIndicadores(base, agora);
  const pctSla = percentualSla(base);
  const porDisciplina = distribuicaoSla(base, "disciplina");
  const porAnalista = distribuicaoSla(base, "responsavel");
  const equipe = cargaPorAnalista(base);
  const disciplinas = [...new Set(linhas.map((l) => l.disciplina?.trim()).filter((d): d is string => !!d))].sort();
  const analistas = [...new Set(linhas.map((l) => l.responsavel?.trim().toUpperCase()).filter((a): a is string => !!a))].sort();
  const go = (k: ChaveVer | null, extra: Record<string, string | null> = {}) => href(filtros, { ver: k, busca: null, ...extra });
  const temFiltro = Object.values(filtros).some(Boolean);

  const lista = ver ? selecionar(base, ver, agora) : [];
  const termo = busca.toUpperCase();
  const encontrados = termo
    ? linhas.filter((l) => [l.codigo, l.nome, l.numAt, l.disciplina, l.responsavel].some((v) => (v || "").toUpperCase().includes(termo)))
    : null;
  const recentesLista = encontrados ? recentes(encontrados, 100) : recentes(base, 30);

  const alertas: { rotulo: string; chave: ChaveVer; n: number; tom: string }[] = [
    { rotulo: "Documentos com SLA vencido", chave: "sla_vencido", n: ind.sla_vencido.analises, tom: "red" },
    { rotulo: "Próximos do vencimento (até 2 dias úteis)", chave: "sla_proximo", n: ind.sla_proximo.analises, tom: "orange" },
    { rotulo: "Pendências críticas (prioritárias com SLA vencido)", chave: "criticos", n: ind.criticos.analises, tom: "red" },
    { rotulo: "Documentos em HOLD", chave: "hold", n: ind.hold.analises, tom: "orange" },
    { rotulo: `Sem movimentação há mais de ${DIAS_SEM_MOVIMENTO} dias`, chave: "sem_movimento", n: ind.sem_movimento.analises, tom: "orange" },
    { rotulo: `Com mais de ${REVISOES_CRITICAS} revisões`, chave: "revisoes", n: ind.revisoes.analises, tom: "orange" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold text-(--color-text)">Painel de Governança GAT{primeiroNome ? ` — olá, ${primeiroNome}` : ""}</h1>
      <p className="mt-1 text-sm text-(--color-text-weak)">
        Situação geral das análises de Prestadores e Cessionários, calculada agora sobre os dados cadastrados. Cada indicador abre a relação correspondente.
      </p>

      <form method="get" action="/inicio" className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-3">
        <label className="flex items-center gap-1 text-xs text-(--color-text-weak)">Solicitação de<input type="date" name="de" defaultValue={filtros.de} className={input} /></label>
        <label className="flex items-center gap-1 text-xs text-(--color-text-weak)">até<input type="date" name="ate" defaultValue={filtros.ate} className={input} /></label>
        <input name="codigo" defaultValue={filtros.codigo} placeholder="Projeto (código)" className={`w-36 ${input}`} />
        <input name="prestador" defaultValue={filtros.prestador} placeholder="Prestador / cessionário" className={`w-44 ${input}`} />
        <select name="disciplina" defaultValue={filtros.disciplina} className={input}><option value="">Todas as disciplinas</option>{disciplinas.map((d) => <option key={d} value={d}>{d}</option>)}</select>
        <select name="analista" defaultValue={filtros.analista} className={input}><option value="">Todos os analistas</option>{analistas.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <select name="status" defaultValue={filtros.status} className={input}><option value="">Todos os status</option>{STATUS_ANALISE_OPCOES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select name="modulo" defaultValue={filtros.modulo} className={input}>
          <option value="">Prestadores e Cessionários</option><option value="prestadores">Só Prestadores</option><option value="cessionarios">Só Cessionários</option>
        </select>
        {ver && <input type="hidden" name="ver" value={ver} />}
        <button type="submit" className="rounded-full bg-(--color-navy) px-4 py-1.5 text-xs font-medium text-white hover:opacity-90">Aplicar</button>
        {temFiltro && <Link href="/inicio" className="rounded-full border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-navy) hover:bg-(--color-surface-2)">Limpar</Link>}
      </form>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao titulo="Projetos ativos" valor={String(ind.projetos.analises)} detalhe="códigos com análise em aberto" destino={go("projetos")} ativo={ver === "projetos"} />
        <Cartao titulo="Documentos recebidos" valor={String(ind.recebidos.documentos)} detalhe={`${ind.recebidos.analises} análises (ATs/disciplinas)`} destino={go("recebidos")} ativo={ver === "recebidos"} />
        <Cartao titulo="Aguardando análise" valor={String(ind.aguardando.analises)} detalhe={`${ind.aguardando.documentos} documentos`} destino={go("aguardando")} ativo={ver === "aguardando"} />
        <Cartao titulo="Em revisão" valor={String(ind.revisao.analises)} detalhe="reenvios (REV ≥ 1) em aberto" destino={go("revisao")} ativo={ver === "revisao"} />
        <Cartao titulo="Análises concluídas" valor={String(ind.concluidas.analises)} detalhe={`${ind.concluidas.documentos} documentos`} tom="green" destino={go("concluidas")} ativo={ver === "concluidas"} />
        <Cartao titulo="SLA vencido" valor={String(ind.sla_vencido.analises)} detalhe={`${ind.sla_vencido.documentos} documentos`} tom="red" destino={go("sla_vencido")} ativo={ver === "sla_vencido"} />
        <Cartao titulo="Próximos do vencimento" valor={String(ind.sla_proximo.analises)} detalhe="até 2 dias úteis" tom="orange" destino={go("sla_proximo")} ativo={ver === "sla_proximo"} />
        <Cartao titulo="Em HOLD" valor={String(ind.hold.analises)} detalhe={`${ind.hold.documentos} documentos`} tom="orange" destino={go("hold")} ativo={ver === "hold"} />
      </div>

      {ver && (
        <Secao titulo={`${ROTULO_VER[ver]} — ${lista.length} registro(s)${filtros.analista && ver === "carteira" ? ` · ${filtros.analista}` : ""}`}>
          <div className="mb-2"><Link href={href(filtros, { ver: null })} className="text-xs font-medium text-(--color-navy) hover:underline">Fechar relação</Link></div>
          <TabelaLinhas linhas={lista.slice(0, 200)} vazio="Nenhum registro para os filtros atuais." />
          {lista.length > 200 && <p className="mt-2 text-xs text-(--color-text-dim)">Mostrando 200 de {lista.length}. Refine pelos filtros.</p>}
        </Secao>
      )}

      <Secao titulo="Controle de SLA" nota="Análises em aberto (EM ANÁLISE) pelo prazo de 10 dias úteis, ou 5 dias nos projetos com SLA reduzido — a mesma regra das demais telas.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Cartao titulo="Dentro do prazo" valor={String(Math.max(0, ind.aguardando.analises - ind.sla_vencido.analises - ind.sla_proximo.analises))} tom="green" destino={go("aguardando")} />
          <Cartao titulo="Próximos do vencimento" valor={String(ind.sla_proximo.analises)} tom="orange" destino={go("sla_proximo")} />
          <Cartao titulo="Prazo vencido" valor={String(ind.sla_vencido.analises)} tom="red" destino={go("sla_vencido")} />
          <Cartao titulo="Cumprimento do SLA" valor={pctSla == null ? "—" : `${pctSla}%`} detalhe="concluídas entregues no prazo" tom={pctSla != null && pctSla < 80 ? "red" : "green"} destino={go("concluidas")} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <TabelaDistribuicao titulo="Por disciplina (no prazo · próximo · vencido)" dados={porDisciplina} hrefLinha={(c) => go("aguardando", { disciplina: c })} />
          <TabelaDistribuicao titulo="Por analista (no prazo · próximo · vencido)" dados={porAnalista} hrefLinha={(c) => go("carteira", { analista: c })} />
        </div>
      </Secao>

      <Secao titulo="Documentos e revisões">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Cartao titulo="Aguardando análise" valor={String(ind.aguardando.analises)} destino={go("aguardando")} />
          <Cartao titulo="Em revisão" valor={String(ind.revisao.analises)} destino={go("revisao")} />
          <Cartao titulo="Liberados" valor={String(ind.liberados.analises)} tom="green" destino={go("liberados")} />
          <Cartao titulo="Não liberados" valor={String(ind.nao_liberados.analises)} tom="red" destino={go("nao_liberados")} />
          <Cartao titulo="Em HOLD" valor={String(ind.hold.analises)} tom="orange" destino={go("hold")} />
          <Cartao titulo={`Mais de ${REVISOES_CRITICAS} revisões`} valor={String(ind.revisoes.analises)} tom={ind.revisoes.analises ? "red" : "navy"} detalhe="em aberto — situação crítica" destino={go("revisoes")} />
        </div>
      </Secao>

      <Secao titulo="Equipe e distribuição de demandas" nota="Carga lida junto da complexidade: a quantidade de documentos pendentes acompanha cada analista; clique para ver a carteira. A análise de sobrecarga ponderada está em Painel de Analistas.">
        <div className="overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
          <table className="w-full text-left text-sm">
            <thead><tr className="text-xs font-medium text-(--color-text-dim)">
              <th className="px-3 py-2.5">Analista</th><th className="px-3 py-2.5 text-right">Total</th><th className="px-3 py-2.5 text-right">Pendentes</th>
              <th className="px-3 py-2.5 text-right">Docs pendentes</th><th className="px-3 py-2.5 text-right">Concluídas</th><th className="px-3 py-2.5 text-right">SLA vencido</th><th className="px-3 py-2.5">Carga pendente</th>
            </tr></thead>
            <tbody>
              {equipe.map((e) => {
                const maior = Math.max(1, ...equipe.map((x) => x.pendentes));
                return (
                  <tr key={e.analista} className="border-t border-(--color-border)">
                    <td className="px-3 py-2.5"><Link href={go("carteira", { analista: e.analista })} className="font-medium text-(--color-navy) hover:underline">{e.analista}</Link></td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-(--color-text-weak)">{e.total}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-(--color-text)">{e.pendentes}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-(--color-text-weak)">{e.documentosPendentes}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-(--color-green)">{e.concluidas}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: e.vencidas ? "var(--color-red)" : undefined }}>{e.vencidas}</td>
                    <td className="w-40 px-3 py-2.5"><div className="h-2 rounded-full bg-(--color-surface-2)"><div className="h-2 rounded-full bg-(--color-navy)" style={{ width: `${(e.pendentes / maior) * 100}%` }} /></div></td>
                  </tr>
                );
              })}
              {equipe.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-(--color-text-weak)">Nenhuma análise para os filtros atuais.</td></tr>}
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao titulo="Alertas operacionais">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {alertas.map((a) => (
            <Link key={a.chave} href={go(a.chave)} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm hover:bg-(--color-surface-2) ${a.n && a.tom === "red" ? "border-(--color-red)/40 bg-(--color-red-bg)" : a.n ? "border-(--color-orange)/40 bg-(--color-orange-bg)" : "border-(--color-border) bg-(--color-surface-1)"}`}>
              <span className="text-(--color-text)">{a.rotulo}</span>
              <span className={`text-lg font-semibold tabular-nums ${a.n ? (a.tom === "red" ? "text-(--color-red)" : "text-(--color-orange)") : "text-(--color-text-dim)"}`}>{a.n}</span>
            </Link>
          ))}
        </div>
      </Secao>

      <Secao titulo={encontrados ? `Pesquisa de projetos — ${recentesLista.length} resultado(s) na base completa` : "Projetos recentes — últimas 30 movimentações"}>
        <form method="get" action="/inicio" className="mb-2 flex flex-wrap items-center gap-2">
          {Object.entries(filtros).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input name="busca" defaultValue={busca} placeholder="Buscar por código, nome, AT, disciplina ou analista" className={`w-80 ${input}`} />
          <button type="submit" className="rounded-full bg-(--color-navy) px-4 py-1.5 text-xs font-medium text-white hover:opacity-90">Pesquisar</button>
          {busca && <Link href={href(filtros, { ver })} className="text-xs font-medium text-(--color-navy) hover:underline">Limpar pesquisa</Link>}
        </form>
        <TabelaLinhas linhas={recentesLista} vazio="Nenhum projeto encontrado." />
      </Secao>

      <Secao titulo="Últimas movimentações" nota="Atividades registradas no sistema (cadastros, análises, baixas, importações, alterações de status).">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1)">
          {atividades.length === 0 ? <p className="px-5 py-6 text-sm text-(--color-text-weak)">Nenhuma atividade registrada.</p> : atividades.map((a) => (
            <div key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-(--color-border) px-4 py-2.5 first:border-0 text-sm">
              <span className="text-(--color-text)"><span className="font-medium">{a.tipo_evento.replace(/_/g, " ")}</span>{a.detalhe ? <span className="text-(--color-text-weak)"> — {a.detalhe}</span> : null}</span>
              <span className="whitespace-nowrap text-xs text-(--color-text-dim)">{a.usuario} · {fmtDataHora(a.data_hora)}</span>
            </div>
          ))}
        </div>
      </Secao>
    </div>
  );
}
