import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export type Distrikt = {
  id: string; navn: string; saelger_user_id: string | null; daekkes_af_user_id: string | null;
  landsdel: string | null; farve: string; sort: number; aktiv: boolean;
};
export type Profil = { id: string; full_name: string | null; is_active: boolean | null };
export type DistriktData = {
  distrikter: Distrikt[]; fladeDistrikt: Map<number, string>; kam: string[]; profiler: Profil[];
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
    sb.from("salgskort_indstilling").select("kam_kpg3").eq("id", 1).maybeSingle(),
    sb.from("profiles").select("id,full_name,is_active").order("full_name"),
  ]);
  for (const r of [d, f, i, p]) if (r.error) throw r.error;
  const m = new Map<number, string>();
  (f.data ?? []).forEach((r: any) => m.set(r.flade, r.distrikt_id));
  return { distrikter: d.data ?? [], fladeDistrikt: m, kam: i.data?.kam_kpg3 ?? ["40", "30", "35", "15"], profiler: p.data ?? [] };
}

const kr = (n: number) => Math.round(n).toLocaleString("da-DK") + " kr.";

export type DistriktStat = { flader: number; n: number; match: number; db: number; oms: number };

export function DistriktPanel({
  data, stats, navn, redigerer, setRedigerer, valgt, setValgt, kanFortryde, onFortryd, onGemt, kpg3Koder,
}: {
  data: DistriktData; stats: Map<string, DistriktStat>; navn: (id: string | null) => string;
  redigerer: boolean; setRedigerer: (b: boolean) => void; valgt: string | null; setValgt: (id: string | null) => void;
  kanFortryde: boolean; onFortryd: () => void; onGemt: () => void; kpg3Koder: { kode: string; label: string; n: number }[];
}) {
  const [edit, setEdit] = useState<Partial<Distrikt> | null>(null);
  const [visKam, setVisKam] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">Distrikter</span>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setVisKam(true)}>KAM-koder</Button>
          <Button size="sm" variant="outline" onClick={() => setEdit({ navn: "", farve: "#3b5b92", landsdel: "Vest", sort: data.distrikter.length + 1 })}>Nyt distrikt</Button>
        </div>
      </div>
      {data.distrikter.length > 0 && (
        <Button size="sm" variant={redigerer ? "default" : "outline"} className="w-full" onClick={() => setRedigerer(!redigerer)}>
          {redigerer ? "Afslut redigering" : "Redigér grænser"}
        </Button>
      )}
      {redigerer && (
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
                <button type="button" className="text-muted-foreground hover:underline" onClick={(e) => { e.stopPropagation(); setEdit(d); }}>Rediger</button>
              </div>
              <div className="text-muted-foreground mt-0.5">{saelger}{d.landsdel ? ` · ${d.landsdel}` : ""}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 tabular-nums">
                <span>{s.flader} {s.flader === 1 ? "flade" : "flader"}</span>
                <span>{s.n.toLocaleString("da-DK")} {s.n === 1 ? "lokation" : "lokationer"}</span>
                <span>{kr(s.oms)} oms.</span>
                <span className="cursor-help" title="Andel af distriktets geografiske lokationer, hvor ansvarlig sælger i Visma er distriktets sælger">{pct}{hos}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {edit && <DistriktDialog d={edit} profiler={data.profiler} onLuk={() => setEdit(null)} onGemt={() => { setEdit(null); onGemt(); }} />}
      {visKam && <KamDialog valgte={data.kam} koder={kpg3Koder} onLuk={() => setVisKam(false)} onGemt={() => { setVisKam(false); onGemt(); }} />}
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

function KamDialog({ valgte, koder, onLuk, onGemt }: { valgte: string[]; koder: { kode: string; label: string; n: number }[]; onLuk: () => void; onGemt: () => void }) {
  const [s, setS] = useState(new Set(valgte));
  const gem = async () => {
    const { error } = await (supabase as any).from("salgskort_indstilling").update({ kam_kpg3: [...s], opdateret_at: new Date().toISOString() }).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("KAM-koder gemt");
    onGemt();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onLuk()}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>KAM-kunder (KPG3)</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Markerede segmenter er ikke geografiske kunder og tæller ikke i distriktsanalysen.</p>
        <div className="space-y-1 text-sm">
          {koder.map((k) => (
            <label key={k.kode} className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={s.has(k.kode)} onCheckedChange={() => setS((o) => { const t = new Set(o); t.has(k.kode) ? t.delete(k.kode) : t.add(k.kode); return t; })} />
              <span className="flex-1 truncate">{k.label}</span><span className="text-muted-foreground tabular-nums">{k.n}</span>
            </label>
          ))}
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
