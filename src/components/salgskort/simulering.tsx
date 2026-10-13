import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal, Search, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { SoegListe, IndsaetKoder, KamFormDialog, omrKort, type DistriktData, type Profil } from "@/components/salgskort/distrikt";
import { kodeOversigt, regelTekst, type KamAftale, type Betingelse, type Omraade, type Regel, type RegelType } from "@/lib/simulering-regler";

export type Scenarie = { id: string; navn: string; beskrivelse: string | null; status: "kladde" | "gjort_gaeldende" | "arkiveret"; oprettet_at: string; opdateret_at: string };
export type ScDistrikt = {
  id: string; scenarie_id: string; kilde_distrikt_id: string | null; navn: string; farve: string; landsdel: string | null; sort: number;
  saelger_user_id: string | null; saelger_fiktiv_id: string | null; daekkes_af_user_id: string | null;
};
export type ScSaelger = { id: string; scenarie_id: string; navn: string; farve: string; profil_id: string | null };
export type ScRegel = { id: string; scenarie_id: string; sortering: number; type: RegelType; saelger_user_id: string | null; saelger_fiktiv_id: string | null; betingelse: Betingelse; aktiv: boolean };
export type ScKam = { id: string; scenarie_id: string; kilde_kam_id: string | null; navn: string; kpg1: string[]; kpg2: string[]; kpg3: string[]; omraade: Omraade | null; ny_i_scenarie: boolean; kam_ansvarlige: string[]; kam_fiktive: string[]; aktiv: boolean };
export type ScData = { distrikter: ScDistrikt[]; saelgere: ScSaelger[]; fladeDistrikt: Map<number, string>; regler: ScRegel[]; kam: ScKam[] };
export type KamRow = { key: string; foer: { aftaler: number; n: number; oms: number; db: number }; efter: { aftaler: number; n: number; oms: number; db: number } };

const sb = () => supabase as any;
const kr = (n: number) => Math.round(n).toLocaleString("da-DK") + " kr.";
const fortegn = (n: number, f: (n: number) => string) => (n > 0 ? "+" : n < 0 ? "−" : "") + f(Math.abs(n));

/** Sælgernøgle for et scenariedistrikt: rigtig sælger, fiktiv ("f:<id>"), dækkende sælger, ellers "__ingen". */
export const scSaelgerKey = (d: ScDistrikt) =>
  d.saelger_user_id ?? (d.saelger_fiktiv_id ? "f:" + d.saelger_fiktiv_id : null) ?? d.daekkes_af_user_id ?? "__ingen";

