"use client";

import { useEffect, useRef, useState } from "react";
import { ehPrioritario, type FaixaHistorica, type ItemGantt } from "@/lib/prestadores-gantt/motor";
import { FERIADOS_RJ_ISO } from "@/lib/dias-uteis";
import { PREMISSAS_PADRAO, type PremissasEstado, type UiGanttEstado } from "./tipos-estado";

type Aba = "prio" | "sla" | "cal" | "adv";
const ABAS: [Aba, string][] = [["prio", "★ Prioridades"], ["sla", "⏱ Prazos (SLA)"], ["cal", "📆 Calendário"], ["adv", "⚙ Avançado"]];

function Num({ valor, min, max, onChange, ov }: { valor: number | ""; min: number; max: number; onChange: (v: number) => void; ov?: boolean }) {
  return (
    <input type="number" min={min} max={max} value={valor} className={ov ? "ov" : ""}
      onChange={(e) => e.target.value !== "" && onChange(Math.max(min, Math.min(max, Number(e.target.value))))} />
  );
}

/** Janela "✎ Editar premissas" — cada alteração recalcula o Gantt na hora e
 * nunca altera a planilha nem o banco. A prioridade (★) vem do sistema
 * (nível definido na edição da análise do prestador). */
export function PremissasDialog({
  aberto, onFechar, nomeCenario, premissas, setPremissas, ui, setUi, hist, itens,
}: {
  aberto: boolean; onFechar: () => void; nomeCenario: string;
  premissas: PremissasEstado; setPremissas: (p: PremissasEstado) => void;
  ui: UiGanttEstado; setUi: (u: UiGanttEstado) => void;
  hist: FaixaHistorica[]; itens: ItemGantt[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [aba, setAba] = useState<Aba>("prio");
  const [novoFeriado, setNovoFeriado] = useState("");
  const [lote, setLote] = useState<{ qual: "P" | "I"; valor: number }>({ qual: "P", valor: 10 });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  const set = (p: Partial<PremissasEstado>) => setPremissas({ ...premissas, ...p });

  const codigos = [...new Set(itens.filter((it) => !it.closed).map((it) => it.code))].sort();
  const prioritarios = new Map<string, { nivel: number; prest: string; n: number }>();
  itens.filter((it) => !it.closed && ehPrioritario(it)).forEach((it) => {
    const a = prioritarios.get(it.code);
    prioritarios.set(it.code, { nivel: Math.min(a?.nivel ?? 99, it.nivelPrioridade ?? 99), prest: it.prest, n: (a?.n ?? 0) + 1 });
  });

  function setOver(qual: "P" | "I", codigo: string, v: number | null) {
    const chave = qual === "P" ? "slaPOver" : "slaIOver";
    const novo = { ...premissas[chave] };
    if (v == null) delete novo[codigo]; else novo[codigo] = v;
    set({ [chave]: novo } as Partial<PremissasEstado>);
  }

  const feriados = [...new Set([...FERIADOS_RJ_ISO, ...premissas.feriadosExtras])]
    .filter((f) => !premissas.feriadosRemovidos.includes(f)).sort();

  return (
    <dialog ref={ref} onClose={onFechar} onClick={(e) => e.target === ref.current && onFechar()}>
      <div className="dh"><b>✎ Editar premissas</b><span className="note" style={{ color: "#C9D4E8" }}>{nomeCenario}</span><button type="button" className="btn sm" onClick={onFechar}>Fechar</button></div>
      <div className="ptabs">
        {ABAS.map(([k, t]) => <button key={k} type="button" className={k === aba ? "on" : ""} onClick={() => setAba(k)}>{t}</button>)}
      </div>
      <div className="db">
        <div className="info" style={{ marginBottom: 10 }}>
          Cada alteração atualiza o Gantt na hora (atrás desta janela). Para guardar como cenário, feche e use <b>💾 Salvar</b> ou <b>+ Novo cenário</b>.
          Nada aqui altera a planilha nem o banco de dados.
        </div>

        {aba === "prio" && (
          <div className="card">
            <h3>★ Projetos prioritários <span className="hint">aparecem no topo do Gantt (Organizar por Projeto) com destaque dourado</span></h3>
            <div className="note" style={{ marginBottom: 8 }}>
              A prioridade é definida no sistema: <b>Projetos → Editar</b> (análise do prestador) → bloco <b>★ Prioridade</b> (nível 1, 2 ou 3).
              Nível 3 = SLA 7 du, nível 2 = 5 du, nível 1 = até 3 du. Abaixo, o que está valendo agora:
            </div>
            <table className="pt">
              <thead><tr><th>Código</th><th>Prestador</th><th>Nível</th><th>Análises abertas</th></tr></thead>
              <tbody>
                {[...prioritarios.entries()].sort((a, b) => a[1].nivel - b[1].nivel || a[0].localeCompare(b[0])).map(([c, v]) => (
                  <tr key={c}><td><span className="star">★</span><b>{c}</b></td><td>{v.prest}</td><td>Nível {v.nivel}</td><td>{v.n}</td></tr>
                ))}
                {!prioritarios.size && <tr><td colSpan={4} className="note">Nenhum projeto prioritário definido.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {aba === "sla" && (
          <div className="pgrid">
            <div className="card" style={{ gridColumn: "1/-1" }}>
              <h3>Prazos padrão</h3>
              <div className="frm" style={{ gridTemplateColumns: "auto auto auto auto" }}>
                <label>SLA do prestador — padrão (du)</label><Num valor={ui.slaP} min={1} max={120} onChange={(v) => setUi({ ...ui, slaP: v })} />
                <label>SLA de análise — padrão (du)</label><Num valor={ui.slaI} min={1} max={120} onChange={(v) => setUi({ ...ui, slaI: v })} />
              </div>
            </div>
            <div className="card" style={{ gridColumn: "1/-1" }}>
              <h3>SLA por prestador / código <span className="hint">valores em destaque sobrescrevem o padrão apenas daquele código</span></h3>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }} className="note">
                Aplicar em lote: SLA
                <select className="btn sm" value={lote.qual} onChange={(e) => setLote({ ...lote, qual: e.target.value as "P" | "I" })}>
                  <option value="P">do prestador</option><option value="I">da análise</option>
                </select>
                <Num valor={lote.valor} min={1} max={120} onChange={(v) => setLote({ ...lote, valor: v })} /> du em todos os códigos
                <button type="button" className="btn sm gold" onClick={() => {
                  const chave = lote.qual === "P" ? "slaPOver" : "slaIOver";
                  set({ [chave]: Object.fromEntries(codigos.map((c) => [c, lote.valor])) } as Partial<PremissasEstado>);
                }}>Aplicar</button>
                <button type="button" className="btn sm" onClick={() => set({ slaPOver: {}, slaIOver: {} })}>Voltar ao padrão</button>
              </div>
              <div className="scroll" style={{ maxHeight: 420 }}>
                <table className="pt">
                  <thead><tr><th>Código</th><th>Prestador</th><th>SLA prestador</th><th>SLA análise</th></tr></thead>
                  <tbody>
                    {codigos.map((c) => {
                      const it = itens.find((x) => x.code === c);
                      const vp = premissas.slaPOver[c], vi = premissas.slaIOver[c];
                      return (
                        <tr key={c}>
                          <td>{prioritarios.has(c) && <span className="star">★</span>}<b>{c}</b></td><td>{it?.prest}</td>
                          <td><Num ov={vp != null} valor={vp ?? ""} min={1} max={120} onChange={(v) => setOver("P", c, v)} /></td>
                          <td><Num ov={vi != null} valor={vi ?? ""} min={1} max={120} onChange={(v) => setOver("I", c, v)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {aba === "cal" && (
          <div className="card">
            <h3>Calendário de dias úteis e feriados</h3>
            <div className="note">Sábados, domingos e os feriados abaixo não contam como dia útil nas projeções.</div>
            <div className="scroll" style={{ maxHeight: 260, marginTop: 6 }}>
              <table className="pt">
                <tbody>
                  {feriados.map((f) => (
                    <tr key={f}><td>{f.split("-").reverse().join("/")}</td><td style={{ textAlign: "right" }}>
                      <button type="button" className="btn sm" onClick={() => set({
                        feriadosExtras: premissas.feriadosExtras.filter((x) => x !== f),
                        feriadosRemovidos: FERIADOS_RJ_ISO.includes(f) ? [...premissas.feriadosRemovidos, f] : premissas.feriadosRemovidos,
                      })}>remover</button></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <input type="date" className="btn sm" value={novoFeriado} onChange={(e) => setNovoFeriado(e.target.value)} />
              <button type="button" className="btn sm" onClick={() => {
                if (!novoFeriado) return;
                set({ feriadosExtras: [...new Set([...premissas.feriadosExtras, novoFeriado])], feriadosRemovidos: premissas.feriadosRemovidos.filter((x) => x !== novoFeriado) });
                setNovoFeriado("");
              }}>Adicionar feriado</button>
              <button type="button" className="btn sm" onClick={() => set({ feriadosExtras: [], feriadosRemovidos: [] })}>Restaurar feriados</button>
            </div>
          </div>
        )}

        {aba === "adv" && (
          <div className="pgrid">
            <div className="card">
              <h3>Prazos e critérios gerais</h3>
              <div className="frm">
                <label>Prazo das análises em andamento</label>
                <select value={premissas.useL ? "1" : "0"} onChange={(e) => set({ useL: e.target.value === "1" })}>
                  <option value="1">Data Limite da análise</option><option value="0">Recalcular pelo SLA do cenário</option>
                </select>
                <label>Limite de proximidade do vencimento (du)</label><Num valor={premissas.prox} min={0} max={60} onChange={(v) => set({ prox: v })} />
                <label>AT crítica quando REV. AT maior que</label><Num valor={premissas.critRev} min={0} max={20} onChange={(v) => set({ critRev: v })} />
                <label>Projeto antigo: enviado há mais de (meses)</label><Num valor={premissas.oldMonths} min={1} max={36} onChange={(v) => set({ oldMonths: v })} />
                <label>Referência para “antigo”</label>
                <select value={premissas.oldRef} onChange={(e) => set({ oldRef: e.target.value as PremissasEstado["oldRef"] })}>
                  <option value="at">1º envio da AT</option><option value="projeto">1º envio do projeto (código)</option><option value="ultimo">Última movimentação</option>
                </select>
                <label>Retorno do prestador já vencido</label>
                <select value={premissas.overdueMode} onChange={(e) => set({ overdueMode: e.target.value as PremissasEstado["overdueMode"] })}>
                  <option value="base">Assumir recebimento na data-base</option><option value="espalhar">Distribuir nos próximos N dias úteis</option><option value="excluir">Não projetar</option>
                </select>
                <label>N dias úteis para distribuir vencidos</label><Num valor={premissas.overdueSpread} min={1} max={60} onChange={(v) => set({ overdueSpread: v })} />
              </div>
            </div>
            <div className="card">
              <h3>Premissas de novas revisões <span className="hint">estimativas — não são dados reais</span></h3>
              <div className="note" style={{ marginBottom: 6 }}>Probabilidade de a AT ser liberada em cada análise, por revisão da AT. Vazio = usa o histórico da própria base.</div>
              <table className="pt">
                <thead><tr><th>Análise da REV. AT</th><th>Histórico</th><th>Premissa (% liberada)</th></tr></thead>
                <tbody>
                  {hist.map((h, i) => (
                    <tr key={i}>
                      <td>REV {i}{i === 3 ? " ou maior" : ""}</td>
                      <td>{h.p == null ? "—" : `${Math.round(h.p * 100)}% `}<span className="note">({h.lib}/{h.n})</span></td>
                      <td><input type="number" min={0} max={100} placeholder={h.p == null ? "50" : String(Math.round(h.p * 100))}
                        value={premissas.pLib[i] ?? ""} className={premissas.pLib[i] != null ? "ov" : ""}
                        onChange={(e) => { const n = [...premissas.pLib]; n[i] = e.target.value === "" ? null : Math.max(0, Math.min(100, Number(e.target.value))); set({ pLib: n }); }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="frm" style={{ marginTop: 8 }}>
                <label>Máx. ciclos de reprovação simulados por AT</label><Num valor={premissas.maxCycles} min={0} max={10} onChange={(v) => set({ maxCycles: v })} />
                <label>Ignorar ciclos com probabilidade abaixo de (%)</label><Num valor={premissas.minW} min={0} max={100} onChange={(v) => set({ minW: v })} />
                <label>Volume do próximo envio (% das pranchas do ciclo atual)</label><Num valor={premissas.volFactor} min={0} max={500} onChange={(v) => set({ volFactor: v })} />
              </div>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <button type="button" className="btn sm" onClick={() => { setPremissas({ ...PREMISSAS_PADRAO }); setUi({ ...ui, slaP: 10, slaI: 10 }); }}>Restaurar todas as premissas padrão</button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
