import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { kodeOversigt, parseKoder, type KamAftale, type Omraade } from "@/lib/simulering-regler";

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
  const kamAftaler: KamAftale[] = (i.data ?? []).map((a: any) => ({ id: a.id, navn: a.navn, kpg1: a.kpg1 ?? [], kpg2: a.kpg2 ?? [], kpg3: a.kpg3 ?? [], omraade: a.omraade ?? null, ansvarlige: a.kam_ansvarlige ?? [], aktiv: a.aktiv }));
  return { distrikter: d.data ?? [], fladeDistrikt: m, kamAftaler, profiler: p.data ?? [] };
}

const kr = (n: number) => Math.round(n).toLocaleString("da-DK") + " kr.";

export type DistriktStat = { flader: number; n: number; match: number; db: number; oms: number };

export function DistriktPanel({
  data, stats, navn, redigerer, setRedigerer, valgt, setValgt, kanFortryde, onFortryd, onGemt, kamValg, kamStat, kunVisning, kamTael, regioner,
}: {
  data: DistriktData; stats: Map<string, DistriktStat>; navn: (id: string | null) => string;
  redigerer: boolean; setRedigerer: (b: boolean) => void; valgt: string | null; setValgt: (id: string | null) => void;
  kanFortryde: boolean; onFortryd: () => void; onGemt: () => void; kamValg: KamValg; kamStat: Map<string, { n: number; oms: number }>; kunVisning?: boolean;
  kamTael: (a: KamAftale) => { n: number; oms: number }; regioner: string[];
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
      {visKam && <KamAftalerDialog aftaler={data.kamAftaler} profiler={data.profiler} valg={kamValg} stat={kamStat} navn={navn} distrikter={data.distrikter} regioner={regioner} tael={kamTael} onLuk={() => setVisKam(false)} onGemt={onGemt} />}
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
export const kodeVis = (kodetype: string, k: string) => kodetype === "kpg2" ? `${k.split("||")[1]} (${k.split("||")[0]})` : k;

function KamAftalerDialog({ aftaler, profiler, valg, stat, navn, distrikter, regioner, tael, onLuk, onGemt }: {
  aftaler: KamAftale[]; profiler: Profil[]; valg: KamValg; stat: Map<string, { n: number; oms: number }>; navn: (id: string | null) => string;
  distrikter: { id: string; navn: string }[]; regioner: string[]; tael: (a: KamAftale) => { n: number; oms: number }; onLuk: () => void; onGemt: () => void;
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
        <div className="flex justify-end"><Button size="sm" onClick={() => setEdit({ navn: "", kpg1: [], kpg2: [], kpg3: [], ansvarlige: [], aktiv: true })}>Ny KAM-aftale</Button></div>
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
                <div className="text-muted-foreground truncate" title={kodeOversigt(a)}>{kodeOversigt(a)}{omrKort(a.omraade, distrikter)} · {a.ansvarlige.length ? a.ansvarlige.map((x) => navn(x)).join(", ") : "ingen ansvarlig"}</div>
                <div className="tabular-nums">{st.n.toLocaleString("da-DK")} lokationer · {kr(st.oms)} oms.</div>
              </li>
            );
          })}
        </ul>
        <DialogFooter><Button variant="outline" onClick={onLuk}>Luk</Button></DialogFooter>
        {edit && <KamFormDialog start={edit} valg={valg} personer={profiler.filter((p) => p.is_active !== false && p.full_name).map((p) => [p.id, p.full_name!] as [string, string])}
          distrikter={distrikter} distriktTitel="Distrikter" regioner={regioner} tael={tael} onLuk={() => setEdit(null)}
          onGem={async (f) => {
            const row = { navn: f.navn, kpg1: f.kpg1, kpg2: f.kpg2, kpg3: f.kpg3, omraade: f.omraade, kam_ansvarlige: f.ansvarlige, aktiv: f.aktiv, opdateret_at: new Date().toISOString() };
            const sb = supabase as any;
            const { error } = edit.id ? await sb.from("kam_aftale").update(row).eq("id", edit.id) : await sb.from("kam_aftale").insert(row);
            if (error) { toast.error(error.message); return; }
            toast.success("KAM-aftale gemt"); setEdit(null); onGemt();
          }} />}
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

