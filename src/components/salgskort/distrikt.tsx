import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search } from "lucide-react";
import type { KamAftale } from "@/lib/simulering-regler";

export type Distrikt = {
  id: string; navn: string; saelger_user_id: string | null; daekkes_af_user_id: string | null;
  landsdel: string | null; farve: string; sort: number; aktiv: boolean;
};
export type Profil = { id: string; full_name: string | null; is_active: boolean | null };
export type DistriktData = {
  distrikter: Distrikt[]; fladeDistrikt: Map<number, string>; kamAftaler: KamAftale[]; profiler: Profil[];
};

export const distriktSaelger = (d: Distrikt | undefined | null) => d ? d.saelger_user_id ?? d.daekkes_af_user_id : null;
export const initialer = (navn: string | null | undefined) =>
  (navn ?? "").split(/\s+/).filter(Boolean).map((s) => s[0]).join("").slice(0, 3).toUpperCase() || "?";
export const kpg3Kode = (s: string | null | undefined) => (s ?? "").match(/^\s*(\d+)/)?.[1] ?? null;

export async function hentDistriktData(): Promise<DistriktData> {
  const sb = supabase as any;
  const [d, f, i, p] = await Promise.all([
    sb.from("distrikter").select("*").order("sort").order("navn"),
    sb.from("distrikt_flade").select("flade,distrikt_id"),
    sb.from("kam_aftale").select("*").order("navn"),
    sb.from("profiles").select("id,full_name,is_active").order("full_name"),
  ]);
  for (const r of [d, f, i, p]) if (r.error) throw r.error;
  const m = new Map<number, string>();
  (f.data ?? []).forEach((r: any) => m.set(r.flade, r.distrikt_id));
  const kamAftaler: KamAftale[] = (i.data ?? []).map((a: any) => ({ id: a.id, navn: a.navn, kodetype: a.kodetype, koder: a.koder ?? [], ansvarlige: a.kam_ansvarlige ?? [], aktiv: a.aktiv }));
  return { distrikter: d.data ?? [], fladeDistrikt: m, kamAftaler, profiler: p.data ?? [] };
}

const kr = (n: number) => Math.round(n).toLocaleString("da-DK") + " kr.";

export type DistriktStat = { flader: number; n: number; match: number; db: number; oms: number };