async function hentScenarier(): Promise<Scenarie[]> {
  const { data, error } = await sb().from("distrikt_scenarie").select("*").order("oprettet_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
async function hentScenarie(id: string): Promise<ScData> {
  const [d, s, f, g, k] = await Promise.all([
    sb().from("scenarie_distrikt").select("*").eq("scenarie_id", id).order("sort").order("navn"),
    sb().from("scenarie_saelger").select("*").eq("scenarie_id", id).order("navn"),
    sb().from("scenarie_flade").select("flade,distrikt_id").eq("scenarie_id", id).range(0, 4999),
    sb().from("scenarie_regel").select("*").eq("scenarie_id", id).order("sortering").order("oprettet_at"),
    sb().from("scenarie_kam").select("*").eq("scenarie_id", id).order("navn"),
  ]);
  for (const r of [d, s, f, g, k]) if (r.error) throw r.error;
  const m = new Map<number, string>();
  (f.data ?? []).forEach((r: any) => m.set(r.flade, r.distrikt_id));
  return { distrikter: d.data ?? [], saelgere: s.data ?? [], fladeDistrikt: m, regler: g.data ?? [], kam: k.data ?? [] };
}

export function useScenarie(aktiv: boolean) {
  const [scenarier, setScenarier] = useState<Scenarie[]>([]);
  const [valgtId, setValgtId] = useState<string | null>(null);
  const [sc, setSc] = useState<ScData | null>(null);
  const [fortryd, setFortryd] = useState<{ flade: number; fra: string | null }[]>([]);
  const reloadListe = async (vaelg?: string | null) => {
    try {
      const l = await hentScenarier();
      setScenarier(l);
      const ny = vaelg !== undefined ? vaelg : valgtId && l.some((s) => s.id === valgtId) ? valgtId : l.find((s) => s.status === "kladde")?.id ?? null;
      setValgtId(ny);
    } catch (e: any) { toast.error("Scenarier: " + (e.message ?? e)); }
  };
  const reload = async () => {
    if (!valgtId) { setSc(null); return; }
    try { setSc(await hentScenarie(valgtId)); } catch (e: any) { toast.error("Scenarie: " + (e.message ?? e)); }
  };
  useEffect(() => { if (aktiv && !scenarier.length) reloadListe(); /* eslint-disable-next-line */ }, [aktiv]);
  useEffect(() => { setFortryd([]); reload(); /* eslint-disable-next-line */ }, [valgtId]);

  const saetFlade = async (fl: number, til: string | null) => {
    if (!sc || !valgtId) return;
    const m = new Map(sc.fladeDistrikt);
    til ? m.set(fl, til) : m.delete(fl);
    setSc({ ...sc, fladeDistrikt: m });
    const r = til
      ? await sb().from("scenarie_flade").upsert({ scenarie_id: valgtId, flade: fl, distrikt_id: til })
      : await sb().from("scenarie_flade").delete().eq("scenarie_id", valgtId).eq("flade", fl);
    if (r.error) { toast.error("Kunne ikke gemme: " + r.error.message); reload(); }
  };
  const tildel = (fl: number, did: string) => {
    if (!sc) return;
    const fra = sc.fladeDistrikt.get(fl) ?? null;
    if (fra === did) return;
    setFortryd((u) => [...u, { flade: fl, fra }]);
    saetFlade(fl, did);
  };
  const fortrydSeneste = () => {
    const s = fortryd[fortryd.length - 1];
    if (!s) return;
    setFortryd((u) => u.slice(0, -1));
    saetFlade(s.flade, s.fra);
  };
  return { scenarier, valgtId, setValgtId, sc, reload, reloadListe, tildel, fortrydSeneste, kanFortryde: fortryd.length > 0 };
}
export type ScenarieState = ReturnType<typeof useScenarie>;

export type SimRow = {
  location_id: string; company_id: string; virksomhed: string; postnr: string; by: string;
  fra: string; til: string; aktiv: boolean; oms: number; db: number;
  /** Nuværende sælger i Visma */
  nu: string;
  /** "geo" eller regel-id (kun i "Flyttes i scenariet") */
  aarsag: string | null;
};
type Valg = [string, number][];
export type RegelValg = { kpg1: Valg; kpg2: Valg; kpg3: Valg };
export type KonsekvensRow = { key: string; foer: Agg; efter: Agg };
type Agg = { n: number; aktive: number; oms: number; db: number };
export const tomAgg = (): Agg => ({ n: 0, aktive: 0, oms: 0, db: 0 });

export function SimuleringPanel({
  st, dd, navn, farve, konsekvens, flytninger, afviger, regler, regelStat, overlap, taelRegel, regioner, ukendteAnsatte, penhedAnsatte, antalLok, regelValg, kamPort, kamTael, kamStat, redigerer, setRedigerer, valgt, setValgt, fladeNavn, dStatSc,
}: {
  st: ScenarieState; dd: DistriktData; navn: (k: string) => string; farve: (k: string) => string;
  konsekvens: KonsekvensRow[]; flytninger: SimRow[]; afviger: SimRow[]; regler: Regel[]; regelStat: Map<string, { n: number; oms: number }>;
  overlap: Map<string, Map<string, number>>; taelRegel: (r: Regel) => { n: number; oms: number }; regioner: string[];
  ukendteAnsatte: number; penhedAnsatte: number; antalLok: number; regelValg: RegelValg; kamPort: KamRow[]; kamTael: (a: KamAftale) => { n: number; oms: number }; kamStat: Map<string, { n: number; oms: number }>;
  redigerer: boolean; setRedigerer: (b: boolean) => void; valgt: string | null; setValgt: (id: string | null) => void;
  fladeNavn: Map<number, string>; dStatSc?: Map<string, { n: number; oms: number }>;
}) {
  const [fane, setFane] = useState<"distr" | "kons">("distr");
  const [navnDlg, setNavnDlg] = useState<null | { titel: string; start: string; ok: (n: string) => Promise<void> }>(null);
  const [editD, setEditD] = useState<Partial<ScDistrikt> | null>(null);
  const [editS, setEditS] = useState<Partial<ScSaelger> | null>(null);
  const [merge, setMerge] = useState<ScDistrikt | null>(null);
  const [visGoer, setVisGoer] = useState(false);
  const [saelgerF, setSaelgerF] = useState<string | null>(null);
  const [editR, setEditR] = useState<Partial<ScRegel> | null>(null);
  const [visAfv, setVisAfv] = useState(false);
  const [editK, setEditK] = useState<Partial<ScKam> | null>(null);
  const valgtSc = st.scenarier.find((s) => s.id === st.valgtId) ?? null;
  const sc = st.sc;
  const laast = valgtSc?.status !== "kladde";

  const rpc = async (fn: string, args: any) => {
    const { data, error } = await sb().rpc(fn, args);
    if (error) { toast.error(error.message); return null; }
    return data as string;
  };
  const nyt = () => setNavnDlg({ titel: "Nyt scenarie (kopi af gældende distriktskort)", start: "", ok: async (n) => { const id = await rpc("scenarie_opret", { _navn: n }); if (id) await st.reloadListe(id); } });
  const omdoeb = () => valgtSc && setNavnDlg({ titel: "Omdøb scenarie", start: valgtSc.navn, ok: async (n) => {
    const { error } = await sb().from("distrikt_scenarie").update({ navn: n, opdateret_at: new Date().toISOString() }).eq("id", valgtSc.id);
    if (error) toast.error(error.message); else await st.reloadListe(valgtSc.id);
  } });
  const kopier = () => valgtSc && setNavnDlg({ titel: "Kopiér scenarie", start: valgtSc.navn + " (kopi)", ok: async (n) => { const id = await rpc("scenarie_kopier", { _id: valgtSc.id, _navn: n }); if (id) await st.reloadListe(id); } });
  const saetStatus = async (status: Scenarie["status"]) => {
    if (!valgtSc) return;
    const { error } = await sb().from("distrikt_scenarie").update({ status, opdateret_at: new Date().toISOString() }).eq("id", valgtSc.id);
    if (error) toast.error(error.message); else await st.reloadListe(valgtSc.id);
  };
  const slet = async () => {
    if (!valgtSc || !confirm(`Slet scenariet "${valgtSc.navn}"? Det kan ikke fortrydes.`)) return;
    const { error } = await sb().from("distrikt_scenarie").delete().eq("id", valgtSc.id);
    if (error) toast.error(error.message); else await st.reloadListe(null);
  };

  const dStats = useMemo(() => {
    const m = new Map<string, number>();
    sc?.fladeDistrikt.forEach((d) => m.set(d, (m.get(d) ?? 0) + 1));
    return m;
  }, [sc]);
  const fiktivNavn = (id: string | null) => sc?.saelgere.find((s) => s.id === id)?.navn ?? "?";
  const dSaelgerTekst = (d: ScDistrikt) => d.saelger_user_id ? navn(d.saelger_user_id)
    : d.saelger_fiktiv_id ? `${fiktivNavn(d.saelger_fiktiv_id)} (fiktiv)`
    : `NY – dækkes af ${d.daekkes_af_user_id ? navn(d.daekkes_af_user_id) : "ingen"}`;

  const sletDistrikt = async (d: ScDistrikt) => {
    if (!confirm(`Slet distriktet "${d.navn}"? Dets ${dStats.get(d.id) ?? 0} flader bliver uden distrikt.`)) return;
    const { error } = await sb().from("scenarie_distrikt").delete().eq("id", d.id);
    if (error) toast.error(error.message); else { if (valgt === d.id) setValgt(null); st.reload(); }
  };
  const sletSaelger = async (s: ScSaelger) => {
    if (!confirm(`Slet den fiktive sælger "${s.navn}"? Distrikter med sælgeren bliver ubesatte.`)) return;
    const { error } = await sb().from("scenarie_saelger").delete().eq("id", s.id);
    if (error) toast.error(error.message); else st.reload();
  };

  const filtrer = (l: SimRow[]) => saelgerF ? l.filter((r) => r.fra === saelgerF || r.til === saelgerF || r.nu === saelgerF) : l;
  const flyt = filtrer(flytninger);
  const dNavn = (id: string) => sc?.distrikter.find((d) => d.id === id)?.navn ?? "?";
  const regelNavn = new Map(regler.map((r) => [r.id, regelTekst(r, navn, dNavn)]));
  const aarsagTekst = (a: string | null) => !a || a === "geo" ? "Geografi" : regelNavn.get(a) ?? "Regel";
  const sletRegel = async (r: ScRegel) => {
    if (!confirm("Slet reglen?")) return;
    const { error } = await sb().from("scenarie_regel").delete().eq("id", r.id);
    if (error) toast.error(error.message); else st.reload();
  };
  const toggleRegel = async (r: ScRegel) => {
    const { error } = await sb().from("scenarie_regel").update({ aktiv: !r.aktiv }).eq("id", r.id);
    if (error) toast.error(error.message); else st.reload();
  };
  const flytRegel = async (i: number, d: -1 | 1) => {
    const l = [...(sc?.regler ?? [])]; const j = i + d;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    const res = await Promise.all(l.map((r, k) => sb().from("scenarie_regel").update({ sortering: k }).eq("id", r.id)));
    const e = res.find((x: any) => x.error); if (e) toast.error(e.error.message);
    st.reload();
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="p-3 space-y-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <select className="flex-1 min-w-0 rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={st.valgtId ?? ""} onChange={(e) => st.setValgtId(e.target.value || null)}>
            <option value="">Vælg scenarie…</option>
            {st.scenarier.map((s) => <option key={s.id} value={s.id}>{s.navn}{s.status === "arkiveret" ? " (arkiveret)" : s.status === "gjort_gaeldende" ? " (gjort gældende)" : ""}</option>)}
          </select>
          <Button size="sm" onClick={nyt}>Nyt scenarie</Button>
        </div>
        {valgtSc && (
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={omdoeb}>Omdøb</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={kopier}>Kopiér</Button>
            {valgtSc.status === "kladde"
              ? <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => saetStatus("arkiveret")}>Arkivér</Button>
              : <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => saetStatus("kladde")}>Genåbn som kladde</Button>}
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={slet}>Slet</Button>
            <Button size="sm" className="h-7 text-xs ml-auto" disabled={laast} onClick={() => setVisGoer(true)}>Gør gældende</Button>
          </div>
        )}
        {valgtSc && laast && <div className="text-xs text-muted-foreground">Scenariet er {valgtSc.status === "arkiveret" ? "arkiveret" : "gjort gældende"} og kan kun ses. Genåbn det som kladde for at redigere.</div>}
      </div>

      {!valgtSc || !sc ? (
        <div className="p-6 text-center text-muted-foreground text-sm">
          {st.scenarier.length ? "Vælg et scenarie ovenfor." : "Ingen scenarier endnu. Opret et nyt scenarie – det starter som en kopi af det gældende distriktskort."}
        </div>
      ) : (
        <>
          <div className="flex gap-2 px-3 pt-2 shrink-0">
            <Button size="sm" variant={fane === "distr" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setFane("distr")}>Distrikter og sælgere</Button>
            <Button size="sm" variant={fane === "kons" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setFane("kons")}>Konsekvens ({flytninger.length} flyt)</Button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            {fane === "distr" ? (
              <>
                {(() => {
                  const d = konsekvens.map((k) => ({ k: k.key, d: k.efter.oms - k.foer.oms })).filter((x) => Math.round(x.d) !== 0).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
                  return (
                    <div className="sticky -top-3 z-10 -mx-3 -mt-3 mb-1 border-b border-border bg-card px-3 py-1.5 flex flex-wrap gap-1" data-testid="delta-bjaelke">
                      {d.length === 0 ? <span className="text-xs text-muted-foreground">Ingen ændring i omsætning pr. sælger.</span> : d.map((x) => (
                        <button key={x.k} type="button" onClick={() => { setSaelgerF(x.k); setFane("kons"); }}
                          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: farve(x.k) }} />
                          <span className="whitespace-nowrap">{navn(x.k)}</span>
                          <span className="tabular-nums font-medium">{fortegn(x.d, mio)}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
                {!laast && (
                  <Button size="sm" variant={redigerer ? "default" : "outline"} className="w-full" onClick={() => setRedigerer(!redigerer)}>
                    {redigerer ? "Afslut redigering" : "Redigér grænser"}
                  </Button>
                )}
                {redigerer && (
                  <div className="rounded border-2 border-primary bg-primary/5 p-2 text-xs space-y-2">
                    <div className="font-medium">Redigeringstilstand (scenarie)</div>
                    <div>{valgt ? <>Klik eller træk hen over flader for at flytte dem til <b>{sc.distrikter.find((d) => d.id === valgt)?.navn}</b>.</> : "Vælg et distrikt i listen herunder."}</div>
                    <Button size="sm" variant="outline" disabled={!st.kanFortryde} onClick={st.fortrydSeneste}>Fortryd seneste</Button>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="font-medium">Distrikter ({sc.distrikter.length})</span>
                  {!laast && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditD({ navn: "", farve: "#3b5b92", landsdel: "Vest", sort: sc.distrikter.length + 1 })}>Nyt distrikt</Button>}
                </div>
                <ul className="space-y-1">
                  {sc.distrikter.map((d) => (
                    <li key={d.id} onClick={() => redigerer && setValgt(d.id)}
                      className={"rounded border px-2 py-1.5 text-xs leading-snug " + (redigerer ? "cursor-pointer hover:bg-muted/40 " : "") + (valgt === d.id && redigerer ? "border-primary ring-1 ring-primary" : "border-border")}>
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-sm shrink-0" style={{ background: d.farve, outline: d.saelger_user_id ? undefined : "1px dashed currentColor" }} />
                        <span className="font-medium flex-1 truncate">{d.navn}</span>
                        {!laast && <RaekkeMenu punkter={[["Rediger", () => setEditD(d)], ["Slå sammen", () => setMerge(d)], ["Slet", () => sletDistrikt(d)]]} />}
                      </div>
                      <div className="text-muted-foreground mt-0.5">{dSaelgerTekst(d)}{d.landsdel ? ` · ${d.landsdel}` : ""} · {dStats.get(d.id) ?? 0} {(dStats.get(d.id) ?? 0) === 1 ? "flade" : "flader"}<span className="tabular-nums"> · {(dStatSc?.get(d.id)?.n ?? 0).toLocaleString("da-DK")} lok. · {mio(dStatSc?.get(d.id)?.oms ?? 0)}</span></div>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between pt-2">
                  <span className="font-medium">Fiktive sælgere ({sc.saelgere.length})</span>
                  {!laast && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditS({ navn: "Ny sælger ", farve: "#6a6a6a" })}>Ny fiktiv sælger</Button>}
                </div>
                {sc.saelgere.length === 0 && <div className="text-xs text-muted-foreground">Ingen fiktive sælgere i scenariet.</div>}
                <ul className="space-y-1">
                  {sc.saelgere.map((s) => (
                    <li key={s.id} className="rounded border border-dashed border-border px-2 py-1.5 text-xs leading-snug flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ background: s.farve, outline: "1px dashed currentColor" }} />
                      <span className="flex-1 truncate"><span className="font-medium">{s.navn}</span> (fiktiv){s.profil_id ? ` → ${navn(s.profil_id)}` : <span className="text-muted-foreground"> · ikke koblet</span>}</span>
                      {!laast && <RaekkeMenu punkter={[["Rediger", () => setEditS(s)], ["Slet", () => sletSaelger(s)]]} />}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between pt-2">
                  <span className="font-medium">Regler ({sc.regler.length})</span>
                  {!laast && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditR({ type: "tildel", aktiv: true, betingelse: {} })}>Ny regel</Button>}
                </div>
                <p className="text-[11px] text-muted-foreground">Rækkefølge: Frellsen (199) → "Tildel"-regler oppefra → geografi → "Må ikke have"-regler.</p>
                {sc.regler.length === 0 && <div className="text-xs text-muted-foreground">Ingen regler – fordelingen følger kun geografien.</div>}
                <ul className="space-y-1">
                  {sc.regler.map((r, i) => {
                    const rr = regler.find((x) => x.id === r.id);
                    const s = regelStat.get(r.id) ?? { n: 0, oms: 0 };
                    return (
                      <li key={r.id} className={"rounded border border-border px-2 py-1.5 text-xs leading-snug space-y-0.5 " + (r.aktiv ? "" : "opacity-60")}>
                        <div className="flex items-start gap-2">
                          <Checkbox className="mt-0.5" disabled={laast} checked={r.aktiv} onCheckedChange={() => toggleRegel(r)} aria-label="Aktiv" />
                          <span className="flex-1">{regelNavn.get(r.id) ?? ""}</span>
                          {!laast && <span className="flex gap-1 text-muted-foreground shrink-0">
                            <button type="button" aria-label="Op" disabled={i === 0} className="disabled:opacity-30" onClick={() => flytRegel(i, -1)}><ArrowUp className="h-3 w-3" /></button>
                            <button type="button" aria-label="Ned" disabled={i === sc.regler.length - 1} className="disabled:opacity-30" onClick={() => flytRegel(i, 1)}><ArrowDown className="h-3 w-3" /></button>
                            <RaekkeMenu punkter={[["Rediger", () => setEditR(r)], ["Kopiér", () => setEditR({ ...r, id: undefined, aktiv: true })], ["Slet", () => sletRegel(r)]]} />
                          </span>}
                        </div>
                        <div className="block text-muted-foreground pl-6 tabular-nums">Rammer {s.n.toLocaleString("da-DK")} lokationer · {kr(s.oms)} oms.</div>
                        {(() => {
                          const o = overlap.get(r.id); if (!o?.size) return null;
                          const tot = [...o.values()].reduce((a, b) => a + b, 0);
                          const tip = [...o.entries()].map(([id, n]) => `${n.toLocaleString("da-DK")} tages af: ${regelNavn.get(id) ?? "?"}`).join("\n");
                          return <div className="pl-6 text-[11px] text-muted-foreground underline decoration-dotted cursor-help w-fit" title={tip}>
                            {tot.toLocaleString("da-DK")} {tot === 1 ? "lokation tages" : "lokationer tages"} af en regel over denne
                          </div>;
                        })()}
                        {r.type === "udeluk" && r.betingelse?.ansatteOver != null && (
                          <div className="text-[11px] text-muted-foreground pl-6">
                            Ansatte = virksomhedens antal (CVR){penhedAnsatte ? `; P-enhedstal for ${penhedAnsatte.toLocaleString("da-DK")} lok. uden virksomhedstal` : ""}. {ukendteAnsatte.toLocaleString("da-DK")} af {antalLok.toLocaleString("da-DK")} lokationer har ukendt antal – tæller som {r.betingelse.ukendtSomOver ? "over" : "under"} grænsen.
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="flex items-center justify-between pt-2">
                  <span className="font-medium">KAM-ansvar ({sc.kam.length})</span>
                  {!laast && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditK({ navn: "", kpg1: [], kpg2: [], kpg3: [], omraade: null, kam_ansvarlige: [], kam_fiktive: [], aktiv: true })}>Ny KAM-aftale</Button>}
                </div>
                <p className="text-[11px] text-muted-foreground">KAM-ansvar flytter ikke lokationer – distriktssælgeren følger regler og geografi.</p>
                {sc.kam.length === 0 && <div className="text-xs text-muted-foreground">Ingen KAM-aftaler i scenariet.</div>}
                <ul className="space-y-1">
                  {sc.kam.map((k) => {
                    const ans = [...k.kam_ansvarlige.map((x) => navn(x)), ...k.kam_fiktive.map((x) => navn("f:" + x))];
                    const ks = kamStat.get(k.id) ?? { n: 0, oms: 0 };
                    return (
                      <li key={k.id} className={"rounded border border-border px-2 py-1.5 text-xs flex items-start gap-2 " + (k.aktiv ? "" : "opacity-60")} data-testid="sc-kam">
                        <span className="flex-1 min-w-0 leading-snug">
                          <span className="font-medium">{k.navn}</span>{k.ny_i_scenarie && <span className="ml-1 rounded border border-border px-1 text-[10px] text-muted-foreground">ny</span>}
                          <span className="text-muted-foreground"> · {kodeOversigt(k)}{omrKort(k.omraade, sc.distrikter)} · {ans.length ? ans.join(", ") : "ingen ansvarlig"} · </span>
                          <span className="tabular-nums whitespace-nowrap">{ks.n.toLocaleString("da-DK")} lok. · {mio(ks.oms)}</span>
                        </span>
                        {!laast && <RaekkeMenu punkter={[["Rediger", () => setEditK(k)], ["Slet", async () => {
                          if (!confirm(`Slet KAM-aftalen "${k.navn}" i scenariet?`)) return;
                          const { error } = await sb().from("scenarie_kam").delete().eq("id", k.id);
                          if (error) toast.error(error.message); else st.reload();
                        }]]} />}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <>
                <Konsekvens rows={konsekvens} navn={navn} farve={farve} valgt={saelgerF} onVaelg={(k) => setSaelgerF(saelgerF === k ? null : k)} />
                <KamPortefoelje rows={kamPort} navn={navn} farve={farve} />
                <Flytteliste titel="Flyttes i scenariet" undertekst="Fra = sælger efter det gældende distriktskort, til = sælger i scenariet."
                  rows={flyt} navn={navn} aarsag={aarsagTekst} filter={saelgerF ? navn(saelgerF) : null} onFjernFilter={() => setSaelgerF(null)} fil="flyttes-i-scenariet.csv" />
                <div className="border-t border-border pt-2">
                  <button type="button" className="flex items-center gap-1 text-sm font-medium hover:underline" onClick={() => setVisAfv(!visAfv)}>
                    {visAfv ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3 rotate-90" />} Afviger allerede i dag ({afviger.length})
                  </button>
                  {visAfv && <Flytteliste titel="" undertekst="Fra = nuværende sælger i Visma, til = sælger efter det gældende distriktskort."
                    rows={filtrer(afviger)} navn={navn} filter={saelgerF ? navn(saelgerF) : null} onFjernFilter={() => setSaelgerF(null)} fil="afviger-i-dag.csv" />}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {navnDlg && <NavnDialog {...navnDlg} onLuk={() => setNavnDlg(null)} />}
      {editD && sc && st.valgtId && <ScDistriktDialog d={editD} scenarieId={st.valgtId} profiler={dd.profiler} fiktive={sc.saelgere} onLuk={() => setEditD(null)} onGemt={() => { setEditD(null); st.reload(); }} />}
      {editS && st.valgtId && <ScSaelgerDialog s={editS} scenarieId={st.valgtId} profiler={dd.profiler} onLuk={() => setEditS(null)} onGemt={() => { setEditS(null); st.reload(); }} />}
      {editR && sc && st.valgtId && <RegelDialog r={editR} scenarieId={st.valgtId} antal={sc.regler.length} profiler={dd.profiler} fiktive={sc.saelgere} valg={regelValg}
        distrikter={sc.distrikter} regioner={regioner} taelRegel={taelRegel}
        ukendte={ukendteAnsatte} onLuk={() => setEditR(null)} onGemt={() => { setEditR(null); st.reload(); }} />}
      {editK && sc && st.valgtId && <KamFormDialog start={{ ...editK, ansvarlige: [...(editK.kam_ansvarlige ?? []).map((x) => "u:" + x), ...(editK.kam_fiktive ?? []).map((x) => "f:" + x)] } as any}
        valg={regelValg} distrikter={sc.distrikter} distriktTitel="Scenariets distrikter" regioner={regioner} onLuk={() => setEditK(null)}
        personer={[...dd.profiler.filter((p) => p.is_active !== false && p.full_name).map((p) => ["u:" + p.id, p.full_name!] as [string, string]), ...sc.saelgere.map((f) => ["f:" + f.id, f.navn + " (fiktiv)"] as [string, string])]}
        tael={(a) => kamTael({ ...a, ansvarlige: [] })}
        onGem={async (f) => {
          const row = { navn: f.navn, kpg1: f.kpg1, kpg2: f.kpg2, kpg3: f.kpg3, omraade: f.omraade, aktiv: f.aktiv,
            kam_ansvarlige: f.ansvarlige.filter((x) => x.startsWith("u:")).map((x) => x.slice(2)), kam_fiktive: f.ansvarlige.filter((x) => x.startsWith("f:")).map((x) => x.slice(2)) };
          const { error } = editK.id ? await sb().from("scenarie_kam").update(row).eq("id", editK.id)
            : await sb().from("scenarie_kam").insert({ ...row, scenarie_id: st.valgtId, ny_i_scenarie: true });
          if (error) { toast.error(error.message); return; }
          setEditK(null); st.reload();
        }} />}
      {merge && sc && st.valgtId && <MergeDialog kilde={merge} scenarieId={st.valgtId} distrikter={sc.distrikter} onLuk={() => setMerge(null)} onGemt={() => { setMerge(null); st.reload(); }} />}
      {visGoer && sc && valgtSc && (
        <GoerGaeldendeDialog sc={sc} scenarie={valgtSc} dd={dd} flytninger={flytninger.length} fladeNavn={fladeNavn}
          onLuk={() => setVisGoer(false)} onFaerdig={async () => { setVisGoer(false); await st.reloadListe(valgtSc.id); }} />
      )}
    </div>
  );
}

function Konsekvens({ rows, navn, farve, valgt, onVaelg }: { rows: KonsekvensRow[]; navn: (k: string) => string; farve: (k: string) => string; valgt: string | null; onVaelg: (k: string) => void }) {
  const fe = (a: number, b: number, f: (n: number) => string = (n) => n.toLocaleString("da-DK")) => (
    <span><span className="text-muted-foreground whitespace-nowrap">{f(a)}→</span><wbr /><span className="whitespace-nowrap">{f(b)}</span></span>
  );
  const k = (n: number) => Math.round(n / 1000).toLocaleString("da-DK");
  const pct = (a: number, b: number) => (a ? fortegn(Math.round(((b - a) / Math.abs(a)) * 100), (n) => n + " %") : "—");
  const t = rows.reduce((s, r) => ({ foer: add(s.foer, r.foer), efter: add(s.efter, r.efter) }), { foer: tomAgg(), efter: tomAgg() });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] [&_td]:px-0.5 [&_th]:px-0.5">
        <thead className="text-muted-foreground">
          <tr className="text-right"><th className="text-left font-medium px-1">Sælger</th><th className="font-medium px-1">Lok.</th><th className="font-medium px-1">Aktive</th><th className="font-medium px-1">Oms. · Δ</th><th className="font-medium px-1">DB · Δ</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} onClick={() => onVaelg(r.key)} className={"border-t border-border cursor-pointer hover:bg-muted/40 text-right tabular-nums " + (valgt === r.key ? "bg-muted/60" : "")}>
              <td className="text-left px-1 py-1 max-w-[160px]"><div className="flex items-center gap-1 min-w-0">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: farve(r.key), outline: r.key.startsWith("f:") ? "1px dashed currentColor" : undefined }} />
                <span className="truncate" title={navn(r.key)}>{navn(r.key)}</span></div></td>
              <td className="px-1">{fe(r.foer.n, r.efter.n)}</td>
              <td className="px-1">{fe(r.foer.aktive, r.efter.aktive)}</td>
              <td className="px-1 leading-tight">{fe(r.foer.oms, r.efter.oms, k)}<div className="text-muted-foreground whitespace-nowrap">{fortegn(r.efter.oms - r.foer.oms, k)} · {pct(r.foer.oms, r.efter.oms)}</div></td>
              <td className="px-1 leading-tight">{fe(r.foer.db, r.efter.db, k)}<div className="text-muted-foreground whitespace-nowrap">{fortegn(r.efter.db - r.foer.db, k)}</div></td>
            </tr>
          ))}
          <tr className="border-t-2 border-border font-medium text-right tabular-nums">
            <td className="text-left px-1 py-1">I alt</td><td className="px-1">{fe(t.foer.n, t.efter.n)}</td><td className="px-1">{fe(t.foer.aktive, t.efter.aktive)}</td>
            <td className="px-1 leading-tight">{fe(t.foer.oms, t.efter.oms, k)}<div className="text-muted-foreground">{fortegn(t.efter.oms - t.foer.oms, k)}</div></td><td className="px-1 leading-tight">{fe(t.foer.db, t.efter.db, k)}<div className="text-muted-foreground">{fortegn(t.efter.db - t.foer.db, k)}</div></td>
          </tr>
        </tbody>
      </table>
      <div className="text-[11px] text-muted-foreground mt-1">Før → efter, med Δ under. Oms. og DB 12 mdr. i 1.000 kr. Klik på en sælger for at filtrere flyttelisten.</div>
    </div>
  );
}
const add = (a: Agg, b: Agg): Agg => ({ n: a.n + b.n, aktive: a.aktive + b.aktive, oms: a.oms + b.oms, db: a.db + b.db });

function Flytteliste({ titel, undertekst, rows, navn, aarsag, filter, onFjernFilter, fil }: { titel: string; undertekst: string; rows: SimRow[]; navn: (k: string) => string; aarsag?: (a: string | null) => string; filter: string | null; onFjernFilter: () => void; fil: string }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: "virksomhed" | "postnr" | "fra" | "til" | "oms" | "db" | "aarsag"; asc: boolean }>({ k: "oms", asc: false });
  const ql = q.trim().toLowerCase();
  const vis = rows.filter((r) => !ql || [r.virksomhed, r.postnr, r.by, navn(r.fra), navn(r.til), aarsag ? aarsag(r.aarsag) : ""].some((v) => v.toLowerCase().includes(ql)))
    .sort((a, b) => {
      const d = sort.k === "oms" ? a.oms - b.oms : sort.k === "db" ? a.db - b.db
        : sort.k === "aarsag" ? (aarsag?.(a.aarsag) ?? "").localeCompare(aarsag?.(b.aarsag) ?? "", "da")
        : sort.k === "fra" || sort.k === "til" ? navn(a[sort.k]).localeCompare(navn(b[sort.k]), "da") : a[sort.k].localeCompare(b[sort.k], "da");
      return sort.asc ? d : -d;
    });
  const th = (k: typeof sort.k, l: string, right?: boolean) => {
    const Ic = sort.k !== k ? ArrowUpDown : sort.asc ? ArrowUp : ArrowDown;
    return <th className={"px-1 py-1 font-medium whitespace-nowrap " + (right ? "text-right" : "text-left")}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort({ k, asc: sort.k === k ? !sort.asc : !(k === "oms" || k === "db") })}>{l}<Ic className="h-3 w-3" /></button></th>;
  };
  const eksport = () => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Virksomhed", "Postnr", "By", "Fra sælger", "Til sælger", "Nuværende sælger (Visma)", ...(aarsag ? ["Årsag"] : []), "Oms. 12 mdr", "DB 12 mdr"].map(esc).join(";"),
      ...vis.map((r) => [r.virksomhed, r.postnr, r.by, navn(r.fra), navn(r.til), navn(r.nu), ...(aarsag ? [aarsag(r.aarsag)] : []), Math.round(r.oms), Math.round(r.db)].map(esc).join(";"))];
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fil; a.click();
  };
  return (
    <div className="space-y-2 pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{titel}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{vis.length} af {rows.length} lokationer</span>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={eksport} disabled={!vis.length}>Eksportér CSV</Button>
      </div>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg virksomhed, postnr., sælger…" className="h-8 pl-7 text-xs" />
      </div>
      <div className="text-[11px] text-muted-foreground">{undertekst}</div>
      {filter && <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs">Fra/til: {filter}<button type="button" aria-label="Fjern" onClick={onFjernFilter}><X className="h-3 w-3" /></button></span>}
      <table className="w-full text-xs">
        <thead className="text-muted-foreground"><tr>{th("virksomhed", "Lokation")}{th("postnr", "Postnr./by")}{th("fra", "Fra")}{th("til", "Til")}{aarsag && th("aarsag", "Årsag")}{th("oms", "Oms.", true)}{th("db", "DB", true)}</tr></thead>
        <tbody>
          {vis.map((r) => (
            <tr key={r.location_id} className="border-t border-border cursor-pointer hover:bg-muted/40" onClick={() => window.open(`/virksomheder/${r.company_id}`, "_blank")}>
              <td className="px-1 py-1 max-w-[200px] truncate" title={r.virksomhed}>{r.virksomhed}</td>
              <td className="px-1 max-w-[80px] truncate" title={`${r.postnr} ${r.by}`}>{r.postnr} {r.by}</td>
              <td className="px-1 max-w-[70px] truncate" title={navn(r.fra)}>{navn(r.fra)}</td>
              <td className="px-1 max-w-[70px] truncate" title={navn(r.til)}>{navn(r.til)}</td>
              {aarsag && <td className="px-1 max-w-[80px] truncate" title={aarsag(r.aarsag)}>{aarsag(r.aarsag)}</td>}
              <td className="px-1 text-right tabular-nums whitespace-nowrap">{kr(r.oms)}</td>
              <td className="px-1 text-right tabular-nums whitespace-nowrap text-muted-foreground">{kr(r.db)}</td>
            </tr>
          ))}
          {!vis.length && <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">Ingen lokationer skifter sælger.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function NavnDialog({ titel, start, ok, onLuk }: { titel: string; start: string; ok: (n: string) => Promise<void>; onLuk: () => void }) {
  const [n, setN] = useState(start);
  const [b, setB] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onLuk()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{titel}</DialogTitle></DialogHeader>
        <Input autoFocus value={n} onChange={(e) => setN(e.target.value)} placeholder="Navn" />
        <DialogFooter><Button variant="outline" onClick={onLuk}>Annullér</Button>
          <Button disabled={b || !n.trim()} onClick={async () => { setB(true); await ok(n.trim()); setB(false); onLuk(); }}>Gem</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const sel = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm";

function ScDistriktDialog({ d, scenarieId, profiler, fiktive, onLuk, onGemt }: { d: Partial<ScDistrikt>; scenarieId: string; profiler: Profil[]; fiktive: ScSaelger[]; onLuk: () => void; onGemt: () => void }) {
  const [f, setF] = useState<Partial<ScDistrikt>>(d);
  const aktive = profiler.filter((p) => p.is_active !== false && p.full_name);
  const saelgerVal = f.saelger_user_id ? "u:" + f.saelger_user_id : f.saelger_fiktiv_id ? "f:" + f.saelger_fiktiv_id : "";
  const besat = !!saelgerVal;
  const gem = async () => {
    if (!f.navn?.trim()) return toast.error("Navn mangler");
    const row = { scenarie_id: scenarieId, navn: f.navn.trim(), farve: f.farve || "#888888", landsdel: f.landsdel || null, sort: f.sort ?? 0,
      saelger_user_id: f.saelger_user_id || null, saelger_fiktiv_id: f.saelger_fiktiv_id || null, daekkes_af_user_id: besat ? null : f.daekkes_af_user_id || null };
    const { error } = f.id ? await sb().from("scenarie_distrikt").update(row).eq("id", f.id) : await sb().from("scenarie_distrikt").insert(row);
    if (error) return toast.error(error.message);
    onGemt();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onLuk()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{f.id ? "Rediger distrikt (scenarie)" : "Nyt distrikt (scenarie)"}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="block">Navn<Input value={f.navn ?? ""} onChange={(e) => setF({ ...f, navn: e.target.value })} /></label>
          <label className="block">Sælger
            <select className={sel} value={saelgerVal} onChange={(e) => {
              const v = e.target.value;
              setF({ ...f, saelger_user_id: v.startsWith("u:") ? v.slice(2) : null, saelger_fiktiv_id: v.startsWith("f:") ? v.slice(2) : null });
            }}>
              <option value="">NY (ubesat)</option>
              {fiktive.length > 0 && <optgroup label="Fiktive sælgere">{fiktive.map((s) => <option key={s.id} value={"f:" + s.id}>{s.navn} (fiktiv)</option>)}</optgroup>}
              <optgroup label="Sælgere">{aktive.map((p) => <option key={p.id} value={"u:" + p.id}>{p.full_name}</option>)}</optgroup>
            </select>
          </label>
          {!besat && (
            <label className="block">Dækkes midlertidigt af
              <select className={sel} value={f.daekkes_af_user_id ?? ""} onChange={(e) => setF({ ...f, daekkes_af_user_id: e.target.value || null })}>
                <option value="">Ingen</option>
                {aktive.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </label>
          )}
          <div className="grid grid-cols-3 gap-2">
            <label className="block">Landsdel
              <select className={sel} value={f.landsdel ?? ""} onChange={(e) => setF({ ...f, landsdel: e.target.value || null })}>
                <option value="">—</option><option>Øst</option><option>Vest</option>
              </select>
            </label>
            <label className="block">Farve<Input type="color" value={f.farve ?? "#888888"} onChange={(e) => setF({ ...f, farve: e.target.value })} /></label>
            <label className="block">Sortering<Input type="number" value={f.sort ?? 0} onChange={(e) => setF({ ...f, sort: Number(e.target.value) })} /></label>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onLuk}>Annullér</Button><Button onClick={gem}>Gem</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScSaelgerDialog({ s, scenarieId, profiler, onLuk, onGemt }: { s: Partial<ScSaelger>; scenarieId: string; profiler: Profil[]; onLuk: () => void; onGemt: () => void }) {
  const [f, setF] = useState<Partial<ScSaelger>>(s);
  const aktive = profiler.filter((p) => p.is_active !== false && p.full_name);
  const gem = async () => {
    if (!f.navn?.trim()) return toast.error("Navn mangler");
    const row = { scenarie_id: scenarieId, navn: f.navn.trim(), farve: f.farve || "#6a6a6a", profil_id: f.profil_id || null };
    const { error } = f.id ? await sb().from("scenarie_saelger").update(row).eq("id", f.id) : await sb().from("scenarie_saelger").insert(row);
    if (error) return toast.error(error.message);
    onGemt();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onLuk()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{f.id ? "Rediger fiktiv sælger" : "Ny fiktiv sælger"}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="block">Navn<Input value={f.navn ?? ""} onChange={(e) => setF({ ...f, navn: e.target.value })} placeholder="Fx Ny sælger Fyn" /></label>
          <label className="block">Farve<Input type="color" value={f.farve ?? "#6a6a6a"} onChange={(e) => setF({ ...f, farve: e.target.value })} /></label>
          <label className="block">Kobl til rigtig profil (kræves før scenariet kan gøres gældende)
            <select className={sel} value={f.profil_id ?? ""} onChange={(e) => setF({ ...f, profil_id: e.target.value || null })}>
              <option value="">Ikke koblet</option>
              {aktive.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </label>
        </div>
        <DialogFooter><Button variant="outline" onClick={onLuk}>Annullér</Button><Button onClick={gem}>Gem</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({ kilde, scenarieId, distrikter, onLuk, onGemt }: { kilde: ScDistrikt; scenarieId: string; distrikter: ScDistrikt[]; onLuk: () => void; onGemt: () => void }) {
  const [til, setTil] = useState("");
  const gem = async () => {
    if (!til) return;
    const a = await sb().from("scenarie_flade").update({ distrikt_id: til }).eq("scenarie_id", scenarieId).eq("distrikt_id", kilde.id);
    if (a.error) return toast.error(a.error.message);
    const b = await sb().from("scenarie_distrikt").delete().eq("id", kilde.id);
    if (b.error) return toast.error(b.error.message);
    toast.success("Distrikter slået sammen");
    onGemt();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onLuk()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Slå "{kilde.navn}" sammen med…</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Alle flader flyttes til det valgte distrikt, og "{kilde.navn}" slettes fra scenariet.</p>
        <select className={sel} value={til} onChange={(e) => setTil(e.target.value)}>
          <option value="">Vælg distrikt</option>
          {distrikter.filter((d) => d.id !== kilde.id).map((d) => <option key={d.id} value={d.id}>{d.navn}</option>)}
        </select>
        <DialogFooter><Button variant="outline" onClick={onLuk}>Annullér</Button><Button disabled={!til} onClick={gem}>Slå sammen</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GoerGaeldendeDialog({ sc, scenarie, dd, flytninger, fladeNavn, onLuk, onFaerdig }: {
  sc: ScData; scenarie: Scenarie; dd: DistriktData; flytninger: number; fladeNavn: Map<number, string>; onLuk: () => void; onFaerdig: () => void;
}) {
  const [b, setB] = useState(false);
  const scMap = new Map(sc.distrikter.map((d) => [d.id, d]));
  const flader = new Set<number>([...sc.fladeDistrikt.keys(), ...dd.fladeDistrikt.keys()]);
  let skifter = 0;
  flader.forEach((fl) => { const s = scMap.get(sc.fladeDistrikt.get(fl) ?? ""); if ((s?.kilde_distrikt_id ?? null) !== (dd.fladeDistrikt.get(fl) ?? null)) skifter++; });
  const brugte = new Set(sc.distrikter.map((d) => d.saelger_fiktiv_id).filter(Boolean));
  const mangler = sc.saelgere.filter((s) => brugte.has(s.id) && !s.profil_id);
  const nye = sc.distrikter.filter((d) => !d.kilde_distrikt_id || !dd.distrikter.some((x) => x.id === d.kilde_distrikt_id)).length;
  const fjernes = dd.distrikter.filter((x) => !sc.distrikter.some((d) => d.kilde_distrikt_id === x.id)).length;
  void fladeNavn;
  const goer = async () => {
    setB(true);
    const { error } = await sb().rpc("scenarie_gor_gaeldende", { _id: scenarie.id });
    setB(false);
    if (error) return toast.error(error.message);
    toast.success("Scenariet er nu det gældende distriktskort. Det tidligere er gemt som arkiveret scenarie.");
    onFaerdig();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onLuk()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Gør "{scenarie.navn}" gældende?</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          <ul className="list-disc pl-5 space-y-0.5">
            <li>{skifter.toLocaleString("da-DK")} flader skifter distrikt</li>
            <li>{flytninger.toLocaleString("da-DK")} lokationer skifter sælger (under de aktive filtre)</li>
            <li>{nye} nye distrikter · {fjernes} distrikter fjernes</li>
          </ul>
          <p className="text-muted-foreground">Det nuværende distriktskort gemmes som arkiveret scenarie "Gældende før [dato]". Sælgertildelingen på lokationer og i Visma ændres ikke – brug flyttelisten til det.</p>
          {mangler.length > 0 && (
            <div className="rounded border border-border bg-muted/50 p-2">
              <b>Kan ikke gøres gældende endnu.</b> Disse fiktive sælgere skal kobles til en rigtig profil først: {mangler.map((s) => s.navn).join(", ")}.
            </div>
          )}
        </div>
        <DialogFooter><Button variant="outline" onClick={onLuk}>Annullér</Button><Button disabled={b || mangler.length > 0} onClick={goer}>Gør gældende</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MultiValg({ titel, valg, valgte, setValgte, vis }: { titel: string; valg: Valg; valgte: string[]; setValgte: (v: string[]) => void; vis?: (v: string) => string }) {
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const v = (x: string) => (vis ? vis(x) : x);
  const liste = [...valg.filter(([x]) => valgte.includes(x)), ...valg.filter(([x]) => !valgte.includes(x) && (!ql || v(x).toLowerCase().includes(ql)))];
  return (
    <div className="space-y-1 min-w-0">
      <div className="text-xs font-medium">{titel}{valgte.length ? ` (${valgte.length} valgt)` : ""}</div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg…" className="h-7 text-xs" />
      <div className="max-h-32 overflow-y-auto rounded border border-border p-1 space-y-0.5">
        {liste.slice(0, ql ? 200 : 60).map(([x, n]) => (
          <label key={x} className="flex items-center gap-2 text-xs cursor-pointer min-w-0">
            <Checkbox checked={valgte.includes(x)} onCheckedChange={() => setValgte(valgte.includes(x) ? valgte.filter((y) => y !== x) : [...valgte, x])} />
            <span className="flex-1 min-w-0 truncate" title={v(x)}>{v(x)}</span><span className="text-muted-foreground tabular-nums shrink-0">{n}</span>
          </label>
        ))}
        {!liste.length && <div className="text-xs text-muted-foreground p-1">Ingen match.</div>}
      </div>
    </div>
  );
}

function RegelDialog({ r, scenarieId, antal, profiler, fiktive, valg, distrikter, regioner, taelRegel, ukendte, onLuk, onGemt }: {
  r: Partial<ScRegel>; scenarieId: string; antal: number; profiler: Profil[]; fiktive: ScSaelger[]; valg: RegelValg;
  distrikter: ScDistrikt[]; regioner: string[]; taelRegel: (r: Regel) => { n: number; oms: number };
  ukendte: number; onLuk: () => void; onGemt: () => void;
}) {
  const [type, setType] = useState<RegelType>(r.type ?? "tildel");
  const [saelger, setSaelger] = useState(r.saelger_user_id ? "u:" + r.saelger_user_id : r.saelger_fiktiv_id ? "f:" + r.saelger_fiktiv_id : "");
  const [b, setB] = useState<Betingelse>(r.betingelse ?? {});
  const [ansatteTil, setAnsatteTil] = useState(b.ansatteOver != null);
  const aktive = profiler.filter((p) => p.is_active !== false && p.full_name);
  const saelgerOpt = (
    <>
      <option value="">Vælg sælger…</option>
      <optgroup label="Sælgere">{aktive.map((p) => <option key={p.id} value={"u:" + p.id}>{p.full_name}</option>)}</optgroup>
      {fiktive.length > 0 && <optgroup label="Fiktive sælgere">{fiktive.map((f) => <option key={f.id} value={"f:" + f.id}>{f.navn} (fiktiv)</option>)}</optgroup>}
    </>
  );
  const omr: Omraade = b.omraade ?? { type: "land", vaerdier: [] };
  const setOmr = (o: Omraade) => setB({ ...b, omraade: o });
  const byg = (): Betingelse => {
    const omraade = omr.type === "land" ? null : omr;
    return type === "tildel"
      ? { kpg1: b.kpg1 ?? [], kpg2: b.kpg2 ?? [], kpg3: b.kpg3 ?? [], omraade }
      : { kpg1: b.kpg1 ?? [], kpg3: b.kpg3 ?? [], ansatteOver: ansatteTil ? b.ansatteOver ?? 100 : null, ukendtSomOver: !!b.ukendtSomOver,
          alternativ: b.alternativ ?? "behold", alternativSaelger: b.alternativ === "saelger" ? b.alternativSaelger ?? null : null, omraade };
  };
  const live = useMemo(() => {
    const bet = byg();
    if (!bet.kpg1?.length && !bet.kpg2?.length && !bet.kpg3?.length && bet.ansatteOver == null) return { n: 0, oms: 0 };
    return taelRegel({ id: "_", type, saelger: "", aktiv: true, b: bet });
  }, [b, type, ansatteTil]);
  const gem = async () => {
    if (!saelger) return toast.error("Vælg en sælger");
    if (omr.type !== "land" && !omr.vaerdier.length) return toast.error("Vælg mindst ét område, eller vælg Hele landet");
    const bet = byg();
    const tom = !bet.kpg1?.length && !bet.kpg2?.length && !bet.kpg3?.length && bet.ansatteOver == null;
    if (tom) return toast.error("Vælg mindst én betingelse");
    if (bet.alternativ === "saelger" && !bet.alternativSaelger) return toast.error("Vælg hvem de udelukkede lokationer går til");
    const row = { scenarie_id: scenarieId, type, betingelse: bet, aktiv: r.aktiv ?? true,
      saelger_user_id: saelger.startsWith("u:") ? saelger.slice(2) : null, saelger_fiktiv_id: saelger.startsWith("f:") ? saelger.slice(2) : null,
      ...(r.id ? {} : { sortering: antal }) };
    const { error } = r.id ? await sb().from("scenarie_regel").update(row).eq("id", r.id) : await sb().from("scenarie_regel").insert(row);
    if (error) return toast.error(error.message);
    onGemt();
  };
  const kpg2Vis = (k: string) => { const [a, c] = k.split("||"); return `${c} (${a})`; };
  return (
    <Dialog open onOpenChange={(o) => !o && onLuk()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden grid-cols-[minmax(0,1fr)] [&>*]:min-w-0">
        <DialogHeader><DialogTitle>{r.id ? "Rediger regel" : "Ny regel"}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm min-w-0">
          <div className="flex gap-2">
            <Button size="sm" variant={type === "tildel" ? "default" : "outline"} onClick={() => setType("tildel")}>Tildel til sælger</Button>
            <Button size="sm" variant={type === "udeluk" ? "default" : "outline"} onClick={() => setType("udeluk")}>Må ikke have</Button>
          </div>
          <p className="text-xs text-muted-foreground">{type === "tildel" ? "Lokationer der matcher, går til sælgeren uanset distrikt (inden for det valgte område)." : "Lokationer der matcher, må ikke gå til sælgeren. Flere valgte betingelser = én af dem er nok."}</p>
          <label className="block">Sælger<select className={sel} value={saelger} onChange={(e) => setSaelger(e.target.value)}>{saelgerOpt}</select></label>
          <IndsaetKoder valg={valg} typer={type === "tildel" ? ["kpg1", "kpg2", "kpg3"] : ["kpg1", "kpg3"]}
            onTilfoej={(t, k) => setB((x) => ({ ...x, [t]: [...new Set([...(x[t] ?? []), ...k])] }))} />
          <MultiValg titel="Aftale (KPG1)" valg={valg.kpg1} valgte={b.kpg1 ?? []} setValgte={(v) => setB({ ...b, kpg1: v })} />
          {type === "tildel" && <MultiValg titel="Underaftale (KPG2)" valg={valg.kpg2} valgte={b.kpg2 ?? []} setValgte={(v) => setB({ ...b, kpg2: v })} vis={kpg2Vis} />}
          <MultiValg titel="Segment (KPG3)" valg={valg.kpg3} valgte={b.kpg3 ?? []} setValgte={(v) => setB({ ...b, kpg3: v })} />
          {type === "udeluk" && (
            <>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-xs cursor-pointer"><Checkbox checked={ansatteTil} onCheckedChange={(v) => setAnsatteTil(!!v)} />Antal ansatte over</label>
                {ansatteTil && <>
                  <Input type="number" min={0} className="h-8 w-32" value={b.ansatteOver ?? 100} onChange={(e) => setB({ ...b, ansatteOver: Number(e.target.value) })} />
                  <p className="text-[11px] text-muted-foreground">Bruger virksomhedens samlede antal ansatte (CVR). Findes det ikke, bruges summen af koblede P-enheder. {ukendte.toLocaleString("da-DK")} lokationer (under de aktive filtre) har ukendt antal.</p>
                  <label className="block text-xs">Ukendt antal ansatte tæller som
                    <select className={sel} value={b.ukendtSomOver ? "over" : "under"} onChange={(e) => setB({ ...b, ukendtSomOver: e.target.value === "over" })}>
                      <option value="under">under grænsen</option><option value="over">over grænsen</option>
                    </select>
                  </label>
                </>}
              </div>
              <label className="block">Udelukkede lokationer
                <select className={sel} value={b.alternativ ?? "behold"} onChange={(e) => setB({ ...b, alternativ: e.target.value as any })}>
                  <option value="behold">Beholder nuværende sælger</option><option value="saelger">Går til…</option>
                </select>
              </label>
              {b.alternativ === "saelger" && (
                <select className={sel} value={b.alternativSaelger ? (b.alternativSaelger.startsWith("f:") ? b.alternativSaelger : "u:" + b.alternativSaelger) : ""}
                  onChange={(e) => { const v = e.target.value; setB({ ...b, alternativSaelger: !v ? null : v.startsWith("u:") ? v.slice(2) : v }); }}>{saelgerOpt}</select>
              )}
            </>
          )}
          <div className="space-y-1 border-t border-border pt-2">
            <div className="font-medium">Område</div>
            <p className="text-[11px] text-muted-foreground">Lokationen skal matche betingelserne ovenfor <b>og</b> ligge i området.</p>
            <div className="flex flex-wrap gap-3 text-xs">
              {([["land", "Hele landet"], ["landsdel", "Landsdel"], ["distrikt", "Distrikter"], ...(regioner.length ? [["region", "Regioner"]] : [])] as [Omraade["type"], string][]).map(([t, l]) => (
                <label key={t} className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="omr" checked={omr.type === t} onChange={() => setOmr({ type: t, vaerdier: [] })} />{l}
                </label>
              ))}
            </div>
            {omr.type === "landsdel" && <SoegListe titel="Landsdel" valg={[["Vest", null], ["Øst", null]]} valgte={omr.vaerdier} setValgte={(v) => setOmr({ ...omr, vaerdier: v })} vis={(x) => x} />}
            {omr.type === "distrikt" && <SoegListe titel="Scenariets distrikter" valg={distrikter.map((d) => [d.id, null] as [string, null])} valgte={omr.vaerdier}
              setValgte={(v) => setOmr({ ...omr, vaerdier: v })} vis={(x) => distrikter.find((d) => d.id === x)?.navn ?? "?"} />}
            {omr.type === "region" && <SoegListe titel="Regioner" valg={regioner.map((x) => [x, null] as [string, null])} valgte={omr.vaerdier} setValgte={(v) => setOmr({ ...omr, vaerdier: v })} vis={(x) => x} />}
          </div>
        </div>
        <div className="text-xs tabular-nums text-muted-foreground" data-testid="regel-live">Rammer {live.n.toLocaleString("da-DK")} lokationer · {kr(live.oms)}</div>
        <DialogFooter><Button variant="outline" onClick={onLuk}>Annullér</Button><Button onClick={gem}>Gem</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KamPortefoelje({ rows, navn, farve }: { rows: KamRow[]; navn: (k: string) => string; farve: (k: string) => string }) {
  const k = (n: number) => Math.round(n / 1000).toLocaleString("da-DK");
  const fe = (a: number, b: number, f: (n: number) => string = (n) => n.toLocaleString("da-DK")) => (
    <span><span className="text-muted-foreground whitespace-nowrap">{f(a)}→</span><wbr /><span className="whitespace-nowrap">{f(b)}</span></span>
  );
  return (
    <div className="pt-2">
      <div className="font-medium mb-1">KAM-portefølje</div>
      {!rows.length ? <div className="text-xs text-muted-foreground">Ingen KAM-ansvarlige.</div> : (
        <table className="w-full text-[11px]">
          <thead className="text-muted-foreground"><tr className="text-right"><th className="text-left font-medium px-1">KAM-ansvarlig</th><th className="font-medium px-1">Aft.</th><th className="font-medium px-1">Lok.</th><th className="font-medium px-1">Oms. · Δ</th><th className="font-medium px-1">DB · Δ</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border text-right tabular-nums">
                <td className="text-left px-1 py-1 max-w-[160px]"><div className="flex items-center gap-1 min-w-0">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: farve(r.key), outline: r.key.startsWith("f:") ? "1px dashed currentColor" : undefined }} />
                  <span className="truncate" title={navn(r.key)}>{navn(r.key)}</span></div></td>
                <td className="px-1">{fe(r.foer.aftaler, r.efter.aftaler)}</td>
                <td className="px-1">{fe(r.foer.n, r.efter.n)}</td>
                <td className="px-1 leading-tight">{fe(r.foer.oms, r.efter.oms, k)}<div className="text-muted-foreground whitespace-nowrap">{fortegn(r.efter.oms - r.foer.oms, k)}</div></td>
                <td className="px-1 leading-tight">{fe(r.foer.db, r.efter.db, k)}<div className="text-muted-foreground whitespace-nowrap">{fortegn(r.efter.db - r.foer.db, k)}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="text-[11px] text-muted-foreground mt-1">Før = gældende KAM-aftaler, efter = scenariet. Oms. og DB i 1.000 kr. KAM-grundlag er et selvstændigt provisionsgrundlag og lægges ikke sammen med distriktssælgernes tal.</div>
    </div>
  );
}

const mio = (n: number) => Math.abs(n) >= 1e6 ? (n / 1e6).toLocaleString("da-DK", { maximumFractionDigits: 1 }) + " mio." : Math.round(n / 1000).toLocaleString("da-DK") + " t.kr.";

function RaekkeMenu({ punkter }: { punkter: [string, () => void][] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Handlinger" className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-3.5 w-3.5" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {punkter.map(([l, f]) => <DropdownMenuItem key={l} onSelect={() => f()}>{l}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