export function omrKort(o: Omraade | null | undefined, distrikter: { id: string; navn: string }[]) {
  if (!o || o.type === "land" || !o.vaerdier?.length) return "";
  if (o.type === "distrikt") return " · i " + o.vaerdier.map((v) => distrikter.find((d) => d.id === v)?.navn ?? "?").join(", ");
  return (o.type === "landsdel" ? " · i landsdel " : " · i ") + o.vaerdier.join(", ");
}

/** Valgfrit område: Hele landet / Landsdel / Distrikter / Regioner. Bruges af regler og KAM-aftaler. */
export function OmraadeValg({ omr, setOmr, distrikter, distriktTitel, regioner, hjaelp }: {
  omr: Omraade; setOmr: (o: Omraade) => void; distrikter: { id: string; navn: string }[]; distriktTitel: string; regioner: string[]; hjaelp: string;
}) {
  return (
    <div className="space-y-1 border-t border-border pt-2">
      <div className="font-medium">Område</div>
      <p className="text-[11px] text-muted-foreground">{hjaelp}</p>
      <div className="flex flex-wrap gap-3 text-xs">
        {([["land", "Hele landet"], ["landsdel", "Landsdel"], ["distrikt", "Distrikter"], ...(regioner.length ? [["region", "Regioner"]] : [])] as [Omraade["type"], string][]).map(([t, l]) => (
          <label key={t} className="flex items-center gap-1 cursor-pointer">
            <input type="radio" checked={omr.type === t} onChange={() => setOmr({ type: t, vaerdier: [] })} />{l}
          </label>
        ))}
      </div>
      {omr.type === "landsdel" && <SoegListe titel="Landsdel" valg={[["Vest", null], ["Øst", null]]} valgte={omr.vaerdier} setValgte={(v) => setOmr({ ...omr, vaerdier: v })} />}
      {omr.type === "distrikt" && <SoegListe titel={distriktTitel} valg={distrikter.map((d) => [d.id, null] as [string, null])} valgte={omr.vaerdier}
        setValgte={(v) => setOmr({ ...omr, vaerdier: v })} vis={(x) => distrikter.find((d) => d.id === x)?.navn ?? "?"} />}
      {omr.type === "region" && <SoegListe titel="Regioner" valg={regioner.map((x) => [x, null] as [string, null])} valgte={omr.vaerdier} setValgte={(v) => setOmr({ ...omr, vaerdier: v })} />}
    </div>
  );
}

type KodeType = "kpg1" | "kpg2" | "kpg3";
/** "Indsæt koder" kopieret fra Excel; fundne koder lægges til den valgte liste. */
export function IndsaetKoder({ valg, typer = ["kpg1", "kpg2", "kpg3"], onTilfoej }: { valg: KamValg; typer?: KodeType[]; onTilfoej: (t: KodeType, koder: string[]) => void }) {
  const [aaben, setAaben] = useState(false);
  const [tekst, setTekst] = useState("");
  const [type, setType] = useState<KodeType>(typer[0]);
  const [res, setRes] = useState<{ fundet: string[]; ikke: string[] } | null>(null);
  if (!aaben) return <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAaben(true)}>Indsæt koder</Button>;
  const kør = () => {
    const r = parseKoder(tekst, valg[type].map(([k]) => k), type);
    setRes(r);
    if (r.fundet.length) onTilfoej(type, r.fundet);
  };
  return (
    <div className="rounded border border-border p-2 space-y-2 text-xs min-w-0" data-testid="indsaet-koder">
      <div className="font-medium">Indsæt koder</div>
      <textarea className="w-full min-h-[64px] rounded border border-input bg-background p-1.5 text-xs" value={tekst} onChange={(e) => setTekst(e.target.value)}
        placeholder={"Fx\n60\n61 [FKS kunder]\n22, 33; 40"} />
      <div className="flex flex-wrap items-center gap-2">
        <span>Indsæt som:</span>
        {typer.map((t) => <Button key={t} size="sm" variant={type === t ? "default" : "outline"} className="h-6 px-2 text-xs" onClick={() => setType(t)}>{t.toUpperCase()}</Button>)}
        <Button size="sm" className="h-6 px-2 text-xs ml-auto" onClick={kør} disabled={!tekst.trim()}>Tilføj</Button>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setAaben(false); setRes(null); setTekst(""); }}>Luk</Button>
      </div>
      {res && <div className="space-y-0.5">
        <div>{res.fundet.length} fundet</div>
        {res.ikke.length > 0 && <div className="text-destructive">Ikke fundet: {res.ikke.join(", ")}</div>}
      </div>}
    </div>
  );
}