export function DistriktPanel({
  data, stats, navn, redigerer, setRedigerer, valgt, setValgt, kanFortryde, onFortryd, onGemt, kamValg, kamStat, kunVisning,
}: {
  data: DistriktData; stats: Map<string, DistriktStat>; navn: (id: string | null) => string;
  redigerer: boolean; setRedigerer: (b: boolean) => void; valgt: string | null; setValgt: (id: string | null) => void;
  kanFortryde: boolean; onFortryd: () => void; onGemt: () => void; kamValg: KamValg; kamStat: Map<string, { n: number; oms: number }>; kunVisning?: boolean;
}) {
  const [edit, setEdit] = useState<Partial<Distrikt> | null>(null);
  const [visKam, setVisKam] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">Distrikter</span>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setVisKam(true)}>KAM-aftaler</Button>
          {!kunVisning && <Button size="sm" variant="outline" onClick={() => setEdit({ navn: "", farve: "#3b5b92", landsdel: "Vest", sort: data.distrikter.length + 1 })}>Nyt distrikt</Button>}
        </div>
      </div>
      {!kunVisning && data.distrikter.length > 0 && (
        <Button size="sm" variant={redigerer ? "default" : "outline"} className="w-full" onClick={() => setRedigerer(!redigerer)}>
          {redigerer ? "Afslut redigering" : "Redigér grænser"}
        </Button>
      )}
      {!kunVisning && redigerer && (
        <div className="rounded border-2 border-primary bg-primary/5 p-2 text-xs space-y-2">
          <div className="font-medium">Redigeringstilstand</div>
          <div>{valgt ? <>Klik eller træk hen over flader for at flytte dem til <b>{data.distrikter.find((d) => d.id === valgt)?.navn}</b>.</> : "Vælg et distrikt i listen herunder."}</div>
          <Button size="sm" variant="outline" disabled={!kanFortryde} onClick={onFortryd}>Fortryd seneste</Button>
        </div>
      )}
      {data.distrikter.length === 0 && <div className="text-muted-foreground text-sm">Ingen distrikter endnu.</div>}
      <ul className="space-y-1">
        {data.distrikter.map((d) => {
          const s = stats.get(d.id) ?? { flader: 0, n: 0, match: 0, db: 0, oms: 0 };
          const pct = s.n ? Math.round((100 * s.match) / s.n) + " %" : "—";
          const ds = distriktSaelger(d);
          const hos = s.n && ds ? ` hos ${navn(ds).split(/\s+/).slice(0, 2).join(" ")}` : "";
          const saelger = d.saelger_user_id ? navn(d.saelger_user_id) : `NY – dækkes af ${d.daekkes_af_user_id ? navn(d.daekkes_af_user_id) : "ingen"}`;
          return (
            <li key={d.id}
              onClick={() => redigerer && setValgt(d.id)}
              className={"rounded border p-2 text-xs " + (redigerer ? "cursor-pointer hover:bg-muted/40 " : "") + (valgt === d.id && redigerer ? "border-primary ring-1 ring-primary" : "border-border")}>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm shrink-0" style={{ background: d.farve, outline: d.saelger_user_id ? undefined : "1px dashed currentColor" }} />
                <span className="font-medium flex-1 truncate">{d.navn}</span>
                {!kunVisning && <button type="button" className="text-muted-foreground hover:underline" onClick={(e) => { e.stopPropagation(); setEdit(d); }}>Rediger</button>}
              </div>
              <div className="text-muted-foreground mt-0.5">{saelger}{d.landsdel ? ` · ${d.landsdel}` : ""}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 tabular-nums">
                <span>{s.flader} {s.flader === 1 ? "flade" : "flader"}</span>
                <span>{s.n.toLocaleString("da-DK")} {s.n === 1 ? "lokation" : "lokationer"}</span>
                <span>{kr(s.oms)} oms.</span>
                <span className="cursor-help" title="Andel af distriktets lokationer (alle undtagen Frellsen 199), hvor ansvarlig sælger i Visma er distriktets sælger">{pct}{hos}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {edit && <DistriktDialog d={edit} profiler={data.profiler} onLuk={() => setEdit(null)} onGemt={() => { setEdit(null); onGemt(); }} />}
      {visKam && <KamAftalerDialog aftaler={data.kamAftaler} profiler={data.profiler} valg={kamValg} stat={kamStat} navn={navn} onLuk={() => setVisKam(false)} onGemt={onGemt} />}
    </div>
  );
}

function DistriktDialog({ d, profiler, onLuk, onGemt }: { d: Partial<Distrikt>; profiler: Profil[]; onLuk: () => void; onGemt: () => void }) {
  const [f, setF] = useState<Partial<Distrikt>>(d);
  const [gemmer, setGemmer] = useState(false);
  const aktive = profiler.filter((p) => p.is_active !== false && p.full_name);
  const gem = async () => {
    if (!f.navn?.trim()) return toast.error("Navn mangler");
    setGemmer(true);
    const row = { navn: f.navn.trim(), saelger_user_id: f.saelger_user_id || null, daekkes_af_user_id: f.saelger_user_id ? null : f.daekkes_af_user_id || null,
      landsdel: f.landsdel || null, farve: f.farve || "#888888", sort: f.sort ?? 0 };
    const sb = supabase as any;
    const { error } = f.id ? await sb.from("distrikter").update(row).eq("id", f.id) : await sb.from("distrikter").insert(row);
    setGemmer(false);
    if (error) return toast.error(error.message);
    toast.success("Distrikt gemt");
    onGemt();
  };
  const sel = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm";
  return (
    <Dialog open onOpenChange={(o) => !o && onLuk()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{f.id ? "Rediger distrikt" : "Nyt distrikt"}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="block">Navn<Input value={f.navn ?? ""} onChange={(e) => setF({ ...f, navn: e.target.value })} /></label>
          <label className="block">Sælger
            <select className={sel} value={f.saelger_user_id ?? ""} onChange={(e) => setF({ ...f, saelger_user_id: e.target.value || null })}>
              <option value="">NY (ubesat)</option>
              {aktive.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </label>
          {!f.saelger_user_id && (
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
        <DialogFooter><Button variant="outline" onClick={onLuk}>Annullér</Button><Button disabled={gemmer} onClick={gem}>Gem</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type KamValg = { kpg1: [string, number][]; kpg2: [string, number][]; kpg3: [string, number][] };
const KODETYPE = { kpg1: "Aftale (KPG1)", kpg2: "Underaftale (KPG2)", kpg3: "Segment (KPG3)" } as const;
export const kodeVis = (kodetype: string, k: string) => kodetype === "kpg2" ? `${k.split("||")[1]} (${k.split("||")[0]})` : k;

function KamAftalerDialog({ aftaler, profiler, valg, stat, navn, onLuk, onGemt }: {
  aftaler: KamAftale[]; profiler: Profil[]; valg: KamValg; stat: Map<string, { n: number; oms: number }>; navn: (id: string | null) => string; onLuk: () => void; onGemt: () => void;
}) {
  const [edit, setEdit] = useState<Partial<KamAftale> | null>(null);
  const slet = async (a: KamAftale) => {
    if (!confirm(`Slet KAM-aftalen "${a.navn}"?`)) return;
    const { error } = await (supabase as any).from("kam_aftale").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    onGemt();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onLuk()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto overflow-x-hidden grid-cols-[minmax(0,1fr)] [&>*]:min-w-0">
        <DialogHeader><DialogTitle>KAM-aftaler</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">KAM går på tværs af distrikterne. Lokationerne beholder deres distriktssælger og tæller stadig i distriktsanalysen.</p>
        <div className="flex justify-end"><Button size="sm" onClick={() => setEdit({ navn: "", kodetype: "kpg1", koder: [], ansvarlige: [], aktiv: true })}>Ny KAM-aftale</Button></div>
        {!aftaler.length && <div className="text-sm text-muted-foreground">Ingen KAM-aftaler endnu.</div>}
        <ul className="space-y-1">
          {aftaler.map((a) => {
            const st = stat.get(a.id) ?? { n: 0, oms: 0 };
            return (
              <li key={a.id} className={"rounded border border-border p-2 text-xs space-y-0.5 " + (a.aktiv ? "" : "opacity-60")}>
                <div className="flex items-center gap-2">
                  <span className="font-medium flex-1 truncate">{a.navn}{a.aktiv ? "" : " (inaktiv)"}</span>
                  <button type="button" className="text-muted-foreground hover:underline" onClick={() => setEdit(a)}>Rediger</button>
                  <button type="button" className="text-muted-foreground hover:underline" onClick={() => slet(a)}>Slet</button>
                </div>
                <div className="text-muted-foreground truncate" title={a.koder.map((k) => kodeVis(a.kodetype, k)).join(", ")}>{KODETYPE[a.kodetype]}: {a.koder.length} {a.koder.length === 1 ? "kode" : "koder"} · {a.ansvarlige.length ? a.ansvarlige.map((x) => navn(x)).join(", ") : "ingen ansvarlig"}</div>
                <div className="tabular-nums">{st.n.toLocaleString("da-DK")} lokationer · {kr(st.oms)} oms.</div>
              </li>
            );
          })}
        </ul>
        <DialogFooter><Button variant="outline" onClick={onLuk}>Luk</Button></DialogFooter>
        {edit && <KamAftaleDialog a={edit} profiler={profiler} valg={valg} onLuk={() => setEdit(null)} onGemt={() => { setEdit(null); onGemt(); }} />}
      </DialogContent>
    </Dialog>
  );
}

function SoegListe({ titel, valg, valgte, setValgte, vis }: { titel: string; valg: [string, number | null][]; valgte: string[]; setValgte: (v: string[]) => void; vis?: (v: string) => string }) {
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const v = (x: string) => (vis ? vis(x) : x);
  const kendte = new Set(valg.map(([x]) => x));
  const alle: [string, number | null][] = [...valgte.filter((x) => !kendte.has(x)).map((x) => [x, null] as [string, null]), ...valg];
  const liste = [...alle.filter(([x]) => valgte.includes(x)), ...alle.filter(([x]) => !valgte.includes(x) && (!ql || v(x).toLowerCase().includes(ql)))];
  return (
    <div className="space-y-1 min-w-0">
      <div className="text-xs font-medium">{titel}{valgte.length ? ` (${valgte.length} valgt)` : ""}</div>
      <div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg…" className="h-7 pl-7 text-xs" /></div>
      <div className="max-h-40 overflow-y-auto rounded border border-border p-1 space-y-0.5">
        {liste.slice(0, ql ? 200 : 80).map(([x, n]) => (
          <label key={x} className="flex items-center gap-2 text-xs cursor-pointer min-w-0">
            <Checkbox checked={valgte.includes(x)} onCheckedChange={() => setValgte(valgte.includes(x) ? valgte.filter((y) => y !== x) : [...valgte, x])} />
            <span className="flex-1 min-w-0 truncate" title={v(x)}>{v(x)}</span>{n != null && <span className="text-muted-foreground tabular-nums shrink-0">{n}</span>}
          </label>
        ))}
        {!liste.length && <div className="text-xs text-muted-foreground p-1">Ingen match.</div>}
      </div>
    </div>
  );
}
export { SoegListe };

function KamAftaleDialog({ a, profiler, valg, onLuk, onGemt }: { a: Partial<KamAftale>; profiler: Profil[]; valg: KamValg; onLuk: () => void; onGemt: () => void }) {
  const [f, setF] = useState<Partial<KamAftale>>(a);
  const kt = f.kodetype ?? "kpg1";
  const personer: [string, null][] = profiler.filter((p) => p.is_active !== false && p.full_name).map((p) => [p.id, null]);
  const pn = new Map(profiler.map((p) => [p.id, p.full_name ?? "?"]));
  const gem = async () => {
    if (!f.navn?.trim()) return toast.error("Navn mangler");
    if (!f.koder?.length) return toast.error("Vælg mindst én kode");
    const row = { navn: f.navn.trim(), kodetype: kt, koder: f.koder, kam_ansvarlige: f.ansvarlige ?? [], aktiv: f.aktiv ?? true, opdateret_at: new Date().toISOString() };
    const sb = supabase as any;
    const { error } = f.id ? await sb.from("kam_aftale").update(row).eq("id", f.id) : await sb.from("kam_aftale").insert(row);
    if (error) return toast.error(error.message);
    toast.success("KAM-aftale gemt");
    onGemt();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onLuk()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden grid-cols-[minmax(0,1fr)] [&>*]:min-w-0">
        <DialogHeader><DialogTitle>{f.id ? "Rediger KAM-aftale" : "Ny KAM-aftale"}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm min-w-0">
          <label className="block">Navn<Input value={f.navn ?? ""} onChange={(e) => setF({ ...f, navn: e.target.value })} /></label>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(KODETYPE) as (keyof typeof KODETYPE)[]).map((k) => (
              <Button key={k} size="sm" variant={kt === k ? "default" : "outline"} className="h-7 text-xs" onClick={() => setF({ ...f, kodetype: k, koder: kt === k ? f.koder : [] })}>{KODETYPE[k]}</Button>
            ))}
          </div>
          <SoegListe titel="Koder" valg={valg[kt]} valgte={f.koder ?? []} setValgte={(v) => setF({ ...f, koder: v })} vis={(x) => kodeVis(kt, x)} />
          <SoegListe titel="KAM-ansvarlige" valg={personer} valgte={f.ansvarlige ?? []} setValgte={(v) => setF({ ...f, ansvarlige: v })} vis={(x) => pn.get(x) ?? "Ukendt"} />
          <label className="flex items-center gap-2 text-xs cursor-pointer"><Checkbox checked={f.aktiv ?? true} onCheckedChange={(v) => setF({ ...f, aktiv: !!v })} />Aktiv</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={onLuk}>Annullér</Button><Button onClick={gem}>Gem</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type AfvigRow = {
  location_id: string; company_id: string; virksomhed: string; postnr: string; by: string; flade: number;
  distrikt: string; distriktSaelger: string; nuvaerende: string; kpg1: string; db: number;
};

export function AfvigelsesListe({ rows, onZoom }: { rows: AfvigRow[]; onZoom: (flade: number) => void }) {
  const total = rows.reduce((a, r) => a + r.db, 0);
  const eksport = () => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Virksomhed", "Postnr", "Flade", "Distrikt", "Distriktets sælger", "Nuværende sælger", "KPG1", "DB 12 mdr"].map(esc).join(";"),
      ...rows.map((r) => [r.virksomhed, r.postnr, r.by, r.distrikt, r.distriktSaelger, r.nuvaerende, r.kpg1, Math.round(r.db)].map(esc).join(";"))];
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "distrikt-afvigelser.csv"; a.click();
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{rows.length.toLocaleString("da-DK")} lokationer hos en anden sælger end distriktets</span>
        <Button size="sm" variant="outline" onClick={eksport} disabled={!rows.length}>Eksportér CSV</Button>
      </div>
      <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground sticky top-0 bg-card">
            <tr><th className="text-left px-2 py-1">Virksomhed</th><th className="text-left px-2">Postnr/by</th><th className="text-left px-2">Distrikt</th><th className="text-left px-2">Distriktets sælger</th><th className="text-left px-2">Nuværende sælger</th><th className="text-left px-2">KPG1</th><th className="text-right px-2">DB 12 mdr.</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.location_id} onClick={() => onZoom(r.flade)} className="border-t border-border cursor-pointer hover:bg-muted/40">
                <td className="px-2 py-1"><Link to="/virksomheder/$id" params={{ id: r.company_id }} onClick={(e) => e.stopPropagation()} className="hover:underline">{r.virksomhed}</Link></td>
                <td className="px-2">{r.postnr} {r.by}</td><td className="px-2">{r.distrikt}</td><td className="px-2">{r.distriktSaelger}</td>
                <td className="px-2">{r.nuvaerende}</td><td className="px-2 truncate max-w-[180px]">{r.kpg1}</td><td className="px-2 text-right tabular-nums">{kr(r.db)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-border font-medium"><td className="px-2 py-1" colSpan={6}>I alt ({rows.length})</td><td className="px-2 text-right tabular-nums">{kr(total)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