export type KamForm = { navn: string; kpg1: string[]; kpg2: string[]; kpg3: string[]; omraade: Omraade | null; ansvarlige: string[]; aktiv: boolean };
const kpg2Vis = (k: string) => { const [a, c] = k.split("||"); return `${c} (${a})`; };

/** Fælles dialog for KAM-aftaler (gældende kort og scenarie). Ansvarlige er nøgler fra `personer`. */
export function KamFormDialog({ start, valg, personer, distrikter, distriktTitel, regioner, tael, onGem, onLuk }: {
  start: Partial<KamAftale>; valg: KamValg; personer: [string, string][]; distrikter: { id: string; navn: string }[]; distriktTitel: string;
  regioner: string[]; tael: (a: KamAftale) => { n: number; oms: number }; onGem: (f: KamForm) => Promise<void>; onLuk: () => void;
}) {
  const [f, setF] = useState<KamForm>({ navn: start.navn ?? "", kpg1: start.kpg1 ?? [], kpg2: start.kpg2 ?? [], kpg3: start.kpg3 ?? [],
    omraade: start.omraade ?? null, ansvarlige: start.ansvarlige ?? [], aktiv: start.aktiv ?? true });
  const [gemmer, setGemmer] = useState(false);
  const omr: Omraade = f.omraade ?? { type: "land", vaerdier: [] };
  const pn = new Map(personer);
  const tom = !f.kpg1.length && !f.kpg2.length && !f.kpg3.length;
  const live = tom ? { n: 0, oms: 0 } : tael({ id: "_", ...f, omraade: omr.type === "land" ? null : omr, ansvarlige: [], aktiv: true });
  const gem = async () => {
    if (!f.navn.trim()) return toast.error("Navn mangler");
    if (tom) return toast.error("Vælg mindst én kode");
    if (omr.type !== "land" && !omr.vaerdier.length) return toast.error("Vælg mindst ét område, eller vælg Hele landet");
    setGemmer(true);
    await onGem({ ...f, navn: f.navn.trim(), omraade: omr.type === "land" ? null : omr });
    setGemmer(false);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onLuk()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden grid-cols-[minmax(0,1fr)] [&>*]:min-w-0">
        <DialogHeader><DialogTitle>{start.id ? "Rediger KAM-aftale" : "Ny KAM-aftale"}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm min-w-0">
          <label className="block">Navn<Input value={f.navn} onChange={(e) => setF({ ...f, navn: e.target.value })} /></label>
          <p className="text-[11px] text-muted-foreground">Lokationen er på aftalen, hvis den har én af de valgte koder (KPG1, KPG2 eller KPG3).</p>
          <IndsaetKoder valg={valg} onTilfoej={(t, k) => setF((x) => ({ ...x, [t]: [...new Set([...x[t], ...k])] }))} />
          <SoegListe titel="Aftale (KPG1)" valg={valg.kpg1} valgte={f.kpg1} setValgte={(v) => setF({ ...f, kpg1: v })} />
          <SoegListe titel="Underaftale (KPG2)" valg={valg.kpg2} valgte={f.kpg2} setValgte={(v) => setF({ ...f, kpg2: v })} vis={kpg2Vis} />
          <SoegListe titel="Segment (KPG3)" valg={valg.kpg3} valgte={f.kpg3} setValgte={(v) => setF({ ...f, kpg3: v })} />
          <OmraadeValg omr={omr} setOmr={(o) => setF({ ...f, omraade: o })} distrikter={distrikter} distriktTitel={distriktTitel} regioner={regioner}
            hjaelp="Valgfrit: lokationen skal også ligge i området." />
          <SoegListe titel="KAM-ansvarlige" valg={personer.map(([k]) => [k, null] as [string, null])} valgte={f.ansvarlige} setValgte={(v) => setF({ ...f, ansvarlige: v })} vis={(x) => pn.get(x) ?? "Ukendt"} />
          <label className="flex items-center gap-2 text-xs cursor-pointer"><Checkbox checked={f.aktiv} onCheckedChange={(v) => setF({ ...f, aktiv: !!v })} />Aktiv</label>
        </div>
        <div className="text-xs tabular-nums text-muted-foreground" data-testid="kam-live">Rammer {live.n.toLocaleString("da-DK")} lokationer · {kr(live.oms)}</div>
        <DialogFooter><Button variant="outline" onClick={onLuk}>Annullér</Button><Button disabled={gemmer} onClick={gem}>Gem</Button></DialogFooter>
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
